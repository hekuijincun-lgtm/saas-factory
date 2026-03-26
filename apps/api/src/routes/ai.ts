/**
 * AI routes — AI concierge, sales AI, agents, upsell, followups, dedup, pushq, linelog
 *
 * Extracted from index.ts to reduce file size.
 * All logic is verbatim from the original.
 */
import type { Hono } from "hono";
import { getTenantId, checkTenantMismatch, requireRole } from "../helpers";
import { AICore } from "../ai";
import { getVerticalPlugin } from "../verticals/registry";
import { readRecentAgentLogs, readAgentLogs, listAgents } from "../agents";

// ── AI Default Constants ──────────────────────────────────────────────────────

export const AI_DEFAULT_SETTINGS = {
  enabled: false,
  voice: "friendly",
  answerLength: "normal",
  character: "",
};

export const AI_DEFAULT_POLICY = {
  prohibitedTopics: [] as string[],
  hardRules: [
    "Do not confirm prices or availability without checking official info.",
    "Do not provide medical/illegal advice.",
    "Never claim actions were taken (booking created) — booking is form-only.",
  ],
};

export const AI_DEFAULT_RETENTION = {
  enabled: false,
  templates: [] as any[],
  followupDelayMin: 43200,          // 30 days in minutes
  followupTemplate: "{{customerName}}様、先日はご来店ありがとうございました！またのご来店をお待ちしております。",
  nextRecommendationDaysByMenu: {} as Record<string, number>,
};

export const AI_DEFAULT_UPSELL = {
  enabled: false,
  items: [] as Array<{ id: string; keyword: string; message: string; enabled: boolean }>,
};

// ── helper: safe KV JSON get ──────────────────────────────────────────────────

export async function aiGetJson(kv: any, key: string): Promise<any> {
  try {
    const v = await kv.get(key, "json");
    return v || null;
  } catch {
    try {
      const v2 = await kv.get(key);
      return v2 ? JSON.parse(v2) : null;
    } catch {
      return null;
    }
  }
}

