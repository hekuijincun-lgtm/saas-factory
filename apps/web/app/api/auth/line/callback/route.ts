export const runtime = "edge";

import { NextResponse } from "next/server";

function b64urlFromBytes(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  // btoa expects Latin1
  const b64 = btoa(s);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256B64url(message: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64urlFromBytes(new Uint8Array(sig));
}

async function signSession(payload: object, secret: string) {
  const body = JSON.stringify(payload);
  const bodyB64u = b64urlFromBytes(new TextEncoder().encode(body));
  const sigB64u = await hmacSha256B64url(bodyB64u, secret);
  return `${bodyB64u}.${sigB64u}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    // TODO: ここは既存のロジック（token交換/保存）に合わせて後で調整
    // いったん “Edgeでビルドが通る” ことを最優先で止血する。

    if (!code || !state) {
      return NextResponse.redirect(new URL("/admin/settings?line=error_missing", url.origin));
    }

    const secret = (process.env.LINE_SESSION_SECRET ?? "").trim();
    if (!secret) {
      return NextResponse.redirect(new URL("/admin/settings?line=error_secret", url.origin));
    }

    const token = await signSession({ code, state, ts: Date.now() }, secret);

    const res = NextResponse.redirect(new URL("/admin/settings?line=ok", url.origin));
    res.headers.set("Set-Cookie", `line_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`);
    return res;
  } catch (e: any) {
    return NextResponse.redirect(new URL("/admin/settings?line=error", new URL(req.url).origin));
  }
}
