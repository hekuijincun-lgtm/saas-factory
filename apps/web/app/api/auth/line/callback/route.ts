export const runtime = "edge";

import { NextResponse } from "next/server";

// ─── crypto helpers ──────────────────────────────────────────────────────────

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

// ─── diagnostic helpers ───────────────────────────────────────────────────────
//
// applyDiag attaches non-sensitive diagnostic signals to every response.
// No tokens, UIDs, codes, or state values are included.
//
// Signals added:
//   1. Response header  x-line-cb-step: <stepLabel>
//      → readable via curl -D - (used by diag-line-callback.ps1)
//   2. Cookie  line_cb=<cbValue>
//      → value visible in HTTP Set-Cookie; encrypted in browser SQLite
//      → ex: "ok:done" / "ng:exchange_failed" / "ng:secret_missing"
//   3. Cookie  line_cb_<cbValue_underscored>=1
//      → cookie NAME encodes the step — plain-text in browser SQLite
//      → ex: name="line_cb_ok_done" / "line_cb_ng_exchange_failed"
//      → verify-line-session.ps1 reads this without needing DPAPI decryption

const LINE_CB_MAX_AGE = 3600; // 1 hour — long enough to verify, short enough to auto-expire

function applyDiag<T extends Response>(res: T, cbValue: string, stepLabel: string): T {
  // Header: always observable regardless of browser state
  res.headers.set("x-line-cb-step", stepLabel);
  // Cookie 1: value holds the step code (encrypted in DB, but visible in HTTP header)
  res.headers.append(
    "Set-Cookie",
    `line_cb=${cbValue}; Path=/; Secure; SameSite=Lax; Max-Age=${LINE_CB_MAX_AGE}`
  );
  // Cookie 2: name encodes the step (name column is plain-text in SQLite — key diagnostic)
  const nameEncoded = `line_cb_${cbValue.replace(/:/g, "_")}`;
  res.headers.append(
    "Set-Cookie",
    `${nameEncoded}=1; Path=/; Secure; SameSite=Lax; Max-Age=${LINE_CB_MAX_AGE}`
  );
  return res;
}

