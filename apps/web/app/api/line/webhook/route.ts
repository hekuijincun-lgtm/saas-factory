import { NextResponse } from "next/server";

export const runtime = "edge";
const where = "api/line/webhook";
const stamp = "LINE_WEBHOOK_V3";

// --- utils ---
function base64FromBytes(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function verifyLineSignature(rawBody: ArrayBuffer, signature: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const mac = await crypto.subtle.sign("HMAC", key, rawBody);
  const expected = base64FromBytes(new Uint8Array(mac));
  return expected === signature;
}

async function replyLine(accessToken: string, replyToken: string, messages: any[]) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: Bearer \,
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  const bodyText = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, bodyText };
}

function buildBookingFlex(bookingUrl: string) {
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
          {
            type: "button",
            style: "primary",
            action: { type: "uri", label: "予約を開始", uri: bookingUrl },
          },
        ],
      },
    },
  };
}

// --- GET debug（本番は最小情報） ---
export async function GET() {
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  const allowBadSig = (process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE ?? "0") === "1";

  return NextResponse.json({
    ok: true,
    where,
    method: "GET",
    stamp,
    secretLen: secret.length,
    accessTokenLen: accessToken.length,
    allowBadSig,
  });
}

// --- POST webhook ---
export async function POST(req: Request) {
  const sig = req.headers.get("x-line-signature") ?? "";
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  const allowBadSig = (process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE ?? "0") === "1";

  const raw = await req.arrayBuffer();

  if (!secret) {
    return NextResponse.json({ ok: false, stamp, where, error: "missing_LINE_CHANNEL_SECRET" }, { status: 500 });
  }
  if (!accessToken) {
    return NextResponse.json({ ok: false, stamp, where, error: "missing_LINE_CHANNEL_ACCESS_TOKEN" }, { status: 500 });
  }

  const verified = sig ? await verifyLineSignature(raw, sig, secret) : false;
  if (!verified && !allowBadSig) {
    return NextResponse.json(
      { ok: false, stamp, where, error: "bad_signature", verified, hasSig: !!sig, bodyLen: raw.byteLength },
      { status: 401 }
    );
  }

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, stamp, where, error: "invalid_json", message: String(e?.message ?? e), verified },
      { status: 400 }
    );
  }

  const events = Array.isArray(payload?.events) ? payload.events : [];
  const ev = events.find((x: any) => x?.type === "message" && x?.message?.type === "text" && x?.replyToken);

  if (!ev) {
    return NextResponse.json({ ok: true, stamp, where, verified, replied: false, eventCount: events.length });
  }

  const textIn = String(ev.message.text ?? "");
  const replyToken = String(ev.replyToken);

  const bookingUrl = "https://YOUR-REAL-BOOKING-URL-HERE";

  const normalized = textIn
    .normalize("NFKC")
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase();

  let messages: any[];

  if (normalized.includes("予約") || normalized.includes("よやく")) {
    messages = [buildBookingFlex(bookingUrl)];
  } else {
    messages = [{ type: "text", text: ECHO: \ }];
  }

  const rep = await replyLine(accessToken, replyToken, messages);

  return NextResponse.json({
    ok: true,
    stamp,
    where,
    verified,
    replied: true,
    replyStatus: rep.status,
    replyOk: rep.ok,
    replyBody: rep.ok ? null : rep.bodyText?.slice(0, 300) ?? null,
    eventCount: events.length,
    mode: messages[0]?.type ?? "unknown",
  });
}