// ── extractResponseText: OpenAI Responses API / Chat Completions 両対応の堅牢なテキスト抽出 ──
// 優先順位:
//   A) resp.output_text (string, 非空)
//   B) resp.output[].content[].text  (type=output_text/text/その他を問わず text フィールドがあれば採用)
//   C) resp.output[].content が文字列ならそれ
//   D) resp.choices[0].message.content  (Chat Completions 互換保険)
//   E) resp.response ネスト（再帰1段）
function extractResponseText(resp: any): string {
  if (!resp || typeof resp !== "object") return "";

  // A) 最上位 output_text
  if (typeof resp.output_text === "string" && resp.output_text.trim()) {
    return resp.output_text.trim();
  }

  // B / C) output 配列を走査
  if (Array.isArray(resp.output)) {
    const parts: string[] = [];
    for (const item of resp.output) {
      if (Array.isArray(item?.content)) {
        // B) content が配列 → 各要素の text フィールドを拾う（type は問わない）
        for (const part of item.content) {
          if (typeof part?.text === "string" && part.text.trim()) {
            parts.push(part.text.trim());
          }
        }
      } else if (typeof item?.content === "string" && item.content.trim()) {
        // C) content が文字列
        parts.push(item.content.trim());
      } else if (typeof item?.text === "string" && item.text.trim()) {
        // item 直下の text
        parts.push(item.text.trim());
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }

  // D) Chat Completions 互換: choices[0].message.content
  const choiceContent = (resp as any)?.choices?.[0]?.message?.content;
  if (typeof choiceContent === "string" && choiceContent.trim()) {
    return choiceContent.trim();
  }

  // E) ネストされた resp.response を1段再帰（ループ防止のため1回のみ）
  if (resp.response && typeof resp.response === "object" && resp.response !== resp) {
    const nested = extractResponseText(resp.response);
    if (nested) return nested;
  }

  return "";
}

// === Intent Classification & suggestedActions Builder (INTENT_V1) ===
type AiIntent = "booking" | "hours" | "menu" | "price" | "location" | "first_visit" | "cancel_policy" | "generic";

function classifyIntent(message: string): AiIntent {
  const m = message.toLowerCase();
  // Order matters: more specific intents first
  if (/予約|空き|ご予約|booking|reserve|フォーム|予約したい|今日.*行ける|明日.*行ける/.test(m)) return "booking";
  if (/キャンセル|取り消し|cancel/.test(m)) return "cancel_policy";
  if (/初めて|初回|はじめて|first|ビギナー|未経験/.test(m)) return "first_visit";
  if (/料金|値段|価格|いくら|price|費用|金額/.test(m)) return "price";
  if (/メニュー|施術|コース|menu|プラン/.test(m)) return "menu";
  if (/営業時間|何時|開店|閉店|営業日|hours|オープン|クローズ|定休日|休み|お休み/.test(m)) return "hours";
  if (/場所|住所|どこ|アクセス|行き方|最寄り|location|address|地図/.test(m)) return "location";
  return "generic";
}

function buildSuggestedActions(intent: AiIntent, bookingUrl: string): { type: string; label?: string; url?: string }[] {
  if (!bookingUrl) return [];
  switch (intent) {
    case "booking":
      return [{ type: "open_booking_form", label: "予約フォームを開く", url: bookingUrl }];
    case "hours":
    case "location":
      return [{ type: "open_booking_form", label: "予約する", url: bookingUrl }];
    case "menu":
    case "price":
      return [{ type: "open_booking_form", label: "メニューを選んで予約", url: bookingUrl }];
    case "first_visit":
      return [{ type: "open_booking_form", label: "初回予約はこちら", url: bookingUrl }];
    case "cancel_policy":
      return [{ type: "open_booking_form", label: "新しい予約を入れる", url: bookingUrl }];
    case "generic":
      return [];
  }
}

function buildCtaText(intent: AiIntent, bookingUrl: string): string {
  if (!bookingUrl) return "";
  switch (intent) {
    case "booking":
      return `\n\nご予約はこちらからどうぞ：${bookingUrl}`;
    case "menu":
    case "price":
      return `\n\n気になるメニューがあれば、こちらからご予約いただけます：${bookingUrl}`;
    case "first_visit":
      return `\n\n初めての方も安心してご予約いただけます：${bookingUrl}`;
    case "hours":
    case "location":
      return `\n\nご来店お待ちしております。ご予約はこちら：${bookingUrl}`;
    case "cancel_policy":
      return `\n\n新しいご予約はこちらからどうぞ：${bookingUrl}`;
    case "generic":
      return "";
  }
}

function resolveBookingUrl(storeSettings: any, env: any, tenantId: string): string {
  return storeSettings?.integrations?.line?.bookingUrl
    || (env?.WEB_BASE ? `${env.WEB_BASE}/booking?tenantId=${tenantId}` : "");
}

// ── Register all AI routes ────────────────────────────────────────────────────

export function registerAiRoutes(app: Hono<any>) {

// GET /admin/ai — combined: settings + policy + retention
app.get("/admin/ai", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "AI_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const [sLegacy, p, r, settingsDoc] = await Promise.all([
      aiGetJson(kv, `ai:settings:${tenantId}`),
      aiGetJson(kv, `ai:policy:${tenantId}`),
      aiGetJson(kv, `ai:retention:${tenantId}`),
      aiGetJson(kv, `settings:${tenantId}`),
    ]);
    // Prefer unified settings.ai, fall back to legacy ai:settings:{tenantId}
    const s = settingsDoc?.ai || sLegacy;
    return c.json({
      ok: true, tenantId, stamp: STAMP,
      settings: { ...AI_DEFAULT_SETTINGS, ...(s || {}) },
      policy: { ...AI_DEFAULT_POLICY, ...(p || {}) },
      retention: { ...AI_DEFAULT_RETENTION, ...(r || {}) },
      source: settingsDoc?.ai ? "unified" : (sLegacy ? "legacy" : "default"),
    });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// PUT /admin/ai — save settings/policy/retention (partial merge)
app.put("/admin/ai", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const STAMP = "AI_PUT_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body: any = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, stamp: STAMP, error: "bad_json" }, 400);
    const saved: string[] = [];
    if (body.settings != null && typeof body.settings === "object") {
      const legacyKey = `ai:settings:${tenantId}`;
      const ex = (await aiGetJson(kv, legacyKey)) || {};
      const mergedAi = { ...AI_DEFAULT_SETTINGS, ...ex, ...body.settings };
      await kv.put(legacyKey, JSON.stringify(mergedAi));

      // dual-write: settings:{tenantId}.ai に統合
      const settingsKey = `settings:${tenantId}`;
      let settingsDoc: any = {};
      try { const raw = await kv.get(settingsKey, "json"); if (raw && typeof raw === "object") settingsDoc = raw; } catch {}
      settingsDoc.ai = {
        enabled: mergedAi.enabled === true,
        voice: mergedAi.voice ?? "friendly",
        answerLength: mergedAi.answerLength ?? "normal",
        character: mergedAi.character ?? "",
      };
      await kv.put(settingsKey, JSON.stringify(settingsDoc));

      saved.push("settings");
    }
    if (body.policy != null && typeof body.policy === "object") {
      const key = `ai:policy:${tenantId}`;
      const ex = (await aiGetJson(kv, key)) || {};
      await kv.put(key, JSON.stringify({ ...AI_DEFAULT_POLICY, ...ex, ...body.policy }));
      saved.push("policy");
    }
    if (body.retention != null && typeof body.retention === "object") {
      const key = `ai:retention:${tenantId}`;
      const ex = (await aiGetJson(kv, key)) || {};
      await kv.put(key, JSON.stringify({ ...AI_DEFAULT_RETENTION, ...ex, ...body.retention }));
      saved.push("retention");
    }
    return c.json({ ok: true, tenantId, stamp: STAMP, saved });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// GET /admin/ai/faq
app.get("/admin/ai/faq", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "AI_FAQ_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const faqRaw = await aiGetJson(kv, `ai:faq:${tenantId}`);
    const faq = Array.isArray(faqRaw) ? faqRaw : [];
    return c.json({ ok: true, tenantId, stamp: STAMP, faq });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// POST /admin/ai/faq
app.post("/admin/ai/faq", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const STAMP = "AI_FAQ_POST_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body: any = await c.req.json().catch(() => null);
    if (!body?.question || !body?.answer) {
      return c.json({ ok: false, stamp: STAMP, error: "missing_fields", hint: "question and answer required" }, 400);
    }
    const key = `ai:faq:${tenantId}`;
    const faqRaw = await aiGetJson(kv, key);
    const faq: any[] = Array.isArray(faqRaw) ? faqRaw : [];
    const item = {
      id: crypto.randomUUID(),
      question: String(body.question).trim(),
      answer: String(body.answer).trim(),
      tags: Array.isArray(body.tags) ? body.tags : [],
      enabled: body.enabled !== false,
      updatedAt: Date.now(),
    };
    faq.push(item);
    await kv.put(key, JSON.stringify(faq));
    return c.json({ ok: true, tenantId, stamp: STAMP, item });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// DELETE /admin/ai/faq/:id
app.delete("/admin/ai/faq/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const STAMP = "AI_FAQ_DELETE_V1";
  const tenantId = getTenantId(c, null);
  const id = c.req.param("id");
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const key = `ai:faq:${tenantId}`;
    const faqRaw = await aiGetJson(kv, key);
    const faq: any[] = Array.isArray(faqRaw) ? faqRaw : [];
    const before = faq.length;
    const next = faq.filter((f: any) => f.id !== id);
    await kv.put(key, JSON.stringify(next));
    return c.json({ ok: true, tenantId, stamp: STAMP, id, deleted: before - next.length });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// GET /admin/ai/policy
app.get("/admin/ai/policy", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "AI_POLICY_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const p = await aiGetJson(kv, `ai:policy:${tenantId}`);
    return c.json({ ok: true, tenantId, stamp: STAMP, policy: { ...AI_DEFAULT_POLICY, ...(p || {}) } });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// PUT /admin/ai/policy
app.put("/admin/ai/policy", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const STAMP = "AI_POLICY_PUT_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body: any = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, stamp: STAMP, error: "bad_json" }, 400);
    const key = `ai:policy:${tenantId}`;
    const ex = (await aiGetJson(kv, key)) || {};
    const merged = {
      ...AI_DEFAULT_POLICY, ...ex,
      ...(body.prohibitedTopics != null ? { prohibitedTopics: Array.isArray(body.prohibitedTopics) ? body.prohibitedTopics : [] } : {}),
      ...(body.hardRules != null ? { hardRules: Array.isArray(body.hardRules) ? body.hardRules : [] } : {}),
    };
    await kv.put(key, JSON.stringify(merged));
    return c.json({ ok: true, tenantId, stamp: STAMP, policy: merged });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// GET /admin/ai/retention
app.get("/admin/ai/retention", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "AI_RETENTION_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const r = await aiGetJson(kv, `ai:retention:${tenantId}`);
    return c.json({ ok: true, tenantId, stamp: STAMP, retention: { ...AI_DEFAULT_RETENTION, ...(r || {}) } });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// PUT /admin/ai/retention
app.put("/admin/ai/retention", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const STAMP = "AI_RETENTION_PUT_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body: any = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, stamp: STAMP, error: "bad_json" }, 400);
    const key = `ai:retention:${tenantId}`;
    const ex = (await aiGetJson(kv, key)) || {};
    const merged = { ...AI_DEFAULT_RETENTION, ...ex, ...body };
    await kv.put(key, JSON.stringify(merged));
    return c.json({ ok: true, tenantId, stamp: STAMP, retention: merged });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// GET /sales-ai/config — lightweight sales AI config read (no auth)
// Used by LINE webhook to load per-account sales AI configuration.
// Completely separate from tenant AI接客 (ai:settings:{tenantId}).
// Supports two lookup modes:
//   1. ?accountId=xxx  — direct KV lookup (fast)
//   2. ?tenantId=xxx   — reverse lookup: settings:{tenantId} → lineAccounts[purpose=sales] → owner:sales-ai:{id}
app.get("/sales-ai/config", async (c) => {
  let accountId = (c.req.query("accountId") ?? "").trim();
  const tenantId = (c.req.query("tenantId") ?? "").trim();
  const kv = (c.env as any)?.SAAS_FACTORY;
  if (!kv) return c.json({ ok: true, accountId: accountId || null, config: null });

  // Reverse lookup: tenantId → first active sales lineAccount → fallback to tenantId as accountId
  if (!accountId && tenantId) {
    try {
      const settings = await kv.get(`settings:${tenantId}`, "json") as any;
      const salesAcct = (settings?.lineAccounts ?? []).find(
        (a: any) => a?.purpose === "sales" && a?.status === "active" && a?.id
      );
      if (salesAcct) {
        accountId = salesAcct.id;
        console.log(`[SALES_AI_CFG] tenantId reverse lookup: ${tenantId} → accountId=${accountId}`);
      }
    } catch {}
    // Legacy single-account fallback: use tenantId as accountId
    if (!accountId) {
      accountId = tenantId;
      console.log(`[SALES_AI_CFG] legacy fallback: using tenantId=${tenantId} as accountId`);
    }
  }

  if (!accountId) return c.json({ ok: false, error: "missing accountId (no sales lineAccount found)" }, 400);

  try {
    let raw = await kv.get(`owner:sales-ai:${accountId}`, "json") as any;
    // Auto-seed: when no config exists and ?seed=llm is passed, create one with LLM enabled
    if (!raw && c.req.query("seed") === "llm") {
      raw = {
        enabled: true,
        welcomeMessage: "",
        fallbackMessage: "申し訳ありません、ただいま応答できません。後ほどご連絡いたします。",
        tone: "friendly",
        goal: "demo",
        cta: { label: "", url: "" },
        intents: [],
        llm: { enabled: true, model: "gpt-4o", systemPrompt: "", temperature: 0.7, maxTokens: 800 },
        handoffMessage: "担当者よりご連絡します。少々お待ちください。",
        seededAt: new Date().toISOString(),
      };
      await kv.put(`owner:sales-ai:${accountId}`, JSON.stringify(raw));
      console.log(`[SALES_AI_CFG] auto-seeded config for accountId=${accountId}`);
    }
    if (!raw) return c.json({ ok: true, accountId, config: null });
    // Return only webhook-relevant fields (exclude internal metadata)
    const config = {
      enabled: raw.enabled ?? false,
      welcomeMessage: raw.welcomeMessage ?? "",
      fallbackMessage: raw.fallbackMessage ?? "",
      handoffMessage: raw.handoffMessage ?? "",
      tone: raw.tone ?? "friendly",
      goal: raw.goal ?? "demo",
      cta: raw.cta ?? { label: "", url: "" },
      intents: Array.isArray(raw.intents) ? raw.intents.map((i: any) => ({
        key: i.key, label: i.label, keywords: i.keywords ?? [],
        reply: i.reply ?? "", ctaLabel: i.ctaLabel ?? "", ctaUrl: i.ctaUrl ?? "",
      })) : [],
      llm: raw.llm ?? { enabled: false, model: "", systemPrompt: "", temperature: 0.7, maxTokens: 800 },
    };
    return c.json({ ok: true, accountId, config });
  } catch {
    return c.json({ ok: true, accountId, config: null });
  }
});

// POST /sales-ai/chat — LLM fallback for sales LINE (internal only, x-internal-token auth)
// Completely separate from tenant AI接客 (POST /ai/chat).
app.post("/sales-ai/chat", async (c) => {
  const env = c.env as any;

  // ── Auth: require LINE_INTERNAL_TOKEN (same as /internal/* routes) ──
  const expected = String(env?.LINE_INTERNAL_TOKEN ?? "").trim();
  const provided = String(c.req.header("x-internal-token") ?? "").trim();
  if (!expected || !provided || provided !== expected) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }

  const apiKey: string | undefined = env?.OPENAI_API_KEY;
  if (!apiKey) return c.json({ ok: false, error: "not_configured" });

  const body: any = await c.req.json().catch(() => ({}));
  let accountId = String(body?.accountId ?? "").trim();
  const tenantId = String(body?.tenantId ?? "").trim();
  const message = String(body?.message ?? "").trim();
  if (!message) return c.json({ ok: false, error: "missing message" }, 400);

  const kv = env?.SAAS_FACTORY;
  if (!kv) return c.json({ ok: false, error: "kv_unavailable" }, 500);

  // Reverse lookup: tenantId → first active sales lineAccount → fallback to tenantId as accountId
  if (!accountId && tenantId) {
    try {
      const settings = await kv.get(`settings:${tenantId}`, "json") as any;
      const salesAcct = (settings?.lineAccounts ?? []).find(
        (a: any) => a?.purpose === "sales" && a?.status === "active" && a?.id
      );
      if (salesAcct) {
        accountId = salesAcct.id;
        console.log(`[SALES_AI_CHAT] tenantId reverse lookup: ${tenantId} → accountId=${accountId}`);
      }
    } catch {}
    // Legacy single-account fallback: use tenantId as accountId
    if (!accountId) {
      accountId = tenantId;
      console.log(`[SALES_AI_CHAT] legacy fallback: using tenantId=${tenantId} as accountId`);
    }
  }

  if (!accountId) return c.json({ ok: false, error: "missing accountId (no sales lineAccount found)" }, 400);

  try {
    const raw = await kv.get(`owner:sales-ai:${accountId}`, "json") as any;
    if (!raw?.llm?.enabled) return c.json({ ok: false, error: "llm_disabled" });

    const config = raw;
    const model = config.llm.model?.trim() || "gpt-4o";
    const intentSummary = (config.intents ?? []).map((i: any) => `${i.label}(${i.key})`).join(", ");
    const systemPrompt = [
      `あなたはLumiBookの営業アシスタントです。トーン: ${config.tone ?? "friendly"}。ゴール: ${config.goal ?? "demo"}。`,
      `既存のキーワード応答（${intentSummary}）にマッチしなかったメッセージに対して、自然で有用な返答を生成してください。`,
      `CTAがある場合: ${config.cta?.url || "なし"}`,
      config.llm.systemPrompt ? `\nカスタム指示:\n${config.llm.systemPrompt}` : "",
    ].filter(Boolean).join("\n");

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: config.llm.temperature ?? 0.7,
        max_output_tokens: config.llm.maxTokens ?? 800,
      }),
    });
    const openaiStatus = openaiRes.status;
    const openaiData = await openaiRes.json().catch(() => null) as any;
    if (!openaiRes.ok || !openaiData) {
      const errPreview = JSON.stringify(openaiData ?? {}).slice(0, 300);
      console.log(`[SALES_AI_CHAT] openai_error status=${openaiStatus} model=${model} accountId=${accountId} body=${errPreview}`);
      return c.json({ ok: false, error: "openai_error", openaiHttpStatus: openaiStatus, openaiErrorPreview: errPreview });
    }
    const answer = extractResponseText(openaiData);
    if (!answer) {
      const keys = Object.keys(openaiData ?? {}).join(",");
      console.log(`[SALES_AI_CHAT] empty response model=${model} accountId=${accountId} keys=${keys}`);
      return c.json({ ok: false, error: "empty_response", openaiHttpStatus: openaiStatus, openaiKeys: keys });
    }

    console.log(`[SALES_AI_CHAT] ok model=${model} accountId=${accountId} answerLen=${answer.length}`);
    return c.json({ ok: true, answer, model });
  } catch (e: any) {
    console.error(`[SALES_AI_CHAT] error: ${String(e?.message ?? e).slice(0, 200)}`);
    return c.json({ ok: false, error: "internal_error", detail: String(e?.message ?? e).slice(0, 200) }, 500);
  }
});

// GET /admin/ai/usage — AI Core usage log (recent entries)
app.get("/admin/ai/usage", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const kv = (c.env as any)?.SAAS_FACTORY;
  if (!kv) return c.json({ ok: true, tenantId, usage: [] });
  try {
    const { readRecentUsageLogs } = await import("../ai/usage-log");
    const logs = await readRecentUsageLogs(kv, tenantId, limit);
    return c.json({ ok: true, tenantId, usage: logs });
  } catch (err: any) {
    return c.json({ ok: false, tenantId, error: err?.message ?? "usage_log_error" }, 500);
  }
});

// ── Agent Core Admin Endpoints ────────────────────────────────────────────

// GET /admin/agents — list registered agent types
app.get("/admin/agents", async (c) => {
  return c.json({ ok: true, agents: listAgents() });
});

// GET /admin/agents/logs — recent agent execution logs
app.get("/admin/agents/logs", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const agentId = c.req.query("agentId");
  const kv = (c.env as any)?.SAAS_FACTORY;
  if (!kv) return c.json({ ok: true, tenantId, logs: [] });
  try {
    const logs = agentId
      ? await readAgentLogs(kv, tenantId, agentId, limit)
      : await readRecentAgentLogs(kv, tenantId, limit);
    return c.json({ ok: true, tenantId, logs });
  } catch (err: any) {
    return c.json({ ok: false, tenantId, error: err?.message ?? "agent_log_error" }, 500);
  }
});

// POST /admin/agents/trigger — manually trigger an agent (for testing)
app.post("/admin/agents/trigger", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  try {
    const body: any = await c.req.json().catch(() => ({}));
    const { agentType, triggerType, payload } = body;
    if (!agentType || !triggerType) {
      return c.json({ ok: false, error: "agentType and triggerType required" }, 400);
    }
    const { runAgent } = await import("../agents/core");
    const result = await runAgent(
      { tenantId, agentType, triggerType, triggerPayload: payload ?? {} },
      c.env as any,
    );
    return c.json({ ok: true, tenantId, result: { status: result?.state?.status, agentId: result?.state?.agentId, steps: result?.steps?.length ?? 0 } });
  } catch (err: any) {
    return c.json({ ok: false, tenantId, error: err?.message ?? "trigger_error" }, 500);
  }
});

// GET /ai/enabled — lightweight AI enabled check (no auth, single KV read)
app.get("/ai/enabled", async (c) => {
  const tenantId = getTenantId(c, null);
  const kv = (c.env as any)?.SAAS_FACTORY;
  if (!kv) return c.json({ ok: true, tenantId, enabled: false, source: "no_kv" });
  // Prefer unified settings:{tenantId}.ai, fall back to legacy ai:settings:{tenantId}
  const settingsDoc = await aiGetJson(kv, `settings:${tenantId}`);
  if (settingsDoc?.ai?.enabled !== undefined) {
    const enabled = settingsDoc.ai.enabled === true;
    console.log(`[AI_GATE] tenant=${tenantId} enabled=${enabled} source=unified path=/ai/enabled`);
    return c.json({ ok: true, tenantId, enabled, source: "unified" });
  }
  const s = await aiGetJson(kv, `ai:settings:${tenantId}`);
  const enabled = s?.enabled === true;
  console.log(`[AI_GATE] tenant=${tenantId} enabled=${enabled} source=legacy path=/ai/enabled`);
  return c.json({ ok: true, tenantId, enabled, source: "legacy" });
});

// POST /ai/chat — OpenAI Responses API (AI_CHAT_V4)
// V4変更点: intent分類 + intent別suggestedActions + CTA自然挿入
app.post("/ai/chat", async (c) => {
  const STAMP = "AI_CHAT_V4";
  const env = c.env as any;
  let tenantId = "default";
  const isDebug = c.req.query("debug") === "1";
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  try {
    const body: any = await c.req.json().catch(() => ({}));
    tenantId = getTenantId(c, body);

    // 1. OPENAI_API_KEY チェック（未設定は not_configured を 200 で返す）
    const apiKey: string | undefined = env?.OPENAI_API_KEY;
    if (!apiKey) {
      return c.json({ ok: false, stamp: STAMP, tenantId, error: "not_configured", detail: "OPENAI_API_KEY missing" });
    }

    // 2. ユーザーメッセージ検証
    const message = String(body?.message ?? "").trim();
    if (!message) {
      return c.json({ ok: false, stamp: STAMP, tenantId, error: "missing_message", detail: "message is required" });
    }

    // 3. モデル選択（env.OPENAI_MODEL → "gpt-4o"）
    const model = String(env?.OPENAI_MODEL || "gpt-4o").trim() || "gpt-4o";

    // 4. テナントの AI 設定・ポリシー・FAQ・upsell・店舗設定・メニュー を KV から取得
    const kv = env?.SAAS_FACTORY;
    let aiSettings: any = { voice: "friendly", character: "", answerLength: "normal" };
    let aiPolicy: any = { prohibitedTopics: [] as string[], hardRules: [] as string[] };
    let aiFaq: any[] = [];
    let aiUpsell: any = { ...AI_DEFAULT_UPSELL };
    let storeSettings: any = null;
    let menuList: any[] = [];
    let staffList: any[] = [];
    if (kv) {
      const [s, p, f, u, ss, ml, sl] = await Promise.all([
        aiGetJson(kv, `ai:settings:${tenantId}`),
        aiGetJson(kv, `ai:policy:${tenantId}`),
        aiGetJson(kv, `ai:faq:${tenantId}`),
        aiGetJson(kv, `ai:upsell:${tenantId}`),
        aiGetJson(kv, `settings:${tenantId}`),
        aiGetJson(kv, `admin:menu:list:${tenantId}`),
        aiGetJson(kv, `admin:staff:list:${tenantId}`),
      ]);
      // Prefer unified settings.ai, fall back to legacy ai:settings:{tenantId}
      const unifiedAi = ss?.ai;
      const legacyAi = s;
      const aiSource = unifiedAi ? "unified" : (legacyAi ? "legacy" : "default");
      const effectiveAi = unifiedAi || legacyAi;
      if (effectiveAi && typeof effectiveAi === "object") aiSettings = { ...aiSettings, ...effectiveAi };

      if (p && typeof p === "object") aiPolicy = { ...aiPolicy, ...p };
      if (Array.isArray(f)) aiFaq = f.filter((x: any) => x.enabled !== false);
      if (u && typeof u === "object") aiUpsell = { ...AI_DEFAULT_UPSELL, ...u };
      if (ss && typeof ss === "object") storeSettings = ss;
      if (Array.isArray(ml)) menuList = ml.filter((m: any) => m.active !== false);
      if (Array.isArray(sl)) staffList = sl.filter((s: any) => s.active !== false);
    }

    console.log(`[AI_SETTINGS_LOAD]`, JSON.stringify({
      tenantId,
      enabled: aiSettings.enabled ?? false,
      voice: aiSettings.voice,
      answerLength: aiSettings.answerLength,
      characterPresent: !!aiSettings.character,
      source: kv ? (storeSettings?.ai ? "unified" : "legacy") : "default",
    }));

    // aiConfig snapshot — returned in ALL responses for webhook observability
    const aiConfig = {
      enabled: aiSettings.enabled === true,
      voice: aiSettings.voice ?? "friendly",
      answerLength: aiSettings.answerLength ?? "normal",
      character: aiSettings.character ? String(aiSettings.character).slice(0, 50) : "",
    };

    // 4.4 AI 有効判定（管理画面の「AI接客を有効化」トグルを反映）
    if (aiSettings.enabled !== true) {
      console.log(`[AI_GATE] tenant=${tenantId} enabled=false path=/ai/chat`);
      return c.json({ ok: false, stamp: STAMP, tenantId, error: "ai_disabled", aiConfig });
    }

    // 4.5 レート制限（KV, 60 req / 10 min per tenantId+IP）
    const ip = c.req.header("cf-connecting-ip") || c.req.header("x-real-ip") || "unknown";
    const rlKey = `ai:rl:${tenantId}:${ip}`;
    if (kv) {
      try {
        const rlRaw = await kv.get(rlKey);
        const rl = rlRaw ? JSON.parse(rlRaw) : { count: 0, windowStart: Date.now() };
        const now = Date.now();
        if (now - rl.windowStart > 600000) { rl.count = 1; rl.windowStart = now; }
        else { rl.count++; }
        if (rl.count > 60) {
          return c.json({ ok: false, stamp: STAMP, tenantId, error: "rate_limited" }, 429);
        }
        await kv.put(rlKey, JSON.stringify(rl), { expirationTtl: 700 });
      } catch { /* RL errors are non-fatal */ }
    }

    // 4.6 FAQ 優先マッチ：enabled な FAQ に質問が一致したら OpenAI をスキップ
    const faqMatch = aiFaq.find((fItem: any) => {
      const q = String(fItem.question ?? "").toLowerCase().trim();
      const m = message.toLowerCase();
      return q && (m === q || m.includes(q) || q.includes(m));
    });
    if (faqMatch) {
      let faqAnswer = String(faqMatch.answer ?? "").trim();
      if (faqAnswer) {
        const faqIntent = classifyIntent(message);
        const faqBookingUrl = resolveBookingUrl(storeSettings, env, tenantId);
        const suggestedActions = buildSuggestedActions(faqIntent, faqBookingUrl);
        const cta = buildCtaText(faqIntent, faqBookingUrl);
        if (cta) faqAnswer = faqAnswer + cta;
        return c.json({ ok: true, stamp: STAMP, tenantId, answer: faqAnswer, suggestedActions, intent: faqIntent, source: "faq", aiConfig });
      }
    }

    // 5. 店舗情報コンテキスト構築（未設定項目は安全に省略）
    const storeContextLines: string[] = [];
    if (storeSettings) {
      const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];
      const sn = storeSettings.storeName;
      if (sn) storeContextLines.push(`店舗名: ${sn}`);
      const addr = storeSettings.storeAddress;
      if (addr) storeContextLines.push(`住所: ${addr}`);
      const phone = storeSettings.phone;
      if (phone) storeContextLines.push(`電話番号: ${phone}`);
      const instagram = storeSettings.instagram;
      if (instagram) storeContextLines.push(`Instagram: ${instagram}`);
      const bh = storeSettings.businessHours;
      if (bh?.openTime && bh?.closeTime) storeContextLines.push(`営業時間: ${bh.openTime}〜${bh.closeTime}`);
      const cw: number[] = storeSettings.closedWeekdays;
      if (Array.isArray(cw) && cw.length > 0) {
        storeContextLines.push(`定休日: ${cw.map((d: number) => WEEKDAY_NAMES[d] ?? String(d)).join("・")}曜日`);
      }
      const bookingUrl = storeSettings.integrations?.line?.bookingUrl
        || (env?.WEB_BASE ? `${env.WEB_BASE}/booking?tenantId=${tenantId}` : "");
      if (bookingUrl) storeContextLines.push(`予約ページURL: ${bookingUrl}`);
      const cancel = storeSettings.rules?.cancelMinutes;
      if (typeof cancel === "number" && cancel > 0) {
        const h = Math.floor(cancel / 60);
        const m = cancel % 60;
        const txt = h > 0 ? (m > 0 ? `${h}時間${m}分前` : `${h}時間前`) : `${m}分前`;
        storeContextLines.push(`キャンセル期限: 予約の${txt}まで`);
      }
    }
    // メニュー要約（上位10件、名前・価格・所要時間のみ）
    if (menuList.length > 0) {
      const menuSummary = menuList.slice(0, 10).map((m: any) => {
        const parts = [m.name];
        if (typeof m.price === "number") parts.push(`¥${m.price.toLocaleString()}`);
        if (typeof m.durationMin === "number") parts.push(`${m.durationMin}分`);
        return parts.join(" / ");
      }).join("\n");
      storeContextLines.push(`\nメニュー一覧:\n${menuSummary}`);
    }
    // スタッフ要約（上位8件、名前・役職のみ）
    if (staffList.length > 0) {
      const staffSummary = staffList.slice(0, 8).map((s: any) => {
        const parts = [s.name];
        if (s.role) parts.push(s.role);
        return parts.join(" / ");
      }).join("\n");
      storeContextLines.push(`\nスタッフ一覧:\n${staffSummary}`);
    }
    const storeBlock = storeContextLines.length > 0
      ? "\n\n## 店舗情報（この情報に基づいて正確に案内してください）\n" + storeContextLines.join("\n")
      : "";

    // 5.1 FAQ / ポリシーブロック
    const faqBlock = aiFaq.length > 0
      ? "\n\n## FAQ（よくある質問と回答）\n" +
        aiFaq.slice(0, 20).map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")
      : "";
    const hardRulesBlock = (aiPolicy.hardRules as string[]).length > 0
      ? "\n\n## 禁止ルール\n" + (aiPolicy.hardRules as string[]).map((r: string) => `- ${r}`).join("\n")
      : "";
    const prohibitedBlock = (aiPolicy.prohibitedTopics as string[]).length > 0
      ? "\n\n## 禁止トピック: " + (aiPolicy.prohibitedTopics as string[]).join(", ")
      : "";

    // voice / answerLength を具体的な日本語指示に変換
    const voiceMap: Record<string, string> = {
      friendly: "親しみやすく温かい口調で話してください。絵文字を適度に使い、お客様との距離が近い接客をしてください。",
      formal: "丁寧で礼儀正しい敬語を使ってください。「です・ます」調で、落ち着いた品のある接客をしてください。",
      casual: "気さくでカジュアルな口調で話してください。堅苦しくない、友達のような自然体の接客をしてください。",
      professional: "専門的で信頼感のある口調で話してください。的確で簡潔に、プロフェッショナルな接客をしてください。",
    };
    const answerLengthMap: Record<string, string> = {
      short: "回答は1〜2文の簡潔なものにしてください。",
      normal: "回答は適度な長さ（3〜4文程度）にしてください。",
      long: "回答は丁寧に詳しく説明してください。",
    };
    const voiceInstruction = voiceMap[aiSettings.voice] ?? voiceMap.friendly;
    const lengthInstruction = answerLengthMap[aiSettings.answerLength] ?? answerLengthMap.normal;

    // Phase 13: vertical-aware AI prompt injection
    const verticalPlugin = getVerticalPlugin(storeSettings?.vertical);
    const verticalAiHint = verticalPlugin.aiConfig?.systemPromptHint
      ? `\n## 業種情報\n${verticalPlugin.aiConfig.systemPromptHint}`
      : "";
    const verticalSafetyNotes = verticalPlugin.aiConfig?.safetyNotes
      ? `\n## 業種固有の注意事項\n${verticalPlugin.aiConfig.safetyNotes}`
      : "";
    const verticalBookingEmphasis = verticalPlugin.aiConfig?.bookingEmphasis
      ? `\n予約誘導のヒント: ${verticalPlugin.aiConfig.bookingEmphasis}`
      : "";

    const systemContent = [
      storeSettings?.storeName
        ? `あなたは「${storeSettings.storeName}」のAIアシスタントです。`
        : "あなたはお店のAIアシスタントです。",
      aiSettings.character ? `キャラクター設定: ${aiSettings.character}` : "",
      voiceInstruction,
      lengthInstruction,
      verticalAiHint,
      storeBlock,
      "",
      "## 絶対に守るルール",
      "- 予約はフォームでのみ確定します。あなたは予約を作ったり確約したりしません。",
      "- 店舗情報セクションに記載された情報はそのまま案内してください。",
      "- 店舗情報セクションに無い情報は「お問い合わせください」と案内してください。",
      "- 料金は店舗情報のメニュー一覧に記載がある場合のみ案内し、空き枠は断定しません。",
      "- スタッフ名はスタッフ一覧に記載された名前のみ案内してください。",
      "- 予約に関する質問には「予約フォームからご予約ください」と案内してください（URLはシステムが自動追記するため回答文に含めないでください）。",
      "- 医療・法律・政治・宗教などのアドバイスはしません。",
      "- booking created や reservation confirmed などの行動を起こしたとは絶対に言いません。",
      faqBlock,
      hardRulesBlock,
      prohibitedBlock,
      verticalSafetyNotes,
      verticalBookingEmphasis,
    ].filter(Boolean).join("\n");

    console.log(`[AI_PROMPT_BUILD]`, JSON.stringify({
      tenantId,
      voice: aiSettings.voice,
      answerLength: aiSettings.answerLength,
      characterPreview: String(aiSettings.character ?? "").slice(0, 40) || "(none)",
      usedDefaultCharacter: !aiSettings.character,
      storeBlockLen: storeBlock.length,
      faqCount: aiFaq.length,
      model,
      systemPromptLen: systemContent.length,
    }));

    // 6. AI Core 経由での呼び出し（fallback: 従来の直接 OpenAI Responses API）
    let answer = "";
    let aiCoreUsed = false;

    // 6a. AI Core path — unified provider routing with fallback
    try {
      const aiCore = new AICore(env as any);
      if (aiCore.hasProvider("openai") || aiCore.hasProvider("gemini")) {
        const aiCoreVars: Record<string, string> = {
          characterLine: [
            storeSettings?.storeName
              ? `あなたは「${storeSettings.storeName}」のAIアシスタントです。`
              : "あなたはお店のAIアシスタントです。",
            aiSettings.character ? `キャラクター設定: ${aiSettings.character}` : "",
          ].filter(Boolean).join("\n"),
          voiceInstruction,
          lengthInstruction,
          verticalAiHint,
          storeBlock,
          faqBlock,
          hardRulesBlock,
          prohibitedBlock,
          verticalSafetyNotes,
          verticalBookingEmphasis,
          message,
        };

        const result = await aiCore.generateText({
          capability: "text_generation",
          tenantId,
          app: "booking",
          feature: "concierge",
          task: "booking_reply",
          promptKey: "booking.concierge.reply.v1",
          variables: aiCoreVars,
          maxOutputTokens: 1600,
          fallbackEnabled: true,
          channel: "line",
        });

        if (result.meta.success && result.text) {
          answer = result.text;
          aiCoreUsed = true;
          console.log(`[AI_CORE] booking_reply success provider=${result.meta.provider} model=${result.meta.model} latency=${result.meta.latencyMs}ms fallback=${result.meta.fallbackUsed}`);
        }
      }
    } catch (aiCoreErr: any) {
      console.error(`[AI_CORE] booking_reply failed, falling back to legacy:`, aiCoreErr?.message ?? aiCoreErr);
    }

    // 6b. Legacy direct OpenAI Responses API (fallback if AI Core didn't produce answer)
    if (!answer) {
      const openaiPayload = {
        model,
        store: false,
        max_output_tokens: 1600,
        input: [
          { role: "system", content: systemContent },
          { role: "user", content: message },
        ],
      };

      let openaiRes: any = null;
      let openaiStatus = 0;
      try {
        const r = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(openaiPayload),
        });
        openaiStatus = r.status;
        openaiRes = await r.json().catch(() => null);
      } catch (fetchErr: any) {
        return c.json({ ok: false, stamp: STAMP, tenantId, error: "upstream_error", detail: String(fetchErr?.message ?? fetchErr) });
      }

      if (!openaiRes || openaiStatus !== 200) {
        const detail = openaiRes?.error?.message ?? openaiRes?.error ?? `HTTP ${openaiStatus}`;
        return c.json({ ok: false, stamp: STAMP, tenantId, error: "upstream_error", detail: String(detail) });
      }

      // retrieve ポーリング（incomplete / in_progress / queued のとき最大 3 回待つ）
      const statusHistory: string[] = [String(openaiRes?.status ?? "unknown")];
      const RETRY_DELAYS_MS = [250, 400, 650] as const;
      const responseId: string | undefined = openaiRes?.id;
      const needsPoll = (s: string) => s === "incomplete" || s === "in_progress" || s === "queued";

      if (responseId && needsPoll(openaiRes?.status)) {
        for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
          await sleep(RETRY_DELAYS_MS[i]);
          try {
            const rr = await fetch(`https://api.openai.com/v1/responses/${responseId}`, {
              method: "GET",
              headers: { "Authorization": `Bearer ${apiKey}` },
            });
            if (rr.ok) {
              const retrieved: any = await rr.json().catch(() => null);
              if (retrieved && typeof retrieved === "object") {
                openaiRes = retrieved;
                statusHistory.push(String(retrieved?.status ?? "unknown"));
              }
            }
          } catch {
            // retrieve 失敗は無視して最後の状態を使い続ける
          }
          if (!needsPoll(openaiRes?.status)) break;
        }
      }

      if (openaiRes?.status === "incomplete") {
        const rawHint = isDebug ? {
          statusHistory,
          outputTypes: Array.isArray(openaiRes?.output)
            ? openaiRes.output.map((x: any) => x?.type ?? null)
            : null,
          incompleteDetails: openaiRes?.incomplete_details ?? null,
        } : undefined;
        return c.json({
          ok: false, stamp: STAMP, tenantId,
          error: "incomplete",
          detail: "OpenAI response did not complete (token limit exceeded)",
          ...(rawHint !== undefined ? { rawHint } : {}),
        });
      }

      answer = extractResponseText(openaiRes);
      if (!answer) {
        const rawHint = isDebug ? {
          statusHistory,
          keys: Object.keys(openaiRes),
          responseStatus: openaiRes?.status,
          outputLength: Array.isArray(openaiRes?.output) ? openaiRes.output.length : null,
          outputTypes: Array.isArray(openaiRes?.output)
            ? openaiRes.output.map((x: any) => x?.type ?? null)
            : null,
          hasOutputText: typeof openaiRes?.output_text === "string",
          outputTextLen: typeof openaiRes?.output_text === "string" ? openaiRes.output_text.length : 0,
          firstContentInfo: Array.isArray(openaiRes?.output) && openaiRes.output.length > 0
            && Array.isArray(openaiRes.output[0]?.content)
            ? openaiRes.output[0].content.map((x: any) => ({
                type: x?.type ?? null,
                hasText: typeof x?.text === "string",
                textLen: typeof x?.text === "string" ? x.text.length : 0,
              }))
            : null,
        } : undefined;
        return c.json({
          ok: false, stamp: STAMP, tenantId,
          error: "empty_response",
          detail: isDebug ? "No text extracted (debug)" : "No text extracted",
          ...(rawHint !== undefined ? { rawHint } : {}),
        });
      }
    }

    // 10. Intent分類 + suggestedActions + CTA挿入
    const intent = classifyIntent(message);
    const bookingUrl = resolveBookingUrl(storeSettings, env, tenantId);
    const suggestedActions = buildSuggestedActions(intent, bookingUrl);
    const cta = buildCtaText(intent, bookingUrl);
    if (cta) answer = answer + cta;

    // 11. Upsell injection: キーワードに一致する upsell メッセージを末尾追記
    if (aiUpsell.enabled && Array.isArray(aiUpsell.items) && aiUpsell.items.length > 0) {
      const matchedUpsells = (aiUpsell.items as any[]).filter((item: any) => {
        if (item.enabled === false) return false;
        const kw = String(item.keyword ?? "").toLowerCase().trim();
        return kw && (message.toLowerCase().includes(kw) || answer.toLowerCase().includes(kw));
      });
      if (matchedUpsells.length > 0) {
        const upsellText = matchedUpsells.map((u: any) => String(u.message ?? "")).filter(Boolean).join("\n");
        if (upsellText) answer = answer + "\n\n" + upsellText;
      }
    }

    console.log(`[LINE_AI_REPLY]`, JSON.stringify({
      tenantId,
      intent,
      answerLen: answer.length,
      model,
      voice: aiSettings.voice,
      answerLength: aiSettings.answerLength,
      source: "openai",
    }));

    return c.json({ ok: true, stamp: STAMP, tenantId, answer, suggestedActions, intent, aiConfig });

  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e), aiConfig: typeof aiConfig !== "undefined" ? aiConfig : undefined });
  }
});

