import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

// ─── version / stamps ────────────────────────────────────────────────────────
const STAMP = "LINE_WEBHOOK_V29_20260312_EVENT_AUDIT";
const where  = "api/line/webhook";

type LinePurpose = "booking" | "sales";

const FALLBACK_TEXT = "少し時間をおいて再度お試しください。";

// ─── timeout constants (ms) ─────────────────────────────────────────────────
const TIMEOUT_TENANT_RESOLVE_MS = 3000;   // destination→tenant KV lookup
const TIMEOUT_SETTINGS_FETCH_MS = 5000;   // getTenantLineConfig (Workers GET /admin/settings)
const TIMEOUT_SALES_CONFIG_MS   = 5000;   // loadSalesAiConfig (Workers GET /sales-ai/config)
const TIMEOUT_AI_CHAT_MS        = 8000;   // runAiChat (Workers POST /ai/chat → OpenAI)
const TIMEOUT_LINE_REPLY_MS     = 10000;  // replyLine (LINE reply API)
const TIMEOUT_LINE_PUSH_MS      = 10000;  // pushLine (LINE push API)

/** fetch with AbortController timeout. Throws on timeout with clear message. */
function fetchT(url: string, init: RequestInit & { timeout: number }): Promise<Response> {
  const { timeout, ...rest } = init;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  return fetch(url, { ...rest, signal: ac.signal }).finally(() => clearTimeout(timer));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── SALES handler ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// sales intent keywords (greeting must be LAST — other intents take priority)
const SALES_INTENT_MAP: { label: string; keywords: string[] }[] = [
  { label: "pricing",      keywords: ["料金", "価格", "値段", "プラン", "月額", "いくら", "費用", "コスト", "料金体系", "費用感", "お値段", "pricing", "price", "cost"] },
  { label: "features",     keywords: ["機能", "できること", "特徴", "何ができる", "使い方", "feature", "features"] },
  { label: "demo",         keywords: ["デモ", "demo", "お試し", "試し", "トライアル", "trial", "体験", "見てみたい"] },
  { label: "consultation", keywords: ["導入", "相談", "問い合わせ", "問合せ", "導入相談", "詳しく", "話したい", "聞きたい", "consultation", "inquiry"] },
  { label: "greeting",     keywords: ["こんにちは", "こんばんは", "おはよう", "はじめまして", "よろしく", "hello", "hi", "hey"] },
];

function detectSalesIntent(textIn: string): string | null {
  const normalized = textIn
    .normalize("NFKC")
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase();
  for (const { label, keywords } of SALES_INTENT_MAP) {
    if (keywords.some(k => normalized.includes(k))) return label;
  }
  return null;
}

function getSalesReplyText(intent: string | null): string {
  switch (intent) {
    case "pricing":
      return [
        "料金についてのご質問ありがとうございます！",
        "",
        "LumiBookの料金プランは以下の通りです：",
        "",
        "🔹 Starter — ¥3,980/月",
        "　個人サロン向け（スタッフ2名、メニュー10件）",
        "",
        "🔹 Pro — ¥9,800/月",
        "　成長中サロン向け（無制限、AI接客、リピート促進）",
        "",
        "🔹 Enterprise — 要相談",
        "　複数店舗・法人向け（専任サポート、カスタム機能）",
        "",
        "※ 初期費用0円、最低契約期間なし、いつでも解約OK",
        "",
        "詳しいご案内やお見積もりをご希望でしたら「相談」とお送りください😊",
      ].join("\n");

    case "features":
      return [
        "LumiBookの主な機能をご紹介します！",
        "",
        "📅 予約受付・管理",
        "　LINE経由の自動予約、空き枠リアルタイム表示",
        "",
        "💬 LINE自動応答",
        "　AI接客で24時間お客様対応",
        "",
        "📊 顧客管理・KPI",
        "　リピート率・来店間隔を自動計算",
        "",
        "🔔 リマインド通知",
        "　予約前日にLINE自動通知",
        "",
        "🎨 メニュー・スタッフ管理",
        "　画像付きメニュー、スタッフ別スケジュール",
        "",
        "デモをご覧になりたい場合は「デモ」とお送りください😊",
      ].join("\n");

    case "demo":
      return [
        "デモのご希望ありがとうございます！",
        "",
        "LumiBookの操作感を実際にお試しいただけます。",
        "以下の方法でご案内可能です：",
        "",
        "1️⃣ オンラインデモ（画面共有、約15分）",
        "2️⃣ テスト環境のご案内（ご自身で操作可能）",
        "",
        "ご都合の良い日時や、ご希望の方法があればこちらにお送りください。",
        "担当から折り返しご連絡いたします😊",
      ].join("\n");

    case "consultation":
      return [
        "導入相談のご連絡ありがとうございます！",
        "",
        "現在の課題やご状況をお聞かせいただければ、",
        "最適なプランや活用方法をご提案いたします。",
        "",
        "例えば：",
        "・現在の予約管理方法（電話？紙？他ツール？）",
        "・スタッフ人数、メニュー数",
        "・LINEの活用状況",
        "",
        "何でもお気軽にどうぞ！担当から詳しくご案内いたします😊",
      ].join("\n");

    case "greeting":
      return [
        "こんにちは！LumiBookにご興味ありがとうございます😊",
        "",
        "サロン向けの予約・LINE対応・顧客管理をまとめて効率化できるツールです。",
        "",
        "何でもお気軽にどうぞ！例えば：",
        "・「料金」— プランと費用のご案内",
        "・「機能」— 何ができるかのご紹介",
        "・「デモ」— 実際にお試し",
        "・「導入相談」— お気軽にご相談",
        "",
        "▼ サービス詳細はこちら",
        "https://lumibook.jp",
      ].join("\n");

    default:
      return [
        "ありがとうございます！",
        "",
        "申し訳ありませんが、内容を読み取れませんでした。",
        "以下のキーワードを送っていただければ、すぐにご案内します：",
        "",
        "・「料金」— プランと費用",
        "・「機能」— できること一覧",
        "・「デモ」— 無料体験",
        "・「導入相談」— 個別のご相談",
        "",
        "▼ サービス詳細はこちら",
        "https://lumibook.jp",
      ].join("\n");
  }
}

function salesIntentToLeadLabel(intent: string | null): string {
  switch (intent) {
    case "pricing":      return "pricing_question";
    case "features":     return "info_request";
    case "demo":         return "demo_request";
    case "consultation": return "interested";
    case "greeting":     return "info_request";
    default:             return "info_request";
  }
}

// ─── Sales AI config loader ──────────────────────────────────────────────
// Reads from GET /sales-ai/config (no auth).
// Supports two modes: accountId direct lookup, or tenantId reverse lookup.
// Completely separate from tenant AI接客 config.
async function loadSalesAiConfig(
  apiBase: string,
  opts: { accountId?: string | null; tenantId?: string }
): Promise<{ config: any; accountId: string } | null> {
  if (!apiBase) return null;
  if (!opts.accountId && !opts.tenantId) return null;
  try {
    const params = new URLSearchParams();
    if (opts.accountId) params.set("accountId", opts.accountId);
    else if (opts.tenantId) params.set("tenantId", opts.tenantId);
    // Auto-seed LLM config on first access (idempotent)
    params.set("seed", "llm");
    const url = `${apiBase}/sales-ai/config?${params.toString()}`;
    const r = await fetchT(url, { headers: { Accept: "application/json" }, timeout: TIMEOUT_SALES_CONFIG_MS });
    if (!r.ok) {
      console.log(`[SALES_AI_CFG] fetch failed status=${r.status} params=${params.toString()}`);
      return null;
    }
    const d = (await r.json()) as any;
    if (!d?.config) return null;
    return { config: d.config, accountId: d.accountId ?? opts.accountId ?? "" };
  } catch (e: any) {
    console.log(`[SALES_AI_CFG] error: ${String(e?.message ?? e).slice(0, 80)}`);
    return null;
  }
}

/** Extract accountId from credSource (e.g. "lineAccount:abc123" → "abc123") */
function extractAccountIdFromCredSource(credSource?: string): string | null {
  if (!credSource) return null;
  // Format: "lineAccount:{id}" or "lineAccount_purpose:{id}"
  const m = credSource.match(/^lineAccount(?:_purpose)?:(.+)$/);
  return m?.[1] ?? null;
}

/** Resolve sales intent from config intents */
function resolveSalesIntent(
  textIn: string,
  intents: any[]
): { intent: any; key: string; label: string } | null {
  const normalized = textIn
    .normalize("NFKC")
    .trim()
    .toLowerCase();
  for (const intent of intents) {
    if (Array.isArray(intent.keywords) && intent.keywords.some((k: string) =>
      normalized === k.toLowerCase()
    )) {
      return { intent, key: intent.key, label: intent.label };
    }
  }
  return null;
}

/** Build sales reply text from config + matched intent */
function buildSalesReply(
  config: any,
  matched: { intent: any; key: string } | null
): string {
  if (matched?.intent?.reply) return matched.intent.reply;
  return config?.welcomeMessage || config?.fallbackMessage || getSalesReplyText(null);
}

/** Handle a text message on a SALES-purpose LINE account.
 *  Loads per-account sales AI config from KV; falls back to hardcoded defaults. */
async function handleSalesEvent(ctx: HandlerContext): Promise<HandlerResult> {
  const { textIn, lineUserId, tenantId, cfg, apiBase } = ctx;

  // 1. Try to load per-account sales AI config
  let accountId = extractAccountIdFromCredSource(cfg.credSource);

  // Fallback: if credSource didn't yield an accountId (legacy/env credentials),
  // look for any active sales lineAccount in settings to resolve accountId.
  if (!accountId && cfg.settingsData) {
    const salesAcct = (cfg.settingsData.lineAccounts ?? []).find(
      (a: any) => a?.purpose === "sales" && a?.status === "active" && a?.id
    );
    if (salesAcct) {
      accountId = salesAcct.id;
      console.log(`[SALES_AI] accountId fallback from settingsData lineAccount id=${accountId}`);
    }
  }

  let salesConfig: any = null;
  let configSource = "none"; // Track why config was or wasn't loaded

  if (!apiBase) {
    configSource = `no_api_base(accountId=${accountId ?? "null"})`;
  } else {
    // Try accountId direct lookup first, then tenantId reverse lookup
    const result = await loadSalesAiConfig(apiBase, {
      accountId: accountId || null,
      tenantId,
    });
    if (result) {
      salesConfig = result.config;
      accountId = result.accountId; // may have been resolved by tenantId reverse lookup
    }

    if (!salesConfig) {
      configSource = `fetch_null(accountId=${accountId ?? "null"},tenantId=${tenantId})`;
    } else if (!salesConfig.enabled) {
      configSource = `disabled(accountId=${accountId})`;
    } else if (!Array.isArray(salesConfig.intents)) {
      configSource = `no_intents_array(accountId=${accountId})`;
    } else {
      configSource = `ok(accountId=${accountId},intents=${salesConfig.intents.length})`;
    }
  }

  console.log(
    `[SALES_AI] configSource=${configSource} enabled=${salesConfig?.enabled ?? "N/A"} ` +
    `text="${textIn.slice(0, 30)}" uid=${lineUserId.slice(0, 8)}`
  );

  // 2. If config exists and is enabled, use config-based resolution
  if (salesConfig?.enabled && Array.isArray(salesConfig.intents)) {
    const matched = resolveSalesIntent(textIn, salesConfig.intents);

    if (matched) {
      const reply = buildSalesReply(salesConfig, matched);
      const branch = `sales_${matched.key}`;
      const leadLabel = salesIntentToLeadLabel(matched.key);

      console.log(`[SALES_AI] config-based branch=${branch} matchKey=${matched.key} replyLen=${reply.length}`);

      return {
        branch,
        salesIntent: matched.key,
        replyMessages: [{ type: "text", text: reply }],
        leadLabel,
        leadCapture: true,
        salesConfigSource: configSource,
      };
    }

    // No intent matched — always try LLM first
    if (salesConfig.llm?.enabled) {
      console.log(`[SALES_AI] llm_fallback accountId=${accountId} tenantId=${tenantId} text="${textIn.slice(0, 30)}"`);

      return {
        branch: "sales_llm",
        salesIntent: null,
        replyMessages: [], // empty — async push will handle reply
        leadLabel: "info_request",
        leadCapture: true,
        salesConfigSource: configSource,
        sendMode: "async",
        asyncPayload: {
          accountId: accountId ?? "",
          tenantId,
          message: textIn,
          lineUserId,
          channelAccessToken: cfg.channelAccessToken,
          fallbackMessage: salesConfig.fallbackMessage || salesConfig.welcomeMessage || getSalesReplyText(null),
        },
      };
    }

    // LLM disabled — use fallbackMessage
    const reply = salesConfig.fallbackMessage || salesConfig.welcomeMessage;
    console.log(`[SALES_AI] no_llm branch=sales_fallback matchKey=none replyLen=${reply.length}`);

    return {
      branch: "sales_fallback",
      salesIntent: null,
      replyMessages: [{ type: "text", text: reply }],
      leadLabel: "info_request",
      leadCapture: true,
      salesConfigSource: configSource,
    };
  }

  // 3. Fallback: hardcoded intent detection (backward compat when no config)
  const salesIntent = detectSalesIntent(textIn);
  const branch = salesIntent ? `sales_${salesIntent}` : "sales_generic";
  const replyMessages = [{ type: "text", text: getSalesReplyText(salesIntent) }];
  const leadLabel = salesIntentToLeadLabel(salesIntent);

  console.log(`[SALES_AI] fallback branch=${branch} intent=${salesIntent ?? "none"} reason=${configSource}`);

  return { branch, salesIntent, replyMessages, leadLabel, leadCapture: true, salesConfigSource: configSource };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── BOOKING handler ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// Booking intent: minimal keyword set — everything else goes to AI接客
const BOOKING_INTENT_KW = [
  "予約", "よやく", "予約したい", "予約する", "予約できますか",
  "空き", "空いてる",
] as const;

function detectBookingIntent(textIn: string): boolean {
  const normalized = textIn
    .normalize("NFKC")
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase();
  return BOOKING_INTENT_KW.some(k => normalized.includes(k));
}

function buildBookingTemplateMessage(bookingUrl: string): object {
  return {
    type: "template",
    altText: "予約ページ",
    template: {
      type: "buttons",
      title: "予約ページ",
      text: "ご予約はこちらからどうぞ",
      actions: [
        { type: "uri", label: "予約を開始", uri: bookingUrl },
      ],
    },
  };
}

function getBookingFallbackText(bookingUrl: string): string {
  return [
    "メッセージありがとうございます！",
    "",
    "当店へのご予約・お問い合わせはお気軽にどうぞ😊",
    "",
    "・「予約」「空き」→ 予約ページをご案内します",
    "・メニューや営業時間など、何でもお聞きください",
    "",
    `▼ ご予約はこちら`,
    bookingUrl,
  ].join("\n");
}

/** Handle a text message on a BOOKING-purpose LINE account.
 *  Priority: booking intent → AI concierge (FAQ + OpenAI) → fallback
 *  GUARANTEE: every text message gets exactly one reply. No silent paths. */
async function handleBookingEvent(ctx: HandlerContext): Promise<HandlerResult> {
  const { textIn, cfg, tenantId, lineUserId, apiBase } = ctx;
  const uid = lineUserId.slice(0, 12);
  const txt = textIn.slice(0, 40);

  // ── 1. Booking intent → template card (highest priority, always synchronous) ──
  if (detectBookingIntent(textIn)) {
    console.log(`[LINE_AI_ROUTING]`, JSON.stringify({
      tenantId, userId: uid, text: txt,
      matchedIntent: "booking", aiEnabled: "skipped",
      faqMatched: false, bookingMatched: true,
      replyMode: "reply", openaiAttempted: false, openaiSucceeded: false, replySent: true,
    }));
    const bookingLink = buildBookingLink(cfg.bookingUrl, tenantId, lineUserId);
    return {
      branch: "booking_template",
      salesIntent: null,
      replyMessages: [buildBookingTemplateMessage(bookingLink)],
      leadLabel: null,
      leadCapture: false,
    };
  }

  // ── 2. AI concierge ──
  let openaiAttempted = false;
  let openaiSucceeded = false;
  let aiDisabled = false;
  let faqMatched = false;
  let aiError: string | null = null;

  // Fast-path: AI enabled check from settingsData (no network hop)
  const aiFromSettings = cfg.settingsData?.ai;
  const aiEnabledFast = aiFromSettings?.enabled === true;

  console.log(`[AI_CONFIG_LOAD]`, JSON.stringify({
    tenantId,
    aiEnabled: aiEnabledFast,
    voice: aiFromSettings?.voice ?? null,
    answerLength: aiFromSettings?.answerLength ?? null,
    character: aiFromSettings?.character ? String(aiFromSettings.character).slice(0, 30) : null,
    source: aiFromSettings ? "settingsData" : "missing",
  }));

  if (aiFromSettings && !aiEnabledFast) {
    // AI明示的に無効 → runAiChat() をスキップしてfallbackへ
    aiDisabled = true;
    aiError = "ai_disabled_fast";
  } else if (apiBase) {
    const aiIp = lineUserId ? `line:${uid}` : "line";
    const AI_TIMEOUT_MS = 8000;
    const TIMEOUT_RESULT: AiChatResult = { ...EMPTY_AI_RESULT, error: "timeout" };

    let ai: AiChatResult;
    try {
      ai = await Promise.race([
        runAiChat(tenantId, textIn, aiIp),
        new Promise<AiChatResult>(resolve =>
          setTimeout(() => {
            console.log(`[BOOKING_AI] timeout ${AI_TIMEOUT_MS}ms tenant=${tenantId}`);
            resolve(TIMEOUT_RESULT);
          }, AI_TIMEOUT_MS)
        ),
      ]);
    } catch (e: any) {
      console.log(`[BOOKING_AI] exception tenant=${tenantId}: ${String(e?.message ?? e).slice(0, 100)}`);
      ai = { ...EMPTY_AI_RESULT, error: `handler_exception:${String(e?.message ?? e).slice(0, 60)}` };
    }

    // ── [AI_CHAT_RESULT] — log the AI chat response for this tenant ──
    console.log(`[AI_CHAT_RESULT]`, JSON.stringify({
      tenantId,
      aiEnabled: ai.aiConfig?.enabled ?? null,
      voice: ai.aiConfig?.voice ?? null,
      answerLength: ai.aiConfig?.answerLength ?? null,
      character: ai.aiConfig?.character ? ai.aiConfig.character.slice(0, 30) : null,
      source: ai.aiConfig ? "workers_kv" : "unavailable",
      aiResult: ai.disabled ? "disabled" : ai.ok ? "ok" : ai.error ?? "unknown",
    }));

    if (ai.disabled) {
      // AI disabled for this tenant — skip to fallback (no OpenAI was attempted)
      aiDisabled = true;
      aiError = "ai_disabled";
    } else if (ai.ok && ai.answer) {
      // Success — AI or FAQ answered
      openaiAttempted = true;
      openaiSucceeded = true;
      faqMatched = ai.source === "faq";

      const msg: any = { type: "text", text: ai.answer };
      if (ai.suggestedActions.length > 0) {
        const qr = buildQuickReplyFromActions(ai.suggestedActions);
        if (qr) msg.quickReply = qr;
      }

      if (faqMatched) {
        console.log(`[LINE_FAQ_MATCH]`, JSON.stringify({
          tenantId, userId: uid, text: txt, source: "faq",
        }));
      }
      console.log(`[LINE_AI_ROUTING]`, JSON.stringify({
        tenantId, userId: uid, text: txt,
        matchedIntent: faqMatched ? "faq" : "ai",
        aiEnabled: true, faqMatched, bookingMatched: false,
        replyMode: "reply", openaiAttempted: true, openaiSucceeded: true,
        replySent: true, answerLen: ai.answer.length, source: ai.source,
      }));
      return {
        branch: faqMatched ? "booking_faq" : "booking_ai",
        salesIntent: null,
        replyMessages: [msg],
        leadLabel: null,
        leadCapture: false,
      };
    } else {
      // AI attempted but failed/empty
      openaiAttempted = !ai.disabled;
      aiError = ai.error ?? (ai.ok ? "empty_answer" : "api_error");
      console.log(`[LINE_AI_ERROR]`, JSON.stringify({
        tenantId, userId: uid, text: txt, error: aiError,
      }));
    }
  }

  // ── 3. Fallback — ALWAYS reached if booking intent and AI both missed ─────
  //    guaranteed reply so no message goes unanswered
  const bookingLink = buildBookingLink(cfg.bookingUrl, tenantId, lineUserId);
  const branch = aiDisabled ? "booking_fallback"
    : openaiAttempted ? "booking_ai_fallback"
    : "booking_fallback";

  console.log(`[LINE_AI_ROUTING]`, JSON.stringify({
    tenantId, userId: uid, text: txt,
    matchedIntent: "fallback", aiEnabled: !aiDisabled,
    faqMatched: false, bookingMatched: false,
    replyMode: "reply", openaiAttempted, openaiSucceeded: false,
    replySent: true, aiError,
  }));
  return {
    branch,
    salesIntent: null,
    replyMessages: [{ type: "text", text: getBookingFallbackText(bookingLink) }],
    leadLabel: null,
    leadCapture: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Shared types & utilities ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

interface HandlerContext {
  textIn: string;
  lineUserId: string;
  tenantId: string;
  cfg: TenantLineConfig;
  apiBase: string;
}

interface HandlerResult {
  branch: string;
  salesIntent: string | null;
  replyMessages: any[];
  leadLabel: string | null;
  leadCapture: boolean;
  salesConfigSource?: string; // diagnostic: why config was/wasn't used
  sendMode?: "sync" | "async"; // "async" = skip replyLine, use waitUntil push instead
  asyncPayload?: {
    accountId: string;
    tenantId: string;
    message: string;
    lineUserId: string;
    channelAccessToken: string;
    fallbackMessage: string;
  };
}

// ─── AI enabled check (debug-only; not in production hot path) ──────────────
async function checkAiEnabled(tenantId: string): Promise<boolean> {
  const apiBase = (
    process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? ""
  ).replace(/\/+$/, "");
  if (!apiBase) return false;
  try {
    const url = `${apiBase}/ai/enabled?tenantId=${encodeURIComponent(tenantId)}`;
    const r = await fetchT(url, { headers: { Accept: "application/json" }, timeout: TIMEOUT_TENANT_RESOLVE_MS });
    if (!r.ok) return false;
    const d = (await r.json()) as any;
    return d?.enabled === true;
  } catch {
    return false;
  }
}

// ─── crypto utils ───────────────────────────────────────────────────────────
function base64FromBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function verifyLineSignature(
  rawBody: ArrayBuffer,
  signature: string,
  secret: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, rawBody);
  return base64FromBytes(new Uint8Array(mac)) === signature;
}

async function shortHash(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf).slice(0, 4))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildDedupKey(tenantId: string, ev: any): Promise<string> {
  const msgId = String(ev.message?.id ?? "").trim();
  if (msgId) return `ai:evt:${tenantId}:msg:${msgId}`;
  const userId = String(ev.source?.userId ?? "unknown").slice(0, 20)
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  const ts = String(ev.timestamp ?? Date.now()).slice(-10);
  const h  = await shortHash(String(ev.message?.text ?? "")).catch(() => "0000");
  return `ai:evt:${tenantId}:${userId}:${ts}:${h}`;
}

// ─── LINE API ─────────────────────────────────────────────────────────────────
async function replyLine(
  accessToken: string,
  replyToken: string,
  messages: any[]
): Promise<{ ok: boolean; status: number; bodyText: string }> {
  const tokenPreview = accessToken.length > 8
    ? `${accessToken.slice(0, 4)}...${accessToken.slice(-4)}`
    : `len=${accessToken.length}`;
  console.log(
    `[REPLY_LINE] calling api.line.me/v2/bot/message/reply ` +
    `tokenPreview=${tokenPreview} tokenLen=${accessToken.length} ` +
    `replyTokenLen=${replyToken.length} replyToken=${replyToken.slice(0, 12)}... ` +
    `msgCount=${messages.length}`
  );
  const reqBody = JSON.stringify({ replyToken, messages });
  const res = await fetchT("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    },
    body: reqBody,
    timeout: TIMEOUT_LINE_REPLY_MS,
  });
  const bodyText = await res.text().catch(() => "");
  console.log(
    `[REPLY_LINE] response status=${res.status} ok=${res.ok} ` +
    `body=${bodyText.slice(0, 300)}`
  );
  return { ok: res.ok, status: res.status, bodyText };
}

async function pushLine(
  accessToken: string,
  userId: string,
  messages: any[]
): Promise<{ ok: boolean; status: number; bodyText: string }> {
  const res = await fetchT("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    },
    body: JSON.stringify({ to: userId, messages }),
    timeout: TIMEOUT_LINE_PUSH_MS,
  });
  const bodyText = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, bodyText };
}