// ─── route handler ────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const url = new URL(req.url);
  const isDebug = url.searchParams.get("debug") === "1";

  // step tracks the current processing stage for diagnostics
  let step = "init";
  const ctx: Record<string, any> = {
    hasCode: !!url.searchParams.get("code"),
    hasState: !!url.searchParams.get("state"),
    hasReturnTo: !!url.searchParams.get("returnTo"),
  };

  // jsonError: debug-only JSON response; applyDiag adds diagnostic signals at call site
  function jsonError(message: string, extra?: object): Response {
    return new Response(
      JSON.stringify({ ok: false, step, message, ...ctx, ...extra }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  // ── STEP: parse_params ───────────────────────────────────────────────────
  try {
    step = "parse_params";
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state") || "";

    if (!code || !stateRaw) {
      if (isDebug) return applyDiag(jsonError("missing code or state"), "ng:missing_code", step);
      return applyDiag(
        NextResponse.redirect(new URL("/admin/line-setup?reason=missing_code", url.origin)),
        "ng:missing_code", step
      );
    }

    // ── STEP: parse_state ──────────────────────────────────────────────────
    step = "parse_state";
    let tenantId = "default";
    let returnTo = "/admin/settings";
    let bootstrapKey: string | null = null;
    try {
      const s = JSON.parse(atob(stateRaw));
      if (s?.tenantId) tenantId = String(s.tenantId);
      if (s?.returnTo && typeof s.returnTo === "string") returnTo = s.returnTo;
      if (s?.bootstrapKey && typeof s.bootstrapKey === "string") bootstrapKey = s.bootstrapKey;
    } catch {
      if (isDebug) return applyDiag(jsonError("state base64/JSON parse failed"), "ng:bad_state", step);
    }

    // Override returnTo from query param or cookie
    const returnToQ = url.searchParams.get("returnTo");
    const cookie = req.headers.get("cookie") ?? "";
    const m = cookie.match(/(?:^|;\s*)line_return_to=([^;]+)/);
    const returnToC = m ? decodeURIComponent(m[1]) : null;
    if (returnToQ && returnToQ.startsWith("/")) returnTo = returnToQ;
    else if (returnToC && returnToC.startsWith("/")) returnTo = returnToC;
    if (returnTo === "/admin") returnTo = "/admin/settings";

    // Detect signup flow BEFORE allowed check
    let isSignup = false;
    let parsedReturnTo: URL | null = null;
    try {
      parsedReturnTo = new URL(returnTo, url.origin);
      isSignup = parsedReturnTo.searchParams.get("signup") === "1";
    } catch { /* malformed returnTo — isSignup stays false */ }

    ctx.tenantId = tenantId;
    ctx.parsedReturnTo = returnTo;
    ctx.isSignup = isSignup;

    // ── STEP: exchange ─────────────────────────────────────────────────────
    step = "exchange";
    const apiBase = resolveApiBase();
    const redirectUri = `${url.origin}/api/auth/line/callback`;

    const exchangeRes = await fetch(`${apiBase}/auth/line/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ code, tenantId, redirectUri, ...(bootstrapKey ? { bootstrapKey } : {}) }),
    });

    if (!exchangeRes.ok) {
      const detail = await exchangeRes.text().catch(() => "");
      if (isDebug) return applyDiag(
        jsonError("exchange HTTP error", { exchangeStatus: exchangeRes.status, detail }),
        "ng:exchange_failed", step
      );
      return applyDiag(
        NextResponse.redirect(new URL("/admin/line-setup?reason=exchange_failed", url.origin)),
        "ng:exchange_failed", step
      );
    }

    const exchangeData = await exchangeRes.json() as any;

    if (!exchangeData.ok) {
      const reason = encodeURIComponent(exchangeData.error ?? "exchange_error");
      if (isDebug) return applyDiag(
        jsonError("exchange returned ok=false", { exchangeError: exchangeData.error ?? exchangeData }),
        "ng:exchange_failed", step
      );
      return applyDiag(
        NextResponse.redirect(new URL(`/admin/line-setup?reason=${reason}`, url.origin)),
        "ng:exchange_failed", step
      );
    }

    const { userId, displayName, allowed, role, membersFound, bootstrapped, bootstrapInfo } = exchangeData as {
      userId: string; displayName: string; allowed: boolean;
      role?: string; membersFound?: boolean; bootstrapped?: boolean;
      bootstrapInfo?: { present: boolean; valid: boolean; used: boolean; expired: boolean };
    };

    ctx.displayName = displayName;
    ctx.allowed = allowed;

    // ── admin guard disabled ──────────────────────────────────────────────
    // RBAC is enforced at Workers API layer (requireRole). Callback allows all
    // authenticated users through to the admin UI; write operations are still
    // gated server-side.
    step = "allowed_check";

    // ── STEP: signup_tenant ────────────────────────────────────────────────
    // Derive a per-user tenantId from LINE userId and inject into returnTo
    step = "signup_tenant";
    let signupTenantId: string | null = null;
    if (isSignup && parsedReturnTo) {
      signupTenantId = "u_" + userId.slice(1, 9).toLowerCase();
      parsedReturnTo.searchParams.set("tenantId", signupTenantId);
      returnTo = parsedReturnTo.pathname + parsedReturnTo.search;
      ctx.signupTenantId = signupTenantId;
      ctx.parsedReturnTo = returnTo;
    }

    // ── STEP: sign_session ─────────────────────────────────────────────────
    step = "sign_session";
    const secret = (() => {
      try {
        const v = ((process as any).env ?? {}).LINE_SESSION_SECRET;
        if (typeof v === "string" && v.trim()) return v.trim();
      } catch {}
      return (process.env.LINE_SESSION_SECRET ?? "").trim();
    })();

    if (!secret) {
      if (isDebug) return applyDiag(
        jsonError("LINE_SESSION_SECRET not configured"),
        "ng:secret_missing", step
      );
      return applyDiag(
        NextResponse.redirect(new URL("/admin/line-setup?reason=secret", url.origin)),
        "ng:secret_missing", step
      );
    }

    const sessionTenantId = signupTenantId ?? tenantId;
    const token = await signSession({ userId, tenantId: sessionTenantId, displayName, ts: Date.now() }, secret);

    // ── STEP: set_cookie / redirect ────────────────────────────────────────
    step = "set_cookie";

    // Debug mode: return JSON summary (no session cookies set, but diagnostic signals applied)
    if (isDebug) {
      return applyDiag(
        new Response(
          JSON.stringify({
            ok: true,
            step: "done",
            message: "would redirect to returnTo (debug: no session cookies set)",
            hasCode: true,
            hasState: true,
            hasReturnTo: !!url.searchParams.get("returnTo"),
            parsedReturnTo: returnTo,
            tenantId,
            lineUserId: userId,
            sessionTenantId,
            isSignup,
            signupTenantId,
            membersFound: membersFound ?? false,
            allowed,
            role: role ?? null,
            displayName,
            bootstrapped: bootstrapped ?? false,
            bootstrap: { present: !!bootstrapKey, ...(bootstrapInfo ?? {}) },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ),
        "ok:debug", step
      );
    }

    // Ensure tenantId is present in the redirect URL so the admin UI lands
    // on the correct tenant instead of falling back to "default".
    const effectiveTenantId = signupTenantId ?? tenantId;
    let finalRedirect = returnTo;
    if (effectiveTenantId && effectiveTenantId !== "default" && !returnTo.includes("tenantId=")) {
      const sep = returnTo.includes("?") ? "&" : "?";
      finalRedirect = `${returnTo}${sep}tenantId=${encodeURIComponent(effectiveTenantId)}`;
    }

    // Success: set session cookies and redirect
    const res = NextResponse.redirect(new URL(finalRedirect, url.origin));
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
    if (signupTenantId) {
      res.headers.append(
        "Set-Cookie",
        `line_tenant=${signupTenantId}; Path=/; Secure; SameSite=Lax; Max-Age=604800`
      );
    }
    return applyDiag(res, "ok:done", step);

  } catch (e: any) {
    const origin = new URL(req.url).origin;
    if (isDebug) {
      return applyDiag(
        new Response(
          JSON.stringify({
            ok: false,
            step,
            message: String(e?.message ?? e),
            hasCode: !!url.searchParams.get("code"),
            hasState: !!url.searchParams.get("state"),
            hasReturnTo: !!url.searchParams.get("returnTo"),
            parsedReturnTo: ctx.parsedReturnTo ?? null,
            isSignup: ctx.isSignup ?? null,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ),
        "ng:exception", step
      );
    }
    return applyDiag(
      NextResponse.redirect(new URL("/admin/line-setup?reason=unknown", origin)),
      "ng:exception", step
    );
  }
}
