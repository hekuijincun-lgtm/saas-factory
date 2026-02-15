import { NextResponse } from "next/server";

export const runtime = "edge";

// ✅ ルート存在確認用（curl GETで200にする）
export async function GET() {
  return NextResponse.json({ ok: true, where: "api/line/webhook", method: "GET" });
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
  return x === 0;
}

async function verifyLineSignature(rawBody: string, signatureBase64: string | null, secret: string) {
  if (!signatureBase64) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const sigBytes = new Uint8Array(sig);

  const given = Uint8Array.from(atob(signatureBase64), (c) => c.charCodeAt(0));
  return timingSafeEqual(sigBytes, given);
}

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-line-signature");

  // Pages env vars: Messaging API の Channel Secret を入れる（重要）
  const secret = (process.env.LINE_CHANNEL_SECRET || "") as string;

  if (!secret) return new NextResponse("missing LINE_CHANNEL_SECRET", { status: 500 });
  if (!(await verifyLineSignature(raw, sig, secret))) {
    return new NextResponse("bad signature", { status: 401 });
  }

  // ✅ とりあえず受信成功（ここから先でWorkersへ転送/返信などを追加）
  return NextResponse.json({ ok: true, where: "api/line/webhook", method: "POST" });
}
