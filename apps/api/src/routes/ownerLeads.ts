/**
 * Owner Lead Management routes — /owner/leads*
 *
 * Auth: handled by existing /owner/* middleware in owner.ts
 * Storage: D1 (sales_leads, lead_message_drafts, lead_reply_classifications)
 * AI: OpenAI Responses API via services/salesAi.ts
 */
import type { Hono } from "hono";
import {
  analyzeLead as aiAnalyzeLead,
  generateDrafts as aiGenerateDrafts,
  classifyReply as aiClassifyReply,
} from "../services/salesAi";

function generateId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

export function registerOwnerLeadRoutes(app: Hono<{ Bindings: Record<string, unknown> }>) {

  // ── GET /owner/leads — list leads ──────────────────────────────────────
  app.get("/owner/leads", async (c) => {
    const env = c.env as any;
    const db = env.DB;
    if (!db) return c.json({ ok: false, error: "DB not available" }, 500);

    const status = c.req.query("status") || "";
    const tenantId = c.req.query("tenantId") || "";

    try {
      let sql = "SELECT * FROM sales_leads";
      const params: string[] = [];
      const conditions: string[] = [];

      if (tenantId) {
        conditions.push("tenant_id = ?");
        params.push(tenantId);
      }
      if (status) {
        conditions.push("status = ?");
        params.push(status);
      }

      if (conditions.length) {
        sql += " WHERE " + conditions.join(" AND ");
      }
      sql += " ORDER BY updated_at DESC LIMIT 200";

      const stmt = db.prepare(sql);
      const result = params.length ? await stmt.bind(...params).all() : await stmt.all();

      const leads = (result.results ?? []).map((row: any) => ({
        ...row,
        painPoints: row.pain_points ? JSON.parse(row.pain_points) : null,
        pain_points: undefined,
        bestOffer: row.best_offer,
        best_offer: undefined,
        recommendedChannel: row.recommended_channel,
        recommended_channel: undefined,
        nextAction: row.next_action,
        next_action: undefined,
        aiSummary: row.ai_summary,
        ai_summary: undefined,
        storeName: row.store_name,
        store_name: undefined,
        tenantId: row.tenant_id,
        tenant_id: undefined,
        websiteUrl: row.website_url,
        website_url: undefined,
        instagramUrl: row.instagram_url,
        instagram_url: undefined,
        lineUrl: row.line_url,
        line_url: undefined,
        createdAt: row.created_at,
        created_at: undefined,
        updatedAt: row.updated_at,
        updated_at: undefined,
      }));

      return c.json({ ok: true, leads });
    } catch (e: any) {
      console.error("[owner/leads GET]", String(e?.message ?? e));
      return c.json({ ok: false, error: "Internal error" }, 500);
    }
  });

  // ── POST /owner/leads — create lead ────────────────────────────────────
  app.post("/owner/leads", async (c) => {
    const env = c.env as any;
    const db = env.DB;
    if (!db) return c.json({ ok: false, error: "DB not available" }, 500);

    const body = await c.req.json().catch(() => ({})) as any;
    const { storeName, industry, websiteUrl, instagramUrl, lineUrl, region, notes, tenantId } = body;

    if (!storeName) {
      return c.json({ ok: false, error: "storeName is required" }, 400);
    }

    const id = generateId();
    const now = nowISO();

    try {
      await db.prepare(
        `INSERT INTO sales_leads (id, tenant_id, industry, store_name, website_url, instagram_url, line_url, region, notes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`
      ).bind(
        id,
        tenantId || "default",
        industry || "shared",
        storeName,
        websiteUrl || null,
        instagramUrl || null,
        lineUrl || null,
        region || null,
        notes || null,
        now,
        now,
      ).run();

      return c.json({ ok: true, id, createdAt: now });
    } catch (e: any) {
      console.error("[owner/leads POST]", String(e?.message ?? e));
      return c.json({ ok: false, error: "Internal error" }, 500);
    }
  });

  // ── GET /owner/leads/:id — get lead detail ─────────────────────────────
  app.get("/owner/leads/:id", async (c) => {
    const env = c.env as any;
    const db = env.DB;
    if (!db) return c.json({ ok: false, error: "DB not available" }, 500);

    const id = c.req.param("id");

    try {
      const row = await db.prepare("SELECT * FROM sales_leads WHERE id = ?").bind(id).first();
      if (!row) return c.json({ ok: false, error: "Lead not found" }, 404);

      const drafts = await db.prepare(
        "SELECT * FROM lead_message_drafts WHERE lead_id = ? ORDER BY created_at DESC"
      ).bind(id).all();

      const classifications = await db.prepare(
        "SELECT * FROM lead_reply_classifications WHERE lead_id = ? ORDER BY created_at DESC"
      ).bind(id).all();

      const lead = {
        ...(row as any),
        painPoints: (row as any).pain_points ? JSON.parse((row as any).pain_points) : null,
        bestOffer: (row as any).best_offer,
        recommendedChannel: (row as any).recommended_channel,
        nextAction: (row as any).next_action,
        aiSummary: (row as any).ai_summary,
        storeName: (row as any).store_name,
        tenantId: (row as any).tenant_id,
        websiteUrl: (row as any).website_url,
        instagramUrl: (row as any).instagram_url,
        lineUrl: (row as any).line_url,
        createdAt: (row as any).created_at,
        updatedAt: (row as any).updated_at,
      };

      return c.json({
        ok: true,
        lead,
        drafts: (drafts.results ?? []).map((d: any) => ({
          id: d.id,
          leadId: d.lead_id,
          kind: d.kind,
          subject: d.subject,
          body: d.body,
          createdAt: d.created_at,
        })),
        classifications: (classifications.results ?? []).map((cl: any) => ({
          id: cl.id,
          leadId: cl.lead_id,
          rawReply: cl.raw_reply,
          label: cl.label,
          confidence: cl.confidence,
          suggestedNextAction: cl.suggested_next_action,
          createdAt: cl.created_at,
        })),
      });
    } catch (e: any) {
      console.error("[owner/leads/:id GET]", String(e?.message ?? e));
      return c.json({ ok: false, error: "Internal error" }, 500);
    }
  });

  // ── POST /owner/leads/:id/analyze — AI analyze ────────────────────────
  app.post("/owner/leads/:id/analyze", async (c) => {
    const env = c.env as any;
    const db = env.DB;
    const apiKey: string | undefined = env?.OPENAI_API_KEY;
    if (!db) return c.json({ ok: false, error: "DB not available" }, 500);
    if (!apiKey) return c.json({ ok: false, error: "OPENAI_API_KEY not configured" }, 503);

    const id = c.req.param("id");
    const model = env?.OPENAI_MODEL || undefined;

    try {
      const row = await db.prepare("SELECT * FROM sales_leads WHERE id = ?").bind(id).first() as any;
      if (!row) return c.json({ ok: false, error: "Lead not found" }, 404);

      const result = await aiAnalyzeLead(apiKey, {
        storeName: row.store_name,
        industry: row.industry,
        websiteUrl: row.website_url,
        instagramUrl: row.instagram_url,
        lineUrl: row.line_url,
        region: row.region,
        notes: row.notes,
      }, model);

      const now = nowISO();
      await db.prepare(
        `UPDATE sales_leads SET score = ?, pain_points = ?, best_offer = ?, recommended_channel = ?, next_action = ?, ai_summary = ?, updated_at = ? WHERE id = ?`
      ).bind(
        result.score,
        JSON.stringify(result.painPoints),
        result.bestOffer,
        result.recommendedChannel,
        result.nextAction,
        result.aiSummary,
        now,
        id,
      ).run();

      return c.json({ ok: true, analysis: result, updatedAt: now });
    } catch (e: any) {
      console.error("[owner/leads/:id/analyze]", String(e?.message ?? e));
      return c.json({ ok: false, error: String(e?.message ?? "AI analysis failed") }, 500);
    }
  });

  // ── POST /owner/leads/:id/generate-draft — AI generate drafts ─────────
  app.post("/owner/leads/:id/generate-draft", async (c) => {
    const env = c.env as any;
    const db = env.DB;
    const apiKey: string | undefined = env?.OPENAI_API_KEY;
    if (!db) return c.json({ ok: false, error: "DB not available" }, 500);
    if (!apiKey) return c.json({ ok: false, error: "OPENAI_API_KEY not configured" }, 503);

    const id = c.req.param("id");
    const model = env?.OPENAI_MODEL || undefined;

    try {
      const row = await db.prepare("SELECT * FROM sales_leads WHERE id = ?").bind(id).first() as any;
      if (!row) return c.json({ ok: false, error: "Lead not found" }, 404);

      const painPoints = row.pain_points ? JSON.parse(row.pain_points) : undefined;

      const result = await aiGenerateDrafts(apiKey, {
        storeName: row.store_name,
        industry: row.industry,
        websiteUrl: row.website_url,
        instagramUrl: row.instagram_url,
        region: row.region,
        painPoints,
        bestOffer: row.best_offer,
        notes: row.notes,
      }, model);

      const now = nowISO();
      const drafts = [
        { kind: "email", subject: result.email.subject, body: result.email.body },
        { kind: "line_initial", subject: null, body: result.lineInitial.body },
        { kind: "line_followup", subject: null, body: result.lineFollowup.body },
      ];

      for (const draft of drafts) {
        await db.prepare(
          `INSERT INTO lead_message_drafts (id, lead_id, kind, subject, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(generateId(), id, draft.kind, draft.subject, draft.body, now).run();
      }

      return c.json({ ok: true, drafts: result, createdAt: now });
    } catch (e: any) {
      console.error("[owner/leads/:id/generate-draft]", String(e?.message ?? e));
      return c.json({ ok: false, error: String(e?.message ?? "Draft generation failed") }, 500);
    }
  });

  // ── POST /owner/leads/:id/classify-reply — AI classify reply ──────────
  app.post("/owner/leads/:id/classify-reply", async (c) => {
    const env = c.env as any;
    const db = env.DB;
    const apiKey: string | undefined = env?.OPENAI_API_KEY;
    if (!db) return c.json({ ok: false, error: "DB not available" }, 500);
    if (!apiKey) return c.json({ ok: false, error: "OPENAI_API_KEY not configured" }, 503);

    const id = c.req.param("id");
    const model = env?.OPENAI_MODEL || undefined;
    const body = await c.req.json().catch(() => ({})) as any;
    const { rawReply, previousContext } = body;

    if (!rawReply) {
      return c.json({ ok: false, error: "rawReply is required" }, 400);
    }

    try {
      const row = await db.prepare("SELECT * FROM sales_leads WHERE id = ?").bind(id).first() as any;
      if (!row) return c.json({ ok: false, error: "Lead not found" }, 404);

      const result = await aiClassifyReply(apiKey, {
        storeName: row.store_name,
        industry: row.industry,
        rawReply,
        previousContext,
      }, model);

      const now = nowISO();
      await db.prepare(
        `INSERT INTO lead_reply_classifications (id, lead_id, raw_reply, label, confidence, suggested_next_action, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(generateId(), id, rawReply, result.label, result.confidence, result.suggestedNextAction, now).run();

      return c.json({ ok: true, classification: result, createdAt: now });
    } catch (e: any) {
      console.error("[owner/leads/:id/classify-reply]", String(e?.message ?? e));
      return c.json({ ok: false, error: String(e?.message ?? "Classification failed") }, 500);
    }
  });

  // ── PUT /owner/leads/:id/status — update lead status ──────────────────
  app.put("/owner/leads/:id/status", async (c) => {
    const env = c.env as any;
    const db = env.DB;
    if (!db) return c.json({ ok: false, error: "DB not available" }, 500);

    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({})) as any;
    const { status } = body;

    const validStatuses = ["new", "contacted", "replied", "interested", "meeting", "proposal", "won", "lost"];
    if (!status || !validStatuses.includes(status)) {
      return c.json({ ok: false, error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, 400);
    }

    try {
      const existing = await db.prepare("SELECT id FROM sales_leads WHERE id = ?").bind(id).first();
      if (!existing) return c.json({ ok: false, error: "Lead not found" }, 404);

      const now = nowISO();
      await db.prepare("UPDATE sales_leads SET status = ?, updated_at = ? WHERE id = ?")
        .bind(status, now, id).run();

      return c.json({ ok: true, status, updatedAt: now });
    } catch (e: any) {
      console.error("[owner/leads/:id/status]", String(e?.message ?? e));
      return c.json({ ok: false, error: "Internal error" }, 500);
    }
  });
}
