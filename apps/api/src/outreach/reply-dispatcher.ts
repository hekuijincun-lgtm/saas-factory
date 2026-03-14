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
import { generateReply } from "./reply-generator";
import { logAudit } from "../lineConfig";

export interface DispatchContext {
  db: D1Database;
  kv: KVNamespace;
  tenantId: string;
  openaiApiKey?: string;
  uid: () => string;
  now: () => string;
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

  // 1. Classify intent
  const classification = await classifyReplyIntent(reply.reply_text, openaiApiKey);

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

  // 4. Generate reply
  const lead = await db
    .prepare("SELECT store_name FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
    .bind(reply.lead_id, tenantId)
    .first<{ store_name: string }>();

  const generated = await generateReply({
    intent: classification.intent,
    replyText: reply.reply_text,
    storeName: lead?.store_name || "弊社",
    openaiApiKey,
  });

  if (!generated.response) {
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

  // 5. Dispatch via send provider
  const outreachSettingsRaw = await kv.get(`outreach:settings:${tenantId}`);
  const outreachSettings = outreachSettingsRaw ? JSON.parse(outreachSettingsRaw) : { sendMode: "safe" };
  const provider = resolveProvider(outreachSettings.sendMode || "safe");

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
        body: generated.response,
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

  // 6. Update reply record
  await db
    .prepare(
      `UPDATE outreach_replies
       SET ai_handled = 1, ai_response = ?1, ai_response_sent = ?2
       WHERE id = ?3 AND tenant_id = ?4`
    )
    .bind(generated.response, sent ? 1 : 0, reply.id, tenantId)
    .run();

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
    `auto_reply:${classification.intent}`,
    generated.response,
    sent ? "sent" : "failed",
    errorMsg,
    ts
  );

  await logAudit(db, tenantId, "system", "outreach.auto_reply", {
    replyId: reply.id,
    leadId: reply.lead_id,
    intent: classification.intent,
    sent,
    pipelineTransition,
  });

  return {
    replyId: reply.id,
    intent: classification.intent,
    sentiment: classification.sentiment,
    confidence: classification.confidence,
    aiResponse: generated.response,
    sent,
    skippedReason: errorMsg || undefined,
    pipelineTransition,
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
