import { NextResponse } from "next/server";

export const runtime = "edge";

// ─── version / stamps ────────────────────────────────────────────────────────
const STAMP_V6  = "LINE_WEBHOOK_V6_20260226_AI_CHAT"; // V6: ECHO削除 → AI接客統合
const STAMP_V5  = "LINE_WEBHOOK_V5_20260225_235900";  // kept for reference
const where     = "api/line/webhook";
const isDebug   = (process.env.LINE_DEBUG === "1");

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

function buildBookingFlex(bookingUrl: string, stamp: string, userId?: string) {
  // stamp intentionally excluded from UI — kept in server logs and response body only
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
          {
            type: "text",
            text: "下のボタンから予約を開始してね😉",
            wrap: true,
            color: "#666666",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            action: { type: "uri", label: "予約を開始", uri: url },
          },
        ],
      },
    },
  };
}

// ─── AI chat caller ──────────────────────────────────────────────────────────
// Workers の /ai/chat を HTTP で呼び出す内部ヘルパー。
// Pages (edge) と Workers は別ランタイムなので直接呼び出しは不可。
// HTTP 呼び出しは再帰ではなく cross-service 呼び出し（/api/proxy 経由禁止）。
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
        // IP はレート制限キーに使われる。LINE 経由は userId をキーにする。
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

  // 2) Fallback: process.env — preserves V4/V5 behavior
  const channelSecret      = process.env.LINE_CHANNEL_SECRET      ?? "";
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  const bookingUrl =
    process.env.LINE_BOOKING_URL_DEFAULT ??
    `${origin}/booking`;

  return { channelSecret, channelAccessToken, bookingUrl, source: "env" };
}

// ─── GET (debug probe) ────────────────────────────────────────────────────────
// ?debug=1&text=営業時間  → returns simulated response (no LINE request)
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
    stamp: STAMP_V6,
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
    "x-stamp": STAMP_V6,
  };

  if (debugMode) {
    const normalized = debugText
      .normalize("NFKC")
      .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
      .toLowerCase();

    // Simulate AI response path
    const handler = "AI_CHAT";
    const simulatedAnswer = normalized.includes("予約") || normalized.includes("よやく")
      ? "予約フォームからご確認ください。"
      : `(AI response for: ${debugText})`;
    const simulatedBooking = normalized.includes("予約") || normalized.includes("よやく");
    const simulatedText = simulatedBooking
      ? simulatedAnswer + `\n\n予約はこちら👇\n${cfg.bookingUrl}`
      : simulatedAnswer;

    const messages: any[] = [
      ...(isDebug
        ? [{ type: "text", text: `DBG stamp=${STAMP_V6} src=${cfg.source}` }]
        : []),
      { type: "text", text: simulatedText },
    ];

    return NextResponse.json(
      { ...base, debug: true, handler, simulatedText: debugText, messages },
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

  const sig         = req.headers.get("x-line-signature") ?? "";
  const allowBadSig = (process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE ?? "0") === "1";
  const stamp       = STAMP_V6;

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

  // Signature verification
  const verified = sig ? await verifyLineSignature(raw, sig, cfg.channelSecret) : false;
  if (!verified && !allowBadSig) {
    return NextResponse.json(
      {
        ok: false,
        stamp,
        where,
        tenantId,
        error: "bad_signature",
        verified,
        hasSig: !!sig,
        bodyLen: raw.byteLength,
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
      ok: true,
      stamp,
      where,
      tenantId,
      source: cfg.source,
      verified,
      replied: false,
      eventCount: events.length,
    });
  }

  const textIn     = String(ev.message.text ?? "");
  const replyToken = String(ev.replyToken);
  const lineUserId = String(ev.source?.userId ?? "").trim();

  // Best-effort: persist lineUserId to Workers KV so /reserve can send push notifications.
  if (lineUserId) {
    const _apiBase = (process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");
    const _adminToken = process.env.ADMIN_TOKEN ?? "";
    if (_apiBase) {
      const _headers: Record<string, string> = { "Content-Type": "application/json" };
      if (_adminToken) _headers["X-Admin-Token"] = _adminToken;
      fetch(
        `${_apiBase}/admin/integrations/line/last-user?tenantId=${encodeURIComponent(tenantId)}`,
        { method: "POST", headers: _headers, body: JSON.stringify({ userId: lineUserId }) }
      ).catch(() => null);
    }
  }

  // ── AI 接客 ──────────────────────────────────────────────────────────────
  // レート制限キー: LINE経由は "line:{userId先頭12文字}" で web UI と分離
  const aiIp = lineUserId ? `line:${lineUserId.slice(0, 12)}` : "line";
  const ai = await runAiChat(tenantId, textIn, aiIp);

  let replyText = ai.ok
    ? ai.answer
    : "少し時間をおいて再度お試しください。";

  // suggestedActions に open_booking_form があれば予約URLを末尾追記
  const hasBooking = ai.suggestedActions.some(
    (a: any) => a?.type === "open_booking_form"
  );
  if (hasBooking) {
    const bookingLink =
      cfg.bookingUrl +
      (cfg.bookingUrl.includes("?") ? "&" : "?") +
      `tenantId=${encodeURIComponent(tenantId)}` +
      (lineUserId ? `&lu=${encodeURIComponent(lineUserId)}` : "");
    replyText += `\n\n予約はこちら👇\n${bookingLink}`;
  }

  const messages: any[] = [
    ...(isDebug
      ? [{ type: "text", text: `DBG stamp=${stamp} src=${cfg.source} aiOk=${ai.ok}` }]
      : []),
    { type: "text", text: replyText },
  ];

  const rep = await replyLine(cfg.channelAccessToken, replyToken, messages);

  return NextResponse.json(
    {
      ok: true,
      stamp,
      where,
      tenantId,
      source: cfg.source,
      verified,
      replied: true,
      replyStatus: rep.status,
      replyOk: rep.ok,
      replyBody: rep.ok ? null : rep.bodyText?.slice(0, 300) ?? null,
      eventCount: events.length,
      aiOk: ai.ok,
    },
    { headers: { "x-stamp": stamp } }
  );
}
