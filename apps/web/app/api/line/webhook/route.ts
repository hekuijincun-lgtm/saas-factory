import { NextResponse } from "next/server";

export const runtime = "edge";

// ─── version / stamps ────────────────────────────────────────────────────────
// V8: ack-first + push-final (99% reply rate)
//   受信後1秒以内に ack reply → AI処理 → push で最終回答
//   KV dedup (TTL 120s) で重複イベントをスキップ
const STAMP_V8  = "LINE_WEBHOOK_V8_20260226_ACK_PUSH";
const STAMP_V7  = "LINE_WEBHOOK_V7_20260226_FULLREPLY"; // kept for reference
const where     = "api/line/webhook";
const isDebug   = (process.env.LINE_DEBUG === "1");

const ACK_TEXT      = "確認しますね！少々お待ちください😊";
const FALLBACK_TEXT = "少し時間をおいて再度お試しください。";

// 予約/空き関連キーワード（メッセージ本文からも検出する）
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

// LINE reply API — replyToken を使用（1回限り有効、期限は数秒〜30秒）
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

// LINE push API — replyToken 不要（userId が必要、AI処理後の最終回答に使用）
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

// KV dedup via Workers /ai/dedup — 500ms タイムアウト付き (best-effort)
// isNew=true → 新規イベント（処理を続行）
// isNew=false → 重複イベント（スキップ）
async function dedupEvent(
  apiBase: string,
  key: string,
  ttlSeconds = 120
): Promise<boolean> {
  if (!apiBase || !key) return true; // フォールバック: 常に新規扱い

  const timeout = new Promise<boolean>(resolve =>
    setTimeout(() => resolve(true), 500) // 500ms で諦め → 新規扱い
  );

  const check = fetch(`${apiBase}/ai/dedup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, ttlSeconds }),
  })
    .then(r => r.json() as Promise<{ isNew: boolean }>)
    .then(d => d?.isNew !== false) // isNew=false なら重複
    .catch(() => true); // エラー → 新規扱い

  return Promise.race([check, timeout]);
}

function buildBookingFlex(bookingUrl: string, stamp: string, userId?: string) {
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

  // 1) Try Workers KV via /admin/settings
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
      // fall through to env fallback
    }
  }

  // 2) Fallback: process.env
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
    stamp: STAMP_V8,
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
    "x-stamp": STAMP_V8,
  };

  if (debugMode) {
    const normalized = debugText
      .normalize("NFKC")
      .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
      .toLowerCase();

    const simulatedBooking = BOOKING_KW.some(k => normalized.includes(k));
    const simulatedAnswer = simulatedBooking
      ? "予約フォームからご確認ください。"
      : `(AI response for: ${debugText})`;
    const bookingLink = simulatedBooking
      ? buildBookingLink(cfg.bookingUrl, tenantId, "DEBUG_USER_ID")
      : null;
    const simulatedFinalText = bookingLink
      ? simulatedAnswer + `\n\n予約はこちら👇\n${bookingLink}`
      : simulatedAnswer;

    const ackMessages: any[] = [{ type: "text", text: ACK_TEXT }];
    const finalMessages: any[] = [
      ...(isDebug
        ? [{ type: "text", text: `DBG stamp=${STAMP_V8} src=${cfg.source}` }]
        : []),
      { type: "text", text: simulatedFinalText },
    ];

    return NextResponse.json(
      {
        ...base,
        debug: true,
        handler: "ACK_PUSH",
        ackText: ACK_TEXT,
        finalText: simulatedFinalText,
        shouldAttachBooking: simulatedBooking,
        ackMessages,
        finalMessages,
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
  // POST debug=1: LINE 送信なし、AI は呼んで想定メッセージを JSON 返却
  const postDebug = searchParams.get("debug") === "1";

  const sig         = req.headers.get("x-line-signature") ?? "";
  const allowBadSig = (process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE ?? "0") === "1";
  const stamp       = STAMP_V8;

  // Read body once
  const raw = await req.arrayBuffer();

  // Resolve credentials: KV → env fallback
  const cfg = await getTenantLineConfig(tenantId, origin);

  if (!cfg.channelSecret) {
    return NextResponse.json(
      { ok: false, stamp, where, tenantId, source: cfg.source, error: "missing_channelSecret" },
      { status: 500 }
    );
  }
  if (!cfg.channelAccessToken) {
    return NextResponse.json(
      { ok: false, stamp, where, tenantId, source: cfg.source, error: "missing_channelAccessToken" },
      { status: 500 }
    );
  }

  // Signature verification（allowBadSig=1 でローカルテスト可）
  const verified = sig ? await verifyLineSignature(raw, sig, cfg.channelSecret) : false;
  if (!verified && !allowBadSig) {
    return NextResponse.json(
      {
        ok: false, stamp, where, tenantId,
        error: "bad_signature", verified, hasSig: !!sig, bodyLen: raw.byteLength,
      },
      { status: 401 }
    );
  }

  // Parse payload
  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, stamp, where, tenantId, error: "invalid_json", message: String(e?.message ?? e) },
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
      ok: true, stamp, where, tenantId, source: cfg.source,
      verified, replied: false, eventCount: events.length,
    });
  }

  const textIn     = String(ev.message.text ?? "");
  const replyToken = String(ev.replyToken);
  const lineUserId = String(ev.source?.userId ?? "").trim();

  // ── KV dedup（重複イベントをスキップ）────────────────────────────────────
  // Cloudflare が同一 webhook を複数回 deliver する場合がある
  const apiBase = (
    process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? ""
  ).replace(/\/+$/, "");

  if (!postDebug) {
    // eventKey = replyToken の先頭32文字（一意性十分）
    const eventKey = replyToken.slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, "");
    const dedupKey = `ai:evt:${tenantId}:${eventKey}`;
    const isNew = await dedupEvent(apiBase, dedupKey, 120);
    if (!isNew) {
      // 重複イベント — 200 で即返却（LINE は 200 を期待する）
      return NextResponse.json({
        ok: true, stamp, where, tenantId, source: cfg.source,
        verified, skipped: true, reason: "duplicate_event", eventCount: events.length,
      });
    }
  }

  // Best-effort: persist lineUserId to Workers KV
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

  // ── POST debug=1: AI は呼ぶが LINE 送信なし ───────────────────────────────
  if (postDebug) {
    const aiStart = Date.now();
    const aiIp = lineUserId ? `line:${lineUserId.slice(0, 12)}` : "line";
    const ai = await runAiChat(tenantId, textIn, aiIp);
    const aiMs = Date.now() - aiStart;

    const hasBookingAction = ai.suggestedActions.some((a: any) => a?.type === "open_booking_form");
    const shouldAttachBooking = hasBookingKw || hasBookingAction;

    let finalText = ai.ok ? ai.answer : FALLBACK_TEXT;
    if (shouldAttachBooking) {
      finalText += `\n\n予約はこちら👇\n${buildBookingLink(cfg.bookingUrl, tenantId, lineUserId)}`;
    }

    return NextResponse.json({
      ok: true, stamp, where, tenantId, debug: true,
      userId: lineUserId || null,
      aiMs,
      ackText: ACK_TEXT,
      finalText,
      shouldAttachBooking,
      aiOk: ai.ok,
      replyPlanned: true,
      pushPlanned: !!lineUserId,
      eventCount: events.length,
    });
  }

  // ── Step 1: ack reply（1秒以内）─────────────────────────────────────────
  // AI処理前に即座に受付メッセージを送る
  const ackMessages: any[] = [{ type: "text", text: ACK_TEXT }];
  const ackRep = await replyLine(cfg.channelAccessToken, replyToken, ackMessages)
    .catch(() => ({ ok: false, status: 0, bodyText: "reply_exception" }));

  // ── Step 2: AI 接客（ack 後に実行）──────────────────────────────────────
  const aiIp = lineUserId ? `line:${lineUserId.slice(0, 12)}` : "line";
  const ai = await runAiChat(tenantId, textIn, aiIp);

  const hasBookingAction = ai.suggestedActions.some((a: any) => a?.type === "open_booking_form");
  const shouldAttachBooking = hasBookingKw || hasBookingAction;

  let finalText = ai.ok ? ai.answer : FALLBACK_TEXT;
  if (shouldAttachBooking) {
    finalText += `\n\n予約はこちら👇\n${buildBookingLink(cfg.bookingUrl, tenantId, lineUserId)}`;
  }

  const finalMessages: any[] = [
    ...(isDebug
      ? [{ type: "text", text: `DBG stamp=${stamp} src=${cfg.source} aiOk=${ai.ok}` }]
      : []),
    { type: "text", text: finalText },
  ];

  // ── Step 3: push で最終回答（replyToken 不要）────────────────────────────
  // userId がない場合は push できないが、ack で受付済みのため best-effort
  let pushRep: { ok: boolean; status: number; bodyText: string } | null = null;
  if (lineUserId) {
    pushRep = await pushLine(cfg.channelAccessToken, lineUserId, finalMessages)
      .catch(() => ({ ok: false, status: 0, bodyText: "push_exception" }));
  }

  // LINE は 200 を期待する — 500 は返さない
  return NextResponse.json(
    {
      ok: true,
      stamp,
      where,
      tenantId,
      source: cfg.source,
      verified,
      ackOk: ackRep.ok,
      ackStatus: ackRep.status,
      pushOk: pushRep?.ok ?? null,
      pushStatus: pushRep?.status ?? null,
      hasUserId: !!lineUserId,
      aiOk: ai.ok,
      shouldAttachBooking,
      eventCount: events.length,
    },
    { headers: { "x-stamp": stamp } }
  );
}
