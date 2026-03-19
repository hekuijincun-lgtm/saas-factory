// Outreach OS — Reply Dispatcher (Phase 14)
// ============================================================
// Handles safe dispatch of auto-replies with all safety checks:
// - Unsubscribe check
// - Rate limiting
// - Cooldown enforcement
// - Max replies per lead guard
// - Tenant isolation

import { isUnsubscribed, checkRateLimit, incrementRateLimit, resolveProvider } from "./send-provider";
import type { AutoReplySettings, OutreachReply, ReplyIntent } from "./types";
import { DEFAULT_AUTO_REPLY_SETTINGS, INTENT_TO_PIPELINE } from "./types";
import type { IntentClassifyResult } from "./reply-classifier";
import { classifyReplyIntent } from "./reply-classifier";
import { classifyCloseIntent } from "./close-classifier";
import { generateReply } from "./reply-generator";
import { generateCloseResponse, getCloseSettings } from "./close-generator";
import type { CloseSettings } from "./close-generator";
import { logAudit } from "../lineConfig";
import type { AICore } from "../ai";

/** Intents that should trigger close evaluation + enhanced response */
const CLOSE_ELIGIBLE_INTENTS: ReplyIntent[] = ["interested", "pricing", "demo"];

export interface DispatchContext {
  db: D1Database;
  kv: KVNamespace;
  tenantId: string;
  openaiApiKey?: string;
  resendApiKey?: string;
  emailFrom?: string;
  uid: () => string;
  now: () => string;
  /** AI Core instance (preferred over direct openaiApiKey) */
  aiCore?: AICore;
}

export interface DispatchResult {
  replyId: string;
  intent: ReplyIntent;
  sentiment: string;
  confidence: number;
  aiResponse: string;
  sent: boolean;
  skippedReason?: string;
  pipelineTransition?: string;
  closeIntent?: string;
  closeResponseType?: string;
  dealTemperature?: string;
}

/**
 * Get auto-reply settings from KV.
 */
export async function getAutoReplySettings(
  kv: KVNamespace,
  tenantId: string
): Promise<AutoReplySettings> {
  const raw = await kv.get(`outreach:auto-reply:${tenantId}`);
  if (!raw) return { ...DEFAULT_AUTO_REPLY_SETTINGS };
  try {
    return { ...DEFAULT_AUTO_REPLY_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_AUTO_REPLY_SETTINGS };
  }
}

/**
 * Save auto-reply settings to KV.
 */
export async function saveAutoReplySettings(
  kv: KVNamespace,
  tenantId: string,
  settings: Partial<AutoReplySettings>
): Promise<AutoReplySettings> {
  const current = await getAutoReplySettings(kv, tenantId);
  const merged = { ...current, ...settings };
  await kv.put(`outreach:auto-reply:${tenantId}`, JSON.stringify(merged));
  return merged;
}

/**
 * Process a single reply: classify → generate → dispatch → log.
 * Called by both the ingest endpoint and the cron.
 */