// ─── KV dedup via Workers /ai/dedup ─────────────────────────────────────────
async function dedupEvent(
  apiBase: string,
  key: string,
  ttlSeconds = 120
): Promise<boolean> {
  if (!apiBase || !key) return true;

  const timeout = new Promise<boolean>(resolve =>
    setTimeout(() => resolve(true), 500)
  );
  const check = fetch(`${apiBase}/ai/dedup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, ttlSeconds }),
  })
    .then(r => r.json() as Promise<{ isNew: boolean }>)
    .then(d => d?.isNew !== false)
    .catch(() => true);

  return Promise.race([check, timeout]);
}

// ─── push retry enqueue via Workers /ai/pushq ────────────────────────────────
async function enqueuePushRetry(
  apiBase: string,
  tenantId: string,
  userId: string,
  messages: any[]
): Promise<void> {
  if (!apiBase || !userId) return;
  fetch(`${apiBase}/ai/pushq`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, userId, messages, ttlSeconds: 600 }),
  }).catch(() => null);
}

// ─── AI chat caller ──────────────────────────────────────────────────────────
type AiConfig = {
  enabled: boolean;
  voice: string;
  answerLength: string;
  character: string;
};
type AiChatResult = {
  ok: boolean;
  answer: string;
  suggestedActions: any[];
  disabled?: boolean;
  source?: "faq" | "openai" | "unknown";
  error?: string;
  aiConfig?: AiConfig;
};
const EMPTY_AI_RESULT: AiChatResult = { ok: false, answer: "", suggestedActions: [] };

async function runAiChat(
  tenantId: string,
  message: string,
  ip: string
): Promise<AiChatResult> {
  const apiBase = (
    process.env.API_BASE ??
    process.env.NEXT_PUBLIC_API_BASE ??
    ""
  ).replace(/\/+$/, "");

  if (!apiBase) return EMPTY_AI_RESULT;

  try {
    const res = await fetchT(`${apiBase}/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": ip,
        "x-real-ip": ip,
      },
      body: JSON.stringify({ message, tenantId }),
      timeout: TIMEOUT_AI_CHAT_MS,
    });
    const data = (await res.json().catch(() => null)) as any;
    const aiConfig: AiConfig | undefined = data?.aiConfig ?? undefined;
    if (data?.ok && data?.answer) {
      return {
        ok: true,
        answer: String(data.answer),
        suggestedActions: Array.isArray(data.suggestedActions) ? data.suggestedActions : [],
        source: data.source === "faq" ? "faq" : "openai",
        aiConfig,
      };
    }
    if (data?.error === "ai_disabled") {
      return { ...EMPTY_AI_RESULT, disabled: true, aiConfig };
    }
    return { ...EMPTY_AI_RESULT, error: data?.error ?? `http_${res.status}`, aiConfig };
  } catch (e: any) {
    return { ...EMPTY_AI_RESULT, error: `exception:${String(e?.message ?? e).slice(0, 60)}` };
  }
}

