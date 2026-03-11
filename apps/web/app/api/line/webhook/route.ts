import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

// ─── version / stamps ────────────────────────────────────────────────────────
const STAMP = "LINE_WEBHOOK_V18E_20260311_PUSH_FALLBACK";
const where  = "api/line/webhook";

type LinePurpose = "booking" | "sales";

const FALLBACK_TEXT = "少し時間をおいて再度お試しください。";

// ═══════════════════════════════════════════════════════════════════════════════
// ─── SALES handler ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// sales intent keywords
const SALES_INTENT_MAP: { label: string; keywords: string[] }[] = [
  { label: "pricing",      keywords: ["料金", "価格", "値段", "プラン", "月額", "いくら", "費用", "コスト", "pricing", "price"] },
  { label: "features",     keywords: ["機能", "できること", "特徴", "何ができる", "feature", "features"] },
  { label: "demo",         keywords: ["デモ", "demo", "お試し", "試し", "トライアル", "trial"] },
  { label: "consultation", keywords: ["導入", "相談", "問い合わせ", "問合せ", "導入相談", "consultation", "inquiry"] },
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

    default:
      return [
        "ご連絡ありがとうございます！",
        "",
        "LumiBookは、サロン向けの予約受付・LINE対応・顧客管理をまとめて効率化できるツールです。",
        "",
        "気になる内容をそのまま送ってください：",
        "『料金』『機能』『デモ』『導入相談』",
        "と送っていただければ、すぐにご案内します😊",
      ].join("\n");
  }
}

function salesIntentToLeadLabel(intent: string | null): string {
  switch (intent) {
    case "pricing":      return "pricing_question";
    case "features":     return "info_request";
    case "demo":         return "demo_request";
    case "consultation": return "interested";
    default:             return "info_request";
  }
}

