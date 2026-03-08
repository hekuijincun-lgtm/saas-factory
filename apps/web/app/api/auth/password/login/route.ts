export const runtime = "edge";

import { NextResponse } from "next/server";

// ── HMAC helpers (identical to email callback) ──────────────────────────────

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

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const tenantId = String(body.tenantId ?? "default");

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  // Proxy to Workers
  const apiBase = resolveApiBase();
  let data: any;
  try {
    const upstream = await fetch(`${apiBase}/auth/password/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ email, password, tenantId }),
    });
    data = await upstream.json();
  } catch {
    return NextResponse.json({ ok: false, error: "upstream_error" }, { status: 502 });
  }

  if (!data.ok) {
    return NextResponse.json(data, { status: 401 });
  }

  // Sign session (same format as email/LINE callback)
  const secret = (() => {
    try {
      const v = ((process as any).env ?? {}).LINE_SESSION_SECRET;
      if (typeof v === "string" && v.trim()) return v.trim();
    } catch {}
    return (process.env.LINE_SESSION_SECRET ?? "").trim();
  })();

  if (!secret) {
    return NextResponse.json({ ok: false, error: "secret_not_configured" }, { status: 500 });
  }

  const resolvedTenantId = data.tenantId ?? tenantId;
  const sessionToken = await signSession(
    { userId: data.identityKey, tenantId: resolvedTenantId, displayName: data.displayName, ts: Date.now() },
    secret
  );

  // Determine redirect target
  let redirectTo = `/admin?tenantId=${encodeURIComponent(resolvedTenantId)}`;
  if (data.onboardingCompleted === false) {
    redirectTo = `/admin/onboarding?tenantId=${encodeURIComponent(resolvedTenantId)}`;
  }

  const SESSION_MAX_AGE = 14 * 24 * 60 * 60; // 1209600 seconds

  const res = NextResponse.json({ ok: true, redirectTo });
  res.headers.append(
    "Set-Cookie",
    `line_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
  );
  if (resolvedTenantId && resolvedTenantId !== "default") {
    res.headers.append(
      "Set-Cookie",
      `last_tenant_id=${encodeURIComponent(resolvedTenantId)}; Path=/; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
    );
  }
  return res;
}
