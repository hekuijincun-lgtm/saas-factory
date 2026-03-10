import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

// ─── version / stamps ────────────────────────────────────────────────────────
// V12: AI enabled gate — ALL automated responses (booking template + AI push)
//      are skipped when ai:settings:{tenantId}.enabled !== true.
//   normal  → aiEnabled check → dedup
//             → booking: buttons template を replyLine で即返信（AI不使用）
//             → ai:     waitUntil(AI+push+quickReply) → 即時 200 返却
//   debug=1 → 実送信ゼロ・{ intent, bookingUrl, replyPlanned, pushPlanned, aiEnabled } 返却
//   debug=2 → push のみ同期実送信して pushStatus + quickReply を返す（テスト用）
const STAMP = "LINE_WEBHOOK_V15_20260310_DEBUG_REPLY";
const where  = "api/line/webhook";

const FALLBACK_TEXT = "少し時間をおいて再度お試しください。";

// ─── AI enabled check ───────────────────────────────────────────────────────
// Calls GET /ai/enabled on Workers to check if AI is enabled for the tenant.
// Returns false when disabled; defaults to false on error (fail-closed).
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

// 予約 intent キーワード（テンプレカードを返す条件）
const BOOKING_INTENT_KW = [
  "予約", "よやく", "予約したい", "予約できる", "予約した", "予約を開始",
  "booking", "reserve",
  "空き", "あき", "空き状況", "空いてる", "空いてますか",
  "最短", "明日行ける", "今日行ける", "来週行ける", "当日",
  "いつ空いてる",
] as const;

// ─── utils ───────────────────────────────────────────────────────────────────
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

// SHA-256 先頭4バイトを hex で返す（dedup key のサフィックス用）
async function shortHash(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf).slice(0, 4))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// dedup key 生成
// 優先: event.message.id（LINE が付与する一意 ID）
// fallback: {userId}:{timestamp末尾10桁}:{shortHash(text)}
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
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
  const bodyText = await res.text().catch(() => "");
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
// 500ms タイムアウト付き（best-effort）
async function dedupEvent(
  apiBase: string,
  key: string,
  ttlSeconds = 120
): Promise<boolean> {
  if (!apiBase || !key) return true; // フォールバック: 常に新規扱い

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
// 429 / 5xx 時のみ（token は送らない）
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
    // AI disabled by admin → signal to skip push
    if (data?.error === "ai_disabled") {
      return { ...EMPTY, disabled: true };
    }
    return EMPTY;
  } catch {
    return EMPTY;
  }
}

// ─── 予約URL組み立て ──────────────────────────────────────────────────────────
function buildBookingLink(bookingUrl: string, tenantId: string, lineUserId: string): string {
  // Strip existing tenantId/lu params to avoid duplicates
  const u = new URL(bookingUrl);
  u.searchParams.delete("tenantId");
  u.searchParams.delete("lu");
  u.searchParams.set("tenantId", tenantId);
  if (lineUserId) u.searchParams.set("lu", lineUserId);
  return u.toString();
}

// ─── 予約 intent 判定 ─────────────────────────────────────────────────────────
function detectBookingIntent(textIn: string): boolean {
  const normalized = textIn
    .normalize("NFKC")
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase();
  return BOOKING_INTENT_KW.some(k => normalized.includes(k));
}

// ─── 予約テンプレカードメッセージ組み立て ─────────────────────────────────────
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

// ─── suggestedActions → LINE quickReply 変換 ─────────────────────────────────
// LINE quickReply 制約: 最大13アイテム、label最大20文字
// action.type="open_booking_form" + url → uri action（外部リンク）
// action.url なし → message action（テキスト再送信）
function buildQuickReplyFromActions(
  actions: { type?: string; label?: string; url?: string }[]
): { items: object[] } | undefined {
  if (!Array.isArray(actions) || actions.length === 0) return undefined;
  const items: object[] = [];
  for (const a of actions.slice(0, 13)) {
    const label = String(a.label ?? "").slice(0, 20) || "詳細を見る";
    if (a.url) {
      // URL付き → uri action（予約フォームへ遷移）
      items.push({
        type: "action",
        action: { type: "uri", label, uri: a.url },
      });
    } else {
      // URLなし → message action（ラベルテキストを再送信）
      items.push({
        type: "action",
        action: { type: "message", label, text: label },
      });
    }
  }
  return items.length > 0 ? { items } : undefined;
}

