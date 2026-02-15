import { NextResponse } from "next/server";

export const runtime = "edge";
const stamp = "LINE_WEBHOOK_V3";
const where = "api/line/webhook";

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

async function lineReply(accessToken: string, replyToken: string, text: string) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });

  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

export async function GET() {
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  const allowBadSig = (process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE ?? "0") === "1";

  return NextResponse.json(
    {
      ok: true,
      where,
      method: "GET",
      stamp,
      secretLen: secret.length,
      accessTokenLen: accessToken.length,
      allowBadSig,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const sig = req.headers.get("x-line-signature") ?? "";
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  const allowBadSig = (process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE ?? "0") === "1";

  const rawBuf = await req.arrayBuffer();
  const rawText = new TextDecoder().decode(rawBuf);

  if (!secret) {
    return NextResponse.json({ ok: false, stamp, where, error: "missing_LINE_CHANNEL_SECRET" }, { status: 500 });
  }

  const verified = !!sig && (await verifyLineSignature(rawBuf, sig, secret));
  if (!verified && !allowBadSig) {
    return NextResponse.json(
      { ok: false, stamp, where, error: "bad_signature", verified, hasSig: !!sig, bodyLen: rawBuf.byteLength },
      { status: 401 }
    );
  }

  let payload: any;
  try {
    payload = JSON.parse(rawText);
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        stamp,
        where,
        error: "invalid_json",
        verified,
        message: String(e?.message ?? e),
        rawHead: rawText.slice(0, 200),
      },
      { status: 400 }
    );
  }

  const events = Array.isArray(payload?.events) ? payload.events : [];
  const summary = events.slice(0, 3).map((ev: any) => ({
    type: ev?.type ?? null,
    messageType: ev?.message?.type ?? null,
    text: ev?.message?.text ?? null,
    replyToken: ev?.replyToken ? "present" : "none",
  }));

  let replyResult: any = null;
  let replied = false;

  // text のときだけ ECHO 返信
  if (accessToken && events.length > 0) {
    const ev = events.find((x: any) => x?.replyToken && x?.message?.type === "text");
    if (ev?.replyToken) {
      const text = String(ev.message.text ?? "");
      replyResult = await lineReply(accessToken, ev.replyToken, `ECHO: ${text}`);
      replied = true;
    }
  }

  return NextResponse.json(
    {
      ok: true,
      stamp,
      where,
      verified,
      allowBadSig,
      secretLen: secret.length,
      accessTokenLen: accessToken.length,
      eventCount: events.length,
      summary,
      replied,
      replyResult,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
