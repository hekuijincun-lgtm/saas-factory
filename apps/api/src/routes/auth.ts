/**
 * Auth routes — LINE OAuth, email magic-link, password login, members RBAC
 *
 * Extracted from index.ts for maintainability.
 * Routes: /auth/line/start, /auth/line/callback, /auth/line/exchange,
 *         /auth/email/start, /auth/email/verify, /auth/password/login,
 *         /admin/bootstrap-key, /admin/members, /admin/members/me,
 *         /admin/members/password
 */
import type { Hono } from "hono";
import Stripe from "stripe";
import { getTenantId, checkTenantMismatch, requireRole, sha256Hex } from '../helpers';
import { mergeSettings, DEFAULT_ADMIN_SETTINGS } from '../settings';
import type { PlanId, SubscriptionInfo } from '../settings';
import { TRIAL_DURATION_DAYS } from '../plan-limits';
import { getVerticalTemplate } from '../vertical-templates';

// ── Types ────────────────────────────────────────────────────────────────────

type MemberRole = 'owner' | 'admin' | 'viewer';

interface AdminMember {
  lineUserId: string;
  role: MemberRole;
  enabled: boolean;
  displayName?: string;
  createdAt: string;
  passwordHash?: string;
  authMethods?: string[];  // e.g. ['email'], ['email','password'], ['line']
}

interface AdminMembersStore { version: 1; members: AdminMember[]; }

interface AdminBootstrapStore {
  version: 1;
  keyHash: string;
  expiresAt: string;
  createdAt: string;
  usedAt?: string;
  usedBy?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// PBKDF2 password hashing (Web Crypto API — available in Workers runtime)
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key, 256
  );
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltB64 = btoa(String.fromCharCode(...salt));
  return `pbkdf2:100000:${saltB64}:${hashB64}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts[0] !== 'pbkdf2' || parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10);
  const salt = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
  const expectedHash = parts[3];
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key, 256
  );
  const actualHash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return actualHash === expectedHash;
}

// Ensures auth_magic_links table exists (idempotent – safe to call on every request).
// Replaces a manual wrangler d1 execute when token lacks d1:write scope.
async function ensureEmailAuthTable(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS auth_magic_links (
      token_hash    TEXT    NOT NULL PRIMARY KEY,
      identity_key  TEXT    NOT NULL,
      tenant_id     TEXT    NOT NULL DEFAULT 'default',
      expires_at    INTEGER NOT NULL,
      used_at       INTEGER,
      return_to     TEXT,
      bootstrap_key TEXT
    )
  `).run();
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_magic_links_identity ON auth_magic_links(identity_key)`
  ).run();
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_magic_links_expires ON auth_magic_links(expires_at)`
  ).run();
}