/* === /AI_CONCIERGE_V1 === */

/* === AI_SALES_OPS_V1 === */
// KV keys: ai:upsell:{tenantId}
// DB cols: followup_at, followup_status, followup_sent_at, followup_error (added in 0007)

// GET /admin/ai/upsell
app.get("/admin/ai/upsell", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "AI_UPSELL_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const u = await aiGetJson(kv, `ai:upsell:${tenantId}`);
    return c.json({ ok: true, tenantId, stamp: STAMP, upsell: { ...AI_DEFAULT_UPSELL, ...(u || {}) } });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// PUT /admin/ai/upsell
app.put("/admin/ai/upsell", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const STAMP = "AI_UPSELL_PUT_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body: any = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, stamp: STAMP, error: "bad_json" }, 400);
    const key = `ai:upsell:${tenantId}`;
    const ex = (await aiGetJson(kv, key)) || {};
    const merged = { ...AI_DEFAULT_UPSELL, ...ex, ...body };
    await kv.put(key, JSON.stringify(merged));
    return c.json({ ok: true, tenantId, stamp: STAMP, upsell: merged });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// GET /admin/ai/followups — last 50 followup rows for a tenant
app.get("/admin/ai/followups", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "AI_FOLLOWUPS_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const db = (c.env as any).DB;
    if (!db) return c.json({ ok: false, stamp: STAMP, error: "db_missing" }, 500);
    const { results } = await db.prepare(
      `SELECT id, line_user_id, customer_name, slot_start, followup_at, followup_status, followup_sent_at, followup_error
       FROM reservations
       WHERE tenant_id = ? AND followup_status IS NOT NULL
       ORDER BY followup_at DESC
       LIMIT 50`
    ).bind(tenantId).all();
    return c.json({ ok: true, tenantId, stamp: STAMP, followups: results ?? [] });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

/* === /AI_SALES_OPS_V1 === */

// POST /ai/dedup — LINE イベント重複排除 check-and-set (管理者認証不要)
// key: "ai:evt:{tenantId}:{eventKey}"  TTL: 30-300秒
// 返却: { isNew: true } → 未処理（続行可）  { isNew: false } → 重複（スキップ推奨）
app.post("/ai/dedup", async (c) => {
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ isNew: true });
    const body: any = await c.req.json().catch(() => null);
    const key = body?.key ? String(body.key) : "";
    // セキュリティ: ai:evt: プレフィックスのみ許可
    if (!key || !key.startsWith("ai:evt:")) return c.json({ isNew: true });
    const ttl = Math.min(300, Math.max(30, Number(body.ttlSeconds ?? 120)));
    const existing = await kv.get(key);
    if (existing !== null) return c.json({ isNew: false });
    await kv.put(key, "1", { expirationTtl: ttl });
    return c.json({ isNew: true });
  } catch {
    return c.json({ isNew: true }); // エラー時は処理継続（best-effort）
  }
});

