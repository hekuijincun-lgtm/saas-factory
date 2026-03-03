export const runtime = "edge";

import { NextResponse } from "next/server";

function b64urlFromBytes(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
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

function resolveApiBase(): string {
  const env = (globalThis as any)?.process?.env ?? {};
  const base =
    env.NEXT_PUBLIC_API_BASE ??
    env.API_BASE ??
    env.BOOKING_API_BASE ??
    "http://127.0.0.1:8787";
  return (base as string).replace(/\/+$/, "");
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Debug mode (kept from original)
  if (url.searchParams.get("debug") === "1") {
    let ctxSeen = false;
    let envSeen = null as any;
    try {
      const env: any = (process as any).env ?? {};
      const ctx: any = { env };
      ctxSeen = true;
      envSeen = (ctx as any)?.env ? Object.keys((ctx as any).env) : null;
    } catch (e: any) {
      return new Response(
        JSON.stringify({ ok: false, where: "DEBUG_CALLBACK_CTX_FAIL", err: String(e?.message ?? e) }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    const v = ((process as any).env ?? {}).LINE_SESSION_SECRET;
    const pv = process.env.LINE_SESSION_SECRET ?? null;
    return new Response(
      JSON.stringify({
        ok: true,
        where: "DEBUG_CALLBACK_ENV_CHECK",
        href: req.url,
        ctxSeen,
        envKeys: envSeen,
        ctxSecretPresent: typeof v === "string" && v.trim().length > 0,
        ctxSecretLen: typeof v === "string" ? v.trim().length : null,
        processSecretPresent: typeof pv === "string" && pv.trim().length > 0,
        processSecretLen: typeof pv === "string" ? pv.trim().length : null,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state") || "";

    if (!code || !stateRaw) {
      return NextResponse.redirect(new URL("/admin/line-setup?reason=missing_code", url.origin));
    }

    // Decode state to extract tenantId and returnTo
    let tenantId = "default";
    let returnTo = "/admin/settings";
    try {
      const s = JSON.parse(atob(stateRaw));
      if (s?.tenantId) tenantId = String(s.tenantId);
      if (s?.returnTo && typeof s.returnTo === "string") returnTo = s.returnTo;
    } catch {}

    // Override returnTo from query param or cookie
    const returnToQ = url.searchParams.get("returnTo");
    const cookie = req.headers.get("cookie") ?? "";
    const m = cookie.match(/(?:^|;\s*)line_return_to=([^;]+)/);
    const returnToC = m ? decodeURIComponent(m[1]) : null;
    if (returnToQ && returnToQ.startsWith("/")) returnTo = returnToQ;
    else if (returnToC && returnToC.startsWith("/")) returnTo = returnToC;
    if (returnTo === "/admin") returnTo = "/admin/settings";

    // Exchange code with Workers to get userId
    const apiBase = resolveApiBase();
    const redirectUri = `${url.origin}/api/auth/line/callback`;

    const exchangeRes = await fetch(`${apiBase}/auth/line/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ code, tenantId, redirectUri }),
    });

    if (!exchangeRes.ok) {
      return NextResponse.redirect(new URL("/admin/line-setup?reason=exchange_failed", url.origin));
    }

    const exchangeData = await exchangeRes.json() as any;

    if (!exchangeData.ok) {
      const reason = encodeURIComponent(exchangeData.error ?? "exchange_error");
      return NextResponse.redirect(new URL(`/admin/line-setup?reason=${reason}`, url.origin));
    }

    const { userId, displayName, allowed } = exchangeData as {
      userId: string; displayName: string; allowed: boolean;
    };

    // Not in allowed list → send to unauthorized page
    if (!allowed) {
      return NextResponse.redirect(
        new URL(`/admin/unauthorized?userId=${encodeURIComponent(userId)}`, url.origin)
      );
    }

    // signup flow: derive per-user tenantId from LINE userId and inject into returnTo
    // tenantId = 'u_' + first 8 chars of userId (after leading 'U'), deterministic & unique per user
    let signupTenantId: string | null = null;
    try {
      const parsedReturnTo = new URL(returnTo, url.origin);
      if (parsedReturnTo.searchParams.get('signup') === '1') {
        signupTenantId = 'u_' + userId.slice(1, 9).toLowerCase();
        parsedReturnTo.searchParams.set('tenantId', signupTenantId);
        returnTo = parsedReturnTo.pathname + parsedReturnTo.search;
      }
    } catch { /* returnTo parse failed — leave as-is */ }

    // Sign session with userId
    const secret = (() => {
      try {
        const v = ((process as any).env ?? {}).LINE_SESSION_SECRET;
        if (typeof v === "string" && v.trim()) return v.trim();
      } catch {}
      return (process.env.LINE_SESSION_SECRET ?? "").trim();
    })();

    if (!secret) {
      return NextResponse.redirect(new URL("/admin/line-setup?reason=secret", url.origin));
    }

    const token = await signSession({ userId, tenantId, displayName, ts: Date.now() }, secret);

    const res = NextResponse.redirect(new URL(returnTo, url.origin));
    res.headers.append(
      "Set-Cookie",
      `line_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
    );
    res.headers.append(
      "Set-Cookie",
      `line_return_to=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`
    );
    res.headers.append(
      "Set-Cookie",
      `line_uid=${userId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
    );
    // line_tenant: non-HttpOnly so AdminShell can read via document.cookie
    if (signupTenantId) {
      res.headers.append(
        "Set-Cookie",
        `line_tenant=${signupTenantId}; Path=/; Secure; SameSite=Lax; Max-Age=604800`
      );
    }
    return res;
  } catch (e: any) {
    return NextResponse.redirect(
      new URL("/admin/line-setup?reason=unknown", new URL(req.url).origin)
    );
  }
}
