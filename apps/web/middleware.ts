import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ── HMAC helpers (Edge-compatible, no Node.js deps) ────────────────────────

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

async function verifySessionHasUserId(token: string, secret: string): Promise<boolean> {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 1) return false;
  const bodyB64u = token.slice(0, dotIdx);
  const sigB64u = token.slice(dotIdx + 1);
  const expectedSig = await hmacSha256B64url(bodyB64u, secret);
  if (expectedSig !== sigB64u) return false;
  try {
    const bodyJson = atob(bodyB64u.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(bodyJson);
    return typeof payload.userId === "string" && payload.userId.length > 0;
  } catch {
    return false;
  }
}

// ── Middleware ──────────────────────────────────────────────────────────────

export async function middleware(req: NextRequest) {

  // BYPASS: staff detail PATCH/DELETE はroute handlerで処理
  try {
    const p = req.nextUrl.pathname;
    const m = req.method.toUpperCase();
    if ((m === "PATCH" || m === "DELETE") && p.startsWith("/admin/staff/")) {
      return NextResponse.next();
    }
  } catch {}

  const { pathname } = req.nextUrl;

  // ✅ /api/proxy はapp route handlerに処理させる
  if (pathname.startsWith("/api/proxy/")) {
    return NextResponse.next();
  }

  // MWDEBUG_LINE_SETUP_V1
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("mwdebug") === "1" && url.pathname === "/admin/line-setup") {
      return NextResponse.json({
        ok: true,
        stamp: "MWDEBUG_LINE_SETUP_V1",
        url: url.toString(),
        env: {
          API_BASE: process.env.API_BASE ?? null,
          BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null,
          UPSTREAM_BASE: process.env.UPSTREAM_BASE ?? null,
        },
      });
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, stamp: "MWDEBUG_LINE_SETUP_V1", error: String(e) },
      { status: 500 }
    );
  }

  // ── Auth check for /admin/* (only when REQUIRE_LINE_AUTH=1) ──────────────
  //
  // Gated behind env flag for gradual rollout.
  // Exempt paths: /admin/unauthorized, /admin/line-setup, /api/*
  if (
    process.env.REQUIRE_LINE_AUTH === "1" &&
    pathname.startsWith("/admin/") &&
    !pathname.startsWith("/admin/unauthorized") &&
    !pathname.startsWith("/admin/line-setup")
  ) {
    const cookie = req.headers.get("cookie") ?? "";
    const sessionMatch = cookie.match(/(?:^|;\s*)line_session=([^;]+)/);
    const sessionToken = sessionMatch ? sessionMatch[1] : null;

    if (sessionToken) {
      const secret = (process.env.LINE_SESSION_SECRET ?? "").trim();
      if (secret) {
        const valid = await verifySessionHasUserId(sessionToken, secret);
        if (!valid) {
          // Invalid or old-format session → redirect to login
          const tenantId = req.nextUrl.searchParams.get("tenantId") || "default";
          const loginUrl = new URL(`/api/auth/line/start`, req.nextUrl.origin);
          // Note: /api/auth/line/start is on Workers, so construct direct URL
          // or use the Pages API route equivalent
          const startUrl = new URL(
            `/api/proxy/auth/line/start?tenantId=${encodeURIComponent(tenantId)}&returnTo=${encodeURIComponent(pathname)}`,
            req.nextUrl.origin
          );
          // Fallback to line-setup if no proxy route exists for start
          void loginUrl; void startUrl;
          const target = new URL(
            `/admin/line-setup?reason=session_expired&returnTo=${encodeURIComponent(pathname)}`,
            req.nextUrl.origin
          );
          return NextResponse.redirect(target);
        }
      }
    } else {
      // No session at all → redirect to login page
      const target = new URL(
        `/admin/line-setup?reason=not_logged_in&returnTo=${encodeURIComponent(pathname)}`,
        req.nextUrl.origin
      );
      return NextResponse.redirect(target);
    }
  }

  const res = NextResponse.next();
  res.headers.set("x-mw-stamp", "MW_20260302_LINEID_AUTH");
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/booking/:path*", "/login", "/api/:path*"],
};
