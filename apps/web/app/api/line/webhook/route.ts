import { NextResponse } from "next/server";

export const runtime = "edge";

// ─── version / stamps ────────────────────────────────────────────────────────
// V8.1: debug=1 に実送信+診断出力 / dedupKey を message.id 優先 / push 429/5xx → retry enqueue
const STAMP     = "LINE_WEBHOOK_V8_1_20260226_DIAG";
const STAMP_V8  = "LINE_WEBHOOK_V8_20260226_ACK_PUSH"; // prev, kept for reference
const where     = "api/line/webhook";
const isDebug   = (process.env.LINE_DEBUG === "1");

const ACK_TEXT      = "確認しますね！少々お待ちください😊";
const FALLBACK_TEXT = "少し時間をおいて再度お試しください。";

// 予約/空き関連キーワード
const BOOKING_KW = [
  "予約", "よやく", "booking", "reserve",
  "空き", "あき", "空き状況", "空いてる", "空いてますか",
  "最短", "明日行ける", "来週行ける", "当日",
  "予約できる", "予約したい", "いつ空いてる",
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

// SHA-256 の先頭 4 バイトを hex で返す（dedup key のサフィックスに使用）
async function shortHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf).slice(0, 4))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// dedup key 生成
// 優先: event.message.id（LINE が付与する一意 ID）
// fallback: {userId}:{timestamp末尾10桁}:{text の shortHash}
async function buildDedupKey(tenantId: string, ev: any): Promise<string> {
  const msgId = String(ev.message?.id ?? "").trim();
  if (msgId) {
    // message.id は LINE が保証する一意値 — これが最良のキー
    return `ai:evt:${tenantId}:msg:${msgId}`;
  }
  // フォールバック
  const userId = String(ev.source?.userId ?? "unknown").slice(0, 20)
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  const ts = String(ev.timestamp ?? Date.now()).slice(-10);
  const h  = await shortHash(String(ev.message?.text ?? "")).catch(() => "0000");
  return `ai:evt:${tenantId}:${userId}:${ts}:${h}`;
}

// ─── LINE API ─────────────────────────────────────────────────────────────────
// reply — replyToken を使用（1回限り、数秒〜30秒で失効）
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

// push — replyToken 不要（userId が必要、AI処理後の最終回答に使用）
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
// 戻り値: true = 新規、false = 重複
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
// 429 / 5xx 時のみ呼び出す（tokenは送らず tenantId + userId + messages のみ）
// Workers が再試行時に KV から config を再取得する設計
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
  }).catch(() => null); // best-effort、失敗しても握り潰す
}

function buildBookingFlex(bookingUrl: string, _stamp: string, userId?: string) {
  const url = userId
    ? `${bookingUrl}${bookingUrl.includes("?") ? "&" : "?"}lu=${encodeURIComponent(userId)}`
    : bookingUrl;
  return {
    type: "flex",
    altText: "予約ページを開く",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "予約ページ", weight: "bold", size: "xl" },
          { type: "text", text: "下のボタンから予約を開始してね😉", wrap: true, color: "#666666" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "button", style: "primary", action: { type: "uri", label: "予約を開始", uri: url } },
        ],
      },
    },
  };
}

// ─── AI chat caller ──────────────────────────────────────────────────────────
async function runAiChat(
  tenantId: string,
  message: string,
  ip: string
): Promise<{ ok: boolean; answer: string; suggestedActions: any[] }> {
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
    return EMPTY;
  } catch {
    return EMPTY;
  }
}

