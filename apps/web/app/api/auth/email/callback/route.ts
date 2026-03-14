export const runtime = "edge";

import { NextResponse } from "next/server";

// ── HMAC helpers (identical to LINE callback) ────────────────────────────────

function b64urlFromBytes(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const url = new URL(req.url);
  // debug mode は development のみ許可（本番で verify 結果を露出しない）
  const isDebug = process.env.NODE_ENV === "development" && url.searchParams.get("debug") === "1";

  const token = url.searchParams.get("token");
  const returnToRaw = url.searchParams.get("returnTo") ?? "/admin";

  // ── open-redirect guard ───────────────────────────────────────────────────
  const returnTo =
    returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")
      ? returnToRaw
      : "/admin";

  // Resolve tenantId: direct param first, then extract from returnTo as fallback
  let tenantId = url.searchParams.get("tenantId") ?? "";
  if (!tenantId && returnTo.includes("tenantId=")) {
    try {
      const rtUrl = new URL(returnTo, url.origin);
      tenantId = rtUrl.searchParams.get("tenantId") ?? "";
    } catch { /* malformed returnTo */ }
  }
  if (!tenantId) tenantId = "default";

  // ── missing token ─────────────────────────────────────────────────────────
  if (!token) {
    if (isDebug) {
      return new Response(
        JSON.stringify({ ok: false, step: "parse_params", error: "missing_token" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return NextResponse.redirect(new URL("/login?reason=missing_token", url.origin));
  }

  // ── verify token with Workers ─────────────────────────────────────────────
  const apiBase = resolveApiBase();

  const verifyRes = await fetch(`${apiBase}/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify({ token, tenantId }),
  }).catch(() => null);

  if (!verifyRes || !verifyRes.ok) {
    const detail = verifyRes ? await verifyRes.text().catch(() => "") : "network_error";
    if (isDebug) {
      return new Response(
        JSON.stringify({ ok: false, step: "verify", error: "verify_http_failed", detail }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return NextResponse.redirect(new URL("/login?reason=verify_failed", url.origin));
  }

  const data = await verifyRes.json() as any;

  if (!data.ok) {
    const reason = encodeURIComponent(data.error ?? "verify_error");
    if (isDebug) {
      return new Response(
        JSON.stringify({ ok: false, step: "verify", error: data.error, data }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return NextResponse.redirect(new URL(`/login?reason=${reason}`, url.origin));
  }

  const {
    identityKey,
    email,
    displayName,
    allowed,
    role,
    membersFound,
    bootstrapped,
    bootstrapError,
    tenantId: verifiedTenantId,
    signedUp,
    hasPassword,
  } = data as {
    identityKey: string;
    email: string;
    displayName: string;
    allowed: boolean;
    role?: string;
    membersFound?: boolean;
    bootstrapped?: boolean;
    bootstrapError?: string;
    tenantId?: string;
    signedUp?: boolean;
    hasPassword?: boolean;
  };

  // Override tenantId with the one resolved by Workers (reverse lookup)
  if (verifiedTenantId && verifiedTenantId !== "default") {
    tenantId = verifiedTenantId;
  }

  // ── admin guard disabled ─────────────────────────────────────────────────
  // RBAC is enforced at Workers API layer (requireRole). Callback allows all
  // authenticated users through to the admin UI; write operations are still
  // gated server-side.

  // ── sign session (same format as LINE callback) ───────────────────────────
  const secret = (() => {
    try {
      const v = ((process as any).env ?? {}).LINE_SESSION_SECRET;
      if (typeof v === "string" && v.trim()) return v.trim();
    } catch {}
    return (process.env.LINE_SESSION_SECRET ?? "").trim();
  })();

  if (!secret) {
    if (isDebug) {
      return new Response(
        JSON.stringify({ ok: false, step: "sign_session", error: "LINE_SESSION_SECRET not configured" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return NextResponse.redirect(new URL("/login?reason=secret_missing", url.origin));
  }

  const sessionToken = await signSession(
    { userId: identityKey, tenantId, displayName, ts: Date.now() },
    secret
  );

  // ── debug mode: return JSON summary (no cookie set) ───────────────────────
  if (isDebug) {
    return new Response(
      JSON.stringify({
        ok: true,
        step: "done",
        message: "would redirect; debug: no session cookie set",
        identityKey,
        email,
        displayName,
        allowed,
        role: role ?? null,
        tenantId,
        membersFound: membersFound ?? false,
        bootstrapped: bootstrapped ?? false,
        returnTo,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  // ── set cookie and redirect ───────────────────────────────────────────────
  // Cookie name "line_session" intentionally kept — middleware/me/RBAC work without changes.
  // 14-day expiry (same as magic link session lifetime).
  const SESSION_MAX_AGE = 14 * 24 * 60 * 60; // 1209600 seconds

  // Fresh signup: if password not yet set, redirect to setup-password first
  // After password setup, user will be redirected to onboarding.
  let effectiveReturnTo = returnTo;
  if (signedUp && tenantId && tenantId !== "default") {
    if (!hasPassword) {
      effectiveReturnTo = `/auth/setup-password?tenantId=${encodeURIComponent(tenantId)}&returnTo=${encodeURIComponent(`/admin/line-setup?tenantId=${tenantId}`)}`;
    } else {
      effectiveReturnTo = `/admin/onboarding?tenantId=${encodeURIComponent(tenantId)}`;
    }
  }

  // Ensure tenantId is present in the redirect URL so the admin UI lands
  // on the correct tenant instead of falling back to "default".
  let finalRedirect = effectiveReturnTo;
  if (tenantId && tenantId !== "default" && !effectiveReturnTo.includes("tenantId=")) {
    const sep = effectiveReturnTo.includes("?") ? "&" : "?";
    finalRedirect = `${effectiveReturnTo}${sep}tenantId=${encodeURIComponent(tenantId)}`;
  }

  const res = NextResponse.redirect(new URL(finalRedirect, url.origin));
  res.headers.append(
    "Set-Cookie",
    `line_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
  );
  // Persist tenantId for post-login recovery (survives session expiry / bookmark /admin)
  if (tenantId && tenantId !== "default") {
    res.headers.append(
      "Set-Cookie",
      `last_tenant_id=${encodeURIComponent(tenantId)}; Path=/; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
    );
  }
  return res;
}
