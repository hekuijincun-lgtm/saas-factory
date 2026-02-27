import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

// ─── version / stamps ────────────────────────────────────────────────────────
// V10: ACK削除・予約intent → テンプレカード reply・AI intent → push のみ
//   normal  → dedup
//             → booking: buttons template を replyLine で即返信（AI不使用）
//             → ai:     waitUntil(AI+push) → 即時 200 返却
//   debug=1 → 実送信ゼロ・{ intent, bookingUrl, replyPlanned, pushPlanned } 返却
//   debug=2 → push のみ同期実送信して pushStatus を返す（テスト用）
const STAMP = "LINE_WEBHOOK_V10_20260227_NOACK";
const where  = "api/line/webhook";

const FALLBACK_TEXT = "少し時間をおいて再度お試しください。";

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
    const isBooking  = detectBookingIntent(debugText);
    const bookingUrl = buildBookingLink(cfg.bookingUrl, tenantId, "DEBUG_USER_ID");
    return NextResponse.json(
      {
        ...base,
        debug: true,
        intent:       isBooking ? "booking" : "ai",
        replyPlanned: isBooking ? buildBookingTemplateMessage(bookingUrl) : null,
        pushPlanned:  !isBooking ? { type: "text", text: "(AI response)" } : null,
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

  // debug モード: "1" = 実送信なし判定のみ, "2" = push のみ同期実送信
  const debugMode = searchParams.get("debug"); // "1" | "2" | null

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

  const aiIp = lineUserId ? `line:${lineUserId.slice(0, 12)}` : "line";

  // ── intent 判定（booking が優先）────────────────────────────────────────────
  const isBookingIntent = detectBookingIntent(textIn);
  const bookingUrl      = buildBookingLink(cfg.bookingUrl, tenantId, lineUserId);

  // ── debug=1: 実送信ゼロ・判定結果のみ JSON で返す ─────────────────────────
  if (debugMode === "1") {
    return NextResponse.json({
      ok: true, stamp: STAMP, where, tenantId, debug: 1,
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
    const answer   = ai.ok ? ai.answer : FALLBACK_TEXT;
    const messages = [{ type: "text", text: answer }];

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

  // ── 予約 intent: テンプレカードを reply で返す（AI 不使用・ACK なし）───────
  if (isBookingIntent) {
    const bookingMsg = buildBookingTemplateMessage(bookingUrl);
    const repBooking = await replyLine(cfg.channelAccessToken, replyToken, [bookingMsg])
      .catch(() => ({ ok: false, status: 0, bodyText: "reply_exception" }));

    console.log(
      `[LINE_BOOKING_REPLY] tenant=${tenantId} uid=${lineUserId.slice(0, 6)}*** ` +
      `st=${repBooking.status} ok=${repBooking.ok} body=${repBooking.bodyText.slice(0, 120)}`
    );

    return NextResponse.json(
      {
        ok: true, stamp: STAMP, where, tenantId, source: cfg.source,
        verified, intent: "booking",
        replyOk: repBooking.ok, replyStatus: repBooking.status,
        hasUserId: !!lineUserId, eventCount: events.length,
      },
      { headers: { "x-stamp": STAMP } }
    );
  }

  // ── AI intent: persist userId + waitUntil(AI+push) → 即時 200 ────────────

  // Best-effort: persist lineUserId to Workers KV
  if (lineUserId) {
    const _adminToken = process.env.ADMIN_TOKEN ?? "";
    if (apiBase) {
      const _h: Record<string, string> = { "Content-Type": "application/json" };
      if (_adminToken) _h["X-Admin-Token"] = _adminToken;
      fetch(
        `${apiBase}/admin/integrations/line/last-user?tenantId=${encodeURIComponent(tenantId)}`,
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

      const answer   = ai.ok ? ai.answer : FALLBACK_TEXT;
      const messages = [{ type: "text" as const, text: answer }];

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