export async function processReply(
  ctx: DispatchContext,
  reply: OutreachReply
): Promise<DispatchResult> {
  const { db, kv, tenantId, openaiApiKey, uid, now } = ctx;
  const ts = now();

  // 1. Classify intent (prefer AI Core if available)
  const classification = await classifyReplyIntent(reply.reply_text, ctx.aiCore ?? openaiApiKey, tenantId);

  // Update reply record with classification
  await db
    .prepare(
      `UPDATE outreach_replies
       SET intent = ?1, sentiment = ?2, intent_confidence = ?3
       WHERE id = ?4 AND tenant_id = ?5`
    )
    .bind(classification.intent, classification.sentiment, classification.confidence, reply.id, tenantId)
    .run();

  // 2. Load settings & check if auto-reply is enabled
  const settings = await getAutoReplySettings(kv, tenantId);

  if (!settings.autoReplyEnabled) {
    await writeReplyLog(db, uid(), tenantId, reply.lead_id, reply.id, "disabled", "", "skipped", null, ts);
    return {
      replyId: reply.id,
      intent: classification.intent,
      sentiment: classification.sentiment,
      confidence: classification.confidence,
      aiResponse: "",
      sent: false,
      skippedReason: "auto_reply_disabled",
    };
  }

  // 3. Safety checks
  const skipReason = await checkSafetyGuards(ctx, reply, settings, classification);
  if (skipReason) {
    await writeReplyLog(db, uid(), tenantId, reply.lead_id, reply.id, `skip:${skipReason}`, "", "skipped", null, ts);
    await db
      .prepare("UPDATE outreach_replies SET ai_handled = 1 WHERE id = ?1 AND tenant_id = ?2")
      .bind(reply.id, tenantId)
      .run();
    return {
      replyId: reply.id,
      intent: classification.intent,
      sentiment: classification.sentiment,
      confidence: classification.confidence,
      aiResponse: "",
      sent: false,
      skippedReason: skipReason,
    };
  }

  // 3.5. Auto-suppress on unsubscribe intent is deferred to AFTER successful send (see step 6.5)

  // 4. Generate reply — use close-aware routing for interested/pricing/demo
  const lead = await db
    .prepare("SELECT store_name, contact_email FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
    .bind(reply.lead_id, tenantId)
    .first<{ store_name: string; contact_email: string | null }>();

  const closeSettings = await getCloseSettings(kv, tenantId);
  const storeName = lead?.store_name || "弊社";

  let responseText = "";
  let closeIntentResult: string | null = null;
  let closeConfidence: number | null = null;
  let dealTemperature: string | null = null;
  let closeResponseType: string | null = null;

  if (CLOSE_ELIGIBLE_INTENTS.includes(classification.intent) && closeSettings.auto_close_enabled) {
    // ── Close-aware response: evaluate close intent + generate close response ──
    try {
      console.log(JSON.stringify({ event: "OUTREACH_CLOSE_EVAL", tenantId, replyId: reply.id, leadId: reply.lead_id, replyIntent: classification.intent, phase: "start" }));
      const closeClassification = await classifyCloseIntent(reply.reply_text, openaiApiKey);
      closeIntentResult = closeClassification.close_intent;
      closeConfidence = closeClassification.close_confidence;
      dealTemperature = closeClassification.deal_temperature;

      // Safety: URL not configured → handoff instead of empty link
      const hasRequiredUrl = (() => {
        switch (closeClassification.recommended_next_step) {
          case "send_pricing": return !!closeSettings.pricing_page_url;
          case "send_demo_link": return !!(closeSettings.demo_booking_url || closeSettings.calendly_url);
          case "send_booking_link": return !!(closeSettings.calendly_url || closeSettings.demo_booking_url);
          default: return true;
        }
      })();

      if (!hasRequiredUrl) {
        // URL未設定 → handoff に逃がす
        await createHandoff(db, uid(), tenantId, reply.lead_id, reply.id, "url_not_configured", "high", ts);
        await writeReplyLog(db, uid(), tenantId, reply.lead_id, reply.id, `close:url_missing:${closeClassification.recommended_next_step}`, "", "skipped", "required URL not configured", ts);
      } else {
        // Phase 20: Fetch learning context for close-aware response quality
        let closeLearningCtx = null;
        try {
          const { getLearningContext } = await import("./learning");
          closeLearningCtx = await getLearningContext(db, tenantId);
        } catch { /* learning optional — fail-open */ }

        // Phase 20: Select best close variant if available
        let variantTemplate = null;
        const closeTypeMap: Record<string, string> = {
          send_pricing: "pricing", send_demo_link: "demo_invite", send_booking_link: "booking_invite",
        };
        const closeType = closeTypeMap[closeClassification.recommended_next_step];
        if (closeType) {
          try {
            const variant = await db
              .prepare(
                `SELECT variant_key, subject_template, body_template, sent_count, meeting_count, close_count
                 FROM outreach_close_variants
                 WHERE tenant_id = ?1 AND close_type = ?2 AND is_active = 1
                 ORDER BY CASE WHEN (sent_count > 0 AND (meeting_count + close_count) > 0) THEN CAST(meeting_count + close_count AS REAL) / sent_count ELSE 0 END DESC, RANDOM()
                 LIMIT 1`
              )
              .bind(tenantId, closeType)
              .first<{ variant_key: string; subject_template: string | null; body_template: string }>();
            if (variant) {
              variantTemplate = variant;
              // Increment sent_count
              await db.prepare(
                `UPDATE outreach_close_variants SET sent_count = sent_count + 1, updated_at = ?1
                 WHERE tenant_id = ?2 AND close_type = ?3 AND variant_key = ?4`
              ).bind(ts, tenantId, closeType, variant.variant_key).run();
            }
          } catch { /* variant selection optional */ }
        }

        const closeResp = await generateCloseResponse({
          closeIntent: closeClassification.close_intent,
          dealTemperature: closeClassification.deal_temperature,
          recommendedNextStep: closeClassification.recommended_next_step,
          replyText: reply.reply_text,
          storeName,
          settings: closeSettings,
          openaiApiKey,
          learningContext: closeLearningCtx,
          variantTemplate,
        });

        responseText = closeResp.response_text;
        closeResponseType = closeResp.response_type;

        console.log(JSON.stringify({
          event: "OUTREACH_CLOSE_EVAL", tenantId, replyId: reply.id, phase: "result",
          closeIntent: closeClassification.close_intent, closeConfidence: closeClassification.close_confidence,
          dealTemperature: closeClassification.deal_temperature, responseType: closeResp.response_type,
          handoff: closeResp.handoff_required, variantKey: variantTemplate?.variant_key || null,
        }));

        if (closeResp.handoff_required) {
          console.log(JSON.stringify({ event: "OUTREACH_HANDOFF_CREATED", tenantId, replyId: reply.id, leadId: reply.lead_id, reason: `close:${closeClassification.close_intent}` }));
          await createHandoff(db, uid(), tenantId, reply.lead_id, reply.id, `close:${closeClassification.close_intent}`, "high", ts);
        }

        // Update reply with close evaluation data
        await db
          .prepare(
            `UPDATE outreach_replies
             SET close_intent = ?1, close_confidence = ?2, deal_temperature = ?3,
                 recommended_next_step = ?4, handoff_required = ?5
             WHERE id = ?6 AND tenant_id = ?7`
          )
          .bind(
            closeClassification.close_intent, closeClassification.close_confidence,
            closeClassification.deal_temperature, closeClassification.recommended_next_step,
            closeResp.handoff_required ? 1 : 0, reply.id, tenantId
          )
          .run();

        // Update lead close stage
        const CLOSE_INTENT_TO_STAGE: Record<string, string> = {
          pricing_request: "pricing_sent", demo_request: "demo_sent",
          schedule_request: "meeting_requested", signup_request: "qualified",
          warm_lead: "interested", compare_request: "pricing_sent",
        };
        const closeStage = CLOSE_INTENT_TO_STAGE[closeClassification.close_intent];
        if (closeStage) {
          await db.prepare(
            `UPDATE sales_leads SET close_stage = ?1, deal_temperature = ?2, close_evaluated_at = ?3, updated_at = ?4
             WHERE id = ?5 AND tenant_id = ?6`
          ).bind(closeStage, closeClassification.deal_temperature, ts, ts, reply.lead_id, tenantId).run();
        }

        // Write close log (with variant key if used)
        try {
          await db.prepare(
            `INSERT INTO outreach_close_logs
             (id, tenant_id, lead_id, reply_id, close_intent, close_confidence, deal_temperature,
              suggested_action, ai_response, execution_status, handoff_required, close_variant_key, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`
          ).bind(
            uid(), tenantId, reply.lead_id, reply.id,
            closeClassification.close_intent, closeClassification.close_confidence,
            closeClassification.deal_temperature, closeClassification.recommended_next_step,
            responseText, closeResp.handoff_required ? "escalated" : "auto_sent",
            closeResp.handoff_required ? 1 : 0, variantTemplate?.variant_key || null, ts
          ).run();
        } catch { /* close log is best-effort */ }
      }
    } catch (closeErr: any) {
      console.error(`[reply-dispatcher] Close evaluation error:`, closeErr.message);
      // Fallback to standard reply-generator
    }
  }

  // If close-aware flow didn't produce a response, fallback to standard reply-generator
  if (!responseText) {
    const generated = await generateReply({
      intent: classification.intent,
      replyText: reply.reply_text,
      storeName,
      openaiApiKey,
      bookingUrl: closeSettings.calendly_url || closeSettings.demo_booking_url || "",
      pricingPageUrl: closeSettings.pricing_page_url || "",
      demoBookingUrl: closeSettings.demo_booking_url || closeSettings.calendly_url || "",
    });
    responseText = generated.response;
  }

  if (!responseText) {
    // No response generated (unknown intent → needs human)
    await writeReplyLog(db, uid(), tenantId, reply.lead_id, reply.id, "needs_human", "", "skipped", null, ts);
    return {
      replyId: reply.id,
      intent: classification.intent,
      sentiment: classification.sentiment,
      confidence: classification.confidence,
      aiResponse: "",
      sent: false,
      skippedReason: "needs_human_review",
    };
  }

  // 4.5. Auto-create handoff for uncertain or complex replies
  if (
    classification.intent === "unknown" ||
    (classification.confidence < 0.7 && classification.intent !== "not_interested")
  ) {
    await createHandoff(db, uid(), tenantId, reply.lead_id, reply.id,
      classification.intent === "unknown" ? "ai_uncertain" : "complex_question",
      classification.intent === "unknown" ? "normal" : "high", ts);
  }

  // 5. Dispatch via send provider
  const outreachSettingsRaw = await kv.get(`outreach:settings:${tenantId}`);
  const outreachSettings = outreachSettingsRaw ? JSON.parse(outreachSettingsRaw) : { sendMode: "safe" };
  const provider = resolveProvider(outreachSettings.sendMode || "safe", {
    RESEND_API_KEY: ctx.resendApiKey,
    EMAIL_FROM: ctx.emailFrom,
  });

  const leadDetail = await db
    .prepare("SELECT contact_email, line_user_id FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
    .bind(reply.lead_id, tenantId)
    .first<{ contact_email: string | null; line_user_id: string | null }>();

  const to = reply.reply_source === "line"
    ? (leadDetail?.line_user_id || "")
    : (leadDetail?.contact_email || "");

  let sent = false;
  let errorMsg: string | null = null;

  if (to) {
    try {
      const sendResult = await provider.send({
        leadId: reply.lead_id,
        tenantId,
        channel: reply.reply_source === "line" ? "line" : "email",
        to,
        subject: "Re: お問い合わせありがとうございます",
        body: responseText,
      });
      sent = sendResult.success;
      if (!sendResult.success) errorMsg = sendResult.error || "send_failed";
      if (sent) await incrementRateLimit(kv, tenantId);
    } catch (err: any) {
      errorMsg = err.message || "dispatch_error";
    }
  } else {
    errorMsg = "no_contact_info";
  }

  // 6. Update reply record (mark handled + resolved if sent)
  await db
    .prepare(
      `UPDATE outreach_replies
       SET ai_handled = 1, ai_response = ?1, ai_response_sent = ?2, status = ?3
       WHERE id = ?4 AND tenant_id = ?5`
    )
    .bind(responseText, sent ? 1 : 0, sent ? "resolved" : "open", reply.id, tenantId)
    .run();

  // 6.5. Auto-suppress on unsubscribe intent (AFTER successful send of confirmation)
  if (classification.intent === "unsubscribe" && sent) {
    const unsubKey = `outreach:unsub:${tenantId}:${reply.lead_id}`;
    await kv.put(unsubKey, "1");
    console.log(`[reply-dispatcher] Auto-suppressed lead=${reply.lead_id} tenant=${tenantId} (unsubscribe intent)`);
  }

  // 7. Update lead: ai_reply_count + last_ai_reply_at
  if (sent) {
    await db
      .prepare(
        `UPDATE sales_leads
         SET ai_reply_count = ai_reply_count + 1, last_ai_reply_at = ?1, updated_at = ?2
         WHERE id = ?3 AND tenant_id = ?4`
      )
      .bind(ts, ts, reply.lead_id, tenantId)
      .run();
  }

  // 8. CRM pipeline transition
  let pipelineTransition: string | undefined;
  const newStage = INTENT_TO_PIPELINE[classification.intent];
  if (newStage && sent) {
    await db
      .prepare(
        `UPDATE sales_leads
         SET pipeline_stage = ?1, updated_at = ?2
         WHERE id = ?3 AND tenant_id = ?4 AND pipeline_stage NOT IN ('meeting', 'customer', 'lost')`
      )
      .bind(newStage, ts, reply.lead_id, tenantId)
      .run();
    pipelineTransition = newStage;
  }

  // 9. Write audit log
  await writeReplyLog(
    db, uid(), tenantId, reply.lead_id, reply.id,
    closeIntentResult ? `auto_close:${closeIntentResult}` : `auto_reply:${classification.intent}`,
    responseText,
    sent ? "sent" : "failed",
    errorMsg,
    ts
  );

  await logAudit(db, tenantId, "system", "outreach.auto_reply", {
    replyId: reply.id,
    leadId: reply.lead_id,
    intent: classification.intent,
    closeIntent: closeIntentResult,
    closeResponseType,
    dealTemperature,
    sent,
    pipelineTransition,
  });

  return {
    replyId: reply.id,
    intent: classification.intent,
    sentiment: classification.sentiment,
    confidence: classification.confidence,
    aiResponse: responseText,
    sent,
    skippedReason: errorMsg || undefined,
    pipelineTransition,
    closeIntent: closeIntentResult || undefined,
    closeResponseType: closeResponseType || undefined,
    dealTemperature: dealTemperature || undefined,
  };
}

/**
 * Process all unhandled replies for a tenant (cron entry point).
 */
export async function processUnhandledReplies(
  ctx: DispatchContext
): Promise<{ processed: number; sent: number; skipped: number; errors: number }> {
  const { db, tenantId } = ctx;
  const rows = await db
    .prepare(
      `SELECT * FROM outreach_replies
       WHERE tenant_id = ?1 AND ai_handled = 0
       ORDER BY created_at ASC
       LIMIT 20`
    )
    .bind(tenantId)
    .all<OutreachReply>();

  const replies = rows.results ?? [];
  let processed = 0, sent = 0, skipped = 0, errors = 0;

  for (const reply of replies) {
    try {
      const result = await processReply(ctx, reply);
      processed++;
      if (result.sent) sent++;
      else if (result.skippedReason) skipped++;
    } catch (err: any) {
      errors++;
      console.error(`[reply-dispatcher] Error processing reply ${reply.id}:`, err.message);
    }
  }

  return { processed, sent, skipped, errors };
}

// ── Internal helpers ─────────────────────────────────────────────────────

async function checkSafetyGuards(
  ctx: DispatchContext,
  reply: OutreachReply,
  settings: AutoReplySettings,
  classification: IntentClassifyResult
): Promise<string | null> {
  const { db, kv, tenantId } = ctx;

  // Confidence threshold
  if (classification.confidence < settings.confidenceThreshold) {
    return "low_confidence";
  }

  // Unknown intent → needs human
  if (classification.intent === "unknown") {
    return "unknown_intent";
  }

  // Unsubscribe check
  if (await isUnsubscribed(kv, tenantId, reply.lead_id)) {
    return "unsubscribed";
  }

  // Max replies per lead
  const lead = await db
    .prepare("SELECT ai_reply_count, last_ai_reply_at FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
    .bind(reply.lead_id, tenantId)
    .first<{ ai_reply_count: number; last_ai_reply_at: string | null }>();

  if (lead && lead.ai_reply_count >= settings.maxRepliesPerLead) {
    return "max_replies_reached";
  }

  // Cooldown check
  if (lead?.last_ai_reply_at) {
    const lastReplyTime = new Date(lead.last_ai_reply_at).getTime();
    const cooldownMs = settings.cooldownMinutes * 60 * 1000;
    if (Date.now() - lastReplyTime < cooldownMs) {
      return "cooldown_active";
    }
  }

  // Rate limit
  const rl = await checkRateLimit(kv, tenantId);
  if (!rl.allowed) {
    return "rate_limited";
  }

  // Spam guard: don't reply to spam
  if (classification.intent === "not_interested" as any) {
    // Still send courtesy reply, but check if lead is already "lost"
    const stage = await db
      .prepare("SELECT pipeline_stage FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(reply.lead_id, tenantId)
      .first<{ pipeline_stage: string }>();
    if (stage?.pipeline_stage === "lost") {
      return "lead_already_lost";
    }
  }

  return null;
}

async function createHandoff(
  db: D1Database,
  id: string,
  tenantId: string,
  leadId: string,
  replyId: string,
  reason: string,
  priority: string,
  createdAt: string
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO outreach_handoffs
         (id, tenant_id, lead_id, reply_id, reason, priority, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7)`
      )
      .bind(id, tenantId, leadId, replyId, reason, priority, createdAt)
      .run();
  } catch { /* handoff creation is best-effort */ }
}

async function writeReplyLog(
  db: D1Database,
  id: string,
  tenantId: string,
  leadId: string,
  replyId: string,
  aiDecision: string,
  aiResponse: string,
  executionStatus: string,
  errorMessage: string | null,
  createdAt: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO outreach_reply_logs
       (id, tenant_id, lead_id, reply_id, ai_decision, ai_response, execution_status, error_message, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    )
    .bind(id, tenantId, leadId, replyId, aiDecision, aiResponse, executionStatus, errorMessage, createdAt)
    .run();
}