// ─── 予約URL組み立て ──────────────────────────────────────────────────────────
function buildBookingLink(bookingUrl: string, tenantId: string, lineUserId: string): string {
  const sep = bookingUrl.includes("?") ? "&" : "?";
  return (
    bookingUrl +
    sep +
    `tenantId=${encodeURIComponent(tenantId)}` +
    (lineUserId ? `&lu=${encodeURIComponent(lineUserId)}` : "")
  );
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
  const adminToken = process.env.ADMIN_TOKEN ?? "";

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
        const bookingUrl = String(line?.bookingUrl ?? "").trim() ||
          `${origin}/booking?tenantId=${encodeURIComponent(tenantId)}`;

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
    const normalized = debugText
      .normalize("NFKC")
      .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
      .toLowerCase();

    const simulatedBooking = BOOKING_KW.some(k => normalized.includes(k));
    const simulatedAnswer  = simulatedBooking
      ? "予約フォームからご確認ください。"
      : `(AI response for: ${debugText})`;
    const bookingLink = simulatedBooking
      ? buildBookingLink(cfg.bookingUrl, tenantId, "DEBUG_USER_ID")
      : null;
    const simulatedFinalText = bookingLink
      ? simulatedAnswer + `\n\n予約はこちら👇\n${bookingLink}`
      : simulatedAnswer;

    return NextResponse.json(
      {
        ...base,
        debug: true,
        handler: "ACK_PUSH",
        ackText: ACK_TEXT,
        finalText: simulatedFinalText,
        shouldAttachBooking: simulatedBooking,
        ackMessages: [{ type: "text", text: ACK_TEXT }],
        finalMessages: [{ type: "text", text: simulatedFinalText }],
      },
      { headers: cacheHeaders }
    );
  }

  return NextResponse.json(base, { headers: cacheHeaders });
}

