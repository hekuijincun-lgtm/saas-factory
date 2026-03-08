export const runtime = "edge";

import { NextResponse } from "next/server";

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

async function verifyAndParseSession(
  token: string,
  secret: string
): Promise<{ userId: string; tenantId: string; displayName: string; role?: string | null } | null> {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 1) return null;
  const bodyB64u = token.slice(0, dotIdx);
  const sigB64u = token.slice(dotIdx + 1);

  const expectedSig = await hmacSha256B64url(bodyB64u, secret);
  if (expectedSig !== sigB64u) return null;

  try {
    const bodyJson = atob(bodyB64u.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(bodyJson);
    if (!payload.userId) return null;
    return {
      userId: payload.userId,
      tenantId: payload.tenantId ?? "",
      displayName: payload.displayName ?? "",
      role: payload.role ?? null,
    };
  } catch {
    return null;
  }
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

function readAdminToken(): string | undefined {
  try {
    const v = ((process as any).env ?? {}).ADMIN_TOKEN;
    if (typeof v === "string" && v.length) return v;
  } catch {}
  const v2 = (process.env as any)?.ADMIN_TOKEN;
  return typeof v2 === "string" && v2.length ? v2 : undefined;
}

/**
 * Fetch current role from Workers /admin/members KV (bypasses stale session cookie).
 * Returns the role string or null if not found / error.
 */
async function fetchFreshRole(
  userId: string,
  tenantId: string
): Promise<string | null> {
  try {
    const base = resolveApiBase();
    const token = readAdminToken();
    const headers: Record<string, string> = {
      "cache-control": "no-store",
    };
    if (token) headers["X-Admin-Token"] = token;

    const res = await fetch(
      `${base}/admin/members?tenantId=${encodeURIComponent(tenantId)}`,
      { headers, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const members: any[] = json?.data?.members ?? [];
    const me = members.find(
      (m: any) => m.lineUserId === userId && m.enabled !== false
    );
    return me?.role ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)line_session=([^;]+)/);
  if (!m) {
    return NextResponse.json({ ok: false, error: "no_session" }, { status: 401 });
  }

  const token = m[1];
  const secret = (() => {
    try {
      const v = ((process as any).env ?? {}).LINE_SESSION_SECRET;
      if (typeof v === "string" && v.trim()) return v.trim();
    } catch {}
    return (process.env.LINE_SESSION_SECRET ?? "").trim();
  })();

  if (!secret) {
    // No secret configured — return no_secret but don't error (legacy mode)
    return NextResponse.json({ ok: false, error: "no_secret" }, { status: 200 });
  }

  const parsed = await verifyAndParseSession(token, secret);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: "invalid_session" }, { status: 401 });
  }

  // Recover tenantId from last_tenant_id cookie when session has "default"
  let effectiveTenantId = parsed.tenantId;
  if (!effectiveTenantId || effectiveTenantId === "default") {
    const ltMatch = cookie.match(/(?:^|;\s*)last_tenant_id=([^;]+)/);
    if (ltMatch) effectiveTenantId = decodeURIComponent(ltMatch[1]);
  }

  // Tenant switch: caller requests a specific tenant via ?tenantId=
  // If it differs from the session cookie's tenant, verify membership and re-sign.
  const url = new URL(req.url);
  const desiredTid = url.searchParams.get("tenantId")?.trim();
  let needsReSign = false;
  let role: string | null = null;
  if (desiredTid && desiredTid !== "default" && desiredTid !== parsed.tenantId) {
    const freshRole = await fetchFreshRole(parsed.userId, desiredTid);
    if (freshRole) {
      effectiveTenantId = desiredTid;
      needsReSign = true;
      role = freshRole;
    }
  }

  // Always resolve role from Workers KV (live source of truth).
  if (role === null && effectiveTenantId) {
    role = await fetchFreshRole(parsed.userId, effectiveTenantId);
  }

  const res = NextResponse.json({
    ok: true,
    userId: parsed.userId,
    tenantId: effectiveTenantId,
    displayName: parsed.displayName,
    role,
  });

  // Re-sign session cookie so subsequent proxy requests carry the correct tenantId
  if (needsReSign) {
    const SESSION_MAX_AGE = 14 * 24 * 60 * 60;
    const sessionToken = await signSession(
      { userId: parsed.userId, tenantId: effectiveTenantId, displayName: parsed.displayName, ts: Date.now() },
      secret
    );
    res.headers.append(
      "Set-Cookie",
      `line_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
    );
    res.headers.append(
      "Set-Cookie",
      `last_tenant_id=${encodeURIComponent(effectiveTenantId)}; Path=/; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
    );
  }

  return res;
}
