import { NextResponse } from "next/server";

export const runtime = "edge";
const stamp = "LINE_WEBHOOK_V2";

/* =========================
   utils
========================= */

function base64FromBytes(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function verifyLineSignature(
  rawBody: ArrayBuffer,
  signature: string,
  secret: string
) {
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

/* =========================
   GET (health / debug)
========================= */

export async function GET() {
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";
  return NextResponse.json({
    ok: true,
    where: "api/line/webhook",
    method: "GET",
    stamp,
    secretLen: secret.length, // 0じゃなければenv入ってる
  });
}

/* =========================
   POST (LINE Webhook)
========================= */

export async function POST(req: Request) {
  const sig = req.headers.get("x-line-signature") ?? "";
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";

  if (!secret) {
    return NextResponse.json(
      { ok: false, stamp, error: "missing_LINE_CHANNEL_SECRET" },
      { status: 500 }
    );
  }

  // 🔑 raw body（署名検証用）
  const rawBuf = await req.arrayBuffer();

  const valid =
    sig && (await verifyLineSignature(rawBuf, sig, secret));

  if (!valid) {
    return NextResponse.json(
      {
        ok: false,
        stamp,
        error: "bad_signature",
        hasSig: !!sig,
        bodyLen: rawBuf.byteLength,
      },
      { status: 401 }
    );
  }

  // 👀 ログ用（ここは text に変換してOK）
  const rawText = new TextDecoder().decode(rawBuf);
  console.log("[LINE_WEBHOOK_RAW]", rawText);

  // TODO: ここで events を parse して処理していく
  // const payload = JSON.parse(rawText);

  return NextResponse.json({
    ok: true,
    stamp,
    where: "api/line/webhook",
    method: "POST",
  });
}
