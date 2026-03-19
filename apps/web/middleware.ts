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

  // MWDEBUG_LINE_SETUP_V1 — development only (本番で env 変数を露出しない)
  if (process.env.NODE_ENV === "development") {
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
  }

  // ── Auth check for /admin/* (always-on) ───────────────────────────────────
  //
  // Session verification is unconditional for privileged routes.
  // If LINE_SESSION_SECRET is not configured, auth is skipped (local dev only).
  // REQUIRE_LINE_AUTH is now only used for LINE-specific login enforcement.
  // Exempt paths: /admin/unauthorized, /admin/line-setup
  if (
    (pathname === "/admin" || pathname.startsWith("/admin/")) &&
    !pathname.startsWith("/admin/unauthorized") &&
    !pathname.startsWith("/admin/line-setup")
  ) {
    // Allow unauthenticated access for default tenant (demo/testing)
    const urlTenantId = req.nextUrl.searchParams.get("tenantId");
    const isDefaultTenant = urlTenantId === "default";

    const secret = (process.env.LINE_SESSION_SECRET ?? "").trim();
    // No secret configured → skip auth (local development without session signing)
    // Default tenant → skip auth (demo access)
    if (secret && !isDefaultTenant) {
      const cookie = req.headers.get("cookie") ?? "";
      const sessionMatch = cookie.match(/(?:^|;\s*)line_session=([^;]+)/);
      const sessionToken = sessionMatch ? sessionMatch[1] : null;

      // Helper: build /login redirect URL preserving tenantId as a direct param.
      const buildLoginRedirect = (reason: string) => {
        const fullPath = pathname + (req.nextUrl.search || "");
        let tidParam = req.nextUrl.searchParams.get("tenantId");
        if (!tidParam) {
          const ltMatch = cookie.match(/(?:^|;\s*)last_tenant_id=([^;]+)/);
          tidParam = ltMatch ? decodeURIComponent(ltMatch[1]) : null;
        }
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
        const valid = await verifySessionHasUserId(sessionToken, secret);
        if (!valid) {
          return NextResponse.redirect(buildLoginRedirect("session_expired"));
        }
      } else {
        return NextResponse.redirect(buildLoginRedirect("not_logged_in"));
      }
    }
  }

  // ── Owner auth gate (/owner/*) ────────────────────────────────────────────
  // Requires valid session + owner membership (KV owner:members via Workers API).
  // Uses owner_ok cookie cache (5 min) to avoid calling Workers on every request.
  // Deprecated fallback: OWNER_USER_IDS env var (used when API_BASE is not set).
  if (pathname === "/owner" || pathname.startsWith("/owner/")) {
    const cookie = req.headers.get("cookie") ?? "";
    const sessionMatch = cookie.match(/(?:^|;\s*)line_session=([^;]+)/);
    const sessionToken = sessionMatch ? sessionMatch[1] : null;

    if (!sessionToken) {
      return NextResponse.redirect(new URL("/login?reason=not_logged_in", req.nextUrl.origin));
    }

    const secret = (process.env.LINE_SESSION_SECRET ?? "").trim();
    if (!secret) {
      return NextResponse.redirect(new URL("/login?reason=config_error", req.nextUrl.origin));
    }

    // Verify HMAC + extract userId
    const valid = await verifySessionHasUserId(sessionToken, secret);
    if (!valid) {
      return NextResponse.redirect(new URL("/login?reason=session_expired", req.nextUrl.origin));
    }

    // Extract userId from token payload
    const dotIdx = sessionToken.lastIndexOf(".");
    let userId = "";
    if (dotIdx > 0) {
      try {
        const bodyB64u = sessionToken.slice(0, dotIdx);
        const bodyJson = atob(bodyB64u.replace(/-/g, "+").replace(/_/g, "/"));
        const payload = JSON.parse(bodyJson);
        userId = payload.userId ?? "";
      } catch {}
    }

    if (!userId) {
      return NextResponse.redirect(new URL("/login?reason=not_owner", req.nextUrl.origin));
    }

    // Check owner_ok cache cookie (value = userId that was verified)
    const ownerOkMatch = cookie.match(/(?:^|;\s*)owner_ok=([^;]+)/);
    const cachedUserId = ownerOkMatch ? decodeURIComponent(ownerOkMatch[1]) : null;

    if (cachedUserId === userId) {
      // Cache hit — owner already verified
      return NextResponse.next();
    }

    // Cache miss — call Workers /auth/owner-check (includes bootstrap logic)
    const apiBase = (process.env.API_BASE ?? "").replace(/\/+$/, "");
    const adminToken = process.env.ADMIN_TOKEN ?? "";
    let isOwner = false;

    if (apiBase) {
      try {
        const headers: Record<string, string> = { "x-session-user-id": userId };
        if (adminToken) headers["X-Admin-Token"] = adminToken;
        const resp = await fetch(`${apiBase}/auth/owner-check`, {
          headers,
          signal: AbortSignal.timeout(3000),
        });
        if (resp.ok) {
          const data = (await resp.json()) as any;
          isOwner = !!data?.isOwner;
        }
      } catch {}
    }

    // Deprecated fallback: OWNER_USER_IDS env var (normalized comparison)
    if (!isOwner) {
      const normalizedUserId = userId.trim().toLowerCase();
      const ownerIds = (process.env.OWNER_USER_IDS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      isOwner = ownerIds.includes(normalizedUserId);
    }

    if (isOwner) {
      const res = NextResponse.next();
      res.cookies.set("owner_ok", userId, {
        path: "/owner",
        maxAge: 300,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      });
      return res;
    }

    // Owner-specific rejection — do NOT redirect to /admin
    const params = new URLSearchParams({
      reason: "not_owner",
      ...(userId ? { uid: userId } : {}),
    });
    return NextResponse.redirect(new URL(`/login?${params}`, req.nextUrl.origin));
  }

  // ── Billing gate (only when BILLING_REQUIRED=1) ──────────────────────────
  //
  // Blocks admin pages (except exempt paths) when tenant has no active subscription.
  // Uses a short-lived cookie (billing_ok=<tenantId>) scoped per tenant to avoid
  // fetching settings on every request. Tenant switch invalidates the cache.
  const isDev = process.env.NODE_ENV === "development";
  /** Diagnostic header helper — development only (本番で tenant/status 情報を露出しない) */
  const setDebugHeader = (res: NextResponse, key: string, value: string) => {
    if (isDev) res.headers.set(key, value);
  };
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
                setDebugHeader(redirect, "x-mw-billing-hint", `blocked|tenant=${tenantId}|status=${status}`);
                return redirect;
              }

              // Set cache cookie (5 min) with tenantId as value
              const res = NextResponse.next();
              setDebugHeader(res, "x-mw-billing-hint", `allowed|tenant=${tenantId}|status=${status}`);
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
            setDebugHeader(failRes, "x-mw-billing-hint", `fail-open-http|tenant=${tenantId}|resp=${resp.status}`);
            return failRes;
          } catch (err) {
            // Fetch failed (timeout, network) — fail open
            const failRes = NextResponse.next();
            setDebugHeader(failRes, "x-mw-billing-hint", `fail-open-catch|tenant=${tenantId}|err=${String(err).slice(0, 80)}`);
            return failRes;
          }
        }
        // apiBase empty — fail open
        const failRes = NextResponse.next();
        setDebugHeader(failRes, "x-mw-billing-hint", `fail-open-no-apibase|tenant=${tenantId}`);
        return failRes;
      }
      // Cache hit — billing already validated for this tenant
      const cacheRes = NextResponse.next();
      setDebugHeader(cacheRes, "x-mw-billing-hint", `cache-hit|tenant=${tenantId}|cached=${cachedTenant}`);
      return cacheRes;
    }
    // No tenantId resolved — fail open
    const noTenantRes = NextResponse.next();
    setDebugHeader(noTenantRes, "x-mw-billing-hint", `fail-open-no-tenant|pathname=${pathname}`);
    return noTenantRes;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/owner/:path*", "/booking/:path*", "/login", "/api/:path*"],
};
