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

async function verifyAndParseSession(
  token: string,
  secret: string
): Promise<{ userId: string; tenantId: string; displayName: string } | null> {
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
      tenantId: payload.tenantId ?? "default",
      displayName: payload.displayName ?? "",
    };
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

  return NextResponse.json({
    ok: true,
    userId: parsed.userId,
    tenantId: parsed.tenantId,
    displayName: parsed.displayName,
  });
}
