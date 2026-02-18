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
  
  const url = new URL(req.url);
  if (url.searchParams.get('debug') === '1') {
  let ctxSeen = false;
  let envSeen = null as any;
  try {
  const env: any = (process as any).env ?? {};
  const ctx: any = { env };
    ctxSeen = true;
    envSeen = (ctx as any)?.env ? Object.keys((ctx as any).env) : null;
  } catch (e: any) {
    return new Response(JSON.stringify({ ok:false, where:'DEBUG_CALLBACK_CTX_FAIL', err: String(e?.message ?? e) }), {
      status: 200, headers:{'content-type':'application/json'}
    });
  }
  const v = ((process as any).env ?? {}).LINE_SESSION_SECRET;
  const pv = (process.env.LINE_SESSION_SECRET ?? null);

  return new Response(JSON.stringify({
    ok:true,
    where:'DEBUG_CALLBACK_ENV_CHECK',
    href:req.url,
    ctxSeen,
    envKeys: envSeen,
    ctxSecretPresent: typeof v === 'string' && v.trim().length > 0,
    ctxSecretLen: typeof v === 'string' ? v.trim().length : null,
    processSecretPresent: typeof pv === 'string' && pv.trim().length > 0,
    processSecretLen: typeof pv === 'string' ? pv.trim().length : null
  }), { status: 200, headers:{'content-type':'application/json'} });
}
try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    // TODO: ここは既存のロジック（token交換/保存）に合わせて後で調整
    // いったん “Edgeでビルドが通る” ことを最優先で止血する。

    if (!code || !state) {
      return NextResponse.redirect(new URL("/admin/line-setup?reason=missing_code", url.origin));
    }

    const secret = (() => {
  try {
  const env: any = (process as any).env ?? {};
  const ctx: any = { env };
    const v = (ctx as any)?.env?.LINE_SESSION_SECRET;
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {}
  return (process.env.LINE_SESSION_SECRET ?? "").trim();
})();
    if (!secret) {
      return NextResponse.redirect(new URL("/admin/line-setup?reason=secret", url.origin));
    }

    const token = await signSession({ code, state, ts: Date.now() }, secret);  // ✅ decide post-login redirect target
    const returnToQ = url.searchParams.get("returnTo");

  // fallback to cookie saved at /api/auth/line/start
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)line_return_to=([^;]+)/);
  const returnToC = m ? decodeURIComponent(m[1]) : null;

  const returnTo = returnToQ ?? returnToC;

    let target = (returnTo && returnTo.startsWith("/")) ? returnTo : "/admin/line-setup";
  if (target === "/admin") target = "/admin/line-setup";



    const res = NextResponse.redirect(new URL(target, url.origin));
    res.headers.append("Set-Cookie", `line_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`);
    
    // clear one-time returnTo cookie
    res.headers.append("Set-Cookie", `line_return_to=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`);
    return res;
  } catch (e: any) {
    return NextResponse.redirect(new URL("/admin/line-setup?reason=unknown", new URL(req.url).origin));
  }
}


















