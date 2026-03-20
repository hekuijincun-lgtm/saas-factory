/**
 * Webhook & tracking routes — email inbound, click tracking, booking events, outreach mount
 */
import { createOutreachRoutes } from "../outreach/routes";
import { getTenantId } from "../helpers";

export function registerWebhookRoutes(app: any) {

// ── Outreach OS routes ──────────────────────────────────────────────────────
// Mounted at /admin/outreach/* — protected by existing admin auth middleware.
app.route("/admin/outreach", createOutreachRoutes(getTenantId));

// ── Outreach Email Inbound Webhook (public, no admin auth) ─────────────────
// POST /webhooks/email/inbound — receives inbound email from Resend or custom integration.
// Supports two payload formats:
//   1. Resend inbound webhook: { type, created_at, data: { from, to, subject, text, html, ... } }
//   2. Flat format: { from, to, subject, text, html, message_id }
// Looks up lead by sender email (tenant-scoped), routes to existing ingest pipeline.
// Protected by OUTREACH_WEBHOOK_SECRET (always required; 503 if not set, 401 if mismatch).
app.post("/webhooks/email/inbound", async (c) => {
  const db = c.env.DB;
  const kv = c.env.SAAS_FACTORY;
  const _t0 = Date.now();

  // Webhook secret verification (always required — reject if not configured)
  const webhookSecret = (c.env as any).OUTREACH_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error(JSON.stringify({ event: "OUTREACH_INBOUND_RECEIVED", status: "fail", reason: "webhook_secret_not_configured" }));
    return c.json({ ok: false, error: "webhook not configured" }, 503);
  }
  {
    const authHeader = c.req.header("x-webhook-secret") || c.req.header("authorization");
    const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader || "";
    let match = provided.length === webhookSecret.length;
    for (let i = 0; i < webhookSecret.length; i++) {
      match = match && (provided.charCodeAt(i) === webhookSecret.charCodeAt(i));
    }
    if (!match) {
      console.error(JSON.stringify({ event: "OUTREACH_INBOUND_RECEIVED", status: "fail", reason: "auth_mismatch" }));
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }
  }

  let rawBody: any;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid JSON body" }, 400);
  }

  // Normalize payload: support both Resend nested format and flat format
  const payload = rawBody?.data && typeof rawBody.data === "object" && rawBody.data.from
    ? rawBody.data
    : rawBody;

  const fromRaw = payload.from || "";
  const emailMatch = fromRaw.match(/<([^>]+)>/) || [null, fromRaw];
  const fromEmail = (emailMatch[1] || "").trim().toLowerCase();
  const replyText = (payload.text || payload.html || "").slice(0, 10000);
  const subject = payload.subject || "";
  const externalMessageId = payload.message_id || payload.messageId || payload.headers?.["message-id"] || "";
  const fromDomain = fromEmail.split("@")[1] || "";
  const subjectPreview = subject.slice(0, 80);
  const textPreview = replyText.replace(/\s+/g, " ").slice(0, 120);

  // P1: Structured receive log
  console.log(JSON.stringify({
    event: "OUTREACH_INBOUND_RECEIVED",
    fromDomain, subjectPreview, textLen: replyText.length,
    messageId: externalMessageId?.slice(0, 40) || null, authOk: true,
  }));

  if (!fromEmail || !fromEmail.includes("@")) {
    return c.json({ ok: false, error: "valid 'from' email is required" }, 400);
  }
  if (!replyText.trim()) {
    return c.json({ ok: false, error: "reply text (text or html) is required" }, 400);
  }

  // Idempotency
  if (externalMessageId) {
    const existing = await db
      .prepare("SELECT id, tenant_id FROM outreach_replies WHERE message_id = ?1 LIMIT 1")
      .bind(externalMessageId)
      .first<{ id: string; tenant_id: string }>();
    if (existing) {
      console.log(JSON.stringify({ event: "OUTREACH_INBOUND_RECEIVED", status: "skipped", reason: "duplicate", replyId: existing.id }));
      return c.json({ ok: true, skipped: true, reason: "duplicate_message_id", replyId: existing.id });
    }
  }

  // Lead lookup
  const leads = await db
    .prepare("SELECT id, tenant_id FROM sales_leads WHERE LOWER(contact_email) = ?1 ORDER BY updated_at DESC LIMIT 10")
    .bind(fromEmail)
    .all<{ id: string; tenant_id: string }>();

  const matchedLeads = leads.results ?? [];

  if (matchedLeads.length === 0) {
    console.log(JSON.stringify({ event: "OUTREACH_INBOUND_RECEIVED", status: "skipped", reason: "no_matching_lead", fromDomain }));
    return c.json({ ok: true, skipped: true, reason: "no_matching_lead", from: fromEmail });
  }

  const results: Array<{ tenantId: string; leadId: string; replyId: string; autoProcessed: boolean }> = [];
  let autoReplySentForThisEmail = false;

  for (const lead of matchedLeads) {
    const tenantId = lead.tenant_id;
    const leadId = lead.id;

    const replyId = `or_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const ts = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO outreach_replies
         (id, tenant_id, lead_id, campaign_id, message_id, reply_text, reply_source, from_email, subject, status, ai_handled, ai_response_sent, created_at)
         VALUES (?1, ?2, ?3, NULL, ?4, ?5, 'email', ?6, ?7, 'open', 0, 0, ?8)`
      )
      .bind(replyId, tenantId, leadId, externalMessageId || null, replyText, fromEmail, subject, ts)
      .run();

    await db
      .prepare("UPDATE sales_leads SET last_replied_at = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4")
      .bind(ts, ts, leadId, tenantId)
      .run();

    // P2: Classify with structured logging
    const openaiApiKey = (c.env as any).OPENAI_API_KEY;
    let classifyResult: any = null;
    try {
      console.log(JSON.stringify({ event: "OUTREACH_REPLY_CLASSIFY_START", tenantId, replyId, leadId }));
      const { classifyReplyIntent } = await import("../outreach/reply-classifier");
      classifyResult = await classifyReplyIntent(replyText, openaiApiKey);
      await db
        .prepare(
          `UPDATE outreach_replies SET intent = ?1, sentiment = ?2, intent_confidence = ?3 WHERE id = ?4 AND tenant_id = ?5`
        )
        .bind(classifyResult.intent, classifyResult.sentiment, classifyResult.confidence, replyId, tenantId)
        .run();
      console.log(JSON.stringify({
        event: "OUTREACH_REPLY_CLASSIFY_RESULT", tenantId, replyId, leadId,
        intent: classifyResult.intent, sentiment: classifyResult.sentiment,
        confidence: classifyResult.confidence,
      }));
    } catch (clsErr: any) {
      console.error(JSON.stringify({ event: "OUTREACH_REPLY_CLASSIFY_RESULT", tenantId, replyId, status: "fail", reason: clsErr?.message?.slice(0, 100) }));
    }

    // Auto-process with structured logging
    let autoProcessed = false;
    if (autoReplySentForThisEmail) {
      console.log(JSON.stringify({ event: "OUTREACH_AUTO_REPLY_DECISION", tenantId, replyId, decision: "skipped_duplicate_tenant" }));
    } else try {
      const { getAutoReplySettings, processReply } = await import("../outreach/reply-dispatcher");
      const arSettings = await getAutoReplySettings(kv, tenantId);
      console.log(JSON.stringify({ event: "OUTREACH_AUTO_REPLY_DECISION", tenantId, replyId, autoReplyEnabled: arSettings.autoReplyEnabled }));
      if (arSettings.autoReplyEnabled) {
        const uidFn = () => `or_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const nowFn = () => new Date().toISOString();
        const procResult = await processReply(
          { db, kv, tenantId, openaiApiKey, resendApiKey: (c.env as any).RESEND_API_KEY, emailFrom: (c.env as any).EMAIL_FROM, uid: uidFn, now: nowFn },
          {
            id: replyId, tenant_id: tenantId, lead_id: leadId,
            campaign_id: null, message_id: externalMessageId || null,
            reply_text: replyText, reply_source: "email",
            from_email: fromEmail, subject, status: "open" as any,
            sentiment: classifyResult?.sentiment || null,
            intent: classifyResult?.intent || null,
            intent_confidence: classifyResult?.confidence || null,
            ai_handled: 0, ai_response: null, ai_response_sent: 0,
            created_at: ts,
          }
        );
        autoProcessed = true;
        autoReplySentForThisEmail = true;
        console.log(JSON.stringify({
          event: "OUTREACH_AUTO_REPLY_SENT", tenantId, replyId, leadId,
          sent: procResult.sent, intent: procResult.intent,
          closeIntent: procResult.closeIntent || null,
          closeResponseType: procResult.closeResponseType || null,
          skippedReason: procResult.skippedReason || null,
        }));
      }
    } catch (procErr: any) {
      console.error(JSON.stringify({ event: "OUTREACH_AUTO_REPLY_SENT", tenantId, replyId, status: "fail", reason: procErr?.message?.slice(0, 100) }));
    }

    results.push({ tenantId, leadId, replyId, autoProcessed });
  }

  console.log(JSON.stringify({
    event: "OUTREACH_INBOUND_RECEIVED", status: "success",
    matchedLeads: matchedLeads.length, processed: results.length, durationMs: Date.now() - _t0,
  }));
  return c.json({ ok: true, processed: results.length, results });
});

// ── Phase 20: Booking link click tracker (public, no auth) ────────────────
// Usage: /track/click?t={tenantId}&l={leadId}&u={encodedBookingUrl}&c={closeLogId}
// Records a 'clicked' booking event then redirects to the actual booking URL.
app.get("/track/click", async (c) => {
  const tenantId = c.req.query("t") || "";
  const leadId = c.req.query("l") || "";
  const url = c.req.query("u") || "";
  const closeLogId = c.req.query("c") || "";

  if (!tenantId || !leadId || !url) {
    return c.redirect(url || "https://example.com", 302);
  }

  // Record click event (best-effort, don't block redirect)
  try {
    const db = c.env.DB;
    const id = `be_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await db.prepare(
      `INSERT INTO outreach_booking_events
       (id, tenant_id, lead_id, close_log_id, event_type, booking_url, created_at)
       VALUES (?1, ?2, ?3, ?4, 'clicked', ?5, ?6)`
    ).bind(id, tenantId, leadId, closeLogId || null, url, new Date().toISOString()).run();
  } catch (err: any) {
    console.error("[track/click] Error recording click:", err.message);
  }

  return c.redirect(url, 302);
});

// POST /booking-events/booked — Record a booked event (for webhook or manual trigger)
app.post("/booking-events/booked", async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{ tenant_id: string; lead_id: string; close_log_id?: string; variant_key?: string }>();

  if (!body.tenant_id || !body.lead_id) {
    return c.json({ ok: false, error: "tenant_id and lead_id required" }, 400);
  }

  const id = `be_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await db.prepare(
    `INSERT INTO outreach_booking_events
     (id, tenant_id, lead_id, close_log_id, event_type, variant_key, created_at)
     VALUES (?1, ?2, ?3, ?4, 'booked', ?5, ?6)`
  ).bind(id, body.tenant_id, body.lead_id, body.close_log_id || null, body.variant_key || null, new Date().toISOString()).run();

  // Update variant close_count if variant_key provided
  if (body.variant_key) {
    try {
      await db.prepare(
        `UPDATE outreach_close_variants SET close_count = close_count + 1, updated_at = ?1
         WHERE tenant_id = ?2 AND variant_key = ?3`
      ).bind(new Date().toISOString(), body.tenant_id, body.variant_key).run();
    } catch { /* best-effort */ }
  }

  return c.json({ ok: true, data: { id } });
});

} // end registerWebhookRoutes
