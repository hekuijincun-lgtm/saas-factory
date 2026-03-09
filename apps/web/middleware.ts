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
    (pathname === "/admin" || pathname.startsWith("/admin/")) &&
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

  // ── Billing gate (only when BILLING_REQUIRED=1) ──────────────────────────
  //
  // Blocks admin pages (except exempt paths) when tenant has no active subscription.
  // Uses a short-lived cookie (billing_ok=<tenantId>) scoped per tenant to avoid
  // fetching settings on every request. Tenant switch invalidates the cache.
  if (
    process.env.BILLING_REQUIRED === "1" &&
    (pathname === "/admin" || pathname.startsWith("/admin/")) &&
    !pathname.startsWith("/admin/billing") &&
    !pathname.startsWith("/admin/onboarding") &&
    !pathname.startsWith("/admin/unauthorized") &&
    !pathname.startsWith("/admin/line-setup")
  ) {
    const cookie = req.headers.get("cookie") ?? "";

    // Resolve tenantId from URL query > session cookie > last_tenant_id cookie
    let tenantId = req.nextUrl.searchParams.get("tenantId")?.trim() || null;
    if (!tenantId) {
      const sessionMatch = cookie.match(/(?:^|;\s*)line_session=([^;]+)/);
      if (sessionMatch) {
        try {
          const bodyB64u = sessionMatch[1].split(".")[0];
          const bodyJson = atob(bodyB64u.replace(/-/g, "+").replace(/_/g, "/"));
          const payload = JSON.parse(bodyJson);
          tenantId = payload.tenantId || null;
        } catch {}
      }
    }
    if (!tenantId) {
      const ltMatch = cookie.match(/(?:^|;\s*)last_tenant_id=([^;]+)/);
      tenantId = ltMatch ? decodeURIComponent(ltMatch[1]) : null;
    }

    if (tenantId) {
      // Check cache cookie — value stores the tenantId it was validated for
      const billingOkMatch = cookie.match(/(?:^|;\s*)billing_ok=([^;]+)/);
      const cachedTenant = billingOkMatch ? decodeURIComponent(billingOkMatch[1]) : null;
      const cacheHit = cachedTenant === tenantId;

      if (!cacheHit) {
        // Fetch subscription status from Workers API directly
        const apiBase = (process.env.API_BASE ?? "").replace(/\/+$/, "");
        const adminToken = process.env.ADMIN_TOKEN ?? "";

        if (apiBase) {
          try {
            const settingsUrl = `${apiBase}/admin/settings?tenantId=${encodeURIComponent(tenantId)}`;
            const headers: Record<string, string> = {};
            if (adminToken) headers["X-Admin-Token"] = adminToken;
            const resp = await fetch(settingsUrl, { headers, signal: AbortSignal.timeout(3000) });

            if (resp.ok) {
              const data = (await resp.json()) as any;
              const sub = (data?.data ?? data)?.subscription;
              const status: string = sub?.status ?? "";
              const isAllowed = status === "active" || status === "trialing" || status === "past_due";

              if (!isAllowed) {
                // Clear stale cache cookie + redirect to billing page
                const billingUrl = `/admin/billing?tenantId=${encodeURIComponent(tenantId)}`;
                const redirect = NextResponse.redirect(new URL(billingUrl, req.nextUrl.origin));
                redirect.cookies.delete("billing_ok");
                redirect.headers.set("x-mw-billing-debug", `blocked|tenant=${tenantId}|status=${status}`);
                return redirect;
              }

              // Set cache cookie (5 min) with tenantId as value
              const res = NextResponse.next();
              res.headers.set("x-mw-stamp", "MW_20260309_BILLING_GATE");
              res.headers.set("x-mw-billing-debug", `allowed|tenant=${tenantId}|status=${status}`);
              res.cookies.set("billing_ok", tenantId, {
                path: "/admin",
                maxAge: 300,
                httpOnly: true,
                secure: true,
                sameSite: "lax",
              });
              return res;
            }
            // Non-OK response (e.g. 401, 500) — fail open, don't block
            const failRes = NextResponse.next();
            failRes.headers.set("x-mw-billing-debug", `fail-open-http|tenant=${tenantId}|resp=${resp.status}`);
            return failRes;
          } catch (err) {
            // Fetch failed (timeout, network) — fail open
            const failRes = NextResponse.next();
            failRes.headers.set("x-mw-billing-debug", `fail-open-catch|tenant=${tenantId}|err=${String(err).slice(0, 80)}`);
            return failRes;
          }
        }
        // apiBase empty — fail open
        const failRes = NextResponse.next();
        failRes.headers.set("x-mw-billing-debug", `fail-open-no-apibase|tenant=${tenantId}`);
        return failRes;
      }
      // Cache hit — billing already validated for this tenant
      const cacheRes = NextResponse.next();
      cacheRes.headers.set("x-mw-stamp", "MW_20260309_BILLING_GATE");
      cacheRes.headers.set("x-mw-billing-debug", `cache-hit|tenant=${tenantId}|cached=${cachedTenant}`);
      return cacheRes;
    }
    // No tenantId resolved — fail open
    const noTenantRes = NextResponse.next();
    noTenantRes.headers.set("x-mw-billing-debug", `fail-open-no-tenant|pathname=${pathname}`);
    return noTenantRes;
  }

  const res = NextResponse.next();
  res.headers.set("x-mw-stamp", "MW_20260309_BILLING_GATE");
  res.headers.set("x-mw-billing-debug", "gate-skipped");
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/booking/:path*", "/login", "/api/:path*"],
};