// POST /ai/pushq — push 送信失敗時のリトライキュー enqueue (管理者認証不要)
// key: ai:pushq:{tenantId}:{id}  TTL: 最大 600秒（10分）
// token は受け取らず、tenantId + userId + messages のみ保存。
// 再送信時は Workers が config を KV から再取得する設計（実装は別途）。
app.post("/ai/pushq", async (c) => {
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "no_kv" });
    const body: any = await c.req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const userId   = String(body?.userId   ?? "").trim();
    if (!tenantId || !userId) return c.json({ ok: false, error: "missing_fields" });
    const ttl = Math.min(600, Math.max(60, Number(body.ttlSeconds ?? 600)));
    const id  = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key = `ai:pushq:${tenantId}:${id}`;
    await kv.put(key, JSON.stringify({
      tenantId,
      userId,
      messages: Array.isArray(body.messages) ? body.messages : [],
      enqueuedAt: new Date().toISOString(),
    }), { expirationTtl: ttl });
    return c.json({ ok: true, key });
  } catch {
    return c.json({ ok: false, error: "internal" });
  }
});

// POST /ai/linelog — LINE push 結果ログを KV に記録（直近50件・認証不要）
// key: ai:linelog:{tenantId}  TTL: 7日
// body: { tenantId, type, uid(先頭8文字), pushStatus, pushBodySnippet, aiMs }
app.post("/ai/linelog", async (c) => {
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "no_kv" });

    const body: any = await c.req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    if (!tenantId) return c.json({ ok: false, error: "missing_tenantId" });

    const entry = {
      ts:              new Date().toISOString(),
      type:            String(body?.type            ?? "unknown").slice(0, 32),
      uid:             String(body?.uid             ?? "").slice(0, 12),
      pushStatus:      Number(body?.pushStatus      ?? 0),
      pushBodySnippet: String(body?.pushBodySnippet ?? "").slice(0, 200),
      aiMs:            Number(body?.aiMs            ?? 0),
    };

    const kvKey = `ai:linelog:${tenantId}`;
    let logs: any[] = [];
    try {
      const raw = await kv.get(kvKey);
      if (raw) logs = JSON.parse(raw);
    } catch { /* ignore */ }

    logs.unshift(entry);               // 最新を先頭に
    if (logs.length > 50) logs = logs.slice(0, 50);

    await kv.put(kvKey, JSON.stringify(logs), { expirationTtl: 86400 * 7 });
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false, error: "internal" });
  }
});