// ─── URL helpers ────────────────────────────────────────────────────────────
function buildBookingLink(bookingUrl: string, tenantId: string, lineUserId: string): string {
  const u = new URL(bookingUrl);
  u.searchParams.delete("tenantId");
  u.searchParams.delete("lu");
  u.searchParams.set("tenantId", tenantId);
  if (lineUserId) u.searchParams.set("lu", lineUserId);
  return u.toString();
}

// ─── suggestedActions → LINE quickReply 変換 ─────────────────────────────────
function buildQuickReplyFromActions(
  actions: { type?: string; label?: string; url?: string }[]
): { items: object[] } | undefined {
  if (!Array.isArray(actions) || actions.length === 0) return undefined;
  const items: object[] = [];
  for (const a of actions.slice(0, 13)) {
    const label = String(a.label ?? "").slice(0, 20) || "詳細を見る";
    if (a.url) {
      items.push({
        type: "action",
        action: { type: "uri", label, uri: a.url },
      });
    } else {
      items.push({
        type: "action",
        action: { type: "message", label, text: label },
      });
    }
  }
  return items.length > 0 ? { items } : undefined;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Purpose resolution ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// Resolve purpose from:
//   1. ?purpose= query param (explicit, highest priority)
//   2. Match destination (bot userId) against lineAccounts[].botUserId
//   3. integrations.line.purpose (legacy single-account)
//   4. Default: "booking" (safe fallback)
function resolvePurpose(
  queryPurpose: string | null,
  destination: string,
  settingsData: any
): { purpose: LinePurpose; resolvedPurposeBy: string } {
  // 1. Query param
  if (queryPurpose === "sales" || queryPurpose === "booking") {
    return { purpose: queryPurpose, resolvedPurposeBy: "query_param" };
  }

  // 2. lineAccounts match by botUserId
  const accounts: any[] = settingsData?.lineAccounts ?? [];
  if (destination && accounts.length > 0) {
    const match = accounts.find(
      (a: any) => a?.botUserId && a.botUserId === destination && a.status === "active"
    );
    if (match?.purpose === "sales" || match?.purpose === "booking") {
      return { purpose: match.purpose, resolvedPurposeBy: "lineAccounts_match" };
    }
  }

  // 3. Legacy single-account purpose
  const legacyPurpose = settingsData?.integrations?.line?.purpose;
  if (legacyPurpose === "sales" || legacyPurpose === "booking") {
    return { purpose: legacyPurpose, resolvedPurposeBy: "integrations_line_purpose" };
  }

  // 4. Default
  return { purpose: "booking", resolvedPurposeBy: "default_booking" };
}

// ─── tenant config resolution ─────────────────────────────────────────────────
interface TenantLineConfig {
  channelSecret: string;
  channelAccessToken: string;
  bookingUrl: string;
  source: "kv" | "env";
  purpose: LinePurpose;
  resolvedPurposeBy: string;
  settingsData: any; // raw settings for purpose resolution
  credSource?: string; // which credential source was used (lineAccount:id | integrations_line | env)
}

async function getTenantLineConfig(
  tenantId: string,
  origin: string,
  queryPurpose: string | null,
  destination: string
): Promise<TenantLineConfig> {
  const apiBase = (
    process.env.API_BASE ??
    process.env.NEXT_PUBLIC_API_BASE ??
    ""
  ).replace(/\/+$/, "");
  let adminToken = "";
  try {
    const cfEnv = (getRequestContext()?.env as any);
    if (cfEnv?.ADMIN_TOKEN) adminToken = String(cfEnv.ADMIN_TOKEN);
  } catch {}
  if (!adminToken) adminToken = process.env.ADMIN_TOKEN ?? "";

  if (apiBase) {
    // Retry once on failure (Workers cold start can cause intermittent timeouts)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
      const url = `${apiBase}/admin/settings?tenantId=${encodeURIComponent(tenantId)}`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (adminToken) headers["X-Admin-Token"] = adminToken;

      const r = await fetchT(url, { headers, timeout: TIMEOUT_SETTINGS_FETCH_MS });
      if (r.ok) {
        const json = (await r.json()) as any;
        const s = json?.data ?? json;

        // Resolve purpose using all available data
        const { purpose, resolvedPurposeBy } = resolvePurpose(queryPurpose, destination, s);

        // ── Credential resolution: prefer matched lineAccount, fall back to integrations.line ──
        let channelSecret = "";
        let channelAccessToken = "";
        let credSource = "integrations_line"; // track which credentials we're using

        // 1. Try matched lineAccount (multi-account: correct credentials for this specific bot)
        const accounts: any[] = s?.lineAccounts ?? [];
        if (destination && accounts.length > 0) {
          const matchedAccount = accounts.find(
            (a: any) => a?.botUserId && a.botUserId === destination && a.status === "active"
          );
          if (matchedAccount) {
            const maSecret = String(matchedAccount.channelSecret ?? "").trim();
            const maToken  = String(matchedAccount.channelAccessToken ?? "").trim();
            if (maSecret && maToken) {
              channelSecret = maSecret;
              channelAccessToken = maToken;
              credSource = `lineAccount:${matchedAccount.id}`;
              console.log(
                `[CFG_CRED] using lineAccount credentials id=${matchedAccount.id} ` +
                `name="${matchedAccount.name}" purpose=${matchedAccount.purpose} ` +
                `botUserId=${destination.slice(0, 12)} secretLen=${maSecret.length} tokenLen=${maToken.length}`
              );
            }
          }
        }

        // 2. If no match or match had empty creds, use purpose-based lookup from lineAccounts
        if (!channelSecret || !channelAccessToken) {
          const purposeAccount = accounts.find(
            (a: any) => a?.purpose === purpose && a.status === "active"
              && String(a.channelSecret ?? "").trim()
              && String(a.channelAccessToken ?? "").trim()
          );
          if (purposeAccount) {
            channelSecret = String(purposeAccount.channelSecret).trim();
            channelAccessToken = String(purposeAccount.channelAccessToken).trim();
            credSource = `lineAccount_purpose:${purposeAccount.id}`;
            console.log(
              `[CFG_CRED] using purpose-matched lineAccount id=${purposeAccount.id} ` +
              `purpose=${purposeAccount.purpose} name="${purposeAccount.name}"`
            );
          }
        }

        // 3. Fall back to legacy integrations.line
        if (!channelSecret || !channelAccessToken) {
          const line = s?.integrations?.line;
          channelSecret      = String(line?.channelSecret      ?? "").trim();
          channelAccessToken = String(line?.channelAccessToken ?? "").trim();
          credSource = "integrations_line";
          if (channelSecret && channelAccessToken) {
            console.log(`[CFG_CRED] using legacy integrations.line credentials`);
          }
        }

        const rawBookingUrl = String(s?.integrations?.line?.bookingUrl ?? "").trim();
        const fallback = `${origin}/booking?tenantId=${encodeURIComponent(tenantId)}`;
        let bookingUrl = rawBookingUrl || fallback;
        if (bookingUrl.includes("/api/line/webhook")) {
          bookingUrl = fallback;
        }
        try {
          const bu = new URL(bookingUrl);
          bu.searchParams.set("tenantId", tenantId);
          bookingUrl = bu.toString();
        } catch { bookingUrl = fallback; }

        if (channelSecret && channelAccessToken) {
          return { channelSecret, channelAccessToken, bookingUrl, source: "kv", purpose, resolvedPurposeBy, settingsData: s, credSource };
        }
      }
    } catch (e: any) {
      // Retry once on transient failure (cold start, network glitch)
      if (attempt === 0) {
        console.log(`[CFG_RETRY] attempt=0 failed, retrying: ${String(e?.message ?? e).slice(0, 80)}`);
        continue;
      }
      // fall through after final attempt
    }
    break; // success or non-retryable — exit loop
    } // end retry loop
  }

  const channelSecret      = process.env.LINE_CHANNEL_SECRET      ?? "";
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  const bookingUrl =
    process.env.LINE_BOOKING_URL_DEFAULT ??
    `${origin}/booking`;

  const { purpose, resolvedPurposeBy } = resolvePurpose(queryPurpose, destination, null);

  return { channelSecret, channelAccessToken, bookingUrl, source: "env", purpose, resolvedPurposeBy, settingsData: null, credSource: "env" };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── GET (debug probe) ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const tenantId  = searchParams.get("tenantId") ?? "default";
  const debugMode = searchParams.get("debug") === "1";
  const debugText = searchParams.get("text") ?? "営業時間は？";
  const queryPurpose = searchParams.get("purpose");

  const cfg = await getTenantLineConfig(tenantId, origin, queryPurpose, "");
  const allowBadSig = (process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE ?? "0") === "1";

  const base = {
    ok: true,
    where,
    stamp: STAMP,
    tenantId,
    purpose: cfg.purpose,
    resolvedPurposeBy: cfg.resolvedPurposeBy,
    credSource: cfg.credSource ?? "unknown",
    secretLen: cfg.channelSecret.length,
    accessTokenLen: cfg.channelAccessToken.length,
    allowBadSig,
    bookingUrl: cfg.bookingUrl,
    source: cfg.source,
  };

  const cacheHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "x-stamp": STAMP,
  };

  if (debugMode) {
    // Simulate handler dispatch
    const debugApiBase = (
      process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? ""
    ).replace(/\/+$/, "");
    const ctx: HandlerContext = {
      textIn: debugText,
      lineUserId: "DEBUG_USER_ID",
      tenantId,
      cfg,
      apiBase: debugApiBase,
    };
    const result = cfg.purpose === "sales"
      ? await handleSalesEvent(ctx)
      : await handleBookingEvent(ctx);

    const aiEnabled = cfg.settingsData?.ai?.enabled === true || await checkAiEnabled(tenantId);

    // Resolve internal token for /sales-ai/chat auth
    let debugInternalToken = "";
    try {
      const cfEnv = (getRequestContext()?.env as any);
      if (cfEnv?.LINE_INTERNAL_TOKEN) debugInternalToken = String(cfEnv.LINE_INTERNAL_TOKEN);
    } catch {}
    if (!debugInternalToken) debugInternalToken = process.env.LINE_INTERNAL_TOKEN ?? "";

    // For async LLM results in debug mode, call LLM synchronously to show answer
    let llmDebug: any = undefined;
    let openaiAttempted = false;
    let openaiSucceeded = false;
    let llmFallbackReason: string | null = null;

    if (result.sendMode === "async" && result.asyncPayload && debugApiBase) {
      openaiAttempted = true;
      try {
        const chatRes = await fetch(`${debugApiBase}/sales-ai/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-token": debugInternalToken,
          },
          body: JSON.stringify({
            accountId: result.asyncPayload.accountId || undefined,
            tenantId: result.asyncPayload.tenantId,
            message: result.asyncPayload.message,
          }),
        });
        const chatData = (await chatRes.json()) as any;
        openaiSucceeded = chatData?.ok === true;
        if (!openaiSucceeded) llmFallbackReason = chatData?.error ?? "unknown";
        llmDebug = {
          llmUsed: openaiSucceeded,
          llmModel: chatData?.model ?? null,
          llmAnswer: chatData?.answer?.slice(0, 300) ?? null,
          llmError: chatData?.error ?? null,
        };
      } catch (e: any) {
        llmFallbackReason = `exception: ${String(e?.message ?? e).slice(0, 80)}`;
        llmDebug = { llmUsed: false, llmError: llmFallbackReason };
      }
    }

    // Determine salesReplyMode
    const salesReplyMode = result.sendMode === "async" ? "llm_async_push"
      : result.branch?.startsWith("sales_") ? "intent_sync_reply"
      : "sync_reply";

    return NextResponse.json(
      {
        ...base,
        debug: true,
        aiEnabled,
        handler: cfg.purpose,
        branch: result.branch,
        salesIntent: result.salesIntent,
        salesConfigSource: result.salesConfigSource ?? "N/A",
        leadCapture: result.leadCapture,
        sendMode: result.sendMode ?? "sync",
        salesReplyMode,
        openaiAttempted,
        openaiSucceeded,
        llmFallbackReason,
        pushSent: false, // debug=GET never actually pushes
        replyPreview: result.replyMessages[0]?.text?.slice(0, 200)
          ?? result.replyMessages[0]?.altText
          ?? (result.sendMode === "async" ? "(async LLM push)" : "(template)"),
        ...(llmDebug ?? {}),
      },
      { headers: cacheHeaders }
    );
  }

  return NextResponse.json(base, { headers: cacheHeaders });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── POST (LINE webhook) ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export async function POST(req: Request) {
  const t0 = Date.now(); // ── latency tracking ──
  const { searchParams, origin } = new URL(req.url);

  const debugMode    = searchParams.get("debug"); // "1" | "2" | null
  const queryPurpose = searchParams.get("purpose"); // "booking" | "sales" | null

  const sig         = req.headers.get("x-line-signature") ?? "";
  const allowBadSig = (process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE ?? "0") === "1";

  const raw = await req.arrayBuffer();

  console.log(`[WH_ENTRY] stamp=${STAMP} bytes=${raw.byteLength} hasSig=${!!sig} debug=${debugMode} queryPurpose=${queryPurpose}`);

  // ── LINE verification early-exit ──────────────────────────────────────────
  if (raw.byteLength === 0) {
    console.log("[WH_VERIFY] empty body → 200");
    return new Response("OK", { status: 200 });
  }
  try {
    const earlyPeek = JSON.parse(new TextDecoder().decode(raw));
    if (Array.isArray(earlyPeek?.events) && earlyPeek.events.length === 0) {
      console.log("[WH_VERIFY] events=[] → 200");
      return new Response("OK", { status: 200 });
    }
  } catch {
    // Not valid JSON — continue
  }

  // ── Resolve tenantId ──────────────────────────────────────────────────────
  let tenantId: string | null = searchParams.get("tenantId") ?? null;
  let resolvedBy = tenantId ? "query_param" : "pending";
  let destination = "";
  let kvHit = false;

  if (!tenantId) {
    try {
      const payloadForLookup = JSON.parse(new TextDecoder().decode(raw));
      destination = String(payloadForLookup?.destination ?? "").trim();
      if (destination) {
        const apiBase = (
          process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? ""
        ).replace(/\/+$/, "");
        if (apiBase) {
          const r = await fetchT(
            `${apiBase}/line/destination-to-tenant?destination=${encodeURIComponent(destination)}`,
            { timeout: TIMEOUT_TENANT_RESOLVE_MS }
          ).catch(() => null);
          if (r?.ok) {
            const d = await r.json() as any;
            if (d?.tenantId) {
              tenantId = String(d.tenantId);
              kvHit = true;
              resolvedBy = "destination_kv";
            }
          }
          if (!tenantId) {
            resolvedBy = "destination_miss";
          }
        } else {
          resolvedBy = "no_api_base";
        }
      } else {
        resolvedBy = "no_destination";
      }
    } catch { resolvedBy = "parse_error"; }
  }

  console.log(`[WH_TENANT] tenantId=${tenantId} resolvedBy=${resolvedBy} dest=${destination.slice(0, 12)} kvHit=${kvHit}`);

  if (!tenantId) {
    const hint = "Open /admin/line-setup?tenantId=YOUR_TENANT and click Remap to fix destination mapping.";
    console.log(`[WH_FAIL] no tenantId resolvedBy=${resolvedBy} destination=${destination}`);
    if (debugMode === "1") {
      return NextResponse.json({
        ok: false, stamp: STAMP, where, debug: 1,
        error: "unknown_destination",
        destination: destination || null,
        resolvedBy, hint,
      }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, error: "unknown_destination", destination: destination || null, resolvedBy, hint },
      { status: 400 }
    );
  }

  // ── Webhook receipt log helper ────────────────────────────────────────────
  const webhookLogApiBase = (
    process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? ""
  ).replace(/\/+$/, "");
  let internalToken = "";
  try {
    const cfEnv = (getRequestContext()?.env as any);
    if (cfEnv?.LINE_INTERNAL_TOKEN) internalToken = String(cfEnv.LINE_INTERNAL_TOKEN);
  } catch {}
  if (!internalToken) internalToken = process.env.LINE_INTERNAL_TOKEN ?? "";

  let _logPostStatus: number | null = null;
  let _logPostOk: boolean | null = null;
  function saveWebhookLog(log: Record<string, unknown>) {
    if (!webhookLogApiBase || !internalToken) {
      _logPostOk = false;
      _logPostStatus = !webhookLogApiBase ? -1 : -2;
      return;
    }
    fetch(`${webhookLogApiBase}/internal/line/last-webhook?tenantId=${encodeURIComponent(tenantId!)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": internalToken,
      },
      body: JSON.stringify({ log: { ts: new Date().toISOString(), tenantId, stamp: STAMP, ...log } }),
    }).then(r => { _logPostStatus = r.status; _logPostOk = r.ok; }).catch(() => { _logPostStatus = 0; _logPostOk = false; });
  }

  // ── Phase 1: parse body ───────────────────────────────────────────────────
  let payload: any = null;
  let parseError: string | null = null;
  let events: any[] = [];
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
    events = Array.isArray(payload?.events) ? payload.events : [];
  } catch (e: any) {
    parseError = String(e?.message ?? e);
  }

  const firstEvent = events[0] as any;
  if (!destination && payload?.destination) {
    destination = String(payload.destination).trim();
  }

  console.log(
    `[WH_PARSE] eventCount=${events.length} parseError=${parseError ?? "none"} ` +
    `firstEventType=${firstEvent?.type ?? "none"} firstMsgType=${firstEvent?.message?.type ?? "none"} ` +
    `hasReplyToken=${!!firstEvent?.replyToken} firstText="${String(firstEvent?.message?.text ?? "").slice(0, 40)}"`
  );

  // ── traceId for per-event audit ─────────────────────────────────────────
  const traceId = crypto.randomUUID().slice(0, 8);

  // ── Log ALL received events for delivery audit ─────────────────────────
  console.log(`[LINE_EVENTS_RECEIVED]`, JSON.stringify({
    traceId,
    eventCount: events.length,
    events: events.map((e: any, i: number) => ({
      idx: i, type: e?.type, msgType: e?.message?.type,
      text: e?.message?.text?.slice(0, 30),
      hasRT: !!e?.replyToken, uid: e?.source?.userId?.slice(0, 8),
    })),
  }));

  // ── Phase 2: resolve config + sig check + PURPOSE ─────────────────────────
  const tCfg0 = Date.now();
  const cfg = await getTenantLineConfig(tenantId, origin, queryPurpose, destination);
  const tCfgMs = Date.now() - tCfg0;
  const verified = (sig && cfg.channelSecret)
    ? await verifyLineSignature(raw, sig, cfg.channelSecret).catch(() => false)
    : false;

  console.log(
    `[WH_CONFIG] source=${cfg.source} credSource=${cfg.credSource} purpose=${cfg.purpose} purposeBy=${cfg.resolvedPurposeBy} ` +
    `hasSecret=${!!cfg.channelSecret} secretLen=${cfg.channelSecret.length} ` +
    `hasToken=${!!cfg.channelAccessToken} tokenLen=${cfg.channelAccessToken.length} ` +
    `sigVerified=${verified} allowBadSig=${allowBadSig}`
  );

  // ── Save receipt log ──────────────────────────────────────────────────────
  saveWebhookLog({
    destination: destination || null,
    resolvedBy,
    purpose: cfg.purpose,
    resolvedPurposeBy: cfg.resolvedPurposeBy,
    hasSig: !!sig,
    sigVerified: verified,
    allowBadSig,
    bodyLen: raw.byteLength,
    parseError,
    eventCount: events.length,
    firstEventType: firstEvent?.type ?? null,
    firstMessageType: firstEvent?.message?.type ?? null,
    firstText: String(firstEvent?.message?.text ?? "").slice(0, 80) || null,
    hasReplyToken: !!firstEvent?.replyToken,
    cfgSource: cfg.source,
    cfgCredSource: cfg.credSource ?? "unknown",
    cfgHasSecret: !!cfg.channelSecret,
    cfgHasToken: !!cfg.channelAccessToken,
  });

  // ── debug=1 POST: full pipeline dry-run ──────────────────────────────────
  if (debugMode === "1") {
    await new Promise(r => setTimeout(r, 500));
    const _d1AiEnabled = cfg.settingsData?.ai?.enabled === true || await checkAiEnabled(tenantId);
    const _d1Ev = events.find((x: any) =>
      x?.type === "message" && x?.message?.type === "text" && x?.replyToken);
    const _d1Text = _d1Ev ? String(_d1Ev.message?.text ?? "") : null;

    let _d1Result: HandlerResult | null = null;
    if (_d1Text) {
      const ctx: HandlerContext = {
        textIn: _d1Text,
        lineUserId: String(_d1Ev?.source?.userId ?? "").trim(),
        tenantId,
        cfg,
        apiBase: webhookLogApiBase,
      };
      _d1Result = cfg.purpose === "sales"
        ? await handleSalesEvent(ctx)
        : await handleBookingEvent(ctx);
    }

    // For async LLM in debug=1, call LLM synchronously to show answer
    let _d1LlmDebug: any = undefined;
    let _d1OpenaiAttempted = false;
    let _d1OpenaiSucceeded = false;
    let _d1LlmFallbackReason: string | null = null;

    if (_d1Result?.sendMode === "async" && _d1Result.asyncPayload && webhookLogApiBase) {
      _d1OpenaiAttempted = true;
      try {
        const chatRes = await fetch(`${webhookLogApiBase}/sales-ai/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-token": internalToken,
          },
          body: JSON.stringify({
            accountId: _d1Result.asyncPayload.accountId || undefined,
            tenantId: _d1Result.asyncPayload.tenantId,
            message: _d1Result.asyncPayload.message,
          }),
        });
        const chatData = (await chatRes.json()) as any;
        _d1OpenaiSucceeded = chatData?.ok === true;
        if (!_d1OpenaiSucceeded) _d1LlmFallbackReason = chatData?.error ?? "unknown";
        _d1LlmDebug = {
          llmUsed: _d1OpenaiSucceeded,
          llmModel: chatData?.model ?? null,
          llmAnswer: chatData?.answer?.slice(0, 300) ?? null,
          llmError: chatData?.error ?? null,
        };
      } catch (e: any) {
        _d1LlmFallbackReason = `exception: ${String(e?.message ?? e).slice(0, 80)}`;
        _d1LlmDebug = { llmUsed: false, llmError: _d1LlmFallbackReason };
      }
    }

    // Determine salesReplyMode
    const _d1SalesReplyMode = _d1Result?.sendMode === "async" ? "llm_async_push"
      : _d1Result?.branch?.startsWith("sales_") ? "intent_sync_reply"
      : "sync_reply";

    return NextResponse.json({
      ok: true, stamp: STAMP, where, debug: 1,
      step: "full_dry_run",
      destination: destination || null,
      resolvedTenantId: tenantId,
      resolvedBy, kvHit,
      purpose: cfg.purpose,
      resolvedPurposeBy: cfg.resolvedPurposeBy,
      handler: cfg.purpose,
      cfgSource: cfg.source,
      cfgHasSecret: !!cfg.channelSecret,
      cfgHasToken:  !!cfg.channelAccessToken,
      sigVerified: verified, hasSig: !!sig, allowBadSig,
      parseError, eventCount: events.length,
      aiEnabled: _d1AiEnabled,
      firstText: _d1Text?.slice(0, 80) ?? null,
      branch: _d1Result?.branch ?? "no_text_event",
      salesIntent: _d1Result?.salesIntent ?? null,
      leadCapture: _d1Result?.leadCapture ?? false,
      sendMode: _d1Result?.sendMode ?? "sync",
      salesReplyMode: _d1SalesReplyMode,
      openaiAttempted: _d1OpenaiAttempted,
      openaiSucceeded: _d1OpenaiSucceeded,
      llmFallbackReason: _d1LlmFallbackReason,
      pushSent: false, // debug=1 never actually pushes
      actionIfLive: _d1Result ? `would_reply_${_d1Result.branch}` : "no_text_event",
      replyPreview: _d1Result?.replyMessages[0]?.text?.slice(0, 200)
        ?? _d1Result?.replyMessages[0]?.altText
        ?? (_d1Result?.sendMode === "async" ? "(async LLM push)" : null),
      ...(_d1LlmDebug ?? {}),
      logPostAttempt: !!webhookLogApiBase && !!internalToken,
      logPostOk: _logPostOk, logPostStatus: _logPostStatus,
      logHasApiBase: !!webhookLogApiBase, logHasToken: !!internalToken,
      hint: resolvedBy.includes("destination_miss")
        ? "KV key missing — re-save LINE credentials for this tenant"
        : resolvedBy === "no_api_base"
        ? "API_BASE env var not set in Pages — cannot look up KV"
        : !internalToken
        ? "LINE_INTERNAL_TOKEN not set in Pages env — webhook logs cannot be saved"
        : undefined,
    });
  }

  // ── Validation gates ──────────────────────────────────────────────────────
  if (!cfg.channelSecret) {
    console.log(`[WH_FAIL] missing channelSecret tenant=${tenantId} source=${cfg.source}`);
    return NextResponse.json(
      { ok: false, stamp: STAMP, where, tenantId, source: cfg.source, error: "missing_channelSecret" },
      { status: 500 }
    );
  }
  if (!cfg.channelAccessToken) {
    console.log(`[WH_FAIL] missing channelAccessToken tenant=${tenantId} source=${cfg.source}`);
    return NextResponse.json(
      { ok: false, stamp: STAMP, where, tenantId, source: cfg.source, error: "missing_channelAccessToken" },
      { status: 500 }
    );
  }

  if (!verified && !allowBadSig) {
    console.log(`[WH_FAIL] bad_signature tenant=${tenantId} hasSig=${!!sig} bodyLen=${raw.byteLength}`);
    return NextResponse.json(
      {
        ok: false, stamp: STAMP, where, tenantId,
        error: "bad_signature", verified, hasSig: !!sig, bodyLen: raw.byteLength,
      },
      { status: 401 }
    );
  }

  if (parseError) {
    console.log(`[WH_FAIL] invalid_json tenant=${tenantId} error=${parseError}`);
    return NextResponse.json(
      { ok: false, stamp: STAMP, where, tenantId, error: "invalid_json", message: parseError },
      { status: 400 }
    );
  }

  // ── Filter ALL text message events (not just first) ────────────────────
  const textEvents = events.filter(
    (x: any) =>
      x?.type === "message" && x?.message?.type === "text" && x?.replyToken
  );

  console.log(
    `[WH_EVENT] traceId=${traceId} textEventCount=${textEvents.length} ` +
    `totalEvents=${events.length} purpose=${cfg.purpose}`
  );

  // ── Postback handling (rich menu: 店舗情報) — booking only ────────────────
  const postbackEv = events.find(
    (x: any) => x?.type === "postback" && x?.replyToken
  );
  if (postbackEv) {
    const postbackData = String(postbackEv.postback?.data ?? "");
    const params = new URLSearchParams(postbackData);

    if (params.get("action") === "store_info") {
      try {
        const apiBase = (
          process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? ""
        ).replace(/\/+$/, "");
        let adminToken = "";
        try {
          const cfEnv = (getRequestContext()?.env as any);
          if (cfEnv?.ADMIN_TOKEN) adminToken = String(cfEnv.ADMIN_TOKEN);
        } catch {}
        if (!adminToken) adminToken = process.env.ADMIN_TOKEN ?? "";

        let storeName = "未設定";
        let address = "未設定";
        let email = "未設定";

        if (apiBase) {
          const settingsUrl = `${apiBase}/admin/settings?tenantId=${encodeURIComponent(tenantId)}`;
          const headers: Record<string, string> = { Accept: "application/json" };
          if (adminToken) headers["X-Admin-Token"] = adminToken;
          const r = await fetchT(settingsUrl, { headers, timeout: TIMEOUT_SETTINGS_FETCH_MS });
          if (r.ok) {
            const json = (await r.json()) as any;
            const s = json?.data ?? json;
            if (s?.storeName) storeName = s.storeName;
            if (s?.storeAddress) address = s.storeAddress;
            if (s?.tenant?.email) email = s.tenant.email;
          }
        }

        const replyText = `店舗情報です📍\n\n店舗名: ${storeName}\n住所: ${address}\nメール: ${email}`;
        const pbRep = await replyLine(cfg.channelAccessToken, String(postbackEv.replyToken), [
          { type: "text", text: replyText },
        ]);
        console.log(`[WH_POSTBACK] store_info replyOk=${pbRep.ok} st=${pbRep.status} traceId=${traceId}`);

        return NextResponse.json({
          ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
          purpose: cfg.purpose, traceId,
          verified, replied: true, action: "store_info",
        });
      } catch (err: any) {
        console.error(`[WH_POSTBACK] store_info error: ${err.message} traceId=${traceId}`);
        return NextResponse.json({
          ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
          purpose: cfg.purpose, traceId,
          verified, replied: false, action: "store_info", error: String(err.message),
        });
      }
    }
  }

  if (textEvents.length === 0) {
    console.log(`[WH_SKIP] traceId=${traceId} no text event. eventTypes=${events.map((e: any) => e?.type).join(",")}`);
    return NextResponse.json({
      ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
      purpose: cfg.purpose, traceId,
      verified, replied: false, eventCount: events.length,
    });
  }

  if (textEvents.length > 1) {
    console.log(`[LINE_MULTI_EVENT] traceId=${traceId} count=${textEvents.length} — processing ALL events`);
  }

  const apiBase = (
    process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? ""
  ).replace(/\/+$/, "");

  // ═══════════════════════════════════════════════════════════════════════════
  // ── PER-EVENT AUDIT TYPE ──────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  type EventAudit = {
    traceId: string; eventIndex: number;
    eventType: string; messageType: string; messageTextPreview: string;
    tenantId: string; userId: string; replyTokenTail: string;
    routeSelected: string;
    aiStarted: boolean; aiFinished: boolean; aiOk: boolean; aiLatencyMs: number;
    replyAttempted: boolean; replyStatus: number; replyOk: boolean;
    pushAttempted: boolean; pushStatus: number; pushOk: boolean;
    finalDelivery: "reply_ok" | "push_ok" | "push_pending" | "no_delivery";
    errorClass: string | null; errorMessage: string | null;
  };
  const audits: EventAudit[] = [];
  let lastResult: HandlerResult | null = null;
  let lastLineUserId = "";
  let lastTextIn = "";

  // ═══════════════════════════════════════════════════════════════════════════
  // ── PER-EVENT PROCESSING LOOP ─────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  for (let ei = 0; ei < textEvents.length; ei++) {
    const ev = textEvents[ei];
    const textIn     = String(ev.message.text ?? "");
    const replyToken = String(ev.replyToken);
    const lineUserId = String(ev.source?.userId ?? "").trim();
    lastTextIn = textIn;
    lastLineUserId = lineUserId;

    // per-event audit fields
    let routeSelected = "unknown";
    let aiStarted = false, aiFinished = false, aiOk = false, aiLatencyMs = 0;
    let replyAttempted = false, replyStatus = 0, replyOk = false;
    let pushAttempted = false, pushStatus = 0, pushOk = false;
    let errorClass: string | null = null, errorMessage: string | null = null;
    let finalDelivery: "reply_ok" | "push_ok" | "push_pending" | "no_delivery" = "no_delivery";

    try {
      console.log(
        `[WH_TEXT] traceId=${traceId} ei=${ei}/${textEvents.length} tenant=${tenantId} ` +
        `purpose=${cfg.purpose} text="${textIn.slice(0, 40)}" uid=${lineUserId.slice(0, 8)} ` +
        `replyToken=...${replyToken.slice(-8)}`
      );

      // ── Handler dispatch ──────────────────────────────────────────────
      const handlerCtx: HandlerContext = { textIn, lineUserId, tenantId, cfg, apiBase };
      const tH0 = Date.now();
      let result: HandlerResult;
      try {
        if (cfg.purpose === "sales") {
          result = await handleSalesEvent(handlerCtx);
        } else {
          aiStarted = true;
          result = await handleBookingEvent(handlerCtx);
          aiFinished = true;
          aiOk = (result.branch?.includes("ai") || result.branch?.includes("faq")) ?? false;
        }
      } catch (handlerErr: any) {
        errorClass = handlerErr?.name ?? "Error";
        errorMessage = String(handlerErr?.message ?? handlerErr).slice(0, 200);
        console.error(`[WH_HANDLER_CRASH] traceId=${traceId} ei=${ei} error=${errorMessage}`);
        const bookingLink = buildBookingLink(cfg.bookingUrl, tenantId, lineUserId);
        result = {
          branch: "handler_crash_fallback",
          salesIntent: null,
          replyMessages: [{ type: "text", text: getBookingFallbackText(bookingLink) }],
          leadLabel: null,
          leadCapture: false,
        };
      }
      aiLatencyMs = Date.now() - tH0;
      routeSelected = result.branch ?? "unknown";
      lastResult = result;

      // ── Async LLM path (sales only) ──────────────────────────────────
      if (result.sendMode === "async" && result.asyncPayload && lineUserId) {
        const { accountId: asyncAcctId, tenantId: asyncTenantId, message: asyncMsg,
                channelAccessToken: asyncToken, fallbackMessage: asyncFallback } = result.asyncPayload;
        pushAttempted = true;

        const runLlmAndPush = async () => {
          let _openaiOk = false;
          let _pushOk = false;
          let _fallbackReason: string | null = null;
          try {
            const chatRes = await fetch(`${apiBase}/sales-ai/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-internal-token": internalToken },
              body: JSON.stringify({ accountId: asyncAcctId || undefined, tenantId: asyncTenantId, message: asyncMsg }),
            });
            const chatData = (await chatRes.json()) as any;
            _openaiOk = chatData?.ok === true;
            if (!_openaiOk) {
              _fallbackReason = chatData?.error ?? "unknown";
              console.log(`[SALES_LLM_CHAT] openai_failed`, JSON.stringify({
                chatHttpStatus: chatRes.status, error: _fallbackReason,
                tenantId: asyncTenantId, accountId: asyncAcctId, traceId, ei,
              }));
            }
            const pushText = _openaiOk && chatData?.answer ? String(chatData.answer) : asyncFallback;
            const pr = await pushLine(asyncToken, lineUserId, [{ type: "text", text: pushText }]);
            _pushOk = pr.ok;
            console.log(`[SALES_LLM_PUSH]`, JSON.stringify({
              status: pr.status, body: pr.bodyText.slice(0, 300), pushOk: pr.ok,
              salesReplyMode: _openaiOk ? "llm_async_push" : "fallback_async_push",
              userId: lineUserId, tenantId: asyncTenantId, traceId, ei,
            }));
          } catch (e: any) {
            _fallbackReason = `exception: ${String(e?.message ?? e).slice(0, 150)}`;
            console.log(`[SALES_LLM_PUSH] error`, JSON.stringify({
              reason: _fallbackReason, traceId, ei,
            }));
            try {
              const pr2 = await pushLine(asyncToken, lineUserId, [{ type: "text", text: asyncFallback }]);
              _pushOk = pr2.ok;
            } catch {}
          }
        };

        try {
          const ctx = getRequestContext();
          if (ctx?.ctx?.waitUntil) ctx.ctx.waitUntil(runLlmAndPush());
          else runLlmAndPush().catch(() => null);
        } catch { runLlmAndPush().catch(() => null); }

        finalDelivery = "push_pending"; // async — can't verify synchronously

      } else {
        // ── Sync reply path ──────────────────────────────────────────────
        replyAttempted = true;
        try {
          const gr = await replyLine(cfg.channelAccessToken, replyToken, result.replyMessages);
          replyOk = gr.ok;
          replyStatus = gr.status;
          console.log(`[WH_REPLY]`, JSON.stringify({
            ok: gr.ok, status: gr.status, body: gr.bodyText.slice(0, 200),
            traceId, ei, branch: result.branch,
          }));
        } catch (e: any) {
          const timedOut = e?.name === "AbortError";
          errorClass = e?.name ?? "Error";
          errorMessage = `reply_exception:${timedOut ? "TIMEOUT:" : ""}${String(e?.message ?? e).slice(0, 200)}`;
          console.log(`[WH_REPLY] exception traceId=${traceId} ei=${ei} error=${errorMessage}`);
        }

        // ── Push fallback if reply failed ──────────────────────────────
        if (!replyOk && lineUserId) {
          pushAttempted = true;
          try {
            const pushMessages = result.replyMessages.map((m: any) =>
              m.type === "text" ? m : { type: "text", text: m.altText ?? m.template?.text ?? FALLBACK_TEXT }
            );
            const pr = await pushLine(cfg.channelAccessToken, lineUserId, pushMessages);
            pushOk = pr.ok;
            pushStatus = pr.status;
            console.log(`[WH_PUSH_FALLBACK]`, JSON.stringify({
              ok: pr.ok, status: pr.status, body: pr.bodyText.slice(0, 200), traceId, ei,
            }));
          } catch (e: any) {
            console.log(`[WH_PUSH_FALLBACK] exception traceId=${traceId} ei=${ei}: ${String(e?.message ?? e).slice(0, 200)}`);
          }
        }

        // ── Safety net push ──────────────────────────────────────────────
        if (!replyOk && !pushOk && lineUserId) {
          pushAttempted = true;
          try {
            const safetyMsg = "すみません、うまく理解できませんでした。もう一度教えてください😊";
            const sr = await pushLine(cfg.channelAccessToken, lineUserId, [{ type: "text", text: safetyMsg }]);
            pushOk = sr.ok;
            pushStatus = sr.status;
            console.log(`[WH_SAFETY_NET]`, JSON.stringify({
              ok: sr.ok, status: sr.status, traceId, ei,
            }));
          } catch (e: any) {
            console.log(`[WH_SAFETY_NET] exception traceId=${traceId} ei=${ei}: ${String(e?.message ?? e).slice(0, 200)}`);
          }
        }

        finalDelivery = replyOk ? "reply_ok" : pushOk ? "push_ok" : "no_delivery";
      }

    } catch (eventErr: any) {
      // Per-event catch — one event failure doesn't block others
      errorClass = errorClass ?? eventErr?.name ?? "Error";
      errorMessage = errorMessage ?? String(eventErr?.message ?? eventErr).slice(0, 200);
      finalDelivery = "no_delivery";
      console.error(`[WH_EVENT_CRASH] traceId=${traceId} ei=${ei} error=${errorMessage}`);
    }

    // ── [LINE_EVENT_AUDIT] — per-event structured audit log ────────────
    const audit: EventAudit = {
      traceId, eventIndex: ei,
      eventType: "message", messageType: "text",
      messageTextPreview: textIn.slice(0, 30),
      tenantId, userId: lineUserId.slice(0, 12),
      replyTokenTail: replyToken.slice(-8),
      routeSelected, aiStarted, aiFinished, aiOk, aiLatencyMs,
      replyAttempted, replyStatus, replyOk,
      pushAttempted, pushStatus, pushOk,
      finalDelivery, errorClass, errorMessage,
    };
    console.log(`[LINE_EVENT_AUDIT]`, JSON.stringify(audit));

    if (finalDelivery === "no_delivery") {
      console.error(
        `[LINE_NO_DELIVERY] traceId=${traceId} ei=${ei} tenant=${tenantId} ` +
        `text="${textIn.slice(0, 30)}" uid=${lineUserId.slice(0, 12)} ` +
        `replyStatus=${replyStatus} errorClass=${errorClass} errorMessage=${errorMessage}`
      );
    }

    audits.push(audit);
  }
  // ── end per-event loop ────────────────────────────────────────────────────

  // ── Comprehensive flow log ─────────────────────────────────────────────────
  const totalMs = Date.now() - t0;
  const allDelivered = audits.every(a => a.finalDelivery !== "no_delivery");
  console.log(`[LINE_WEBHOOK_FLOW]`, JSON.stringify({
    traceId, tenantId, purpose: cfg.purpose,
    textEventCount: textEvents.length,
    allDelivered,
    latency: { totalMs, cfgMs: tCfgMs },
    audits: audits.map(a => ({ ei: a.eventIndex, route: a.routeSelected, fd: a.finalDelivery })),
  }));

  // ── Lead capture (last event, sales only) ─────────────────────────────────
  if (lastResult?.leadCapture && apiBase && internalToken && lastLineUserId) {
    fetch(`${apiBase}/internal/sales/lead-reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-token": internalToken },
      body: JSON.stringify({
        tenantId, lineUserId: lastLineUserId,
        rawReply: lastTextIn.slice(0, 500),
        label: lastResult.leadLabel ?? "info_request",
        displayName: "",
      }),
    })
      .then(r => console.log(`[WH_LEAD] status=${r.status}`))
      .catch(() => null);
  }

  // ── Build response ─────────────────────────────────────────────────────────
  const firstAudit = audits[0];
  const response = NextResponse.json(
    {
      ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
      verified, mode: "v29_event_audit",
      purpose: cfg.purpose, traceId,
      textEventCount: textEvents.length,
      allDelivered,
      branch: firstAudit?.routeSelected ?? "none",
      finalDelivery: firstAudit?.finalDelivery ?? "no_delivery",
      audits: audits.map(a => ({
        ei: a.eventIndex, route: a.routeSelected, fd: a.finalDelivery,
        replyOk: a.replyOk, pushOk: a.pushOk,
      })),
      resolvedBy, eventCount: events.length,
      text: lastTextIn.slice(0, 80),
      lineUserId: lastLineUserId.slice(0, 8),
    },
    { headers: { "x-stamp": STAMP } }
  );

  // ── KV last result save (fire-and-forget, last event) ──────────────────────
  if (webhookLogApiBase && internalToken && firstAudit) {
    const lastResultPayload = {
      ts: new Date().toISOString(), stamp: STAMP, traceId,
      tenantId, resolvedBy, purpose: cfg.purpose,
      textEventCount: textEvents.length,
      branch: firstAudit.routeSelected,
      finalDelivery: firstAudit.finalDelivery,
      replyOk: firstAudit.replyOk, replyStatus: firstAudit.replyStatus,
      pushOk: firstAudit.pushOk, pushStatus: firstAudit.pushStatus,
      allDelivered,
      errorClass: firstAudit.errorClass, errorMessage: firstAudit.errorMessage,
    };
    const saveLastResult = async () => {
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), 3000);
      try {
        await fetch(
          `${webhookLogApiBase}/internal/line/last-result?tenantId=${encodeURIComponent(tenantId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-token": internalToken },
            body: JSON.stringify({ result: lastResultPayload }),
            signal: ac.signal,
          }
        );
      } catch {} finally { clearTimeout(tid); }
    };
    try {
      const ctx = getRequestContext();
      if (ctx?.ctx?.waitUntil) ctx.ctx.waitUntil(saveLastResult());
      else saveLastResult().catch(() => null);
    } catch { saveLastResult().catch(() => null); }
  }

  return response;
}
