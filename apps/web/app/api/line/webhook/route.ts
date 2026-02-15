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

export async function GET() {
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";
  const allowBadSig = process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE === "1";
  return NextResponse.json({ ok: true, where, method: "GET", stamp, secretLen: secret.length, allowBadSig });
}

export async function POST(req: Request) {
  const sig = req.headers.get("x-line-signature") ?? "";
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";
  const allowBadSig = process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE === "1";
  const raw = await req.arrayBuffer();

  let verified = false;
  if (secret && sig) verified = await verifyLineSignature(raw, sig, secret);

  if (!verified && !allowBadSig) {
    return NextResponse.json(
      { ok: false, stamp, where, error: "bad_signature", verified, hasSig: !!sig, bodyLen: raw.byteLength },
      { status: 401 }
    );
  }

  let events: any[] = [];
  try {
    const json = JSON.parse(new TextDecoder().decode(raw));
    events = json.events ?? [];
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, stamp, where, error: "invalid_json", message: String(e?.message ?? e) },
      { status: 400 }
    );
  }

  const summary = events.map((ev) => ({
    type: ev.type,
    replyToken: ev.replyToken ?? null,
    text: ev.message?.text ?? null,
    timestamp: ev.timestamp ?? null,
  }));

  return NextResponse.json({ ok: true, stamp, where, verified, eventCount: events.length, summary });
}