// ─── tenant config resolution ─────────────────────────────────────────────────
interface TenantLineConfig {
  channelSecret: string;
  channelAccessToken: string;
  bookingUrl: string;
  source: "kv" | "env";
}

async function getTenantLineConfig(
  tenantId: string,
  origin: string
): Promise<TenantLineConfig> {
  const apiBase = (
    process.env.API_BASE ??
    process.env.NEXT_PUBLIC_API_BASE ??
    ""
  ).replace(/\/+$/, "");
  // Read ADMIN_TOKEN: CF Pages bindings (secrets) live in getRequestContext().env,
  // NOT in process.env. Check binding first; fall back to plain env var.
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
        const line = s?.integrations?.line;

        const channelSecret      = String(line?.channelSecret      ?? "").trim();
        const channelAccessToken = String(line?.channelAccessToken ?? "").trim();
        // Ensure bookingUrl points to /booking (not webhook URL) with correct tenantId
        const rawBookingUrl = String(line?.bookingUrl ?? "").trim();
        const fallback = `${origin}/booking?tenantId=${encodeURIComponent(tenantId)}`;
        let bookingUrl = rawBookingUrl || fallback;
        // Reject stored URLs that point to webhook endpoint (bad data in KV)
        if (bookingUrl.includes("/api/line/webhook")) {
          bookingUrl = fallback;
        }
        try {
          const bu = new URL(bookingUrl);
          bu.searchParams.set("tenantId", tenantId);
          bookingUrl = bu.toString();
        } catch { bookingUrl = fallback; }

        if (channelSecret && channelAccessToken) {
          return { channelSecret, channelAccessToken, bookingUrl, source: "kv" };
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

  return { channelSecret, channelAccessToken, bookingUrl, source: "env" };
}

// ─── GET (debug probe) ────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const tenantId  = searchParams.get("tenantId") ?? "default";
  const debugMode = searchParams.get("debug") === "1";
  const debugText = searchParams.get("text") ?? "営業時間は？";

  const cfg = await getTenantLineConfig(tenantId, origin);
  const allowBadSig = (process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE ?? "0") === "1";

  const base = {
    ok: true,
    where,
    stamp: STAMP,
    tenantId,
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
    const isBooking  = detectBookingIntent(debugText);
    const bookingUrl = buildBookingLink(cfg.bookingUrl, tenantId, "DEBUG_USER_ID");
    const aiEnabled  = await checkAiEnabled(tenantId);
    return NextResponse.json(
      {
        ...base,
        debug: true,
        aiEnabled,
        intent:       isBooking ? "booking" : "ai",
        replyPlanned: aiEnabled && isBooking ? buildBookingTemplateMessage(bookingUrl) : null,
        pushPlanned:  aiEnabled && !isBooking ? { type: "text", text: "(AI response)" } : null,
        gateReason:   !aiEnabled ? "ai_disabled" : null,
      },
      { headers: cacheHeaders }
    );
  }

  return NextResponse.json(base, { headers: cacheHeaders });
}

