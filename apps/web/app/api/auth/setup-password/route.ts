export const runtime = "edge";

import { NextResponse } from "next/server";

function resolveApiBase(): string {
  const env = (globalThis as any)?.process?.env ?? {};
  const base =
    env.NEXT_PUBLIC_API_BASE ??
    env.API_BASE ??
    env.BOOKING_API_BASE ??
    "http://127.0.0.1:8787";
  return (base as string).replace(/\/+$/, "");
}

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

async function verifySession(req: Request): Promise<{ userId: string; tenantId: string } | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)line_session=([^;]+)/);
  if (!m) return null;

  const token = decodeURIComponent(m[1]);
  let secret: string | undefined;
  try {
    const v = ((process as any).env ?? {}).LINE_SESSION_SECRET;
    if (typeof v === "string" && v.trim()) secret = v.trim();
  } catch {}
  if (!secret) {
    const v2 = (process.env.LINE_SESSION_SECRET ?? "").trim();
    secret = v2 || undefined;
  }
  if (!secret) return null;

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
    return { userId: payload.userId, tenantId: payload.tenantId ?? "" };
  } catch {
    return null;
  }
}

function readAdminToken(): string | undefined {
  try {
    const { getRequestContext } = require("@cloudflare/next-on-pages");
    const ctx = getRequestContext();
    const v = (ctx?.env as any)?.ADMIN_TOKEN;
    if (typeof v === "string" && v.length) return v;
  } catch {}
  const v2 = (process.env as any)?.ADMIN_TOKEN;
  return typeof v2 === "string" && v2.length ? v2 : undefined;
}

/**
 * POST /api/auth/setup-password
 * Body: { password: string, tenantId: string }
 * Requires valid session cookie.
 * Proxies to Workers PUT /admin/members/password.
 */
export async function POST(req: Request) {
  const session = await verifySession(req);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "invalid_session" },
      { status: 401 }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const password = body.password;
  const tenantId = body.tenantId || session.tenantId || "default";

  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "password_length", hint: "8+ characters required" },
      { status: 400 }
    );
  }

  const apiBase = resolveApiBase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-session-user-id": session.userId,
    "x-session-tenant-id": tenantId,
  };
  const adminToken = readAdminToken();
  if (adminToken) headers["X-Admin-Token"] = adminToken;

  const upstream = await fetch(
    `${apiBase}/admin/members/password?tenantId=${encodeURIComponent(tenantId)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ password }),
    }
  ).catch(() => null);

  if (!upstream) {
    return NextResponse.json(
      { ok: false, error: "upstream_error" },
      { status: 502 }
    );
  }

  const data = await upstream.json().catch(() => ({ ok: false, error: "parse_error" }));
  return NextResponse.json(data, { status: upstream.status });
}
