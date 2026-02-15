import { NextResponse } from "next/server";

export const runtime = "edge";
const stamp = "LINE_WEBHOOK_V2";

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
  const allowBadSig = (process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE ?? "") === "1";
  return NextResponse.json({
    ok: true,
    where: "api/line/webhook",
    method: "GET",
    stamp,
    secretLen: secret.length,
    allowBadSig,
  });
}

export async function POST(req: Request) {
  const where = "api/line/webhook";
  const sig = req.headers.get("x-line-signature") ?? "";
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";
  const allowBadSig = (process.env.LINE_WEBHOOK_ALLOW_BAD_SIGNATURE ?? "") === "1";

  if (!secret) {
    return NextResponse.json({ ok: false, stamp, where, error: "missing_LINE_CHANNEL_SECRET" }, { status: 500 });
  }

  const raw = await req.arrayBuffer();
  const verified = sig ? await verifyLineSignature(raw, sig, secret) : false;
  const bodyText = new TextDecoder().decode(raw);

  console.log("[LINE_WEBHOOK]", JSON.stringify({
    stamp,
    verified,
    hasSig: !!sig,
    bodyLen: raw.byteLength,
    allowBadSig,
  }));
  console.log("[LINE_WEBHOOK_RAW]", bodyText);

  if (!verified) {
    if (allowBadSig) {
      return NextResponse.json({
        ok: true,
        stamp,
        where,
        note: "signature_failed_but_allowed",
        verified,
        hasSig: !!sig,
        bodyLen: raw.byteLength,
      });
    }
    return NextResponse.json(
      { ok: false, stamp, where, error: "bad_signature", verified, hasSig: !!sig, bodyLen: raw.byteLength },
      { status: 401 }
    );
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, stamp, where, error: "invalid_json", message: String(e?.message ?? e) },
      { status: 400 }
    );
  }

  const events = Array.isArray(parsed?.events) ? parsed.events : [];
  const summary = events.map((ev: any) => ({
    type: ev?.type ?? null,
    replyToken: ev?.replyToken ? "present" : null,
    userId: ev?.source?.userId ?? null,
    timestamp: ev?.timestamp ?? null,
  }));

  return NextResponse.json({ ok: true, stamp, where, verified, eventCount: events.length, summary });
}