// ─── POST (LINE webhook) ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const tenantId =
    searchParams.get("tenantId") ??
    process.env.LINE_DEFAULT_TENANT_ID ??
    "default";
  // debug=1: 実際に LINE API を呼び出し、status/bodySnippet を含む診断 JSON を返す
  const postDebug = searchParams.get("debug") === "1";

  const sig         = req.headers.get("x-line-signature") ?? "";
  const allowBadSig = (process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE ?? "0") === "1";

  const raw = await req.arrayBuffer();
  const cfg = await getTenantLineConfig(tenantId, origin);

  if (!cfg.channelSecret) {
    return NextResponse.json(
      { ok: false, stamp: STAMP, where, tenantId, source: cfg.source, error: "missing_channelSecret" },
      { status: 500 }
    );
  }
  if (!cfg.channelAccessToken) {
    return NextResponse.json(
      { ok: false, stamp: STAMP, where, tenantId, source: cfg.source, error: "missing_channelAccessToken" },
      { status: 500 }
    );
  }

  const verified = sig ? await verifyLineSignature(raw, sig, cfg.channelSecret) : false;
  if (!verified && !allowBadSig) {
    return NextResponse.json(
      {
        ok: false, stamp: STAMP, where, tenantId,
        error: "bad_signature", verified, hasSig: !!sig, bodyLen: raw.byteLength,
      },
      { status: 401 }
    );
  }

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, stamp: STAMP, where, tenantId, error: "invalid_json", message: String(e?.message ?? e) },
      { status: 400 }
    );
  }

  const events = Array.isArray(payload?.events) ? payload.events : [];
  const ev = events.find(
    (x: any) =>
      x?.type === "message" && x?.message?.type === "text" && x?.replyToken
  );

  if (!ev) {
    return NextResponse.json({
      ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
      verified, replied: false, eventCount: events.length,
    });
  }

  const textIn     = String(ev.message.text ?? "");
  const replyToken = String(ev.replyToken);
  const lineUserId = String(ev.source?.userId ?? "").trim();

  const apiBase = (
    process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? ""
  ).replace(/\/+$/, "");

  // dedup key（debug=1 でも計算するが check/set はしない）
  const dedupKey = await buildDedupKey(tenantId, ev);

  // ── KV dedup（通常モードのみ）────────────────────────────────────────────
  let dedupHit = false;
  if (!postDebug) {
    const isNew = await dedupEvent(apiBase, dedupKey, 120);
    if (!isNew) {
      dedupHit = true;
      return NextResponse.json({
        ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
        verified, skipped: true, reason: "duplicate_event",
        dedupKey, eventCount: events.length,
      });
    }
  }

  // Best-effort: persist lineUserId to Workers KV（通常モードのみ）
  if (lineUserId && !postDebug) {
    const _adminToken = process.env.ADMIN_TOKEN ?? "";
    if (apiBase) {
      const _headers: Record<string, string> = { "Content-Type": "application/json" };
      if (_adminToken) _headers["X-Admin-Token"] = _adminToken;
      fetch(
        `${apiBase}/admin/integrations/line/last-user?tenantId=${encodeURIComponent(tenantId)}`,
        { method: "POST", headers: _headers, body: JSON.stringify({ userId: lineUserId }) }
      ).catch(() => null);
    }
  }

  // ── 予約キーワード判定 ────────────────────────────────────────────────────
  const normalizedIn = textIn
    .normalize("NFKC")
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase();
  const hasBookingKw = BOOKING_KW.some(k => normalizedIn.includes(k));

  // ── Step 1: ack reply ────────────────────────────────────────────────────
  const ackMessages: any[] = [{ type: "text", text: ACK_TEXT }];
  const ackRep = await replyLine(cfg.channelAccessToken, replyToken, ackMessages)
    .catch(() => ({ ok: false, status: 0, bodyText: "reply_exception" }));

  // ── Step 2: AI 接客 ───────────────────────────────────────────────────────
  const aiStart = Date.now();
  const aiIp    = lineUserId ? `line:${lineUserId.slice(0, 12)}` : "line";
  const ai      = await runAiChat(tenantId, textIn, aiIp);
  const aiMs    = Date.now() - aiStart;

  const hasBookingAction    = ai.suggestedActions.some((a: any) => a?.type === "open_booking_form");
  const shouldAttachBooking = hasBookingKw || hasBookingAction;

  let finalText = ai.ok ? ai.answer : FALLBACK_TEXT;
  if (shouldAttachBooking) {
    finalText += `\n\n予約はこちら👇\n${buildBookingLink(cfg.bookingUrl, tenantId, lineUserId)}`;
  }

  const finalMessages: any[] = [
    ...(isDebug
      ? [{ type: "text", text: `DBG stamp=${STAMP} src=${cfg.source} aiOk=${ai.ok}` }]
      : []),
    { type: "text", text: finalText },
  ];

  // ── Step 3: push で最終回答 ───────────────────────────────────────────────
  let pushRep: { ok: boolean; status: number; bodyText: string } | null = null;
  if (lineUserId) {
    pushRep = await pushLine(cfg.channelAccessToken, lineUserId, finalMessages)
      .catch(() => ({ ok: false, status: 0, bodyText: "push_exception" }));

    // 429 / 5xx → retry キューに積む（best-effort、通常モードのみ）
    if (!postDebug && pushRep && !pushRep.ok) {
      const s = pushRep.status;
      if (s === 429 || (s >= 500 && s < 600)) {
        enqueuePushRetry(apiBase, tenantId, lineUserId, finalMessages);
      }
    }
  }

  // ── debug=1: 診断情報を JSON で返す ──────────────────────────────────────
  // token 類は含めない。status/bodySnippet(500文字) のみ
  if (postDebug) {
    return NextResponse.json({
      ok: true, stamp: STAMP, where, tenantId, debug: true,
      userId: lineUserId || null,
      dedupKey,
      dedupHit,  // debug=1 では常に false（dedup skip）
      aiMs,
      aiOk: ai.ok,
      shouldAttachBooking,
      finalText,
      // ack（reply）の診断
      replyStatus:      ackRep.status,
      replyOk:          ackRep.ok,
      replyBodySnippet: ackRep.bodyText.slice(0, 500) || null,
      // push の診断
      pushStatus:      pushRep?.status ?? null,
      pushOk:          pushRep?.ok ?? null,
      pushBodySnippet: pushRep?.bodyText?.slice(0, 500) ?? null,
      hasUserId:   !!lineUserId,
      eventCount:  events.length,
    });
  }

  // ── 通常モード: LINE は 200 を期待する ───────────────────────────────────
  return NextResponse.json(
    {
      ok: true,
      stamp: STAMP,
      where,
      tenantId,
      source: cfg.source,
      verified,
      ackOk:     ackRep.ok,
      ackStatus: ackRep.status,
      pushOk:    pushRep?.ok ?? null,
      pushStatus: pushRep?.status ?? null,
      hasUserId: !!lineUserId,
      aiOk:      ai.ok,
      shouldAttachBooking,
      eventCount: events.length,
    },
    { headers: { "x-stamp": STAMP } }
  );
}