// ─── POST (LINE webhook) ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  const { searchParams, origin } = new URL(req.url);

  // debug モード: "1" = 実送信なし判定のみ, "2" = push のみ同期実送信
  const debugMode = searchParams.get("debug"); // "1" | "2" | null

  const sig         = req.headers.get("x-line-signature") ?? "";
  const allowBadSig = (process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE ?? "0") === "1";

  const raw = await req.arrayBuffer();

  console.log(`[WH_ENTRY] stamp=${STAMP} bytes=${raw.byteLength} hasSig=${!!sig} debug=${debugMode}`);

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

  // Resolve tenantId: query param → destination KV lookup → 400 error
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

  // No default fallback — unknown destination returns 400
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

  // ── Webhook receipt log helper: fire-and-forget to Workers KV ──────────────
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

  // ── Phase 2: resolve config + sig check ───────────────────────────────────
  const cfg = await getTenantLineConfig(tenantId, origin);
  const verified = (sig && cfg.channelSecret)
    ? await verifyLineSignature(raw, sig, cfg.channelSecret).catch(() => false)
    : false;

  console.log(
    `[WH_CONFIG] source=${cfg.source} hasSecret=${!!cfg.channelSecret} secretLen=${cfg.channelSecret.length} ` +
    `hasToken=${!!cfg.channelAccessToken} tokenLen=${cfg.channelAccessToken.length} ` +
    `sigVerified=${verified} allowBadSig=${allowBadSig}`
  );

  // ── Save receipt log (BEFORE any early-return) ────────────────────────────
  saveWebhookLog({
    destination: destination || null,
    resolvedBy,
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
    const _d1IsBooking = _d1Text ? detectBookingIntent(_d1Text) : null;
    let _d1Action: string;
    if (!_d1Ev) _d1Action = "no_text_event";
    else if (!_d1AiEnabled) _d1Action = "sales_flow";
    else if (_d1IsBooking) _d1Action = "would_reply_booking_template";
    else _d1Action = "would_push_ai";

    return NextResponse.json({
      ok: true, stamp: STAMP, where, debug: 1,
      step: "full_dry_run",
      destination: destination || null,
      resolvedTenantId: tenantId,
      resolvedBy, kvHit,
      cfgSource: cfg.source,
      cfgHasSecret: !!cfg.channelSecret,
      cfgHasToken:  !!cfg.channelAccessToken,
      sigVerified: verified, hasSig: !!sig, allowBadSig,
      parseError, eventCount: events.length,
      aiEnabled: _d1AiEnabled,
      firstText: _d1Text?.slice(0, 80) ?? null,
      intent: _d1IsBooking === null ? null : (_d1IsBooking ? "booking" : "ai"),
      actionIfLive: _d1Action,
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
  // Do this BEFORE postback so we can use it for guaranteed-reply fallback
  const ev = events.find(
    (x: any) =>
      x?.type === "message" && x?.message?.type === "text" && x?.replyToken
  );

  // Extract replyToken + userId early — needed for guaranteed-reply fallback
  const textIn     = ev ? String(ev.message.text ?? "") : "";
  const replyToken = ev ? String(ev.replyToken) : "";
  const lineUserId = ev ? String(ev.source?.userId ?? "").trim() : "";

  console.log(
    `[WH_EVENT] hasTextEvent=${!!ev} text="${textIn.slice(0, 40)}" ` +
    `uid=${lineUserId.slice(0, 8)} replyToken=${replyToken.slice(0, 8)}...`
  );

  // ── Postback handling (rich menu: 店舗情報) ──────────────────────────────────
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
          verified, replied: true, action: "store_info",
        });
      } catch (err: any) {
        console.error(`[WH_POSTBACK] store_info error: ${err.message}`);
        return NextResponse.json({
          ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
          verified, replied: false, action: "store_info", error: String(err.message),
        });
      }
    }
  }

  if (!ev) {
    console.log(`[WH_SKIP] no text event found. eventTypes=${events.map((e: any) => e?.type).join(",")}`);
    return NextResponse.json({
      ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
      verified, replied: false, eventCount: events.length,
    });
  }

  console.log(
    `[WH_TEXT] tenant=${tenantId} resolvedBy=${resolvedBy} ` +
    `text="${textIn.slice(0, 40)}" uid=${lineUserId.slice(0, 8)} ` +
    `replyToken=${replyToken.slice(0, 8)}... cfgSource=${cfg.source}`
  );

  const apiBase = (
    process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? ""
  ).replace(/\/+$/, "");

  const aiIp = lineUserId ? `line:${lineUserId.slice(0, 12)}` : "line";

  // ── AI gate ────────────────────────────────────────────────────────────────
  const aiEnabled = await checkAiEnabled(tenantId);
  console.log(`[WH_AI_GATE] aiEnabled=${aiEnabled} tenant=${tenantId}`);

  if (!aiEnabled) {
    // ── Sales LINE flow (AI disabled tenants) ─────────────────────────────
    const trimmed = textIn.trim();
    const numberMatch = trimmed.match(/^[１-４1-4]$/);
    const num = numberMatch
      ? trimmed.replace(/[１２３４]/g, (c) => String("１２３４".indexOf(c) + 1))
      : null;

    let replyText: string;
    let label: string | null = null;

    if (num === "1") {
      label = "interested";
      replyText = "ありがとうございます！\n無料診断のご案内をお送りしますね。\n\n担当者より改めてご連絡いたします。少々お待ちください🙏";
    } else if (num === "2") {
      label = "info_request";
      replyText = "ありがとうございます！\n\nLumi Bookは眉毛サロン専用の予約管理ツールです。\n\n・LINE予約導線の最適化\n・予約の取りこぼし防止\n・顧客管理・リピート促進\n\n詳しい資料をお送りしますね📄\n担当者より改めてご連絡いたします。";
    } else if (num === "3") {
      label = "pricing_question";
      replyText = "ありがとうございます！\n\n料金プラン：\n🔹 Starter: ¥3,980/月\n🔹 Pro: ¥9,800/月\n🔹 Enterprise: ご相談\n\n詳しくは担当者からご説明いたします。\nご都合の良い時間帯はありますか？";
    } else if (num === "4") {
      label = "demo_request";
      replyText = "ありがとうございます！\n担当者より直接ご連絡いたします。\n\nご都合の良い曜日・時間帯があれば教えてください🙏";
    } else {
      replyText = "ありがとうございます！Lumi Bookです✨\n\n眉毛サロン向けに\n・LINE予約導線の改善\n・予約の取りこぼしチェック\n・無料診断\nを行っています。\n\n気になるものを番号で返信してください。\n1. 無料診断したい\n2. どんなツールか知りたい\n3. 料金を知りたい\n4. 担当者と話したい";
    }

    console.log(`[WH_SALES] BEFORE replyLine() label=${label ?? "greeting"} tokenLen=${cfg.channelAccessToken.length} replyTokenLen=${replyToken.length}`);

    let salesReplyOk = false;
    let salesReplyStatus = 0;
    let salesReplyBody = "";
    try {
      const rep = await replyLine(cfg.channelAccessToken, replyToken, [
        { type: "text", text: replyText },
      ]);
      salesReplyOk = rep.ok;
      salesReplyStatus = rep.status;
      salesReplyBody = rep.bodyText.slice(0, 500);
    } catch (e: any) {
      salesReplyBody = `EXCEPTION: ${String(e?.message ?? e).slice(0, 400)}`;
    }

    console.log(
      `[WH_SALES] AFTER replyLine() ok=${salesReplyOk} status=${salesReplyStatus} ` +
      `body=${salesReplyBody}`
    );

    // Save to /owner/leads via internal endpoint (fire-and-forget)
    if (apiBase && lineUserId) {
      const leadToken = internalToken; // reuse from outer scope
      if (leadToken) {
        fetch(`${apiBase}/internal/sales/lead-reply`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-token": leadToken,
          },
          body: JSON.stringify({
            tenantId,
            lineUserId,
            rawReply: textIn.slice(0, 500),
            label: label ?? null,
            displayName: "",
          }),
        }).catch((e) => console.error(`[WH_SALES] lead-reply error: ${e}`));
      }
    }

    return NextResponse.json(
      {
        ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
        verified, aiEnabled: false, replied: salesReplyOk,
        replyStatus: salesReplyStatus, replyBody: salesReplyBody.slice(0, 200),
        resolvedBy, eventCount: events.length,
        mode: "sales", label: label ?? "greeting",
      },
      { headers: { "x-stamp": STAMP } }
    );
  }

  // ── intent 判定（booking が優先）────────────────────────────────────────────
  console.log(`[WH_AI_FLOW] tenant=${tenantId} aiEnabled=true, proceeding to intent detection`);
  const isBookingIntent = detectBookingIntent(textIn);
  const bookingUrl      = buildBookingLink(cfg.bookingUrl, tenantId, lineUserId);
  console.log(`[WH_AI_FLOW] isBooking=${isBookingIntent} text="${textIn.slice(0, 30)}"`);


  // ── debug=1: 実送信ゼロ・判定結果のみ JSON で返す ─────────────────────────
  if (debugMode === "1") {
    return NextResponse.json({
      ok: true, stamp: STAMP, where, tenantId, debug: 1,
      aiEnabled: true,  // if we reached here, AI gate passed
      intent:       isBookingIntent ? "booking" : "ai",
      bookingUrl:   isBookingIntent ? bookingUrl : null,
      replyPlanned: isBookingIntent ? buildBookingTemplateMessage(bookingUrl) : null,
      pushPlanned:  !isBookingIntent
        ? { type: "text", text: "(AI response — not executed in debug=1)" }
        : null,
    });
  }

  // ── debug=2: push のみ同期実送信（ack なし・テスト用）────────────────────
  if (debugMode === "2") {
    const ai       = await runAiChat(tenantId, textIn, aiIp);

    // AI disabled by admin → skip push even in debug=2
    if (ai.disabled) {
      return NextResponse.json({
        ok: true, stamp: STAMP, where, tenantId, debug: 2,
        intent: "ai", aiDisabled: true,
        hasUserId: !!lineUserId,
        finalText: null, pushStatus: null, pushOk: null, pushBodySnippet: null,
      });
    }

    const answer   = ai.ok ? ai.answer : FALLBACK_TEXT;
    const quickReply = ai.ok ? buildQuickReplyFromActions(ai.suggestedActions) : undefined;
    const messages = [{ type: "text", text: answer, ...(quickReply ? { quickReply } : {}) }];

    let pushRep: { ok: boolean; status: number; bodyText: string } | null = null;
    if (lineUserId) {
      pushRep = await pushLine(cfg.channelAccessToken, lineUserId, messages)
        .catch(() => ({ ok: false, status: 0, bodyText: "push_exception" }));
    }

    return NextResponse.json({
      ok: true, stamp: STAMP, where, tenantId, debug: 2,
      intent: isBookingIntent ? "booking" : "ai",
      hasUserId: !!lineUserId,
      finalText: answer,
      suggestedActions: ai.suggestedActions ?? [],
      quickReply: quickReply ?? null,
      pushStatus:      pushRep?.status      ?? null,
      pushOk:          pushRep?.ok          ?? null,
      pushBodySnippet: pushRep?.bodyText?.slice(0, 500) ?? null,
    });
  }

  // ── 通常モード: dedup → booking template reply OR AI+push ─────────────────

  // KV dedup（重複イベントをスキップ）
  const dedupKey = await buildDedupKey(tenantId, ev);
  const isNew    = await dedupEvent(apiBase, dedupKey, 120);
  if (!isNew) {
    return NextResponse.json({
      ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
      verified, skipped: true, reason: "duplicate_event",
      dedupKey, eventCount: events.length,
    });
  }

  // ── 予約 intent: テンプレカードを reply で返す（AI gate 通過済み）───────
  if (isBookingIntent) {
    console.log(`[WH_BOOKING] BEFORE replyLine() tenant=${tenantId} bookingUrl=${bookingUrl.slice(0, 60)}`);
    const bookingMsg = buildBookingTemplateMessage(bookingUrl);
    const repBooking = await replyLine(cfg.channelAccessToken, replyToken, [bookingMsg])
      .catch(() => ({ ok: false, status: 0, bodyText: "reply_exception" }));

    console.log(
      `[WH_BOOKING] AFTER replyLine() ok=${repBooking.ok} st=${repBooking.status} ` +
      `body=${repBooking.bodyText.slice(0, 200)}`
    );

    return NextResponse.json(
      {
        ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
        verified, aiEnabled: true, resolvedBy, intent: "booking",
        replyOk: repBooking.ok, replyStatus: repBooking.status,
        hasUserId: !!lineUserId, eventCount: events.length,
      },
      { headers: { "x-stamp": STAMP } }
    );
  }

  // ── AI intent: persist userId + waitUntil(AI+push) → 即時 200 ────────────

  // Best-effort: persist lineUserId to Workers KV via internal endpoint
  // Uses /internal/ path (LINE_INTERNAL_TOKEN) to avoid RBAC requireRole() check
  if (lineUserId) {
    const _internalToken = process.env.LINE_INTERNAL_TOKEN ?? "";
    if (apiBase) {
      const _h: Record<string, string> = { "Content-Type": "application/json" };
      if (_internalToken) _h["x-internal-token"] = _internalToken;
      fetch(
        `${apiBase}/internal/line/last-user?tenantId=${encodeURIComponent(tenantId)}`,
        { method: "POST", headers: _h, body: JSON.stringify({ userId: lineUserId }) }
      ).catch(() => null);
    }
  }

  // waitUntil 取得（Cloudflare Pages edge context）
  // ローカル開発では getRequestContext() が投げるので fallback: fire-and-forget
  let waitUntilFn: (p: Promise<any>) => void = (p) => void p.catch(() => null);
  try {
    const { ctx } = getRequestContext();
    waitUntilFn = (p) => ctx.waitUntil(p);
  } catch { /* ローカル開発 / テスト環境 */ }

  // AI + push をバックグラウンドで実行（レスポンス返却後も継続）
  const runAiAndPush = async (): Promise<void> => {
    try {
      const aiStart = Date.now();
      const ai      = await runAiChat(tenantId, textIn, aiIp);
      const aiMs    = Date.now() - aiStart;

      // AI disabled by admin → do not push any message
      if (ai.disabled) {
        console.log(`[LINE_AI_SKIP] tenant=${tenantId} reason=ai_disabled`);
        return;
      }

      const answer   = ai.ok ? ai.answer : FALLBACK_TEXT;
      const quickReply = ai.ok ? buildQuickReplyFromActions(ai.suggestedActions) : undefined;
      const messages = [{ type: "text" as const, text: answer, ...(quickReply ? { quickReply } : {}) }];

      if (lineUserId) {
        const pushRep = await pushLine(cfg.channelAccessToken, lineUserId, messages)
          .catch(() => ({ ok: false, status: 0, bodyText: "push_exception" }));

        // ログ: token/userId 丸出し禁止 — 先頭6文字のみ
        console.log(
          `[LINE_PUSH] tenant=${tenantId} uid=${lineUserId.slice(0, 6)}*** ` +
          `aiMs=${aiMs}ms st=${pushRep.status} ok=${pushRep.ok} ` +
          `body=${pushRep.bodyText.slice(0, 500)}`
        );

        // linelog: Workers KV に記録（直近50件・fire-and-forget）
        if (apiBase) {
          fetch(`${apiBase}/ai/linelog`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tenantId,
              type: "webhook_push",
              uid: lineUserId.slice(0, 8),
              pushStatus: pushRep.status,
              pushBodySnippet: pushRep.bodyText.slice(0, 200),
              aiMs,
            }),
          }).catch(() => null);
        }

        // 429 / 5xx → retry キューに積む（TTL 10分）
        if (!pushRep.ok) {
          const s = pushRep.status;
          if (s === 429 || (s >= 500 && s < 600)) {
            enqueuePushRetry(apiBase, tenantId, lineUserId, messages);
          }
        }
      }
    } catch (bgErr: any) {
      console.error(`[LINE_PUSH_BG] error:`, String(bgErr?.message ?? bgErr));
    }
  };

  waitUntilFn(runAiAndPush());

  // LINE は 200 を期待する — AI+push は waitUntil で継続
  return NextResponse.json(
    {
      ok: true,
      stamp: STAMP,
      where,
      tenantId,
      source: cfg.source,
      verified,
      intent:    "ai",
      hasUserId: !!lineUserId,
      queued:    true,
      eventCount: events.length,
    },
    { headers: { "x-stamp": STAMP } }
  );
}
