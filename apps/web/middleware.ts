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
  // Redirects to /login (email magic-link) — LINE fallback is on that page.
  if (
    process.env.REQUIRE_LINE_AUTH === "1" &&
    pathname.startsWith("/admin/") &&
    !pathname.startsWith("/admin/unauthorized") &&
    !pathname.startsWith("/admin/line-setup")
  ) {
    const cookie = req.headers.get("cookie") ?? "";
    const sessionMatch = cookie.match(/(?:^|;\s*)line_session=([^;]+)/);
    const sessionToken = sessionMatch ? sessionMatch[1] : null;

    // Helper: build /login redirect URL preserving tenantId as a direct param.
    // Falls back to last_tenant_id cookie when URL has no tenantId (e.g. bookmark /admin).
    const buildLoginRedirect = (reason: string) => {
      const fullPath = pathname + (req.nextUrl.search || "");
      let tidParam = req.nextUrl.searchParams.get("tenantId");
      if (!tidParam) {
        const ltMatch = cookie.match(/(?:^|;\s*)last_tenant_id=([^;]+)/);
        tidParam = ltMatch ? decodeURIComponent(ltMatch[1]) : null;
      }
      // If we recovered a tenantId and returnTo doesn't already have it, inject it
      let returnToPath = fullPath;
      if (tidParam && !fullPath.includes("tenantId=")) {
        const sep = fullPath.includes("?") ? "&" : "?";
        returnToPath = `${fullPath}${sep}tenantId=${encodeURIComponent(tidParam)}`;
      }
      let loginUrl = `/login?reason=${reason}&returnTo=${encodeURIComponent(returnToPath)}`;
      if (tidParam) loginUrl += `&tenantId=${encodeURIComponent(tidParam)}`;
      return new URL(loginUrl, req.nextUrl.origin);
    };

    if (sessionToken) {
      const secret = (process.env.LINE_SESSION_SECRET ?? "").trim();
      if (secret) {
        const valid = await verifySessionHasUserId(sessionToken, secret);
        if (!valid) {
          return NextResponse.redirect(buildLoginRedirect("session_expired"));
        }
      }
    } else {
      return NextResponse.redirect(buildLoginRedirect("not_logged_in"));
    }
  }

  const res = NextResponse.next();
  res.headers.set("x-mw-stamp", "MW_20260304_EMAIL_AUTH");
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/booking/:path*", "/login", "/api/:path*"],
};