/** Handle a text message on a SALES-purpose LINE account */
async function handleSalesEvent(ctx: HandlerContext): Promise<HandlerResult> {
  const { textIn, lineUserId } = ctx;

  // Sales intent detection (no booking template — even "予約" is treated as sales context)
  const salesIntent = detectSalesIntent(textIn);
  const branch = salesIntent ? `sales_${salesIntent}` : "sales_generic";

  const replyMessages = [{ type: "text", text: getSalesReplyText(salesIntent) }];

  // Lead capture label
  const leadLabel = salesIntentToLeadLabel(salesIntent);

  return { branch, salesIntent, replyMessages, leadLabel, leadCapture: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── BOOKING handler ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const BOOKING_INTENT_KW = [
  "予約", "よやく", "予約したい", "予約できる", "予約した", "予約を開始",
  "booking", "reserve",
  "空き", "あき", "空き状況", "空いてる", "空いてますか",
  "最短", "明日行ける", "今日行ける", "来週行ける", "当日",
  "いつ空いてる",
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
      text: "下のボタンから予約を開始してね😊",
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
 *  Flow: booking intent → template card
 *        otherwise → AI接客 (if enabled) → fallback */
async function handleBookingEvent(ctx: HandlerContext): Promise<HandlerResult> {
  const { textIn, cfg, tenantId, lineUserId, apiBase } = ctx;

  // 1. Booking intent → template card (highest priority, always synchronous)
  if (detectBookingIntent(textIn)) {
    const bookingLink = buildBookingLink(cfg.bookingUrl, tenantId, lineUserId);
    return {
      branch: "booking_template",
      salesIntent: null,
      replyMessages: [buildBookingTemplateMessage(bookingLink)],
      leadLabel: null,
      leadCapture: false,
    };
  }

  // 2. AI接客 — call /ai/chat with 8s timeout (replyToken expires at ~30s)
  const aiIp = lineUserId ? `line:${lineUserId.slice(0, 12)}` : "line";
  const aiEnabled = await checkAiEnabled(tenantId);

  if (aiEnabled && apiBase) {
    console.log(`[BOOKING_AI] calling runAiChat tenant=${tenantId} text="${textIn.slice(0, 40)}"`);
    const AI_TIMEOUT_MS = 8000;
    type AiResult = { ok: boolean; answer: string; suggestedActions: any[]; disabled?: boolean };
    const EMPTY_AI: AiResult = { ok: false, answer: "", suggestedActions: [] };

    let ai: AiResult;
    try {
      ai = await Promise.race([
        runAiChat(tenantId, textIn, aiIp),
        new Promise<typeof EMPTY_AI>(resolve =>
          setTimeout(() => {
            console.log(`[BOOKING_AI] timeout after ${AI_TIMEOUT_MS}ms`);
            resolve(EMPTY_AI);
          }, AI_TIMEOUT_MS)
        ),
      ]);
    } catch (e: any) {
      console.log(`[BOOKING_AI] exception: ${String(e?.message ?? e).slice(0, 100)}`);
      ai = EMPTY_AI;
    }

    if (ai.ok && ai.answer) {
      const answer = ai.answer;
      const msg: any = { type: "text", text: answer };
      if (ai.suggestedActions.length > 0) {
        const qr = buildQuickReplyFromActions(ai.suggestedActions);
        if (qr) msg.quickReply = qr;
      }
      console.log(`[BOOKING_AI] success answerLen=${answer.length} actions=${ai.suggestedActions.length}`);
      return {
        branch: "booking_ai",
        salesIntent: null,
        replyMessages: [msg],
        leadLabel: null,
        leadCapture: false,
      };
    }

    console.log(`[BOOKING_AI] failed ok=${ai.ok} disabled=${ai.disabled} answerLen=${ai.answer.length}`);
  }

  // 3. Fallback — friendly store greeting with booking link
  const bookingLink = buildBookingLink(cfg.bookingUrl, tenantId, lineUserId);
  return {
    branch: aiEnabled ? "booking_ai_fallback" : "booking_fallback",
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
}

// ─── AI enabled check ───────────────────────────────────────────────────────
async function checkAiEnabled(tenantId: string): Promise<boolean> {
  const apiBase = (
    process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? ""
  ).replace(/\/+$/, "");
  if (!apiBase) return false;
  try {
    const r = await fetch(
      `${apiBase}/ai/enabled?tenantId=${encodeURIComponent(tenantId)}`,
      { headers: { Accept: "application/json" } }
    );
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
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    },
    body: reqBody,
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
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    },
    body: JSON.stringify({ to: userId, messages }),
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
async function runAiChat(
  tenantId: string,
  message: string,
  ip: string
): Promise<{ ok: boolean; answer: string; suggestedActions: any[]; disabled?: boolean }> {
  const EMPTY = { ok: false, answer: "", suggestedActions: [] };

  const apiBase = (
    process.env.API_BASE ??
    process.env.NEXT_PUBLIC_API_BASE ??
    ""
  ).replace(/\/+$/, "");

  if (!apiBase) return EMPTY;

  try {
    const res = await fetch(`${apiBase}/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": ip,
        "x-real-ip": ip,
      },
      body: JSON.stringify({ message, tenantId }),
    });
    const data = (await res.json().catch(() => null)) as any;
    if (data?.ok && data?.answer) {
      return {
        ok: true,
        answer: String(data.answer),
        suggestedActions: Array.isArray(data.suggestedActions) ? data.suggestedActions : [],
      };
    }
    if (data?.error === "ai_disabled") {
      return { ...EMPTY, disabled: true };
    }
    return EMPTY;
  } catch {
    return EMPTY;
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
    try {
      const url = `${apiBase}/admin/settings?tenantId=${encodeURIComponent(tenantId)}`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (adminToken) headers["X-Admin-Token"] = adminToken;

      const r = await fetch(url, { headers });
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
    } catch {
      // fall through
    }
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

    const aiEnabled = await checkAiEnabled(tenantId);

    return NextResponse.json(
      {
        ...base,
        debug: true,
        aiEnabled,
        handler: cfg.purpose,
        branch: result.branch,
        salesIntent: result.salesIntent,
        leadCapture: result.leadCapture,
        replyPreview: result.replyMessages[0]?.text?.slice(0, 200)
          ?? result.replyMessages[0]?.altText
          ?? "(template)",
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
          const r = await fetch(
            `${apiBase}/line/destination-to-tenant?destination=${encodeURIComponent(destination)}`
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

  // ── Phase 2: resolve config + sig check + PURPOSE ─────────────────────────
  const cfg = await getTenantLineConfig(tenantId, origin, queryPurpose, destination);
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
    const _d1AiEnabled = await checkAiEnabled(tenantId);
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
      actionIfLive: _d1Result ? `would_reply_${_d1Result.branch}` : "no_text_event",
      replyPreview: _d1Result?.replyMessages[0]?.text?.slice(0, 200)
        ?? _d1Result?.replyMessages[0]?.altText
        ?? null,
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

  // ── Find first text message event with replyToken ─────────────────────────
  const ev = events.find(
    (x: any) =>
      x?.type === "message" && x?.message?.type === "text" && x?.replyToken
  );

  const textIn     = ev ? String(ev.message.text ?? "") : "";
  const replyToken = ev ? String(ev.replyToken) : "";
  const lineUserId = ev ? String(ev.source?.userId ?? "").trim() : "";

  console.log(
    `[WH_EVENT] hasTextEvent=${!!ev} text="${textIn.slice(0, 40)}" ` +
    `uid=${lineUserId.slice(0, 8)} replyToken=${replyToken.slice(0, 8)}... ` +
    `purpose=${cfg.purpose}`
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
          const r = await fetch(settingsUrl, { headers });
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
        console.log(`[WH_POSTBACK] store_info replyOk=${pbRep.ok} st=${pbRep.status} body=${pbRep.bodyText.slice(0, 120)}`);

        return NextResponse.json({
          ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
          purpose: cfg.purpose,
          verified, replied: true, action: "store_info",
        });
      } catch (err: any) {
        console.error(`[WH_POSTBACK] store_info error: ${err.message}`);
        return NextResponse.json({
          ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
          purpose: cfg.purpose,
          verified, replied: false, action: "store_info", error: String(err.message),
        });
      }
    }
  }

  if (!ev) {
    console.log(`[WH_SKIP] no text event found. eventTypes=${events.map((e: any) => e?.type).join(",")}`);
    return NextResponse.json({
      ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
      purpose: cfg.purpose,
      verified, replied: false, eventCount: events.length,
    });
  }

  console.log(
    `[WH_TEXT] tenant=${tenantId} purpose=${cfg.purpose} resolvedBy=${resolvedBy} ` +
    `text="${textIn.slice(0, 40)}" uid=${lineUserId.slice(0, 8)} ` +
    `replyToken=${replyToken.slice(0, 8)}... cfgSource=${cfg.source}`
  );

  const apiBase = (
    process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? ""
  ).replace(/\/+$/, "");

  // ═══════════════════════════════════════════════════════════════════════════
  // ── PURPOSE-BASED DISPATCH ────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  const handlerCtx: HandlerContext = { textIn, lineUserId, tenantId, cfg, apiBase };

  let result: HandlerResult;
  try {
    result = cfg.purpose === "sales"
      ? await handleSalesEvent(handlerCtx)
      : await handleBookingEvent(handlerCtx);
  } catch (handlerErr: any) {
    // Handler crashed — guaranteed fallback reply so user always gets a response
    console.error(
      `[WH_HANDLER_CRASH] purpose=${cfg.purpose} error=${String(handlerErr?.message ?? handlerErr).slice(0, 200)}`
    );
    const bookingLink = buildBookingLink(cfg.bookingUrl, tenantId, lineUserId);
    result = {
      branch: "handler_crash_fallback",
      salesIntent: null,
      replyMessages: [{ type: "text", text: getBookingFallbackText(bookingLink) }],
      leadLabel: null,
      leadCapture: false,
    };
  }

  const tokenPreviewMain = cfg.channelAccessToken.length > 8
    ? `${cfg.channelAccessToken.slice(0, 4)}...${cfg.channelAccessToken.slice(-4)}`
    : `(empty:${cfg.channelAccessToken.length})`;
  console.log(
    `[WH_DISPATCH] purpose=${cfg.purpose} branch=${result.branch} ` +
    `salesIntent=${result.salesIntent} leadCapture=${result.leadCapture} ` +
    `tokenPreview=${tokenPreviewMain} tokenLen=${cfg.channelAccessToken.length} ` +
    `replyToken=${replyToken.slice(0, 12)}... text="${textIn.slice(0, 60)}"`
  );

  // ── Send reply (with push fallback if replyToken fails) ──────────────────
  let replyOk = false;
  let replyStatus = 0;
  let replyBody = "";
  let pushFallbackUsed = false;
  let pushFallbackOk = false;
  try {
    const gr = await replyLine(cfg.channelAccessToken, replyToken, result.replyMessages);
    replyOk = gr.ok;
    replyStatus = gr.status;
    replyBody = gr.bodyText.slice(0, 500);
  } catch (e: any) {
    replyBody = `EXCEPTION: ${String(e?.message ?? e).slice(0, 400)}`;
  }
  console.log(
    `[WH_REPLY] ok=${replyOk} status=${replyStatus} purpose=${cfg.purpose} ` +
    `branch=${result.branch} body=${replyBody.slice(0, 200)}`
  );

  // ── Push fallback: if reply failed and we have a userId, push instead ────
  if (!replyOk && lineUserId) {
    console.log(`[WH_PUSH_FALLBACK] reply failed (status=${replyStatus}), attempting push to ${lineUserId.slice(0, 8)}...`);
    pushFallbackUsed = true;
    try {
      // Filter to text-only messages for push (template messages may not work via push)
      const pushMessages = result.replyMessages.map((m: any) =>
        m.type === "text" ? m : { type: "text", text: m.altText ?? m.template?.text ?? FALLBACK_TEXT }
      );
      const pr = await pushLine(cfg.channelAccessToken, lineUserId, pushMessages);
      pushFallbackOk = pr.ok;
      console.log(`[WH_PUSH_FALLBACK] ok=${pr.ok} status=${pr.status} body=${pr.bodyText.slice(0, 200)}`);
    } catch (e: any) {
      console.log(`[WH_PUSH_FALLBACK] exception: ${String(e?.message ?? e).slice(0, 200)}`);
    }
  }

  // ── Lead capture (sales only) ─────────────────────────────────────────────
  let leadCaptureAttempted = false;
  if (result.leadCapture && apiBase && internalToken && lineUserId) {
    leadCaptureAttempted = true;
    fetch(`${apiBase}/internal/sales/lead-reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": internalToken,
      },
      body: JSON.stringify({
        tenantId,
        lineUserId,
        rawReply: textIn.slice(0, 500),
        label: result.leadLabel ?? "info_request",
        displayName: "",
      }),
    })
      .then(r => console.log(`[WH_LEAD] status=${r.status} ok=${r.ok}`))
      .catch(e => console.log(`[WH_LEAD] error: ${String(e?.message ?? e).slice(0, 100)}`));
  } else if (result.leadCapture) {
    console.log(
      `[WH_LEAD] skipped: apiBase=${!!apiBase} internalToken=${!!internalToken} lineUserId=${!!lineUserId}`
    );
  }

  // ── Persist last result to KV (AWAITED — fire-and-forget was silently lost) ─
  const lastResultPayload = {
    ts: new Date().toISOString(),
    stamp: STAMP,
    tenantId,
    resolvedBy,
    purpose: cfg.purpose,
    resolvedPurposeBy: cfg.resolvedPurposeBy,
    credSource: cfg.credSource ?? "unknown",
    eventType: "message",
    messageType: "text",
    messageText: textIn.slice(0, 100),
    lineUserId: lineUserId.slice(0, 8),
    branch: result.branch,
    salesIntent: result.salesIntent ?? "none",
    replyAttempted: true,
    replyOk,
    replyStatus,
    replyBody: replyBody.slice(0, 200),
    errorReason: replyOk ? null : replyBody.slice(0, 200),
    leadCaptureAttempted,
    sigVerified: verified,
    cfgSource: cfg.source,
    tokenLen: cfg.channelAccessToken.length,
    tokenPreview: cfg.channelAccessToken.length > 8
      ? `${cfg.channelAccessToken.slice(0, 4)}...${cfg.channelAccessToken.slice(-4)}`
      : "(short)",
    replyTokenLen: replyToken.length,
    replyTokenPreview: replyToken.slice(0, 12),
    pushFallbackUsed,
    pushFallbackOk,
  };
  let lastResultSaved = false;
  if (webhookLogApiBase && internalToken) {
    try {
      const lr = await fetch(
        `${webhookLogApiBase}/internal/line/last-result?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-token": internalToken,
          },
          body: JSON.stringify({ result: lastResultPayload }),
        }
      );
      lastResultSaved = lr.ok;
      console.log(`[WH_LAST_RESULT] saved ok=${lr.ok} status=${lr.status}`);
    } catch (e: any) {
      console.log(`[WH_LAST_RESULT] save failed: ${String(e?.message ?? e).slice(0, 100)}`);
    }
  }

  // ── Response ──────────────────────────────────────────────────────────────
  return NextResponse.json(
    {
      ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
      verified, mode: "purpose_split_v18d",
      purpose: cfg.purpose,
      resolvedPurposeBy: cfg.resolvedPurposeBy,
      credSource: cfg.credSource ?? "unknown",
      branch: result.branch,
      salesIntent: result.salesIntent,
      replied: replyOk,
      replyStatus,
      replyBody: replyBody.slice(0, 200),
      leadCaptureAttempted,
      resolvedBy, eventCount: events.length,
      text: textIn.slice(0, 80),
      lineUserId: lineUserId.slice(0, 8),
      pushFallbackUsed,
      pushFallbackOk,
      lastResultSaved,
    },
    { headers: { "x-stamp": STAMP } }
  );
}