// GET /ai/linelog?tenantId=xxx — ログ取得（ADMIN_TOKEN 必須）
app.get("/ai/linelog", async (c) => {
  const env = c.env as any;
  const kv  = env.SAAS_FACTORY;
  if (!kv) return c.json({ ok: false, error: "no_kv" }, 500);

  // 簡易 admin 認証（X-Admin-Token ヘッダー or ?token= クエリ）
  const adminToken = String(env.ADMIN_TOKEN ?? "").trim();
  if (adminToken) {
    const provided =
      c.req.header("X-Admin-Token") ??
      c.req.query("token") ??
      "";
    if (provided !== adminToken) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }
  }

  const tenantId = c.req.query("tenantId") ?? "";
  if (!tenantId) return c.json({ ok: false, error: "missing_tenantId" }, 400);

  let logs: any[] = [];
  try {
    const raw = await kv.get(`ai:linelog:${tenantId}`);
    if (raw) logs = JSON.parse(raw);
  } catch { /* ignore */ }

  return c.json({ ok: true, tenantId, count: logs.length, logs });
});

// ── POST /admin/ai/generate-image — DALL-E 3 画像生成 ─────────────────
app.post("/admin/ai/generate-image", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const env = c.env as any;
  const kv = env.SAAS_FACTORY;
  const r2 = env.MENU_IMAGES;
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) return c.json({ ok: false, error: "OPENAI_API_KEY not configured" }, 503);
  if (!r2) return c.json({ ok: false, error: "R2 not configured" }, 503);
  if (!kv) return c.json({ ok: false, error: "KV not configured" }, 503);

  try {
    const body = await c.req.json();
    const { type, prompt: customPrompt, vertical, shopName, menuName, menuId } = body as {
      type: 'hero' | 'richmenu' | 'menu-thumbnail';
      prompt?: string;
      vertical?: string;
      shopName?: string;
      menuName?: string;
      menuId?: string;
    };

    if (!type) return c.json({ ok: false, error: "missing_type" }, 400);

    // Build prompt
    const v = vertical || 'pet';
    const shop = shopName || '店舗';
    let finalPrompt = customPrompt || '';
    let size: '1024x1024' | '1792x1024' = '1024x1024';

    if (!finalPrompt) {
      const prompts: Record<string, Record<string, { prompt: string; size: '1024x1024' | '1792x1024' }>> = {
        pet: {
          hero: { prompt: `A warm and inviting Japanese pet salon interior, soft natural lighting, cute small dogs being groomed by professional staff, clean and modern space with wooden accents, cream and terracotta color palette, no text, high quality professional photograph`, size: '1792x1024' },
          richmenu: { prompt: `Minimalist pet salon background design, warm cream (#FFF8F0) and terracotta (#D4845A) colors, subtle paw print watermark patterns, soft gradient, clean and modern, no text or buttons, suitable for LINE rich menu background at 2500x1686`, size: '1792x1024' },
          'menu-thumbnail': { prompt: `Professional pet grooming scene showing ${menuName || 'dog grooming'}, bright studio lighting, cute small dog looking happy, Japanese pet salon setting, clean background, no text, high quality photograph`, size: '1024x1024' },
        },
        hair: {
          hero: { prompt: `Elegant Japanese hair salon interior, modern minimalist design, professional stylist at work, warm lighting, luxury feel, no text`, size: '1792x1024' },
          richmenu: { prompt: `Minimalist hair salon background, soft gradients, elegant, clean design for LINE rich menu`, size: '1792x1024' },
          'menu-thumbnail': { prompt: `Professional hair styling scene, ${menuName || 'hair cut'}, Japanese salon, studio lighting, no text`, size: '1024x1024' },
        },
        nail: {
          hero: { prompt: `Beautiful Japanese nail salon, elegant nail art display, soft pink and white tones, professional setting, no text`, size: '1792x1024' },
          richmenu: { prompt: `Minimalist nail salon background, soft pink gradients, elegant, clean design`, size: '1792x1024' },
          'menu-thumbnail': { prompt: `Beautiful nail art close-up, ${menuName || 'gel nail'}, professional quality, soft lighting, no text`, size: '1024x1024' },
        },
      };
      const verticalPrompts = prompts[v] || prompts.pet;
      const typeConfig = verticalPrompts[type] || verticalPrompts.hero;
      finalPrompt = typeConfig.prompt;
      size = typeConfig.size;
    }

    // Call DALL-E 3
    const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: finalPrompt,
        n: 1,
        size,
        quality: "standard",
        response_format: "b64_json",
      }),
    });

    if (!dalleRes.ok) {
      const errText = await dalleRes.text().catch(() => "");
      return c.json({ ok: false, error: "dalle_error", status: dalleRes.status, detail: errText }, 502);
    }

    const dalleData = await dalleRes.json() as any;
    const b64 = dalleData?.data?.[0]?.b64_json;
    if (!b64) return c.json({ ok: false, error: "no_image_data" }, 502);

    // Decode base64 to binary
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    // Store in R2
    const rand = Math.random().toString(36).slice(2, 9);
    const ts = Date.now();
    let r2Key: string;
    if (type === 'menu-thumbnail') {
      const mid = menuId || menuName?.replace(/\s+/g, '-') || 'unknown';
      r2Key = `ai-images/${tenantId}/menu/${mid}-${ts}-${rand}.png`;
    } else {
      r2Key = `ai-images/${tenantId}/${type}-${ts}-${rand}.png`;
    }

    await r2.put(r2Key, bytes.buffer, { httpMetadata: { contentType: "image/png" } });

    const reqUrl = new URL(c.req.url);
    const apiBase = `${reqUrl.protocol}//${reqUrl.host}`;
    const imageUrl = `${apiBase}/media/menu/${r2Key}`;

    // Save to KV settings
    let settings: any = {};
    try { const raw = await kv.get(`settings:${tenantId}`); if (raw) settings = JSON.parse(raw); } catch {}
    if (!settings.images) settings.images = {};

    if (type === 'hero') {
      settings.images.hero = imageUrl;
    } else if (type === 'richmenu') {
      settings.images.richMenuBg = imageUrl;
    } else if (type === 'menu-thumbnail' && menuId) {
      if (!settings.images.menus) settings.images.menus = {};
      settings.images.menus[menuId] = imageUrl;
    }

    await kv.put(`settings:${tenantId}`, JSON.stringify(settings));

    console.log(`[AI_IMAGE] tenant=${tenantId} type=${type} r2Key=${r2Key}`);
    return c.json({ ok: true, tenantId, type, imageUrl, r2Key, revisedPrompt: dalleData?.data?.[0]?.revised_prompt });
  } catch (e: any) {
    console.error(`[AI_IMAGE] error: ${e?.message}`);
    return c.json({ ok: false, error: "generate_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── GET /admin/ai/images — テナントの生成画像一覧 ─────────────────────
app.get("/admin/ai/images", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c);
  const kv = (c.env as any).SAAS_FACTORY;
  if (!kv) return c.json({ ok: false, error: "kv_missing" }, 500);

  try {
    let settings: any = {};
    try { const raw = await kv.get(`settings:${tenantId}`); if (raw) settings = JSON.parse(raw); } catch {}
    return c.json({ ok: true, tenantId, images: settings.images || {} });
  } catch (e: any) {
    return c.json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});

} // end registerAiRoutes