function getStripe(env: any): Stripe | null {
  const key: string = env.STRIPE_SECRET_KEY ?? '';
  if (!key) return null;
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

// ── Route registration ───────────────────────────────────────────────────────

export function registerAuthRoutes(app: any) {

  // =========================================================================
  // LINE OAuth minimal routes
  // =========================================================================

  app.get("/auth/line/start", async (c: any) => {
    const tenantId = c.req.query("tenantId") || "default";
    const returnTo =
      c.req.query("returnTo") ||
      "https://saas-factory-web-v2.pages.dev/admin/settings";

    const env = c.env as any;
    // Fallback across multiple possible env var names for forward-compatibility
    const clientId = env.LINE_CHANNEL_ID ?? env.LINE_LOGIN_CHANNEL_ID ?? env.LINE_CLIENT_ID ?? "";
    const redirectUri = env.LINE_REDIRECT_URI ?? env.LINE_LOGIN_REDIRECT_URI ?? env.LINE_CALLBACK_URL ?? "";

    if (!clientId || !redirectUri) {
      return c.json(
        { ok: false, error: "missing line env", need: ["LINE_CHANNEL_ID", "LINE_REDIRECT_URI"] },
        500
      );
    }

    const bootstrapKey = c.req.query("bootstrapKey") || undefined;
    const stateObj = {
      tenantId, returnTo, ts: Date.now(),
      ...(bootstrapKey ? { bootstrapKey } : {}),
    };
    const state = btoa(JSON.stringify(stateObj));

    const scope = "profile%20openid";
    const authUrl =
      "https://access.line.me/oauth2/v2.1/authorize" +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=${scope}`;

    return c.redirect(authUrl, 302);
  });

  app.get("/auth/line/callback", async (c: any) => {
    const code = c.req.query("code");
    const state = c.req.query("state") || "";

    if (!code) return c.json({ ok: false, error: "missing_code" }, 400);

    let returnTo = "https://saas-factory-web-v2.pages.dev/admin/settings";
    try {
      const s = JSON.parse(atob(state));
      if (s?.returnTo) returnTo = s.returnTo;
    } catch {}

    const session = crypto.randomUUID();

    c.header(
      "Set-Cookie",
      `line_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
    );

    return c.redirect(returnTo, 302);
  });
  /* === /LINE_OAUTH_MIN_ROUTES_V1 === */

  // =========================================================================
  // Admin members CRUD
  // =========================================================================

  app.get('/admin/members', async (c: any) => {
    const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
    const tenantId = getTenantId(c, null);
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    const raw = await kv.get(`admin:members:${tenantId}`);
    const store: AdminMembersStore = raw
      ? JSON.parse(raw)
      : { version: 1, members: [] };
    return c.json({ ok: true, tenantId, data: store });
  });

  app.put('/admin/members', async (c: any) => {
    const mismatch = checkTenantMismatch(c);
    if (mismatch) return mismatch;
    const rbac = await requireRole(c, 'owner'); if (rbac) return rbac;
    const tenantId = getTenantId(c, null);
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    let body: any = {};
    try { body = await c.req.json(); } catch {}
    const { members } = body as {
      members?: AdminMember[];
    };
    if (!Array.isArray(members)) {
      return c.json({ ok: false, error: 'members array required' }, 400);
    }
    // Owner check is now handled by requireRole(c, 'owner') above.
    // 少なくとも 1 人の enabled owner が残ることを保証
    const enabledOwners = members.filter((m: AdminMember) => m.role === 'owner' && m.enabled);
    if (enabledOwners.length === 0) {
      return c.json({ ok: false, error: 'at_least_one_owner_required' }, 400);
    }
    const next: AdminMembersStore = { version: 1, members };
    await kv.put(`admin:members:${tenantId}`, JSON.stringify(next));
    // Write reverse lookup for each enabled member (tenant recovery on re-login)
    for (const m of members) {
      if (m.enabled) {
        await kv.put(`member:tenant:${m.lineUserId}`, tenantId!, { expirationTtl: 7776000 });
      }
    }
    return c.json({ ok: true, tenantId, data: next });
  });
  /* === /ADMIN_MEMBERS_V1 === */

  /* === ADMIN_MEMBERS_PASSWORD_V1 ===
     PUT /admin/members/password?tenantId=
     Body: { password: string }
     Sets password for the calling user (identified by x-session-user-id).
     Requires authentication (any role). Password is PBKDF2-hashed, never stored in plaintext.
  === */
  app.put('/admin/members/password', async (c: any) => {
    const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
    const tenantId = getTenantId(c, null);
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    const userId = c.req.header('x-session-user-id') ?? '';
    if (!userId) return c.json({ ok: false, error: 'missing_user_id', hint: 'Session cookie may be invalid or LINE_SESSION_SECRET not configured' }, 403);

    let body: any = {};
    try { body = await c.req.json(); } catch {}
    const password = String(body.password ?? '');
    if (password.length < 8 || password.length > 128) {
      return c.json({ ok: false, error: 'password_length', hint: '8-128 characters required' }, 400);
    }

    const raw = await kv.get(`admin:members:${tenantId}`);
    let store: AdminMembersStore;
    let member: AdminMember | undefined;

    if (!raw) {
      // No members record at all — auto-create for self-service (fresh/legacy tenant).
      // Only the authenticated session holder becomes owner.
      store = {
        version: 1,
        members: [{
          lineUserId: userId,
          role: 'owner' as MemberRole,
          enabled: true,
          displayName: userId.startsWith('email:') ? userId.slice(6) : userId,
          createdAt: new Date().toISOString(),
          authMethods: [userId.startsWith('email:') ? 'email' : 'line'],
        }],
      };
      member = store.members[0];
    } else {
      store = JSON.parse(raw);
      member = store.members.find((m: AdminMember) => m.lineUserId === userId && m.enabled);
      if (!member) {
        return c.json({ ok: false, error: 'not_a_member', hint: 'Your session userId does not match any enabled member in this tenant', userId, tenantId }, 403);
      }
    }

    member.passwordHash = await hashPassword(password);
    if (!member.authMethods) member.authMethods = [];
    if (!member.authMethods.includes('password')) member.authMethods.push('password');
    if (!member.authMethods.includes('email')) member.authMethods.push('email');

    await kv.put(`admin:members:${tenantId}`, JSON.stringify(store));
    return c.json({ ok: true, tenantId, authMethods: member.authMethods });
  });

  /* === GET /admin/members/me — returns current member info (auth methods, role) === */
  app.get('/admin/members/me', async (c: any) => {
    const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
    const tenantId = getTenantId(c, null);
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    const userId = c.req.header('x-session-user-id') ?? '';
    if (!userId) return c.json({ ok: false, error: 'missing_user_id' }, 403);

    const raw = await kv.get(`admin:members:${tenantId}`);
    if (!raw) return c.json({ ok: true, tenantId, data: null });
    const store: AdminMembersStore = JSON.parse(raw);
    const member = store.members.find((m: AdminMember) => m.lineUserId === userId && m.enabled);
    if (!member) return c.json({ ok: true, tenantId, data: null });

    return c.json({
      ok: true, tenantId,
      data: {
        lineUserId: member.lineUserId,
        role: member.role,
        displayName: member.displayName,
        authMethods: member.authMethods ?? (member.lineUserId.startsWith('email:') ? ['email'] : ['line']),
        hasPassword: !!member.passwordHash,
      },
    });
  });
  /* === /ADMIN_MEMBERS_PASSWORD_V1 === */

  // =========================================================================
  // Password login
  // =========================================================================

  /* === AUTH_PASSWORD_LOGIN_V1 ===
     POST /auth/password/login
     Body: { email, password, tenantId? }
     Authenticates with email+password against admin:members KV.
     Returns identity, tenant, role, and onboarding state for session creation.
     No session/cookie issued here — Pages route handler signs the session.
  === */
  app.post('/auth/password/login', async (c: any) => {
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;

    let body: any = {};
    try { body = await c.req.json(); } catch {}

    const rawEmail = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return c.json({ ok: false, error: 'invalid_email' }, 400);
    }
    if (!password) {
      return c.json({ ok: false, error: 'missing_password' }, 400);
    }

    const identityKey = `email:${rawEmail}`;

    // Resolve tenantId: client-provided or reverse lookup
    let tenantId = String(body.tenantId ?? 'default');
    if (tenantId === 'default') {
      const reverseTid = await kv.get(`member:tenant:${identityKey}`);
      if (reverseTid) tenantId = reverseTid;
    }

    if (tenantId === 'default') {
      return c.json({ ok: false, error: 'tenant_not_found',
        hint: 'No tenant found for this email. Please use the signup link or magic link login.' }, 401);
    }

    // Load members
    const raw = await kv.get(`admin:members:${tenantId}`);
    if (!raw) {
      return c.json({ ok: false, error: 'no_members' }, 401);
    }
    const store: AdminMembersStore = JSON.parse(raw);
    const member = store.members.find((m: AdminMember) => m.lineUserId === identityKey && m.enabled);
    if (!member) {
      return c.json({ ok: false, error: 'invalid_credentials' }, 401);
    }

    // Check password
    if (!member.passwordHash) {
      return c.json({ ok: false, error: 'password_not_set',
        hint: 'Use magic link login or set a password from admin settings.' }, 401);
    }

    const valid = await verifyPassword(password, member.passwordHash);
    if (!valid) {
      return c.json({ ok: false, error: 'invalid_credentials' }, 401);
    }

    // Check onboarding state
    let onboardingCompleted: boolean | undefined;
    try {
      const settingsRaw = await kv.get(`settings:${tenantId}`, 'json') as any;
      onboardingCompleted = settingsRaw?.onboarding?.onboardingCompleted;
    } catch {}

    // Refresh reverse lookup
    await kv.put(`member:tenant:${identityKey}`, tenantId, { expirationTtl: 7776000 });

    return c.json({
      ok: true,
      identityKey,
      email: rawEmail,
      displayName: member.displayName ?? rawEmail,
      role: member.role,
      tenantId,
      onboardingCompleted: onboardingCompleted ?? null,
    });
  });

  // =========================================================================
  // Bootstrap key
  // =========================================================================

  app.post('/admin/bootstrap-key', async (c: any) => {
    const mismatch = checkTenantMismatch(c);
    if (mismatch) return mismatch;
    const rbac = await requireRole(c, 'owner'); if (rbac) return rbac;
    const tenantId = getTenantId(c, null);
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    // Owner check is now handled by requireRole(c, 'owner') above.

    // 鍵生成
    const plainKey = crypto.randomUUID() + '-' + crypto.randomUUID().slice(0, 8);
    const keyHash = await sha256Hex(plainKey);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const store: AdminBootstrapStore = {
      version: 1,
      keyHash,
      expiresAt,
      createdAt: now.toISOString(),
    };
    await kv.put(`admin:bootstrap:${tenantId}`, JSON.stringify(store), { expirationTtl: 86400 });

    return c.json({ ok: true, tenantId, bootstrapKeyPlain: plainKey, expiresAt });
  });
  /* === /BOOTSTRAP_KEY_V1 === */

  // =========================================================================
  // Email auth (magic link)
  // =========================================================================

  /* === EMAIL_AUTH_V1 ===
     POST /auth/email/start   – generate magic link, send via Resend (or debug=1 returns URL)
     POST /auth/email/verify  – validate token, check RBAC, return identity info
                                (Pages callback signs the session cookie)
     Rate limit: max 3 sends per email per 60s (KV: email:rl:{email})
     D1 auto-init: CREATE TABLE IF NOT EXISTS runs on first call (idempotent, no separate migration needed)
  === */

  app.post('/auth/email/start', async (c: any) => {
    const env = c.env as any;
    const kv: KVNamespace = env.SAAS_FACTORY;
    const db: D1Database = env.DB;

    await ensureEmailAuthTable(db);

    let body: any = {};
    try { body = await c.req.json(); } catch {}

    const rawEmail: string = String(body.email ?? '').trim().toLowerCase();
    const bootstrapKey: string | undefined = body.bootstrapKey || undefined;
    const isDebug = body.debug === '1' || body.debug === true;
    const isDiagnose = body.diagnose === '1' || body.diagnose === true; // like debug but goes through Resend
    const isSignup = body.signup === true || body.signup === '1' || body.signup === 'true';

    // Basic email validation
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return c.json({ ok: false, error: 'invalid_email' }, 400);
    }

    // Signup: validate storeName before any KV writes (including rate-limit)
    if (isSignup) {
      const rawStoreName = String(body.storeName ?? '').trim();
      if (rawStoreName.length < 2 || rawStoreName.length > 50) {
        return c.json({ ok: false, error: 'invalid_store_name' }, 400);
      }
    }

    // Rate limit: max 3 sends per 60s per email (checked before any KV writes)
    const rlKey = `email:rl:${rawEmail}`;
    const rlRaw = await kv.get(rlKey);
    const rlCount = rlRaw ? parseInt(rlRaw, 10) : 0;
    if (rlCount >= 3) {
      return c.json({ ok: false, error: 'rate_limited', retryAfter: 60 }, 429);
    }
    await kv.put(rlKey, String(rlCount + 1), { expirationTtl: 60 });

    // Determine tenantId + returnTo: server-generated for signup, client-provided for login
    let tenantId: string;
    let safeReturnTo: string;
    if (isSignup) {
      const storeName = String(body.storeName ?? '').trim().slice(0, 50) || rawEmail.split('@')[0];
      const baseSlug = storeName.toLowerCase()
        .replace(/[^\w]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'store';
      tenantId = baseSlug + '-' + crypto.randomUUID().slice(0, 4);
      safeReturnTo = `/admin/onboarding?tenantId=${encodeURIComponent(tenantId)}`;

      // Stripe session verification (if provided from Checkout flow)
      const stripeSessionId: string = String(body.stripeSessionId ?? '').trim();
      let stripeInfo: { sessionId: string; planId: string; customerId: string; subscriptionId: string } | undefined;
      if (stripeSessionId) {
        // Prevent session reuse: one Checkout Session → one tenant
        const usedKey = `stripe:session:used:${stripeSessionId}`;
        const alreadyUsed = await kv.get(usedKey);
        if (alreadyUsed) {
          return c.json({ ok: false, error: 'stripe_session_already_used' }, 409);
        }
        const stripe = getStripe(env);
        if (stripe) {
          try {
            const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
            if (session.payment_status === 'paid') {
              stripeInfo = {
                sessionId: stripeSessionId,
                planId: (session.metadata?.planId ?? 'starter'),
                customerId: String(session.customer ?? ''),
                subscriptionId: String(session.subscription ?? ''),
              };
              // Mark session as used (30 days TTL — Stripe sessions expire in 24h anyway)
              await kv.put(usedKey, tenantId, { expirationTtl: 2592000 });
            }
          } catch { /* invalid session — continue without stripe info */ }
        }
      }

      // Fallback planId from URL ?plan= (when Stripe is not configured)
      const VALID_PLAN_IDS = new Set(['starter', 'pro', 'enterprise']);
      const fallbackPlanId: string | undefined = (!stripeInfo && typeof body.planId === 'string' && VALID_PLAN_IDS.has(body.planId))
        ? body.planId : undefined;

      // Phase 1a: persist vertical selection from signup form
      const VALID_VERTICALS = new Set(['eyebrow', 'nail', 'dental', 'hair', 'esthetic', 'cleaning', 'handyman', 'pet', 'seitai', 'gym', 'school', 'shop', 'food', 'handmade', 'generic']);
      const signupVertical: string | undefined = (typeof body.vertical === 'string' && VALID_VERTICALS.has(body.vertical))
        ? body.vertical : undefined;

      // Trial flag: body.trial = true → 14-day free Pro trial (no Stripe required)
      const isTrial = (body.trial === true || body.trial === '1' || body.trial === 'true') && !stripeInfo;

      await kv.put(`signup:init:${tenantId}`, JSON.stringify({
        storeName, ownerEmail: rawEmail,
        ...(stripeInfo ? { stripe: stripeInfo } : {}),
        ...(fallbackPlanId ? { planId: fallbackPlanId } : {}),
        ...(signupVertical ? { vertical: signupVertical } : {}),
        ...(isTrial ? { trial: true } : {}),
      }), { expirationTtl: 900 }); // 15 min
    } else {
      tenantId = String(body.tenantId ?? 'default');
      const returnTo = String(body.returnTo ?? '/admin');
      safeReturnTo = (returnTo.startsWith('/') && !returnTo.startsWith('//'))
        ? returnTo : '/admin';
    }

    // Generate token (plaintext never stored in DB)
    const plainToken = crypto.randomUUID() + '-' + crypto.randomUUID();
    const tokenHash = await sha256Hex(plainToken);
    const expiresAt = Math.floor(Date.now() / 1000) + 600; // 10 minutes
    const identityKey = `email:${rawEmail}`;

    // Store hashed token in D1 (bootstrap_key stored as SHA-256 hash, never plaintext)
    const bsKeyHash = bootstrapKey ? await sha256Hex(bootstrapKey) : null;
    await db.prepare(
      `INSERT INTO auth_magic_links
         (token_hash, identity_key, tenant_id, expires_at, return_to, bootstrap_key)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(tokenHash, identityKey, tenantId, expiresAt, safeReturnTo, bsKeyHash).run();

    // Build callback URL (Pages edge function handles session signing)
    // bootstrap_key is NOT included in URL — verify reads it from D1 to avoid URL exposure
    const webOrigin = (env.WEB_ORIGIN ?? env.PAGES_ORIGIN ?? 'https://saas-factory-web-v2.pages.dev')
      .replace(/\/+$/, '');
    const cbParams = new URLSearchParams({ token: plainToken, returnTo: safeReturnTo });
    if (tenantId !== 'default') cbParams.set('tenantId', tenantId);
    const callbackUrl = `${webOrigin}/api/auth/email/callback?${cbParams.toString()}`;

    // Debug mode: skip email, return URL directly
    if (isDebug) {
      return c.json({ ok: true, debug: true, callbackUrl, identityKey, expiresAt,
                      note: 'email not sent in debug mode' });
    }

    // Send via Resend
    const resendApiKey: string = env.RESEND_API_KEY ?? '';
    if (!resendApiKey) {
      return c.json({ ok: false, error: 'email_not_configured',
                      hint: 'set RESEND_API_KEY in Workers env' }, 500);
    }

    const emailFrom: string = env.EMAIL_FROM ?? 'SaaS Factory <no-reply@saas-factory.app>';
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [rawEmail],
        subject: '管理画面ログインリンク',
        html: `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:sans-serif">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <div style="background:#1e293b;padding:32px 32px 24px">
    <div style="font-size:11px;letter-spacing:0.1em;color:rgba(255,255,255,0.6)">ADMIN LOGIN</div>
    <h1 style="margin:8px 0 0;font-size:22px;font-weight:600;color:#fff">管理画面ログインリンク</h1>
  </div>
  <div style="padding:32px">
    <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">
      以下のボタンをクリックして管理画面にログインしてください。<br>
      このリンクは <strong>10分間</strong> 有効で、1度しか使えません。
    </p>
    <a href="${callbackUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:14px 28px;border-radius:32px;text-decoration:none;font-weight:600;font-size:15px">
      管理画面にログイン
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">
      ボタンが機能しない場合はこのURLをブラウザに貼り付けてください:<br>
      <a href="${callbackUrl}" style="color:#6366f1;word-break:break-all">${callbackUrl}</a>
    </p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #f1f5f9">
    <p style="margin:0;font-size:11px;color:#cbd5e1">
      このメールに心当たりがない場合は無視してください。リンクを開かなければ何も起きません。
    </p>
  </div>
</div>
</body></html>`,
      }),
    });

    if (!emailRes.ok) {
      const resendStatus = emailRes.status;
      const errText = await emailRes.text().catch(() => '(unreadable)');
      // Safe log: status + body only (API key never in scope here)
      console.error(`[email/start] Resend error ${resendStatus}:`, errText);
      // Map Resend status to meaningful hint (no secrets in response)
      const hint =
        resendStatus === 401 ? 'invalid_or_missing_api_key' :
        resendStatus === 403 ? 'domain_not_verified_or_restricted_recipient' :
        resendStatus === 422 ? 'domain_not_verified_or_restricted_recipient' :
        resendStatus === 429 ? 'resend_rate_limited' :
        `resend_http_${resendStatus}`;
      if (isDiagnose) {
        return c.json({ ok: false, error: 'email_send_failed', resendStatus, hint, detail: errText }, 500);
      }
      return c.json({ ok: false, error: 'email_send_failed', hint }, 500);
    }

    return c.json({ ok: true, sent: true, identityKey });
  });

  // =========================================================================
  // Email verify
  // =========================================================================

  app.post('/auth/email/verify', async (c: any) => {
    const env = c.env as any;
    const kv: KVNamespace = env.SAAS_FACTORY;
    const db: D1Database = env.DB;

    await ensureEmailAuthTable(db);

    let body: any = {};
    try { body = await c.req.json(); } catch {}

    const { token, tenantId: bodyTenantId } = body as {
      token?: string; tenantId?: string;
    };

    if (!token) {
      return c.json({ ok: false, error: 'missing_token' }, 400);
    }

    const tokenHash = await sha256Hex(token);
    const now = Math.floor(Date.now() / 1000);

    // D1 lookup
    const row = await db.prepare(
      'SELECT * FROM auth_magic_links WHERE token_hash = ?'
    ).bind(tokenHash).first() as any;

    if (!row) {
      return c.json({ ok: false, error: 'invalid_token' }, 401);
    }
    if (row.used_at) {
      return c.json({ ok: false, error: 'token_used' }, 401);
    }
    if (row.expires_at < now) {
      return c.json({ ok: false, error: 'token_expired' }, 401);
    }

    // Mark as used (single-use guarantee)
    await db.prepare(
      'UPDATE auth_magic_links SET used_at = ? WHERE token_hash = ?'
    ).bind(now, tokenHash).run();

    const identityKey: string = row.identity_key;
    let tenantId: string = bodyTenantId ?? row.tenant_id ?? 'default';
    // Reverse lookup: recover tenant from KV when all context is lost
    if (tenantId === 'default') {
      const reverseTid = await kv.get(`member:tenant:${identityKey}`);
      if (reverseTid) tenantId = reverseTid;
    }
    // bootstrap_key in D1 is SHA-256 hash (set by /start); plaintext never stored
    const bsKeyHash: string | null = row.bootstrap_key ?? null;
    const email: string = identityKey.startsWith('email:') ? identityKey.slice(6) : identityKey;
    const displayName: string = email;

    // --- Signup provisioning (signup:init written by /start when signup=1) ---
    const signupInitRaw = await kv.get(`signup:init:${tenantId}`);
    if (signupInitRaw) {
      const si: { storeName?: string; planId?: string; trial?: boolean; vertical?: string; stripe?: { sessionId?: string; planId: string; customerId: string; subscriptionId: string } } = JSON.parse(signupInitRaw);
      const storedName = si.storeName || email;
      const ownerStore: AdminMembersStore = {
        version: 1,
        members: [{
          lineUserId: identityKey,
          role: 'owner',
          enabled: true,
          displayName,
          createdAt: new Date().toISOString(),
          authMethods: ['email'],
        }],
      };
      await kv.put('tenant:exists:' + tenantId, '1');
      // Ensure the signup user is always present as owner in admin:members.
      // If the record already exists (e.g. from a previous test), append the
      // signup user instead of silently skipping.
      const existingMembers = await kv.get(`admin:members:${tenantId}`);
      if (!existingMembers) {
        await kv.put(`admin:members:${tenantId}`, JSON.stringify(ownerStore));
      } else {
        const existing: AdminMembersStore = JSON.parse(existingMembers);
        const alreadyPresent = existing.members.some(
          (m: AdminMember) => m.lineUserId === identityKey
        );
        if (!alreadyPresent) {
          existing.members.push({
            lineUserId: identityKey,
            role: 'owner',
            enabled: true,
            displayName,
            createdAt: new Date().toISOString(),
            authMethods: ['email'],
          });
          await kv.put(`admin:members:${tenantId}`, JSON.stringify(existing));
        }
      }
      // Determine subscription seed: Stripe > trial > fallback planId
      const resolvedPlanId: PlanId | undefined = si.stripe
        ? (si.stripe.planId as PlanId)
        : (si.planId as PlanId | undefined);
      const subscriptionSeed: Partial<SubscriptionInfo> | undefined = si.stripe
        ? {
            planId: si.stripe.planId as PlanId,
            stripeCustomerId: si.stripe.customerId || undefined,
            stripeSubscriptionId: si.stripe.subscriptionId || undefined,
            stripeSessionId: si.stripe.sessionId || undefined,
            status: 'active' as const,
            createdAt: Date.now(),
          }
        : si.trial
          ? {
              planId: 'pro' as PlanId,
              status: 'trialing' as const,
              trialEndsAt: Date.now() + TRIAL_DURATION_DAYS * 86400000,
              createdAt: Date.now(),
            }
          : {
                planId: resolvedPlanId ?? ('starter' as PlanId),
                status: 'active' as const,
                createdAt: Date.now(),
              };
      // Phase 1a: seed vertical from signup selection
      const seedVertical = si.vertical ?? undefined;
      const seedSettings = mergeSettings(DEFAULT_ADMIN_SETTINGS, {
        storeName: storedName,
        tenant: { name: storedName, email },
        onboarding: { onboardingCompleted: false },
        subscription: subscriptionSeed as SubscriptionInfo,
        ...(seedVertical ? { vertical: seedVertical } : {}),
      });
      await kv.put('settings:' + tenantId, JSON.stringify(seedSettings));
      // Write reverse index: stripeCustomerId → tenantId
      if (si.stripe?.customerId) {
        await kv.put(`stripe:customer:${si.stripe.customerId}`, tenantId);
      }
      // admin:settings: key for tenant listing/lookup (simple format)
      const existingAdminSettings = await kv.get('admin:settings:' + tenantId);
      if (!existingAdminSettings) {
        await kv.put('admin:settings:' + tenantId, JSON.stringify({ storeName: storedName }));
      }
      // --- Vertical template auto-population ---
      if (si.vertical && si.vertical !== 'generic') {
        const tpl = getVerticalTemplate(si.vertical);
        if (tpl) {
          // Seed menus
          const menuItems = tpl.menus.map((m, i) => ({
            id: `menu_tpl_${Date.now()}_${i}`,
            name: m.name,
            price: m.price,
            durationMin: m.duration,
            description: m.description || '',
            category: m.category || '',
            active: true,
            sortOrder: i,
          }));
          await kv.put(`admin:menu:list:${tenantId}`, JSON.stringify(menuItems));

          // Seed staff
          const staffItems = tpl.staff.map((s, i) => ({
            id: `staff_tpl_${Date.now()}_${i}`,
            name: s.name,
            role: s.role || '',
            active: true,
          }));
          await kv.put(`admin:staff:list:${tenantId}`, JSON.stringify(staffItems));

          // Seed AI FAQ
          if (tpl.faq.length > 0) {
            const faqItems = tpl.faq.map((f, i) => ({
              id: `faq_tpl_${i}`,
              question: f.question,
              answer: f.answer,
            }));
            await kv.put(`ai:faq:${tenantId}`, JSON.stringify(faqItems));
          }

          // Seed AI character
          if (tpl.aiCharacter) {
            const aiSettings = { enabled: false, voice: 'friendly', answerLength: 'normal', character: tpl.aiCharacter };
            await kv.put(`ai:settings:${tenantId}`, JSON.stringify(aiSettings));
          }
        }
      }

      await kv.delete(`signup:init:${tenantId}`);
      await kv.put(`member:tenant:${identityKey}`, tenantId, { expirationTtl: 7776000 });
      return c.json({ ok: true, identityKey, email, displayName, allowed: true,
                      role: 'owner', membersFound: false, signedUp: true, hasPassword: false, tenantId });
    }

    // --- Step 1: RBAC members check (admin:members:{tenantId}) ---
    const membersRaw = await kv.get(`admin:members:${tenantId}`);
    const membersStore: AdminMembersStore | null = membersRaw ? JSON.parse(membersRaw) : null;

    if (membersStore && membersStore.members.length > 0) {
      const member = membersStore.members.find((m: AdminMember) => m.lineUserId === identityKey);
      if (member && member.enabled) {
        // Update displayName if changed
        if (member.displayName !== displayName) {
          member.displayName = displayName;
          await kv.put(`admin:members:${tenantId}`, JSON.stringify(membersStore));
        }
        await kv.put(`member:tenant:${identityKey}`, tenantId, { expirationTtl: 7776000 });
        return c.json({ ok: true, identityKey, email, displayName, allowed: true,
                        role: member.role, membersFound: true, hasPassword: !!member.passwordHash, tenantId });
      }
      return c.json({ ok: true, identityKey, email, displayName, allowed: false,
                      membersFound: true, tenantId });
    }

    // --- Step 2: Bootstrap key check (hash comparison — plaintext never leaves D1) ---
    if (bsKeyHash) {
      const bsRaw = await kv.get(`admin:bootstrap:${tenantId}`);
      if (bsRaw) {
        const bs: AdminBootstrapStore = JSON.parse(bsRaw);
        // D1 stores SHA-256 hash; compare directly with bs.keyHash (also SHA-256)
        const used = !!bs.usedAt;
        const expired = new Date(bs.expiresAt) <= new Date();
        const valid = (bs.keyHash === bsKeyHash && !used && !expired);
        if (valid) {
          const bootstrapped: AdminMembersStore = {
            version: 1,
            members: [{
              lineUserId: identityKey,
              role: 'owner',
              enabled: true,
              displayName,
              createdAt: new Date().toISOString(),
            }],
          };
          await kv.put(`admin:members:${tenantId}`, JSON.stringify(bootstrapped));
          bs.usedAt = new Date().toISOString();
          bs.usedBy = identityKey;
          await kv.put(`admin:bootstrap:${tenantId}`, JSON.stringify(bs));
          await kv.put(`member:tenant:${identityKey}`, tenantId, { expirationTtl: 7776000 });
          return c.json({ ok: true, identityKey, email, displayName, allowed: true, role: 'owner',
                          membersFound: false, bootstrapped: true, tenantId });
        }
      }
      return c.json({ ok: true, identityKey, email, displayName, allowed: false,
                      membersFound: false, bootstrapError: 'invalid_or_used', tenantId });
    }

    // --- Step 3: Legacy fallback (allowedAdminLineUserIds) ---
    const settingsRaw = (await kv.get(`settings:${tenantId}`, 'json') as any) ?? {};
    const allowedList: string[] = Array.isArray(settingsRaw.allowedAdminLineUserIds)
      ? settingsRaw.allowedAdminLineUserIds : [];

    if (allowedList.length === 0) {
      // Self-seed: brand-new tenant, first email login becomes owner
      await kv.put(`settings:${tenantId}`, JSON.stringify({
        ...settingsRaw, allowedAdminLineUserIds: [identityKey],
      }));
      // Also create admin:members so password route / RBAC work immediately
      const existingMembers = await kv.get(`admin:members:${tenantId}`);
      if (!existingMembers) {
        const seedStore: AdminMembersStore = {
          version: 1,
          members: [{
            lineUserId: identityKey,
            role: 'owner' as MemberRole,
            enabled: true,
            displayName,
            createdAt: new Date().toISOString(),
            authMethods: [identityKey.startsWith('email:') ? 'email' : 'line'],
          }],
        };
        await kv.put(`admin:members:${tenantId}`, JSON.stringify(seedStore));
      }
      await kv.put(`member:tenant:${identityKey}`, tenantId, { expirationTtl: 7776000 });
      return c.json({ ok: true, identityKey, email, displayName, allowed: true,
                      role: 'owner', membersFound: false, seeded: true, tenantId });
    }

    const allowed = allowedList.includes(identityKey);
    if (allowed) {
      await kv.put(`member:tenant:${identityKey}`, tenantId, { expirationTtl: 7776000 });
      // Ensure admin:members record exists for allowlisted users
      const existingMembers = await kv.get(`admin:members:${tenantId}`);
      if (!existingMembers) {
        const seedStore: AdminMembersStore = {
          version: 1,
          members: [{
            lineUserId: identityKey,
            role: 'owner' as MemberRole,
            enabled: true,
            displayName,
            createdAt: new Date().toISOString(),
            authMethods: [identityKey.startsWith('email:') ? 'email' : 'line'],
          }],
        };
        await kv.put(`admin:members:${tenantId}`, JSON.stringify(seedStore));
      } else {
        // Add to existing members if not already present
        const store: AdminMembersStore = JSON.parse(existingMembers);
        const exists = store.members.some((m: AdminMember) => m.lineUserId === identityKey);
        if (!exists) {
          store.members.push({
            lineUserId: identityKey,
            role: 'admin' as MemberRole,
            enabled: true,
            displayName,
            createdAt: new Date().toISOString(),
            authMethods: [identityKey.startsWith('email:') ? 'email' : 'line'],
          });
          await kv.put(`admin:members:${tenantId}`, JSON.stringify(store));
        }
      }
    }
    return c.json({ ok: true, identityKey, email, displayName, allowed, membersFound: false, tenantId });
  });
  /* === /EMAIL_AUTH_V1 === */

  // =========================================================================
  // LINE auth exchange
  // =========================================================================

  /* === LINE_AUTH_EXCHANGE_V1 ===
     POST /auth/line/exchange
     Exchanges a LINE OAuth code for userId + displayName,
     checks allowedAdminLineUserIds in KV, and self-seeds on first login.
     Body: { code: string; tenantId?: string; redirectUri: string }
     Response: { ok, userId, displayName, allowed, seeded? }
  */
  app.post("/auth/line/exchange", async (c: any) => {
    const env = c.env as any;
    let body: any = {};
    try { body = await c.req.json(); } catch {}
    const { code, tenantId = 'default', redirectUri, bootstrapKey } = body as {
      code?: string; tenantId?: string; redirectUri?: string; bootstrapKey?: string;
    };

    if (!code || !redirectUri) {
      return c.json({ ok: false, error: 'missing_params' }, 400);
    }

    const clientId: string = env.LINE_CHANNEL_ID ?? env.LINE_LOGIN_CHANNEL_ID ?? env.LINE_CLIENT_ID ?? '';
    const clientSecret: string = env.LINE_LOGIN_CHANNEL_SECRET ?? '';

    if (!clientId || !clientSecret) {
      return c.json({ ok: false, error: 'missing_line_login_config' }, 500);
    }

    // Exchange authorization code for access token
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '');
      return c.json({ ok: false, error: 'token_exchange_failed', detail: errText }, 400);
    }

    const tokenData = await tokenRes.json() as any;
    const accessToken: string = tokenData.access_token ?? '';
    if (!accessToken) {
      return c.json({ ok: false, error: 'no_access_token' }, 400);
    }

    // Get user profile from LINE
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      return c.json({ ok: false, error: 'profile_fetch_failed' }, 400);
    }

    const profile = await profileRes.json() as any;
    const userId: string = profile.userId ?? '';
    const displayName: string = profile.displayName ?? '';

    if (!userId) {
      return c.json({ ok: false, error: 'no_user_id' }, 400);
    }

    // ENV allowlist — takes priority over KV.
    // Set ADMIN_ALLOWED_LINE_USER_IDS="Uaaa,Ubbb" in Cloudflare Workers env to allow multiple admins.
    // If not set, falls through to KV-based allowlist (existing behaviour).
    const rawEnvIds = ((env as any).ADMIN_ALLOWED_LINE_USER_IDS ?? '').trim();
    const envAllowList = rawEnvIds
      ? rawEnvIds.split(',').map((s: string) => s.trim()).filter(Boolean)
      : null;
    if (envAllowList) {
      const allowed = envAllowList.includes(userId);
      if (!allowed) return c.json({ ok: false, error: 'forbidden', reason: 'line_user_not_allowed' }, 403);
      return c.json({ ok: true, userId, displayName, allowed: true });
    }

    // --- Step 0: Reverse lookup when tenant context is lost ---
    const kv: KVNamespace = env.SAAS_FACTORY;
    let effectiveTid = tenantId;
    if (effectiveTid === 'default') {
      const reverseTid = await kv.get(`member:tenant:${userId}`);
      if (reverseTid) effectiveTid = reverseTid;
    }

    // --- Step 1: RBAC members check (admin:members:{tenantId}) ---
    const membersRaw = await kv.get(`admin:members:${effectiveTid}`);
    const membersStore: AdminMembersStore | null = membersRaw ? JSON.parse(membersRaw) : null;

    if (membersStore && membersStore.members.length > 0) {
      // RBAC パス: members が存在する場合
      const member = membersStore.members.find((m: AdminMember) => m.lineUserId === userId);
      if (member && member.enabled) {
        // displayName を更新（ログインのたびに最新を保存）
        if (member.displayName !== displayName) {
          member.displayName = displayName;
          await kv.put(`admin:members:${effectiveTid}`, JSON.stringify(membersStore));
        }
        await kv.put(`member:tenant:${userId}`, effectiveTid, { expirationTtl: 7776000 });
        return c.json({ ok: true, userId, displayName, allowed: true,
                        role: member.role, membersFound: true, tenantId: effectiveTid });
      }
      return c.json({ ok: true, userId, displayName, allowed: false,
                      membersFound: true, tenantId: effectiveTid });
    }

    // --- Step 2: Bootstrap key 検証 ---
    if (bootstrapKey) {
      const bsRaw = await kv.get(`admin:bootstrap:${effectiveTid}`);
      const bootstrapInfo: { present: boolean; valid: boolean; used: boolean; expired: boolean } =
        { present: !!bsRaw, valid: false, used: false, expired: false };
      if (bsRaw) {
        const bs: AdminBootstrapStore = JSON.parse(bsRaw);
        const keyHash = await sha256Hex(bootstrapKey);
        bootstrapInfo.used = !!bs.usedAt;
        bootstrapInfo.expired = new Date(bs.expiresAt) <= new Date();
        bootstrapInfo.valid = (bs.keyHash === keyHash && !bootstrapInfo.used && !bootstrapInfo.expired);
        if (bootstrapInfo.valid) {
          const bootstrapped: AdminMembersStore = {
            version: 1,
            members: [{
              lineUserId: userId,
              role: 'owner',
              enabled: true,
              displayName,
              createdAt: new Date().toISOString(),
            }],
          };
          await kv.put(`admin:members:${effectiveTid}`, JSON.stringify(bootstrapped));
          bs.usedAt = new Date().toISOString();
          bs.usedBy = userId;
          await kv.put(`admin:bootstrap:${effectiveTid}`, JSON.stringify(bs));
          await kv.put(`member:tenant:${userId}`, effectiveTid, { expirationTtl: 7776000 });
          return c.json({ ok: true, userId, displayName, allowed: true, role: 'owner',
                          membersFound: false, bootstrapped: true, bootstrapInfo, tenantId: effectiveTid });
        }
        return c.json({ ok: true, userId, displayName, allowed: false,
                        membersFound: false, bootstrapInfo, tenantId: effectiveTid });
      }
      return c.json({ ok: true, userId, displayName, allowed: false,
                      membersFound: false, bootstrapInfo: { present: false, valid: false, used: false, expired: false }, tenantId: effectiveTid });
    }

    // --- Step 3: Legacy fallback (allowedAdminLineUserIds) ---
    const settingsRaw = (await kv.get(`settings:${effectiveTid}`, 'json') as any) ?? {};
    const allowedList: string[] = Array.isArray(settingsRaw.allowedAdminLineUserIds)
      ? settingsRaw.allowedAdminLineUserIds : [];

    if (allowedList.length === 0) {
      // 従来の self-seed
      await kv.put(`settings:${effectiveTid}`, JSON.stringify({
        ...settingsRaw, allowedAdminLineUserIds: [userId],
      }));
      // Also create admin:members so password route / RBAC work immediately
      const existingMembers = await kv.get(`admin:members:${effectiveTid}`);
      if (!existingMembers) {
        const seedStore: AdminMembersStore = {
          version: 1,
          members: [{
            lineUserId: userId,
            role: 'owner' as MemberRole,
            enabled: true,
            displayName,
            createdAt: new Date().toISOString(),
            authMethods: ['line'],
          }],
        };
        await kv.put(`admin:members:${effectiveTid}`, JSON.stringify(seedStore));
      }
      await kv.put(`member:tenant:${userId}`, effectiveTid, { expirationTtl: 7776000 });
      return c.json({ ok: true, userId, displayName, allowed: true,
                      role: 'owner', membersFound: false, seeded: true, tenantId: effectiveTid });
    }

    const allowed = allowedList.includes(userId);
    if (allowed) {
      await kv.put(`member:tenant:${userId}`, effectiveTid, { expirationTtl: 7776000 });
      // Ensure admin:members record exists for allowlisted users
      const existingMembers = await kv.get(`admin:members:${effectiveTid}`);
      if (!existingMembers) {
        const seedStore: AdminMembersStore = {
          version: 1,
          members: [{
            lineUserId: userId,
            role: 'owner' as MemberRole,
            enabled: true,
            displayName,
            createdAt: new Date().toISOString(),
            authMethods: ['line'],
          }],
        };
        await kv.put(`admin:members:${effectiveTid}`, JSON.stringify(seedStore));
      } else {
        const store: AdminMembersStore = JSON.parse(existingMembers);
        const exists = store.members.some((m: AdminMember) => m.lineUserId === userId);
        if (!exists) {
          store.members.push({
            lineUserId: userId,
            role: 'admin' as MemberRole,
            enabled: true,
            displayName,
            createdAt: new Date().toISOString(),
            authMethods: ['line'],
          });
          await kv.put(`admin:members:${effectiveTid}`, JSON.stringify(store));
        }
      }
    }
    return c.json({ ok: true, userId, displayName, allowed, membersFound: false, tenantId: effectiveTid });
  });
  /* === /LINE_AUTH_EXCHANGE_V1 === */

}

// Re-export types for use by other modules
export type { MemberRole, AdminMember, AdminMembersStore, AdminBootstrapStore };
export { hashPassword, verifyPassword, ensureEmailAuthTable };
