import { Hono } from "hono";
import { cors } from "hono/cors";
import Stripe from "stripe";
import { resolveVertical, DEFAULT_ADMIN_SETTINGS, mergeSettings, GENERIC_REPEAT_TEMPLATE } from "./settings";
import type { PlanId, SubscriptionInfo } from "./settings";
import { getPlanLimits, isTrialExpired, TRIAL_DURATION_DAYS } from "./plan-limits";
import { getVerticalTemplate } from "./vertical-templates";
import { getRepeatConfig, getStyleLabel, buildRepeatMessage, DEFAULT_REPEAT_TEMPLATE } from "./verticals/eyebrow";
import { getVerticalPlugin } from "./verticals/registry";
import { registerOwnerRoutes, getOwnerIds, bootstrapOwnerIfEmpty, isPrincipalAllowed, normalizePrincipal } from "./routes/owner";
import { registerOwnerLeadRoutes } from "./routes/ownerLeads";
import { createOutreachRoutes } from "./outreach/routes";
import { AICore } from "./ai";
import { runAllDueAgents, readRecentAgentLogs, readAgentLogs, listAgents, triggerLineMessage } from "./agents";
import { LineCore } from "./line";

// test helper (lock reproduction)
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// test helper (lock reproduction)

// test helper (lock reproduction)

// test helper (lock reproduction)

// test helper (lock reproduction)

import { SlotLock } from "./durable/SlotLock";

// test helper (lock reproduction)

// test helper (lock reproduction)

// test helper (lock reproduction)

// test helper (lock reproduction)

// test helper (lock reproduction)

type Env = Record<string, unknown>;

// ── Active reservation semantics ─────────────────────────────
// A reservation is "active" iff its status is NOT in this set.
// Used by /slots, /reserve, /admin/reservations queries and the
// partial unique index idx_res_unique_active.
const CANCELLED_STATUS = 'cancelled' as const;
// SQL fragment — use in .prepare() template strings.
const SQL_ACTIVE_FILTER = `status != '${CANCELLED_STATUS}'` as const;

const app = new Hono<{ Bindings: Env }>();

// =============================================================================
// Phase 0.6: CORS ミドルウェア
//
// origin 判定の優先順位:
//   1. staticOrigins: localhost:3000 / 127.0.0.1:3000（常に許可・env 不要）
//   2. ADMIN_WEB_BASE: この env の origin と完全一致なら許可
//   3. ADMIN_ALLOWED_ORIGINS: カンマ区切り origin リストと完全一致なら許可
//   4. PAGES_DEV_ALLOWED_SUFFIX: 指定サフィックスに一致する pages.dev のみ許可
//      例: ".saas-factory-web-v2.pages.dev" を設定すると
//          https://abc123.saas-factory-web-v2.pages.dev だけ通る
//   5. ALLOW_PAGES_DEV_WILDCARD=1: *.pages.dev を全許可（staging 検証用）
//   6. 上記いずれにも一致しない → null（拒否）
//
// 推奨設定方針（B案: デフォルト安全）:
//   ローカル: env なしでも localhost は通る
//   staging : PAGES_DEV_ALLOWED_SUFFIX=".saas-factory-web-v2.pages.dev"
//             + ADMIN_WEB_BASE=https://saas-factory-web-v2.pages.dev
//   production: ADMIN_WEB_BASE に本番 origin を設定。wildcard は使わない。
// =============================================================================
app.use('/*', cors({
  origin: (origin, c) => {
    if (!origin) return null;

    const env = c.env as any;

    // 1) ハードコード: 常に許可（ローカル開発）
    const staticOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
    if (staticOrigins.includes(origin)) return origin;

    // 2) ADMIN_WEB_BASE: この env var の URL の origin と完全一致
    const webBase: string | undefined = env?.ADMIN_WEB_BASE;
    if (webBase) {
      try {
        if (origin === new URL(webBase).origin) return origin;
      } catch { /* 無効 URL は無視 */ }
    }

    // 3) ADMIN_ALLOWED_ORIGINS: カンマ区切りの追加 origin リスト
    const extraOrigins: string | undefined = env?.ADMIN_ALLOWED_ORIGINS;
    if (extraOrigins) {
      const list = extraOrigins.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (list.includes(origin)) return origin;
    }

    // pages.dev チェックは HTTPS のみ対象
    if (!origin.startsWith('https://')) return null;

    // 4) PAGES_DEV_ALLOWED_SUFFIX: 指定サフィックスに一致する pages.dev origin のみ許可
    //    例: ".saas-factory-web-v2.pages.dev"
    //    → https://abc123.saas-factory-web-v2.pages.dev を通し、
    //      他プロジェクトの pages.dev は弾く
    const suffix: string | undefined = env?.PAGES_DEV_ALLOWED_SUFFIX;
    if (suffix && origin.endsWith('.pages.dev')) {
      if (origin.endsWith(suffix)) return origin;
      // サフィックス指定があるがマッチしない → wildcard も見ない（安全側）
      return null;
    }

    // 5) ALLOW_PAGES_DEV_WILDCARD=1: *.pages.dev を全許可（staging 一時検証用）
    //    本番では設定しないこと
    if (env?.ALLOW_PAGES_DEV_WILDCARD === '1' && origin.endsWith('.pages.dev')) {
      return origin;
    }

    // 6) 上記いずれにも該当しない → 拒否
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
  credentials: true,
}));

// =============================================================================
// Phase 0.6: admin 認証ミドルウェア（/admin/* に適用）
//
// 動作モード:
//   ADMIN_TOKEN 設定済み
//     → X-Admin-Token ヘッダーと照合。不一致で 401。
//   ADMIN_TOKEN 未設定 + REQUIRE_ADMIN_TOKEN=1
//     → 503 で強制ブロック（本番での設定漏れを事故にしない）
//   ADMIN_TOKEN 未設定 + REQUIRE_ADMIN_TOKEN 未設定
//     → console.warn してスキップ（後方互換・デフォルト）
//
// 設定方法:
//   ADMIN_TOKEN       : wrangler secret put ADMIN_TOKEN [--env staging|production]
//   REQUIRE_ADMIN_TOKEN: wrangler secret put REQUIRE_ADMIN_TOKEN [--env staging]
//                        プロンプトに "1" を入力
// =============================================================================
app.use('/admin/*', async (c, next) => {
  const env = c.env as any;
  const expected: string | undefined = env?.ADMIN_TOKEN;
  const requireToken: boolean = env?.REQUIRE_ADMIN_TOKEN === '1';

  if (!expected) {
    if (requireToken) {
      console.error('[auth] REQUIRE_ADMIN_TOKEN=1 だが ADMIN_TOKEN が未設定。/admin/* をブロック。');
      return c.json({ ok: false, error: 'Service misconfigured: admin token not set' }, 503);
    }
    console.warn('[auth] ADMIN_TOKEN 未設定。/admin/* が無防備。wrangler secret put ADMIN_TOKEN で設定を。');
    return next();
  }

  const provided = c.req.header('X-Admin-Token');
  if (!provided || provided !== expected) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  return next();
});

// ── GET /auth/owner-check — KV-based owner verification ───────────────────
// Called by Pages middleware to check if a userId is an owner.
// Auth: ADMIN_TOKEN required. Not under /owner/* so it's not blocked by owner middleware.
app.get("/auth/owner-check", async (c) => {
  const env = c.env as any;
  const expected: string | undefined = env?.ADMIN_TOKEN;
  if (!expected) return c.json({ ok: false, error: "Service unavailable" }, 503);
  const provided = c.req.header("X-Admin-Token");
  if (!provided || provided !== expected) return c.json({ ok: false, error: "Unauthorized" }, 401);

  const kv = env.SAAS_FACTORY as KVNamespace | null;
  const userId = c.req.header("x-session-user-id") ?? "";
  if (!userId) return c.json({ ok: true, isOwner: false });

  // Try bootstrap (only if KV empty + bootstrap identity)
  let bootstrapped = false;
  if (kv) bootstrapped = await bootstrapOwnerIfEmpty(kv, userId);

  // Check owner list (KV primary, env fallback deprecated)
  const ownerIds = await getOwnerIds(kv, env?.OWNER_USER_IDS ?? "");
  const isOwner = isPrincipalAllowed(userId, ownerIds);
  console.log(`[owner-check] uid=${normalizePrincipal(userId).slice(0, 30)} isOwner=${isOwner} ownerCount=${ownerIds.length}`);

  return c.json({ ok: true, isOwner, ...(bootstrapped ? { bootstrapped: true } : {}) });
});

// Owner routes (middleware + endpoints) — see apps/api/src/routes/owner.ts
registerOwnerRoutes(app);
registerOwnerLeadRoutes(app);

function getTenantId(c: any, body?: any): string {
  // x-session-tenant-id: injected by Pages proxy after HMAC-verifying line_session cookie.
  // Authoritative for admin routes; overrides URL query param.
  const sessionTid = c.req.header("x-session-tenant-id")?.trim();
  if (sessionTid && sessionTid !== "default") return sessionTid;
  try {
    const url = new URL(c.req.url)
    const qTid = url.searchParams.get("tenantId")?.trim();
    if (qTid) return qTid;
    const bTid = typeof body?.tenantId === 'string' ? body.tenantId.trim() : '';
    if (bTid) return bTid;
    const hTid = c.req.header("x-tenant-id")?.trim();
    if (hTid) return hTid;
    return "default";
  } catch {
    const bTid = typeof body?.tenantId === 'string' ? body.tenantId.trim() : '';
    if (bTid) return bTid;
    const hTid = c.req.header("x-tenant-id")?.trim();
    if (hTid) return hTid;
    return "default";
  }
}

/**
 * Phase 2: mismatch guard.
 * Returns a 403 Response if ENFORCE_TENANT_MISMATCH=1 env var is set AND
 * the session tenant differs from the URL query tenant.
 * Returns null when no violation.
 */
function checkTenantMismatch(_c: any): Response | null {
  // Tenant mismatch guard removed. Tenant is now resolved from request
  // (query > header > session > default). RBAC (requireRole) still gates
  // write access per-tenant.
  return null;
}

// =============================================================================
// Phase RBAC: live KV-based role check for admin write routes.
// Gate: ENFORCE_RBAC env var must be '1' to activate.
// Follows the same call pattern as checkTenantMismatch():
//   const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
// =============================================================================
type AdminRole = 'owner' | 'admin' | 'viewer';
const ROLE_LEVEL: Record<AdminRole, number> = { owner: 3, admin: 2, viewer: 1 };

async function requireRole(c: any, minRole: AdminRole): Promise<Response | null> {
  const env = c.env as any;
  if (env?.ENFORCE_RBAC !== '1') return null; // phase gate — disabled by default

  const route = c.req.method + ' ' + c.req.path;
  const userId = c.req.header('x-session-user-id')?.trim();
  if (!userId) {
    console.warn(`[rbac:deny] missing_user_id route=${route}`);
    return c.json({ ok: false, error: 'missing_user_id' }, 403);
  }

  const tenantId = getTenantId(c);
  const kv = env.SAAS_FACTORY as KVNamespace | undefined;
  if (!kv) {
    console.error(`[rbac:deny] kv_binding_missing route=${route} tenant=${tenantId}`);
    return c.json({ ok: false, error: 'kv_binding_missing_rbac' }, 503);
  }

  let membersRaw: string | null = null;
  try {
    membersRaw = await kv.get(`admin:members:${tenantId}`);
  } catch (e: any) {
    console.error(`[rbac:deny] kv_read_error route=${route} tenant=${tenantId} err=${e?.message}`);
    return c.json({ ok: false, error: 'kv_read_error_rbac' }, 503);
  }

  // No members record → legacy tenant, allow through (backward compat)
  if (!membersRaw) {
    console.warn(`[rbac:passthrough] no_members_record route=${route} tenant=${tenantId} user=${userId}`);
    c.header('x-rbac-passthrough', '1');
    return null;
  }

  let store: { members: Array<{ lineUserId: string; role: string; enabled: boolean }> };
  try {
    store = JSON.parse(membersRaw);
  } catch {
    console.warn(`[rbac:passthrough] malformed_members route=${route} tenant=${tenantId}`);
    c.header('x-rbac-passthrough', '1');
    return null;
  }

  if (!Array.isArray(store.members) || store.members.length === 0) {
    console.warn(`[rbac:passthrough] empty_members route=${route} tenant=${tenantId}`);
    c.header('x-rbac-passthrough', '1');
    return null;
  }

  let member = store.members.find(
    (m) => m.lineUserId === userId && m.enabled !== false
  );

  // ── Self-heal: user not in admin:members but may be a legitimate owner/admin ──
  // Check settings allowlist and reverse tenant lookup as fallback.
  // This bridges the gap where ENFORCE_RBAC was enabled before all tenants
  // had complete admin:members records.
  if (!member) {
    let healed = false;
    try {
      // Check 1: user is in allowedAdminLineUserIds (legacy allowlist)
      const settingsRaw = await kv.get(`settings:${tenantId}`, 'json') as any;
      const allowedList: string[] = Array.isArray(settingsRaw?.allowedAdminLineUserIds)
        ? settingsRaw.allowedAdminLineUserIds : [];

      if (allowedList.includes(userId)) {
        // User is in the allowlist → add to admin:members as admin
        const newMember = {
          lineUserId: userId,
          role: 'admin' as const,
          enabled: true,
          displayName: userId.startsWith('email:') ? userId.slice(6) : userId,
          createdAt: new Date().toISOString(),
          authMethods: [userId.startsWith('email:') ? 'email' : 'line'],
        };
        store.members.push(newMember);
        await kv.put(`admin:members:${tenantId}`, JSON.stringify({ version: 1, members: store.members }));
        member = newMember;
        healed = true;
        console.warn(`[rbac:self-heal] allowlist_match route=${route} tenant=${tenantId} user=${userId} role=admin`);
      }

      // Check 2: user has reverse tenant lookup (member:tenant:{userId} → tenantId)
      // This means the user previously logged in for this tenant. Grant owner if no other owner exists.
      if (!healed) {
        const reverseTid = await kv.get(`member:tenant:${userId}`);
        if (reverseTid === tenantId) {
          const hasOwner = store.members.some((m) => m.role === 'owner' && m.enabled !== false);
          const newRole = hasOwner ? 'admin' : 'owner';
          const newMember = {
            lineUserId: userId,
            role: newRole as 'owner' | 'admin',
            enabled: true,
            displayName: userId.startsWith('email:') ? userId.slice(6) : userId,
            createdAt: new Date().toISOString(),
            authMethods: [userId.startsWith('email:') ? 'email' : 'line'],
          };
          store.members.push(newMember);
          await kv.put(`admin:members:${tenantId}`, JSON.stringify({ version: 1, members: store.members }));
          member = newMember;
          healed = true;
          console.warn(`[rbac:self-heal] reverse_lookup route=${route} tenant=${tenantId} user=${userId} role=${newRole}`);
        }
      }

      // Check 3: user has a valid HMAC-verified session for this exact tenant.
      // The session cookie is signed by Pages with LINE_SESSION_SECRET and cannot
      // be forged. If x-session-tenant-id matches the target tenant, the user was
      // previously authenticated for this tenant (via signup, magic link, or
      // password login). Safe to bootstrap them into admin:members.
      if (!healed) {
        const sessionTid = c.req.header('x-session-tenant-id')?.trim();
        if (sessionTid && sessionTid !== 'default' && sessionTid === tenantId) {
          const hasOwner = store.members.some((m) => m.role === 'owner' && m.enabled !== false);
          const newRole = hasOwner ? 'admin' : 'owner';
          const newMember = {
            lineUserId: userId,
            role: newRole as 'owner' | 'admin',
            enabled: true,
            displayName: userId.startsWith('email:') ? userId.slice(6) : userId,
            createdAt: new Date().toISOString(),
            authMethods: [userId.startsWith('email:') ? 'email' : 'line'],
          };
          store.members.push(newMember);
          await kv.put(`admin:members:${tenantId}`, JSON.stringify({ version: 1, members: store.members }));
          member = newMember;
          healed = true;
          console.warn(`[rbac:self-heal] session_tenant_match route=${route} tenant=${tenantId} user=${userId} role=${newRole}`);
        }
      }
    } catch (e: any) {
      console.warn(`[rbac:self-heal-error] route=${route} tenant=${tenantId} user=${userId} err=${e?.message}`);
    }

    if (!member) {
      console.warn(`[rbac:deny] not_a_member route=${route} tenant=${tenantId} user=${userId}`);
      return c.json({ ok: false, error: 'not_a_member' }, 403);
    }
  }

  const memberLevel = ROLE_LEVEL[member.role as AdminRole] ?? 0;
  const requiredLevel = ROLE_LEVEL[minRole];
  if (memberLevel < requiredLevel) {
    console.warn(`[rbac:deny] insufficient_role route=${route} tenant=${tenantId} user=${userId} role=${member.role} required=${minRole}`);
    return c.json({ ok: false, error: 'insufficient_role', role: member.role, required: minRole }, 403);
  }

  // Success — attach role header for observability
  c.header('x-rbac-role', member.role);
  return null;
}

/**
 * Debug helper: sets response headers when ?debug=1 to expose tenant resolution.
 */
function setTenantDebugHeaders(c: any, tenantId: string, keyExample?: string): void {
  if (c.req.query('debug') !== '1') return;
  c.header('x-tenant-from-header', c.req.header('x-session-tenant-id') || '(none)');
  c.header('x-tenant-from-query', c.req.query('tenantId') || '(none)');
  c.header('x-tenant-resolved', tenantId);
  if (keyExample) c.header('x-tenant-key', keyExample);
}

// ── /__build — deployment health + version info ─────────────────────────────
// Returns: git SHA, migration status (D1 tables), AI availability, timestamp.
// Used by CI smoke tests and owner UI build stamp.
app.get("/__build", async (c) => {
  const env = c.env as any;
  const gitSha = env?.GIT_SHA || "dev";

  // D1 migration check — verify sales_leads table exists (latest migration)
  let migrationOk = false;
  let migrationDetail = "";
  try {
    const db = env?.DB;
    if (db) {
      await db.prepare("SELECT 1 FROM sales_leads LIMIT 0").run();
      migrationOk = true;
      migrationDetail = "sales_leads OK";
    } else {
      migrationDetail = "DB binding missing";
    }
  } catch (e: any) {
    migrationDetail = String(e?.message ?? e).slice(0, 100);
  }

  // OpenAI availability
  const aiConfigured = !!env?.OPENAI_API_KEY;

  return c.json({
    ok: true,
    stamp: "API_BUILD_V2",
    gitSha,
    deployedAt: new Date().toISOString(),
    migration: { ok: migrationOk, detail: migrationDetail },
    ai: { configured: aiConfigured },
  });
});


// ── GET /admin/rbac/audit ──────────────────────────────────────────────────
// Diagnostic: check members status for a tenant (or multiple via ?tenantIds=a,b,c).
// Returns member counts, roles, and ENFORCE_RBAC status for pre-rollout verification.
app.get('/admin/rbac/audit', async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const env = c.env as any;
  const kv = env.SAAS_FACTORY;
  if (!kv) return c.json({ ok: false, error: 'kv_missing' }, 500);

  const enforceRbac = env?.ENFORCE_RBAC === '1';
  const enforceTenantMismatch = env?.ENFORCE_TENANT_MISMATCH === '1';

  // Accept single tenantId or comma-separated list
  const rawIds = (c.req.query('tenantIds') ?? c.req.query('tenantId') ?? 'default').trim();
  const tenantIds = rawIds.split(',').map((s: string) => s.trim()).filter(Boolean);

  const results: any[] = [];
  for (const tid of tenantIds.slice(0, 20)) { // cap at 20 to avoid abuse
    try {
      const membersRaw = await kv.get(`admin:members:${tid}`);
      if (!membersRaw) {
        results.push({ tenantId: tid, status: 'no_members_record', legacyPassthrough: true });
        continue;
      }
      const store = JSON.parse(membersRaw);
      const members = Array.isArray(store?.members) ? store.members : [];
      const summary = members.map((m: any) => ({
        userId: m.lineUserId ? m.lineUserId.slice(0, 8) + '...' : '(empty)',
        role: m.role,
        enabled: m.enabled,
      }));
      const ownerCount = members.filter((m: any) => m.role === 'owner' && m.enabled !== false).length;
      const adminCount = members.filter((m: any) => m.role === 'admin' && m.enabled !== false).length;
      results.push({
        tenantId: tid,
        status: 'members_found',
        legacyPassthrough: false,
        totalMembers: members.length,
        enabledOwners: ownerCount,
        enabledAdmins: adminCount,
        members: summary,
      });
    } catch (e: any) {
      results.push({ tenantId: tid, status: 'error', error: String(e?.message ?? e) });
    }
  }

  return c.json({
    ok: true,
    enforceRbac,
    enforceTenantMismatch,
    sessionUserId: c.req.header('x-session-user-id') ?? '(none)',
    tenants: results,
  });
});

// --- slots (DUMMY V1) ---
    // === ADMIN_SETTINGS_V1 ===
  // GET/PUT admin settings (KV)
  app.get('/admin/settings', async (c) => {
    const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
    const debug = c.req.query('debug') === '1'
    const tenantId = getTenantId(c)
    setTenantDebugHeaders(c, tenantId, `settings:${tenantId}`)

    const envAny: any = (c as any).env || (c as any)
    const kv = (envAny && (envAny.SAAS_FACTORY || envAny.KV || envAny.SAAS_FACTORY_KV)) || null
    if(!kv){
      return c.json({ ok:false, error:'kv_binding_missing', tenantId, seen:Object.keys(envAny||{}) }, 500)
    }

    // Phase 1a: vertical-aware defaults — eyebrow defaults only for eyebrow tenants
    const DEFAULT_SETTINGS: any = {
      businessName: "",
      slotMinutes: 30,
      timezone: "Asia/Tokyo",
      closedWeekdays: [],
      openTime: "10:00",
      closeTime: "19:00",
      slotIntervalMin: 30,
      storeAddress: "",
      consentText: "予約内容を確認し、同意の上で予約を確定します",
      staffSelectionEnabled: true,
    }
    const deepMerge = (a: any, b: any) => {
      const out: any = Array.isArray(a) ? [...a] : { ...(a||{}) }
      for(const k of Object.keys(b||{})){
        const av = out[k]
        const bv = b[k]
        if(av && bv && typeof av==='object' && typeof bv==='object' && !Array.isArray(av) && !Array.isArray(bv)){
          out[k] = deepMerge(av, bv)
        } else {
          out[k] = bv
        }
      }
      return out
    }

    const getJson = async (key: string) => {
      try{
        const v = await kv.get(key, "json")
        return v || null
      }catch(e){
        try{
          const v2 = await kv.get(key)
          return v2 ? JSON.parse(v2) : null
        }catch(_){
          return null
        }
      }
    }

    const keyDefault = 'settings:default'
    const keyTenant  = 'settings:' + tenantId

    const sDefault = await getJson(keyDefault)
    const sTenant  = tenantId === 'default' ? null : await getJson(keyTenant)

    let data = DEFAULT_SETTINGS
    if(sDefault) data = deepMerge(data, sDefault)
    if(sTenant)  data = deepMerge(data, sTenant)

    // P1: inject resolved vertical fields
    const { vertical, verticalConfig } = resolveVertical(data)
    data = { ...data, vertical, verticalConfig }

    return c.json({
      ok:true,
      tenantId,
      data,
      debug: debug ? { keyDefault, keyTenant, hasDefault: !!sDefault, hasTenant: !!sTenant } : undefined
    })
  })

  app.put('/admin/settings', async (c) => {
    const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
    const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
    const tenantId = getTenantId(c)

    const envAny: any = (c as any).env || (c as any)
    const kv = (envAny && (envAny.SAAS_FACTORY || envAny.KV || envAny.SAAS_FACTORY_KV)) || null
    if(!kv){
      return c.json({ ok:false, error:'kv_binding_missing', tenantId, seen:Object.keys(envAny||{}) }, 500)
    }

    // Self-heal: if admin:members does not exist yet, create it with current user as owner.
    // This covers legacy tenants that passed requireRole via no_members_record passthrough.
    const userId = c.req.header('x-session-user-id')?.trim();
    if (userId) {
      const membersRaw = await kv.get(`admin:members:${tenantId}`);
      if (!membersRaw) {
        const seedStore: AdminMembersStore = {
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
        await kv.put(`admin:members:${tenantId}`, JSON.stringify(seedStore));
        console.warn(`[settings:self-heal] created admin:members tenant=${tenantId} user=${userId}`);
      }
    }

    let body: any = null
    try{
      body = await c.req.json()
    }catch(e){
      return c.json({ ok:false, error:'bad_json' }, 400)
    }

    const normTime = (s: any, fallback: string) => {
      const v = String(s ?? fallback)
      return /^\d{2}:\d{2}$/.test(v) ? v : fallback
    }

    const patch: any = {}
    if(body.storeName != null) patch.storeName = String(body.storeName)
    if(body.storeAddress != null) patch.storeAddress = String(body.storeAddress)
    if(body.consentText != null) patch.consentText = String(body.consentText)
    if(body.staffSelectionEnabled != null) patch.staffSelectionEnabled = Boolean(body.staffSelectionEnabled)
    if(body.businessName != null) patch.businessName = String(body.businessName)
    if(body.timezone != null) patch.timezone = String(body.timezone)
    if(body.openTime != null) patch.openTime = normTime(body.openTime, "10:00")
    if(body.closeTime != null) patch.closeTime = normTime(body.closeTime, "19:00")
    if(body.slotIntervalMin != null) patch.slotIntervalMin = Number(body.slotIntervalMin)
    if(body.slotMinutes != null) patch.slotMinutes = Number(body.slotMinutes)
    if(body.closedWeekdays != null){
      patch.closedWeekdays = Array.isArray(body.closedWeekdays) ? body.closedWeekdays.map((x:any)=>Number(x)) : []
    }
    // nested objects from the full AdminSettings schema
    if(body.publicDays != null) patch.publicDays = Number(body.publicDays)
    if(body.tenant != null && typeof body.tenant === 'object') patch.tenant = body.tenant
    if(body.businessHours != null && typeof body.businessHours === 'object') patch.businessHours = body.businessHours
    if(body.rules != null && typeof body.rules === 'object') patch.rules = body.rules
    if(body.assignment != null && typeof body.assignment === 'object') patch.assignment = body.assignment
    if(body.exceptions != null && Array.isArray(body.exceptions)) patch.exceptions = body.exceptions
    // allowedAdminLineUserIds: array of strings (LINE userId / email identity)
    if(body.allowedAdminLineUserIds != null) {
      patch.allowedAdminLineUserIds = Array.isArray(body.allowedAdminLineUserIds)
        ? body.allowedAdminLineUserIds.map((x: any) => String(x))
        : []
    }

    // read existing KV, merge patch on top (partial save - don't overwrite other fields)
    const key = 'settings:' + tenantId
    let existing: any = {}
    try {
      const ev = await kv.get(key, "json")
      if(ev && typeof ev === 'object') existing = ev
    } catch { try { const s = await kv.get(key); if(s) existing = JSON.parse(s) } catch {} }

    // deep-merge integrations so sub-objects (line, stripe) are merged not replaced
    if(body.integrations != null && typeof body.integrations === 'object') {
      const existingInteg = existing.integrations || {}
      const bodyInteg = body.integrations
      patch.integrations = { ...existingInteg }
      if(bodyInteg.line != null && typeof bodyInteg.line === 'object') {
        patch.integrations.line = { ...(existingInteg.line || {}), ...bodyInteg.line }
      }
      if(bodyInteg.stripe != null && typeof bodyInteg.stripe === 'object') {
        patch.integrations.stripe = { ...(existingInteg.stripe || {}), ...bodyInteg.stripe }
      }
    }
    // notifications: deep merge (lineReminder sub-object も保持)
    if(body.notifications != null && typeof body.notifications === 'object') {
      const existingNotif = existing.notifications || {}
      patch.notifications = { ...existingNotif, ...body.notifications }
      if(body.notifications.lineReminder != null && typeof body.notifications.lineReminder === 'object') {
        patch.notifications.lineReminder = { ...(existingNotif.lineReminder || {}), ...body.notifications.lineReminder }
      }
    }
    // onboarding: shallow merge
    if(body.onboarding != null && typeof body.onboarding === 'object') {
      patch.onboarding = { ...(existing.onboarding || {}), ...body.onboarding }
    }
    // P2: vertical / verticalConfig 直接指定
    if(body.vertical != null) patch.vertical = String(body.vertical)
    if(body.verticalConfig != null && typeof body.verticalConfig === 'object') {
      const existingVC = existing.verticalConfig || {}
      patch.verticalConfig = { ...existingVC, ...body.verticalConfig }
      if(body.verticalConfig.repeat != null && typeof body.verticalConfig.repeat === 'object') {
        patch.verticalConfig.repeat = { ...(existingVC.repeat || {}), ...body.verticalConfig.repeat }
      }
    }

    // ai: deep merge
    if (body.ai != null && typeof body.ai === 'object') {
      const existingAi = existing.ai || {};
      patch.ai = { ...existingAi, ...body.ai };
    }
    // lineAccounts: full array replacement (managed via dedicated endpoints)
    if (body.lineAccounts != null) patch.lineAccounts = body.lineAccounts;
    // lineRouting: shallow merge
    if (body.lineRouting != null && typeof body.lineRouting === 'object') {
      patch.lineRouting = { ...(existing.lineRouting || {}), ...body.lineRouting };
    }

    const merged = { ...existing, ...patch }
    await kv.put(key, JSON.stringify(merged))

    // Auto-register LINE destination-to-tenant when credentials are present.
    // Runs as waitUntil so it doesn't block the response.
    // Handles both line-setup page (PUT /admin/settings) and any other save path.
    const lineToken = String(
      patch.integrations?.line?.channelAccessToken
      ?? existing?.integrations?.line?.channelAccessToken
      ?? ""
    ).trim();
    if (lineToken) {
      const registerBot = async () => {
        try {
          const botCheck = await verifyLineToken(lineToken);
          if (botCheck.status === "ok" && botCheck.userId) {
            await kv.put(`line:destination-to-tenant:${botCheck.userId}`, tenantId);
            await kv.put(`line:tenant2dest:${tenantId}`, botCheck.userId);
          }
        } catch {}
      };
      const execCtx = (c as any).executionCtx ?? (c as any).execution;
      if (execCtx?.waitUntil) {
        execCtx.waitUntil(registerBot());
      } else {
        registerBot().catch(() => null);
      }
    }

    return c.json({ ok:true, tenantId, key, saved: merged })
  })
  // === /ADMIN_SETTINGS_V1 ===
// === SLOTS_SETTINGS_V1 ===
  // settings-driven slots generator (multi-tenant)
  app.get('/slots', async (c) => {
    const debug = c.req.query('debug') === '1'

    // Use getTenantId() for consistency with /reserve and /admin/* routes.
    // Previously used inline logic that skipped x-session-tenant-id header.
    const tenantId = getTenantId(c, null)
    const staffId = (c.req.query('staffId') || 'any').trim() || 'any'
    const date    = (c.req.query('date') || '').trim()

    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){
      return c.json({ ok:false, error:'bad_date', hint:'YYYY-MM-DD', tenantId, staffId, date }, 400)
    }

    const envAny: any = (c as any).env || (c as any)

    const pickFirst = (obj: any, keys: string[]) => {
      for (const k of keys) if (obj && obj[k]) return obj[k]
      return null
    }

    const kv = pickFirst(envAny, ['KV','SAAS_FACTORY_KV','SAAS_FACTORY','APP_KV','DATA_KV','BOOKING_KV'])
    const db = pickFirst(envAny, ['DB','D1','DATABASE','SAAS_FACTORY_DB','BOOKING_DB'])

    if(!kv){
      return c.json({ ok:false, error:'kv_binding_missing', tenantId, seen:Object.keys(envAny||{}), hint:'Check wrangler.toml bindings' }, 500)
    }
    if(!db){
      return c.json({ ok:false, error:'d1_binding_missing', tenantId, seen:Object.keys(envAny||{}), hint:'Check wrangler.toml bindings' }, 500)
    }

    const pad2 = (n: number) => String(n).padStart(2,'0')
    
    const JST_OFFSET_MS = 9 * 60 * 60 * 1000
    const jstDate = (tms: number) => new Date(tms + JST_OFFSET_MS)
const parseHHMM = (s: string) => {
      const m = /^(\d{2}):(\d{2})$/.exec(s)
      if(!m) return null
      const hh = Number(m[1]), mm = Number(m[2])
      if(hh<0||hh>23||mm<0||mm>59) return null
      return { hh, mm }
    }
    const toIsoJst = (d: string, hhmm: string) => (d + 'T' + hhmm + ':00+09:00')
    const ms = (iso: string) => new Date(iso).getTime()
    const overlaps = (a0:number,a1:number,b0:number,b1:number) => a0 < b1 && a1 > b0

    const DEFAULT_SETTINGS: any = {
      businessName: "",
      slotMinutes: 30,
      timezone: "Asia/Tokyo",
      closedWeekdays: [],
      openTime: "10:00",
      closeTime: "19:00",
      slotIntervalMin: 30,
    }

    const deepMerge = (a: any, b: any) => {
      const out: any = Array.isArray(a) ? [...a] : { ...(a||{}) }
      for(const k of Object.keys(b||{})){
        const av = out[k]
        const bv = b[k]
        if(av && bv && typeof av==='object' && typeof bv==='object' && !Array.isArray(av) && !Array.isArray(bv)){
          out[k] = deepMerge(av, bv)
        } else {
          out[k] = bv
        }
      }
      return out
    }

    const getJson = async (key: string) => {
      try{
        const v = await kv.get(key, "json")
        return v || null
      }catch(e){
        try{
          const v2 = await kv.get(key)
          return v2 ? JSON.parse(v2) : null
        }catch(_){
          return null
        }
      }
    }

    const candidatesDefault = [
      'admin:settings:default',
      'settings:default',
      'admin:settings',
      'settings',
    ]
    const candidatesTenant = [
      'admin:settings:' + tenantId,
      'settings:' + tenantId,
      'admin:settings:tenant:' + tenantId,
      'settings:tenant:' + tenantId,
    ]

    let s = DEFAULT_SETTINGS
    let sDefault: any = null
    let sTenant: any  = null
    let hitDefaultKey: string | null = null
    let hitTenantKey: string | null = null

    for(const k of candidatesDefault){ sDefault = await getJson(k); if(sDefault){ hitDefaultKey = k; break } }
    if(tenantId !== 'default'){
      for(const k of candidatesTenant){  sTenant  = await getJson(k); if(sTenant){ hitTenantKey = k; break } }
    }

    if(sDefault) s = deepMerge(s, sDefault)
    if(sTenant)  s = deepMerge(s, sTenant)

    const openTime = String(s.openTime || "10:00")
    const closeTime = String(s.closeTime || "19:00")
    const slotIntervalMin = Number(s.slotIntervalMin ?? s.slotMinutes ?? 30)
    const slotMinutes = Number(s.slotMinutes ?? 30)
    const closedWeekdays = Array.isArray(s.closedWeekdays) ? s.closedWeekdays.map((x:any)=>Number(x)) : []

    const o = parseHHMM(openTime)
    const cc = parseHHMM(closeTime)
    if(!o || !cc){
      return c.json({ ok:false, error:'bad_settings_time', tenantId, openTime, closeTime }, 500)
    }

    const weekday = jstDate(ms(date + 'T00:00:00+09:00')).getUTCDay()
    if(closedWeekdays.includes(weekday)){
      return c.json({
        ok:true, tenantId, staffId, date,
        settings: debug ? { openTime, closeTime, slotIntervalMin, slotMinutes, closedWeekdays, weekday, hitDefaultKey, hitTenantKey } : undefined,
        slots: []
      })
    }

    const openIso  = toIsoJst(date, pad2(o.hh) + ':' + pad2(o.mm))
    const closeIso = toIsoJst(date, pad2(cc.hh) + ':' + pad2(cc.mm))
    const openMs  = ms(openIso)
    const closeMs = ms(closeIso)

    const stepMs = slotIntervalMin * 60 * 1000
    // cellAvailable: slot interval (= grid cell width) — matches admin ledger
    const cellOverlapMs = stepMs
    // bookableForMenu: actual menu duration — matches /reserve truth
    const reqDurMin = Number(c.req.query('durationMin') || 0)
    const menuDurMs = reqDurMin > 0 ? reqDurMin * 60 * 1000 : cellOverlapMs
    // Only run the second check when menu duration exceeds slot interval
    const needMenuCheck = menuDurMs > cellOverlapMs

    const dayStart = date + 'T00:00:00+09:00'
    const dayEnd   = date + 'T23:59:59+09:00'

    let reservations: Array<{start_at:string,end_at:string,staff_id?:string}> = []
    try{
      if(staffId === 'any'){
        const q = await db
          .prepare(`SELECT start_at, end_at, staff_id FROM reservations WHERE tenant_id = ? AND start_at < ? AND end_at > ? AND ${SQL_ACTIVE_FILTER} ORDER BY start_at`)
          .bind(tenantId, dayEnd, dayStart)
          .all()
        reservations = (q.results || []) as any
      } else {
        // Include both this staff's reservations AND unassigned ('any'/NULL) reservations
        // Unassigned reservations consume capacity and must be counted
        const q = await db
          .prepare(`SELECT start_at, end_at, staff_id FROM reservations WHERE tenant_id = ? AND (staff_id = ? OR staff_id = 'any' OR staff_id IS NULL) AND start_at < ? AND end_at > ? AND ${SQL_ACTIVE_FILTER} ORDER BY start_at`)
          .bind(tenantId, staffId, dayEnd, dayStart)
          .all()
        reservations = (q.results || []) as any
      }
    }catch(e:any){
      return c.json({ ok:false, error:'d1_query_failed', tenantId, detail:String(e?.message||e), stack: debug ? String(e?.stack||'') : undefined }, 500)
    }

    // Map reservations to ms pairs, also track staff_id for per-staff aggregation
    type ResPair = { a0: number; a1: number; sid: string }
    const resAll: ResPair[] = reservations
      .map(r => ({ a0: ms(r.start_at), a1: ms(r.end_at), sid: String(r.staff_id || 'any') }))
      .filter(x => Number.isFinite(x.a0) && Number.isFinite(x.a1))

    // Group reservations by staff_id for per-staff conflict check
    const resByStaff: Record<string, ResPair[]> = {}
    for(const r of resAll){
      if(!resByStaff[r.sid]) resByStaff[r.sid] = []
      resByStaff[r.sid].push(r)
    }

    // Load availability overrides
    // - specific staff: single KV read
    // - any staff: load all active staff KV entries for aggregation
    let singleAvail: Record<string, string> = {}
    let allStaffAvail: Record<string, Record<string, string>> = {}
    let activeStaffIds: string[] = []

    if(staffId !== 'any'){
      try{
        const raw = await kv.get(`availability:${tenantId}:${staffId}:${date}`)
        if(raw) singleAvail = JSON.parse(raw)
      }catch{}
    } else {
      try{
        const staffRaw = await kv.get(`admin:staff:list:${tenantId}`)
        const allStaff: any[] = staffRaw ? JSON.parse(staffRaw) : []
        activeStaffIds = allStaff.filter(s => s.active !== false).map(s => String(s.id))
        for(const sid of activeStaffIds){
          try{
            const raw = await kv.get(`availability:${tenantId}:${sid}:${date}`)
            if(raw) allStaffAvail[sid] = JSON.parse(raw)
          }catch{}
        }
      }catch{}
    }

    type SlotStatus = 'available' | 'few' | 'full'
    const slots: Array<{time:string, available:boolean, cellAvailable:boolean, bookableForMenu:boolean, status:SlotStatus}> = []

    // Helper: check capacity for a given overlap window (reused for cell + menu checks)
    const checkCapacity = (t: number, windowMs: number): { avail: boolean; status: SlotStatus } => {
      const end = t + windowMs
      if(staffId !== 'any'){
        // ── Specific staff ──
        let avail = true
        for(const r of resAll){
          if(overlaps(t, end, r.a0, r.a1)){ avail = false; break }
        }
        const time = pad2(jstDate(t).getUTCHours()) + ':' + pad2(jstDate(t).getUTCMinutes())
        const ovr = singleAvail[time]
        if(avail && ovr === 'closed') avail = false
        const st: SlotStatus = !avail ? 'full' : ovr === 'half' ? 'few' : 'available'
        return { avail, status: st }
      } else {
        // ── Any staff ──
        if(activeStaffIds.length === 0){
          let conflictCount = 0
          for(const r of resAll){ if(overlaps(t, end, r.a0, r.a1)) conflictCount++ }
          const avail = conflictCount < 1
          return { avail, status: avail ? 'available' : 'full' }
        }
        let anyConflictCount = 0
        for(const r of (resByStaff['any'] || [])){ if(overlaps(t, end, r.a0, r.a1)) anyConflictCount++ }
        const staffStatuses: SlotStatus[] = []
        for(const sid of activeStaffIds){
          let ownConflict = false
          for(const r of (resByStaff[sid] || [])){ if(overlaps(t, end, r.a0, r.a1)){ ownConflict = true; break } }
          if(ownConflict) continue
          const time = pad2(jstDate(t).getUTCHours()) + ':' + pad2(jstDate(t).getUTCMinutes())
          const ovr = (allStaffAvail[sid] || {})[time]
          if(ovr === 'closed') continue
          staffStatuses.push(ovr === 'half' ? 'few' : 'available')
        }
        const remainingCount = staffStatuses.length - anyConflictCount
        if(remainingCount <= 0) return { avail: false, status: 'full' }
        const sorted = staffStatuses.slice().sort((a, b) => a === b ? 0 : a === 'available' ? -1 : 1)
        const remaining = sorted.slice(anyConflictCount)
        return { avail: true, status: remaining.some(s => s === 'available') ? 'available' : 'few' }
      }
    }

    // Loop boundary matches admin grid: slot starts up to and including closeTime
    for(let t = openMs; t <= closeMs; t += stepMs){
      const dt = jstDate(t)
      const time = pad2(dt.getUTCHours()) + ':' + pad2(dt.getUTCMinutes())

      // 1) cellAvailable: interval-based overlap (matches admin ledger grid)
      const cell = checkCapacity(t, cellOverlapMs)

      // 2) bookableForMenu: duration-based overlap (matches /reserve truth)
      //    Only differs when menu duration > slot interval
      const menu = needMenuCheck ? checkCapacity(t, menuDurMs) : cell

      slots.push({
        time,
        available: cell.avail,           // backward compat = cellAvailable
        cellAvailable: cell.avail,
        bookableForMenu: menu.avail,
        status: cell.status,             // backward compat for admin grid
      })
    }

    return c.json({
      ok:true, tenantId, staffId, date,
      settings: debug ? { openTime, closeTime, slotIntervalMin, menuDurMin: reqDurMin || null, closedWeekdays, weekday, hitDefaultKey, hitTenantKey } : undefined,
      _debug: debug ? {
        reservationCount: reservations.length,
        resAllCount: resAll.length,
        cellAvailableCount: slots.filter(s => s.cellAvailable).length,
        bookableCount: slots.filter(s => s.bookableForMenu).length,
        activeStaffIds,
        reservations: reservations.slice(0, 10),
      } : undefined,
      slots,
    })
  })
  // === /SLOTS_SETTINGS_V1 ===

// ══════════════════════════════════════════════════════════════════════════════
// Public Sales LINE endpoint — NO AUTH (not under /admin/*)
// Returns only sanitized routing + inviteUrl for LP CTA resolution.
// ══════════════════════════════════════════════════════════════════════════════
app.get("/public/sales-line", async (c) => {
  try {
    const tenantId = getTenantId(c, null);
    const kv = (c.env as any)?.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_not_bound" }, 500);

    const raw = await kv.get(`settings:${tenantId}`, "json") as any;
    const accounts: any[] = Array.isArray(raw?.lineAccounts) ? raw.lineAccounts : [];
    const routing = raw?.lineRouting || {};

    // Build sales routing map: industry → accountId
    const salesRouting: Record<string, string> = {};
    if (routing.sales && typeof routing.sales === "object") {
      for (const [industry, accountId] of Object.entries(routing.sales)) {
        if (typeof accountId === "string" && accountId) {
          salesRouting[industry] = accountId;
        }
      }
    }

    // Build sanitized accounts (only active sales accounts with inviteUrl)
    const salesAccounts = accounts
      .filter((a: any) => a.status === "active" && a.purpose === "sales" && a.inviteUrl)
      .map((a: any) => ({
        id: a.id,
        industry: a.industry || "shared",
        purpose: a.purpose,
        inviteUrl: String(a.inviteUrl),
        status: a.status,
        name: a.name,
      }));

    return c.json({
      ok: true,
      tenantId,
      salesRouting,
      salesAccounts,
    }, 200, { "Cache-Control": "public, max-age=60, s-maxage=300" });
  } catch (e: any) {
    return c.json({ ok: false, error: "fetch_error", detail: String(e?.message ?? e) }, 500);
  }
});

app.get('/slots__legacy', async (c) => {
  const debug = (c.req.query("debug") || "") === "1";
  try {
    const tenantId = c.req.query("tenantId") || "default";
    const staffIdQ = c.req.query("staffId") || "any";

    const dateStr = c.req.query("date") || "";
    let y: number, m: number, d: number;

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [yy, mm, dd] = dateStr.split("-").map((v) => Number(v));
      y = yy; m = mm; d = dd;
    } else {
      const now = new Date();
      y = now.getFullYear(); m = now.getMonth() + 1; d = now.getDate();
    }

    const pad2 = (n: number) => String(n).padStart(2, "0");
    const date = `${y}-${pad2(m)}-${pad2(d)}`;
    const tz = "+09:00";

    // ---- load settings (tenant-scoped) ----
    // expects { ok:true, tenantId, data:{ openTime, closeTime, slotIntervalMin, timezone } } OR { ok:true, openTime... }
    const settingsUrl = new URL("/admin/settings", "http://local");
    settingsUrl.searchParams.set("tenantId", tenantId);

    const settingsRes = await fetch(settingsUrl.toString().replace("http://local", c.req.url.split("/").slice(0,3).join("/")), {
      method: "GET",
      headers: { "Accept": "application/json" },
    });
    let openTime = "10:00";
    let closeTime = "16:00";
    let slotIntervalMin = 30;

    if (settingsRes.ok) {
      const raw = await settingsRes.json().catch(() => null);
      const s = raw?.data ?? raw;
      if (s?.openTime) openTime = String(s.openTime);
      if (s?.closeTime) closeTime = String(s.closeTime);
      if (s?.slotIntervalMin) slotIntervalMin = Number(s.slotIntervalMin) || slotIntervalMin;
    }

    // parse HH:mm
    const toMin = (hhmm: string) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
      if (!m) return null;
      return Number(m[1]) * 60 + Number(m[2]);
    };

    const openMin = toMin(openTime) ?? (10 * 60);
    const closeMin = toMin(closeTime) ?? (16 * 60);
    const step = Math.max(5, Math.min(120, slotIntervalMin || 30));

    // ---- load reservations (by day prefix) ----
    const prefix = `${date}T`;
    const like = `${prefix}%`;

    let rows: any[] = [];
    if (staffIdQ && staffIdQ !== "any") {
      const q2 = `
        SELECT slot_start
        FROM reservations
        WHERE tenant_id = ?
          AND status = 'active'
          AND slot_start LIKE ?
          AND staff_id = ?
      `;
      const r = await c.env.DB.prepare(q2).bind(tenantId, like, staffIdQ).all();
      rows = (r && Array.isArray((r as any).results)) ? (r as any).results : [];
    } else {
      const q = `
        SELECT slot_start
        FROM reservations
        WHERE tenant_id = ?
          AND status = 'active'
          AND slot_start LIKE ?
      `;
      const r = await c.env.DB.prepare(q).bind(tenantId, like).all();
      rows = (r && Array.isArray((r as any).results)) ? (r as any).results : [];
    }

    const reserved = new Set<string>(rows.map((x) => String(x.slot_start)));

    // ---- build slots ----
    const slots: Array<any> = [];
    for (let t = openMin; t + step <= closeMin; t += step) {
      const hh = Math.floor(t / 60);
      const mm = t % 60;
      const time = `${pad2(hh)}:${pad2(mm)}`;

      const slotStart = `${date}T${time}:00${tz}`;
      const isReserved = reserved.has(slotStart);

      slots.push({
        time,
        available: !isReserved,
        reason: isReserved ? "reserved" : undefined,
        meta: debug ? { slotStart, source: "dummy_v6_settings" } : undefined,
      });
    }

    return c.json({
      ok: true,
      tenantId,
      staffId: staffIdQ,
      date,
      slots,
      debug: debug ? { openTime, closeTime, slotIntervalMin: step, reservedCount: reserved.size } : undefined,
    });
  } catch (e: any) {
    return c.json({
      ok: false,
      error: "slots_error",
      message: String(e?.message || e),
      stack: debug ? String(e?.stack || "") : undefined,
    }, 500);
  }
});app.get("/ping", (c) => c.text("pong"));


/** =========================
 * GET /media/menu/* — R2 から画像を公開配信（認証不要）
 * path 例: /media/menu/menu-images/default/menu_xxx/1234567890-abc123.jpg
 * Cache-Control: public, max-age=31536000, immutable（key が変わる運用なのでOK）
 * ========================= */
app.get("/media/menu/*", async (c) => {
  try {
    const r2 = (c.env as any).MENU_IMAGES;
    if (!r2) return new Response("R2 not configured", { status: 503 });

    const url = new URL(c.req.url);
    const imageKey = decodeURIComponent(url.pathname.replace(/^\/media\/menu\//, ""));
    if (!imageKey) return new Response("Not Found", { status: 404 });

    const obj = await r2.get(imageKey);
    if (!obj) return new Response("Not Found", { status: 404 });

    const headers = new Headers();
    headers.set("Content-Type", obj.httpMetadata?.contentType ?? "image/jpeg");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    if (obj.etag) headers.set("ETag", `"${obj.etag}"`);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(obj.body, { status: 200, headers });
  } catch (err: any) {
    return new Response("Server Error", { status: 500 });
  }
});

/** =========================
 * DO debug
 * ========================= */
// ✅ DO 生存確認: /__debug/do?name=abc
app.get("/__debug/do", async (c) => {
  const name = c.req.query("name") || "default";
  const id = c.env.SLOT_LOCK.idFromName(name);
  const stub = c.env.SLOT_LOCK.get(id);
  const res = await stub.fetch("http://slot-lock/__ping");
  const text = await res.text();
  return c.json({ ok: true, name, status: res.status, body: text });
});

app.get("/__debug/admin-auth", (c) => {
  const raw = ((c.env as any).ADMIN_ALLOWED_LINE_USER_IDS || "").trim();
  const allow = raw ? raw.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
  const mask = (s: string) => s.length <= 6 ? (s.slice(0, 2) + "***") : (s.slice(0, 4) + "***");
  const preview = allow.slice(0, 3).map(mask);

  // userId from query — takes priority
  let userId = c.req.query("userId") || "";
  let sessionUserMasked: string | null = null;
  let sessionVerified = false; // signature not checked (no LINE_SESSION_SECRET in Workers)

  // If userId not in query, try to decode line_session cookie (Pages-signed JWT-like token)
  // Format: base64url(JSON{userId,...}).hmacSig  — body part is readable without secret
  if (!userId) {
    try {
      const cookieHeader = c.req.header("cookie") || "";
      const m = cookieHeader.match(/(?:^|;\s*)line_session=([^;]+)/);
      if (m) {
        const b64u = m[1].split(".")[0]; // body part before the dot
        const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - b64u.length % 4) % 4);
        const payload = JSON.parse(atob(b64)) as any;
        if (payload?.userId && typeof payload.userId === "string") {
          userId = payload.userId;
          sessionUserMasked = mask(userId);
          sessionVerified = false; // decoded without sig check
        }
      }
    } catch { /* cookie absent or malformed — ignore */ }
  }

  const isAllowed = userId ? allow.includes(userId) : false;
  return c.json({
    ok: true,
    envPresent: raw.length > 0,
    allowCount: allow.length,
    userIdProvided: userId.length > 0,
    isAllowed,
    allowPreviewMasked: preview,
    ...(sessionUserMasked !== null ? { sessionUserMasked, sessionVerified } : {}),
  });
});

/** =========================
 * Menu
 * ========================= */
type MenuOption = {
  id: string;
  name: string;
  price: number;
  durationMin: number;
  active: boolean;
  sortOrder: number;
};

type MenuItem = {
  id: string;
  name: string;
  price: number;
  durationMin: number;
  active: boolean;
  sortOrder: number;
  verticalAttributes?: Record<string, any>;
  options?: MenuOption[];
};

/** Normalize and sanitize menu options array */
function normalizeMenuOptions(raw: any): MenuOption[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const result: MenuOption[] = [];
  for (const o of raw) {
    if (!o || typeof o !== 'object') continue;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) continue;
    const price = Number(o.price);
    const durationMin = Number(o.durationMin);
    if (!Number.isFinite(price) || price < 0) continue;
    if (!Number.isFinite(durationMin) || durationMin < 0) continue;
    result.push({
      id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      price,
      durationMin,
      active: o.active !== false,
      sortOrder: typeof o.sortOrder === 'number' && Number.isFinite(o.sortOrder) ? o.sortOrder : 999,
    });
  }
  return result.length > 0 ? result : undefined;
}

// Phase 4: defaultMenu は registry 経由で取得
function defaultMenu(vertical?: string): MenuItem[] {
  return getVerticalPlugin(vertical).defaultMenu() as MenuItem[];
}

app.get("/admin/menu", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  try {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;

    const key = `admin:menu:list:${tenantId}`;
    const value = await kv.get(key);

    if (value) {
      const menu = JSON.parse(value);
      return c.json({ ok: true, tenantId, data: menu });
    }

    // Phase 1a: resolve vertical to return appropriate default menu
    let vertical = 'generic';
    try {
      const settingsRaw = await kv.get(`settings:${tenantId}`);
      if (settingsRaw) {
        const s = JSON.parse(settingsRaw);
        vertical = resolveVertical(s).vertical;
      }
    } catch { /* ignore */ }
    return c.json({ ok: true, tenantId, data: defaultMenu(vertical) });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to fetch menu", message: String(error) }, 500);
  }
});

/** =========================
 * POST /admin/menu/image?tenantId=&menuId=
 * multipart/form-data  field: file (image/*)
 * 3MB 制限。R2 にアップロードして { imageKey, imageUrl } を返す。
 * imageKey: menu-images/{tenantId}/{menuId}/{ts}-{rand}.{ext}
 * imageUrl: Workers 自身の origin + /media/menu/{imageKey}
 * ========================= */
app.post("/admin/menu/image", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c);
    const menuId = (c.req.query("menuId") || "new").replace(/[^a-zA-Z0-9_\-]/g, "_");
    const r2 = (c.env as any).MENU_IMAGES;
    if (!r2) return c.json({ ok: false, error: "R2_not_bound" }, 500);

    const formData = await c.req.formData().catch(() => null);
    if (!formData) return c.json({ ok: false, error: "invalid_form_data" }, 400);

    const file = formData.get("file") as File | null;
    if (!file) return c.json({ ok: false, error: "missing_file_field" }, 400);

    if (file.size > 3 * 1024 * 1024) {
      return c.json({ ok: false, error: "file_too_large", maxBytes: 3145728 }, 413);
    }

    const contentType = file.type || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return c.json({ ok: false, error: "invalid_file_type", got: contentType }, 400);
    }

    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const rand = Math.random().toString(36).slice(2, 9);
    const imageKey = `menu-images/${tenantId}/${menuId}/${Date.now()}-${rand}.${ext}`;

    const buf = await file.arrayBuffer();
    await r2.put(imageKey, buf, { httpMetadata: { contentType } });

    const reqUrl = new URL(c.req.url);
    const apiBase = `${reqUrl.protocol}//${reqUrl.host}`;
    const imageUrl = `${apiBase}/media/menu/${imageKey}`;

    return c.json({ ok: true, tenantId, menuId, imageKey, imageUrl });
  } catch (err: any) {
    return c.json({ ok: false, error: "upload_failed", message: String(err?.message ?? err) }, 500);
  }
});

/** =========================
 * GET /media/reservations/* — R2 から予約画像を公開配信（認証不要）
 * path 例: /media/reservations/tenants/default/reservations/123/before-1234567890-abc.jpg
 * ========================= */
app.get("/media/reservations/*", async (c) => {
  try {
    const r2 = (c.env as any).MENU_IMAGES;
    if (!r2) return new Response("R2 not configured", { status: 503 });

    const url = new URL(c.req.url);
    const imageKey = decodeURIComponent(url.pathname.replace(/^\/media\/reservations\//, ""));
    if (!imageKey) return new Response("Not Found", { status: 404 });

    const obj = await r2.get(imageKey);
    if (!obj) return new Response("Not Found", { status: 404 });

    const headers = new Headers();
    headers.set("Content-Type", obj.httpMetadata?.contentType ?? "image/jpeg");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    if (obj.etag) headers.set("ETag", `"${obj.etag}"`);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(obj.body, { status: 200, headers });
  } catch (err: any) {
    return new Response("Server Error", { status: 500 });
  }
});

/** =========================
 * POST /admin/reservations/:id/image?tenantId=&kind=before|after
 * multipart/form-data  field: file (image/*)
 * 3MB 制限。R2 にアップロードして D1 meta の beforeUrl/afterUrl を更新する。
 * imageKey: tenants/{tenantId}/reservations/{id}/{kind}-{ts}-{rand}.{ext}
 * ========================= */
app.post("/admin/reservations/:id/image", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c);
    const id = c.req.param("id");
    const kind = (c.req.query("kind") || "before").replace(/[^a-zA-Z0-9_\-]/g, "_");
    const r2 = (c.env as any).MENU_IMAGES;
    if (!r2) return c.json({ ok: false, error: "R2_not_bound" }, 500);
    const db = (c.env as any).DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

    const formData = await c.req.formData().catch(() => null);
    if (!formData) return c.json({ ok: false, error: "invalid_form_data" }, 400);

    const file = formData.get("file") as File | null;
    if (!file) return c.json({ ok: false, error: "missing_file_field" }, 400);

    if (file.size > 3 * 1024 * 1024) {
      return c.json({ ok: false, error: "file_too_large", maxBytes: 3145728 }, 413);
    }

    const contentType = file.type || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return c.json({ ok: false, error: "invalid_file_type", got: contentType }, 400);
    }

    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const rand = Math.random().toString(36).slice(2, 9);
    const imageKey = `tenants/${tenantId}/reservations/${id}/${kind}-${Date.now()}-${rand}.${ext}`;

    const buf = await file.arrayBuffer();
    await r2.put(imageKey, buf, { httpMetadata: { contentType } });

    const reqUrl = new URL(c.req.url);
    const apiBase = `${reqUrl.protocol}//${reqUrl.host}`;
    const imageUrl = `${apiBase}/media/reservations/${imageKey}`;

    // D1 meta を更新（既存 meta に beforeUrl/afterUrl をマージ）
    const existingRow: any = await db
      .prepare("SELECT meta FROM reservations WHERE id = ? AND tenant_id = ?")
      .bind(id, tenantId).first().catch(() => null);
    let existingMeta: any = {};
    if (existingRow?.meta) { try { existingMeta = JSON.parse(existingRow.meta); } catch {} }
    const metaKey = kind === "after" ? "afterUrl" : "beforeUrl";
    const mergedMeta = { ...existingMeta, [metaKey]: imageUrl };
    await db
      .prepare("UPDATE reservations SET meta = ? WHERE id = ? AND tenant_id = ?")
      .bind(JSON.stringify(mergedMeta), id, tenantId).run();

    return c.json({ ok: true, tenantId, reservationId: id, kind, imageKey, imageUrl });
  } catch (err: any) {
    return c.json({ ok: false, error: "upload_failed", message: String(err?.message ?? err) }, 500);
  }
});

app.post("/admin/menu", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;

    const body = await c.req.json().catch(() => ({} as any));
    const { name, price, durationMin, active, sortOrder } = body ?? {};

    if (!name || typeof name !== "string" || name.trim() === "") {
      return c.json({ ok: false, error: "name is required" }, 400);
    }
    if (price === undefined || typeof price !== "number" || price < 0) {
      return c.json({ ok: false, error: "price must be non-negative number" }, 400);
    }
    if (durationMin === undefined || typeof durationMin !== "number" || durationMin <= 0) {
      return c.json({ ok: false, error: "durationMin must be positive number" }, 400);
    }
    if (active !== undefined && typeof active !== "boolean") {
      return c.json({ ok: false, error: "active must be boolean" }, 400);
    }
    if (sortOrder !== undefined && (typeof sortOrder !== "number" || sortOrder < 0)) {
      return c.json({ ok: false, error: "sortOrder must be non-negative number" }, 400);
    }

    const key = `admin:menu:list:${tenantId}`;
    const value = await kv.get(key);

    const seed = defaultMenu();
    const menu: any[] = value ? JSON.parse(value) : seed;

    // Plan limit check: maxMenus
    const settingsForLimit = await kv.get(`settings:${tenantId}`);
    if (settingsForLimit) {
      const sl = JSON.parse(settingsForLimit);
      const sub = sl.subscription;
      if (sub) {
        const limits = getPlanLimits(sub.planId, isTrialExpired(sub.trialEndsAt) ? 'cancelled' : sub.status);
        if (menu.length >= limits.maxMenus) {
          return c.json({ ok: false, error: 'plan_limit_reached', limit: 'maxMenus', max: limits.maxMenus, current: menu.length }, 403);
        }
      }
    }

    // Phase 6: verticalAttributes のみ write（eyebrow legacy write 停止）
    const verticalAttributes = body?.verticalAttributes && typeof body.verticalAttributes === 'object' ? body.verticalAttributes : undefined;

    // Phase 11: runtime validation of verticalAttributes
    if (verticalAttributes) {
      const settingsRaw = await kv.get(`settings:${tenantId}`);
      const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
      const plugin = getVerticalPlugin(settings.vertical);
      if (plugin.validateMenuAttrs) {
        const result = plugin.validateMenuAttrs(verticalAttributes);
        if (!result.valid) {
          return c.json({
            ok: false,
            error: 'validation_error',
            code: 'INVALID_VERTICAL_ATTRIBUTES',
            field: 'verticalAttributes',
            message: result.error || 'Invalid vertical attributes',
          }, 400);
        }
      }
    }

    // If body contains an existing item id, treat as update (upsert)
    const bodyId: string | undefined = typeof body?.id === 'string' && body.id.trim() ? body.id.trim() : undefined;
    const existingIdx = bodyId ? menu.findIndex((m: any) => m.id === bodyId) : -1;

    if (existingIdx >= 0) {
      // Update existing item (preserve unspecified fields)
      const existing = menu[existingIdx];
      const updated: any = {
        ...existing,
        name: name.trim(),
        price,
        durationMin,
        active: active !== undefined ? active : existing.active,
        sortOrder: sortOrder !== undefined ? sortOrder : existing.sortOrder,
      };
      // Phase 6: verticalAttributes のみ write（eyebrow legacy write 停止）
      if (verticalAttributes !== undefined) updated.verticalAttributes = verticalAttributes;
      // imageKey/imageUrl: optional 画像フィールド
      if (body.imageKey != null) {
        if (body.imageKey) updated.imageKey = String(body.imageKey);
        else delete updated.imageKey;
      }
      if (body.imageUrl != null) {
        if (body.imageUrl) updated.imageUrl = String(body.imageUrl);
        else delete updated.imageUrl;
      }
      // options: menu add-on options
      if (body.options !== undefined) {
        const opts = normalizeMenuOptions(body.options);
        if (opts) updated.options = opts;
        else delete updated.options;
      }
      menu[existingIdx] = updated;
      await kv.put(key, JSON.stringify(menu));
      return c.json({ ok: true, tenantId, data: updated });
    }

    const id = `menu_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newItem: any = {
      id,
      name: name.trim(),
      price,
      durationMin,
      active: active !== undefined ? active : true,
      sortOrder: sortOrder !== undefined ? sortOrder : menu.length,
    };
    // Phase 6: verticalAttributes のみ write（eyebrow legacy write 停止）
    if (verticalAttributes !== undefined) newItem.verticalAttributes = verticalAttributes;
    if (body.imageKey) newItem.imageKey = String(body.imageKey);
    if (body.imageUrl) newItem.imageUrl = String(body.imageUrl);
    // options: menu add-on options
    const newOptions = normalizeMenuOptions(body.options);
    if (newOptions) newItem.options = newOptions;
    menu.push(newItem);
    await kv.put(key, JSON.stringify(menu));

    return c.json({ ok: true, tenantId, data: newItem }, 201);
  } catch (error) {
    return c.json({ ok: false, error: "Failed to create menu", message: String(error) }, 500);
  }
})

/** PATCH /admin/menu/:id — update existing menu item */
app.patch("/admin/menu/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c);
    const itemId = c.req.param("id");
    const kv = (c.env as any).SAAS_FACTORY;
    const body = await c.req.json().catch(() => ({} as any));

    const key = `admin:menu:list:${tenantId}`;
    const raw = await kv.get(key);
    let menu: any[];
    if (raw) {
      menu = JSON.parse(raw);
    } else {
      // KV未保存時はGETと同様にデフォルトメニューで初期化（不一致を防ぐ）
      let vertical = 'generic';
      try {
        const sRaw = await kv.get(`settings:${tenantId}`);
        if (sRaw) vertical = resolveVertical(JSON.parse(sRaw)).vertical;
      } catch {}
      menu = defaultMenu(vertical);
    }
    const idx = menu.findIndex((m: any) => m.id === itemId);
    if (idx < 0) return c.json({ ok: false, error: "menu_item_not_found", tenantId, itemId, menuIds: menu.map((m: any) => m.id) }, 404);

    const existing = menu[idx];
    const updated: any = { ...existing };
    if (body.name !== undefined) updated.name = String(body.name).trim();
    if (body.price !== undefined) updated.price = Number(body.price);
    if (body.durationMin !== undefined) updated.durationMin = Number(body.durationMin);
    if (body.active !== undefined) updated.active = Boolean(body.active);
    if (body.sortOrder !== undefined) updated.sortOrder = Number(body.sortOrder);
    if (body.verticalAttributes !== undefined) {
      if (body.verticalAttributes === null) delete updated.verticalAttributes;
      else updated.verticalAttributes = body.verticalAttributes;
    }
    // Phase 11: runtime validation of verticalAttributes
    if (body.verticalAttributes && body.verticalAttributes !== null) {
      const settingsRaw = await kv.get(`settings:${tenantId}`);
      const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
      const plugin = getVerticalPlugin(settings.vertical);
      if (plugin.validateMenuAttrs) {
        const result = plugin.validateMenuAttrs(body.verticalAttributes);
        if (!result.valid) {
          return c.json({
            ok: false,
            error: 'validation_error',
            code: 'INVALID_VERTICAL_ATTRIBUTES',
            field: 'verticalAttributes',
            message: result.error || 'Invalid vertical attributes',
          }, 400);
        }
      }
    }
    // imageKey/imageUrl: optional 画像フィールド
    if (body.imageKey !== undefined) {
      if (!body.imageKey) delete updated.imageKey;
      else updated.imageKey = String(body.imageKey);
    }
    if (body.imageUrl !== undefined) {
      if (!body.imageUrl) delete updated.imageUrl;
      else updated.imageUrl = String(body.imageUrl);
    }
    // options: menu add-on options
    if (body.options !== undefined) {
      const opts = normalizeMenuOptions(body.options);
      if (opts) updated.options = opts;
      else delete updated.options;
    }
    menu[idx] = updated;
    await kv.put(key, JSON.stringify(menu));

    return c.json({ ok: true, tenantId, data: updated });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to update menu", message: String(error) }, 500);
  }
})
/**
 * --- Staff (multi-tenant, KV) ---
 * key: admin:staff:list:${tenantId}
 */
app.get("/admin/staff", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  // Query-first resolution: booking flow always sends explicit ?tenantId=
  // so URL query must take priority over x-session-tenant-id header.
  const tenantId = c.req.query("tenantId")
    || c.req.header("x-session-tenant-id")
    || c.req.header("x-tenant-id")
    || "default";
  const key = `admin:staff:list:${tenantId}`
  setTenantDebugHeaders(c, tenantId, key)

  const raw = await c.env.SAAS_FACTORY.get(key)
  const data = raw ? JSON.parse(raw) : []

  // normalize: 既存データに nominationFee がない場合 0 を補完
  const normalized = data.map((s: any) => ({
    ...s,
    nominationFee: normalizeNominationFee(s.nominationFee),
  }))

  return c.json({ ok: true, tenantId, data: normalized })
})

app.post("/admin/staff", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c)
  const key = `admin:staff:list:${tenantId}`

  const body = await c.req.json()

  const raw = await c.env.SAAS_FACTORY.get(key)
  const list = raw ? JSON.parse(raw) : []

  // Plan limit check: maxStaff
  const settingsForLimit = await c.env.SAAS_FACTORY.get(`settings:${tenantId}`);
  if (settingsForLimit) {
    const sl = JSON.parse(settingsForLimit);
    const sub = sl.subscription;
    if (sub) {
      const limits = getPlanLimits(sub.planId, isTrialExpired(sub.trialEndsAt) ? 'cancelled' : sub.status);
      if (list.length >= limits.maxStaff) {
        return c.json({ ok: false, error: 'plan_limit_reached', limit: 'maxStaff', max: limits.maxStaff, current: list.length }, 403);
      }
    }
  }

  const id = body?.id || `staff_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const item: any = { ...body, id, nominationFee: normalizeNominationFee(body?.nominationFee) };
  if (body.verticalAttributes) {
    item.verticalAttributes = body.verticalAttributes;
  }

  const next = [item, ...list]
  await c.env.SAAS_FACTORY.put(key, JSON.stringify(next))

  return c.json({ ok: true, tenantId, data: item })
})

/**
 * STAFF_ALL_V3 - force route match via app.all + method switch
 * (fixes PATCH/DELETE not reaching handler)
 */
app.all("/admin/staff/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c)
  const key = `admin:staff:list:${tenantId}`
  const id = c.req.param("id")
  const method = c.req.method

  const raw = await c.env.SAAS_FACTORY.get(key)
  const list = raw ? JSON.parse(raw) : []

  if (method === "PATCH") {
    const body = await c.req.json()
    const idx = list.findIndex((x: any) => x?.id === id)
    if (idx < 0) return c.json({ ok: false, where: "STAFF_ALL_V3", error: "not_found", id, tenantId }, 404)

    const updated = { ...list[idx], ...body, id }
    if (body.nominationFee !== undefined) {
      updated.nominationFee = normalizeNominationFee(body.nominationFee);
    }
    if (body.verticalAttributes !== undefined) {
      if (body.verticalAttributes === null) delete updated.verticalAttributes;
      else updated.verticalAttributes = body.verticalAttributes;
    }
    list[idx] = updated
    await c.env.SAAS_FACTORY.put(key, JSON.stringify(list))
    return c.json({ ok: true, where: "STAFF_ALL_V3", tenantId, data: updated })
  }

  if (method === "DELETE") {
    const next = list.filter((x: any) => x?.id !== id)
    if (next.length === list.length) return c.json({ ok: false, where: "STAFF_ALL_V3", error: "not_found", id, tenantId }, 404)

    await c.env.SAAS_FACTORY.put(key, JSON.stringify(next))
    return c.json({ ok: true, where: "STAFF_ALL_V3", tenantId })
  }

  return c.json({ ok: false, where: "STAFF_ALL_V3", error: "method_not_allowed", method }, 405)
})
/** =========================
 * Settings
 * ========================= */
app.get("/admin/settings", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;

    const vTenant = await kv.get(`settings:${tenantId}`);
    const vDefault = await kv.get("settings:default");

    const tenantObj = vTenant ? JSON.parse(vTenant) : null;
    const defaultObj = vDefault ? JSON.parse(vDefault) : null;

    // ✅ 常に完全形を返す（DEFAULT_SETTINGS ← settings:default ← settings:tenant）
    let merged = deepMerge(safeClone(DEFAULT_SETTINGS), defaultObj);
    merged = deepMerge(merged, tenantObj);

    return c.json({ ok: true, tenantId, data: merged });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to fetch settings", message: String(error) }, 500);
  }
});



// Legacy PUT/PATCH handler removed — use app.patch("/admin/menu/:id") above (with RBAC + options normalization)
app.delete("/admin/menu/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c);
    const id = c.req.param("id");
    const key = `admin:menu:list:${tenantId}`;
    const list = ((await c.env.SAAS_FACTORY.get(key, "json")) as any[]) ?? [];
    const next = list.filter((x) => x && x.id !== id);
    if (next.length === list.length) return c.json({ ok: false, error: "not_found" }, 404);
    await c.env.SAAS_FACTORY.put(key, JSON.stringify(next));
    return c.json({ ok: true, tenantId });
  } catch (e: any) {
    return c.json({ ok: false, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
// NOTE: duplicate PUT /admin/settings removed — the primary handler (earlier in file) handles all fields.


/** =========================
 * Admin Reservations (READ / UPDATE / DELETE)
 * GET  /admin/reservations?tenantId=&date=YYYY-MM-DD
 * PATCH /admin/reservations/:id  { staffId?, name?, phone?, note? }
 * DELETE /admin/reservations/:id  → mark status='cancelled'
 * ========================= */
app.get("/admin/reservations", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  try {
    const tenantId = getTenantId(c);
    const date = c.req.query("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ ok: false, error: "bad_date", hint: "?date=YYYY-MM-DD" }, 400);
    }
    const db = (c.env as any).DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

    // slot_start is stored as ISO with +09:00, e.g. "2026-02-25T06:00:00+09:00"
    const like = `${date}T%`;
    const q = await db
      .prepare(`SELECT id, tenant_id, slot_start, start_at, end_at, duration_minutes,
                       customer_name, customer_phone, staff_id, note, created_at, status, meta
                FROM reservations
                WHERE tenant_id = ? AND slot_start LIKE ? AND ${SQL_ACTIVE_FILTER}
                ORDER BY slot_start ASC`)
      .bind(tenantId, like)
      .all();

    const rows: any[] = (q.results || []);
    const reservations = rows.map((r: any) => {
      // extract date/time from slot_start (already JST: "YYYY-MM-DDTHH:MM:SS+09:00")
      const slotStr = String(r.slot_start || r.start_at || "");
      const dtMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(slotStr);
      const rDate = dtMatch ? dtMatch[1] : date;
      const rTime = dtMatch ? dtMatch[2] : "";

      let meta: any = undefined;
      if (r.meta) {
        try { meta = JSON.parse(r.meta); } catch { meta = undefined; }
      }
      return {
        reservationId: r.id,
        date: rDate,
        time: rTime,
        name: r.customer_name ?? "",
        phone: r.customer_phone ?? undefined,
        staffId: r.staff_id ?? "any",
        note: r.note ?? undefined,
        durationMin: r.duration_minutes ?? 60,
        status: r.status ?? "active",
        createdAt: r.created_at ?? "",
        meta,
      };
    });

    return c.json({ ok: true, tenantId, date, reservations });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to fetch reservations", message: String(error) }, 500);
  }
});

/** =========================
 * GET /admin/reservations/:id?tenantId=
 * Single reservation by ID (used by customer detail view)
 * ========================= */
app.get("/admin/reservations/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  try {
    const tenantId = getTenantId(c);
    const id = c.req.param("id");
    const db = (c.env as any).DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

    const row: any = await db
      .prepare(
        `SELECT id, tenant_id, slot_start, start_at, end_at, duration_minutes,
                customer_name, customer_phone, staff_id, note, created_at, status, meta
         FROM reservations WHERE id = ? AND tenant_id = ?`
      )
      .bind(id, tenantId)
      .first();

    if (!row) return c.json({ ok: false, error: "not_found" }, 404);

    const slotStr = String(row.slot_start || row.start_at || "");
    const dtMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(slotStr);
    let meta: any = undefined;
    if (row.meta) { try { meta = JSON.parse(row.meta); } catch {} }

    return c.json({
      ok: true,
      tenantId,
      reservation: {
        reservationId: row.id,
        date: dtMatch ? dtMatch[1] : "",
        time: dtMatch ? dtMatch[2] : "",
        name: row.customer_name ?? "",
        phone: row.customer_phone ?? undefined,
        staffId: row.staff_id ?? "any",
        note: row.note ?? undefined,
        durationMin: row.duration_minutes ?? 60,
        status: row.status ?? "active",
        createdAt: row.created_at ?? "",
        meta,
      },
    });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

app.on(["PUT", "PATCH"], "/admin/reservations/:id", async (c) => {
  try {
    const mismatch = checkTenantMismatch(c);
    if (mismatch) return mismatch;
    const tenantId = getTenantId(c);
    const id = c.req.param("id");
    const db = (c.env as any).DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

    const body = await c.req.json<{ staffId?: string | null; name?: string; phone?: string | null; note?: string | null; meta?: any }>()
      .catch(() => ({} as any));

    // Build SET clause dynamically (only provided fields)
    const sets: string[] = [];
    const vals: unknown[] = [];
    if ("staffId" in body) { sets.push("staff_id = ?"); vals.push(body.staffId ?? null); }
    if ("name" in body && body.name !== undefined) { sets.push("customer_name = ?"); vals.push(body.name); }
    if ("phone" in body) { sets.push("customer_phone = ?"); vals.push(body.phone ?? null); }
    if ("note" in body) { sets.push("note = ?"); vals.push(body.note ?? null); }
    if ("meta" in body) {
      // meta は JSON マージ: 既存 meta に深くマージして保存
      const existingRow: any = await db.prepare("SELECT meta FROM reservations WHERE id = ? AND tenant_id = ?").bind(id, tenantId).first().catch(() => null);
      let existingMeta: any = {};
      if (existingRow?.meta) { try { existingMeta = JSON.parse(existingRow.meta); } catch {} }
      const mergedMeta = { ...existingMeta, ...(body.meta ?? {}) };
      // consentLog は vertical 非依存なので sub-merge 継続
      if (body.meta?.consentLog && existingMeta.consentLog) {
        mergedMeta.consentLog = { ...existingMeta.consentLog, ...body.meta.consentLog };
      }
      // verticalData sub-merge
      if (body.meta?.verticalData && existingMeta.verticalData) {
        mergedMeta.verticalData = { ...existingMeta.verticalData, ...body.meta.verticalData };
      }
      sets.push("meta = ?"); vals.push(JSON.stringify(mergedMeta));
    }

    if (sets.length === 0) return c.json({ ok: false, error: "no_fields_to_update" }, 400);

    vals.push(id, tenantId);
    await db.prepare(`UPDATE reservations SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`)
      .bind(...vals).run();

    // Return updated row
    const row: any = await db
      .prepare("SELECT * FROM reservations WHERE id = ? AND tenant_id = ?")
      .bind(id, tenantId).first();
    if (!row) return c.json({ ok: false, error: "not_found" }, 404);

    const slotStr = String(row.slot_start || row.start_at || "");
    const dtMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(slotStr);
    let rowMeta: any = undefined;
    if (row.meta) { try { rowMeta = JSON.parse(row.meta); } catch {} }
    return c.json({
      ok: true, tenantId,
      data: {
        reservationId: row.id,
        date: dtMatch ? dtMatch[1] : "",
        time: dtMatch ? dtMatch[2] : "",
        name: row.customer_name ?? "",
        phone: row.customer_phone ?? undefined,
        staffId: row.staff_id ?? "any",
        note: row.note ?? undefined,
        status: row.status ?? "active",
        createdAt: row.created_at ?? "",
        meta: rowMeta,
      },
    });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to update reservation", message: String(error) }, 500);
  }
});

app.delete("/admin/reservations/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c);
    const id = c.req.param("id");
    const db = (c.env as any).DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

    const existing: any = await db
      .prepare("SELECT id, status FROM reservations WHERE id = ? AND tenant_id = ?")
      .bind(id, tenantId).first();
    if (!existing) return c.json({ ok: false, error: "not_found" }, 404);
    if (existing.status === CANCELLED_STATUS) return c.json({ ok: false, error: "already_cancelled" }, 409);

    await db.prepare(`UPDATE reservations SET status = '${CANCELLED_STATUS}' WHERE id = ? AND tenant_id = ?`)
      .bind(id, tenantId).run();

    return c.json({ ok: true, tenantId, id, status: "cancelled" });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to cancel reservation", message: String(error) }, 500);
  }
});

/** =========================
 * Eyebrow KPI
 * GET /admin/kpi?tenantId=&days=90
 * Returns: repeatConversionRate, avgRepeatIntervalDays, staffCounts, totalRevenue
 * ========================= */
app.get("/admin/kpi", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  try {
    const tenantId = getTenantId(c);
    const days = Math.min(Math.max(Number(c.req.query("days") || "90"), 7), 365);
    const db = (c.env as any).DB;
    const kv = (c.env as any).SAAS_FACTORY;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

    // Phase 11: resolve vertical for dynamic KPI axis
    const settingsRaw = await kv.get(`settings:${tenantId}`);
    const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
    const plugin = getVerticalPlugin(settings.vertical);
    const filterKey = plugin.menuFilterConfig?.filterKey || 'styleType';

    // 対象期間
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // 1) 総予約数 / スタッフ別件数
    const staffRes = await db.prepare(
      `SELECT staff_id, COUNT(*) as cnt
       FROM reservations
       WHERE tenant_id = ? AND slot_start >= ? AND ${SQL_ACTIVE_FILTER}
       GROUP BY staff_id`
    ).bind(tenantId, since + 'T').all();
    const staffCounts: Record<string, number> = {};
    let totalReservations = 0;
    for (const r of (staffRes.results || [])) {
      staffCounts[r.staff_id || 'any'] = r.cnt;
      totalReservations += r.cnt;
    }

    // 2) リピート転換率: meta.customerKey でグループ（customerKeyがある予約のみ）
    const custRes = await db.prepare(
      `SELECT json_extract(meta, '$.customerKey') as ckey, COUNT(*) as visits
       FROM reservations
       WHERE tenant_id = ? AND slot_start >= ? AND ${SQL_ACTIVE_FILTER}
         AND json_extract(meta, '$.customerKey') IS NOT NULL
       GROUP BY ckey`
    ).bind(tenantId, since + 'T').all();
    const custRows: any[] = custRes.results || [];
    const totalCustomers = custRows.length;
    const repeatCustomers = custRows.filter((r: any) => r.visits >= 2).length;
    const repeatConversionRate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : null;

    // missingCustomerKeyCount: customerKeyが無い予約数（精度低下の目安）
    const missingRes: any = await db.prepare(
      `SELECT COUNT(*) as cnt FROM reservations
       WHERE tenant_id = ? AND slot_start >= ? AND ${SQL_ACTIVE_FILTER}
         AND (meta IS NULL OR json_extract(meta, '$.customerKey') IS NULL)`
    ).bind(tenantId, since + 'T').first();
    const missingCustomerKeyCount: number = missingRes?.cnt ?? 0;

    // 3) 平均リピート間隔（日）: 同一 customerKey の min/max slot_start の差の平均
    const intervalRes = await db.prepare(
      `SELECT json_extract(meta, '$.customerKey') as ckey,
              MIN(slot_start) as first_visit,
              MAX(slot_start) as last_visit,
              COUNT(*) as visits
       FROM reservations
       WHERE tenant_id = ? AND slot_start >= ? AND ${SQL_ACTIVE_FILTER}
         AND json_extract(meta, '$.customerKey') IS NOT NULL
       GROUP BY ckey
       HAVING visits >= 2`
    ).bind(tenantId, since + 'T').all();
    const intervalRows: any[] = intervalRes.results || [];
    let avgRepeatIntervalDays: number | null = null;
    if (intervalRows.length > 0) {
      let totalDays = 0;
      for (const r of intervalRows) {
        const first = new Date(r.first_visit).getTime();
        const last = new Date(r.last_visit).getTime();
        const diffDays = (last - first) / (1000 * 60 * 60 * 24) / (r.visits - 1);
        totalDays += diffDays;
      }
      avgRepeatIntervalDays = Math.round(totalDays / intervalRows.length);
    }

    // 4) スタイル別内訳（styleBreakdown）
    // Query: per (metaStyleType, customerKey) group — aggregate in JS for flexibility
    // Note: menu_id/menu_name columns do not exist in D1 reservations table
    // Phase 11: dynamic vertical axis based on plugin filterKey
    const breakdownJsonPath = `$.verticalData.${filterKey}`;
    const styleRawRes = await db.prepare(
      `SELECT
         json_extract(meta, '${breakdownJsonPath}') as metaStyleType,
         json_extract(meta, '$.customerKey') as ckey,
         COUNT(*) as visits
       FROM reservations
       WHERE tenant_id = ? AND slot_start >= ? AND ${SQL_ACTIVE_FILTER}
         AND json_extract(meta, '$.customerKey') IS NOT NULL
       GROUP BY metaStyleType, ckey`
    ).bind(tenantId, since + 'T').all();

    // Aggregate by resolved styleType (metaStyleType or 'unknown')
    const styleAgg: Record<string, { reservationsCount: number; customersCount: number; repeatCustomersCount: number }> = {};
    for (const r of ((styleRawRes.results || []) as any[])) {
      const st: string = r.metaStyleType || 'unknown';
      if (!styleAgg[st]) styleAgg[st] = { reservationsCount: 0, customersCount: 0, repeatCustomersCount: 0 };
      styleAgg[st].reservationsCount += r.visits;
      styleAgg[st].customersCount += 1;
      if (r.visits >= 2) styleAgg[st].repeatCustomersCount += 1;
    }
    const styleBreakdown: Record<string, { reservationsCount: number; customersCount: number; repeatCustomersCount: number; repeatConversionRate: number | null }> = {};
    for (const [st, agg] of Object.entries(styleAgg)) {
      styleBreakdown[st] = {
        ...agg,
        repeatConversionRate: agg.customersCount > 0 ? Math.round((agg.repeatCustomersCount / agg.customersCount) * 100) : null,
      };
    }

    // Phase 12: popular menu ranking — top menus by reservation count
    const menuRankRes = await db.prepare(
      `SELECT menu_name, COUNT(*) as cnt
       FROM reservations
       WHERE tenant_id = ? AND slot_start >= ? AND ${SQL_ACTIVE_FILTER}
         AND menu_name IS NOT NULL AND menu_name != ''
       GROUP BY menu_name
       ORDER BY cnt DESC
       LIMIT 10`
    ).bind(tenantId, since + 'T').all();
    const popularMenus: { name: string; count: number; share: number }[] = [];
    const menuRankTotal = (menuRankRes.results || []).reduce((sum: number, r: any) => sum + r.cnt, 0);
    for (const r of (menuRankRes.results || []) as any[]) {
      popularMenus.push({
        name: r.menu_name,
        count: r.cnt,
        share: menuRankTotal > 0 ? Math.round((r.cnt / menuRankTotal) * 100) : 0,
      });
    }

    return c.json({
      ok: true, tenantId, days, since,
      kpi: {
        totalReservations,
        totalCustomers,
        repeatCustomers,
        repeatConversionRate,
        avgRepeatIntervalDays,
        missingCustomerKeyCount,
        staffCounts,
        styleBreakdown,
        breakdownAxis: filterKey,
        popularMenus,
      },
    });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to compute KPI", message: String(error) }, 500);
  }
});

/** =========================
 * Backfill customerKey
 * POST /admin/kpi/backfill-customer-key?tenantId=&days=365&dryRun=1
 * Assigns meta.customerKey to existing reservations that lack it.
 * dryRun=1 → scan only, no writes. dryRun=0 → actually update.
 * Processes up to 200 rows per call (safe for Workers CPU limits).
 * ========================= */
app.post("/admin/kpi/backfill-customer-key", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'owner'); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c);
    const days = Math.min(Math.max(Number(c.req.query("days") || "365"), 1), 730);
    const dryRun = c.req.query("dryRun") !== "0"; // default: dryRun=true
    const db = (c.env as any).DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Fetch reservations missing customerKey (limit 200 per call for safety)
    const rows: any[] = (await db.prepare(
      `SELECT id, line_user_id, customer_phone, meta
       FROM reservations
       WHERE tenant_id = ? AND slot_start >= ?
         AND ${SQL_ACTIVE_FILTER}
         AND (meta IS NULL OR json_extract(meta, '$.customerKey') IS NULL)
       LIMIT 200`
    ).bind(tenantId, since + 'T').all()).results || [];

    let updatedCount = 0;
    let skippedCount = 0;
    const reasons: string[] = [];

    for (const row of rows) {
      const key = buildCustomerKey({ lineUserId: row.line_user_id, phone: row.customer_phone });
      if (!key) {
        skippedCount++;
        continue;
      }

      // Merge customerKey into existing meta
      let existingMeta: Record<string, any> = {};
      if (row.meta) {
        try { existingMeta = JSON.parse(row.meta); } catch { /* ignore */ }
      }
      const newMeta = { ...existingMeta, customerKey: key };

      if (!dryRun) {
        await db.prepare("UPDATE reservations SET meta = ? WHERE id = ? AND tenant_id = ?")
          .bind(JSON.stringify(newMeta), row.id, tenantId)
          .run()
          .catch((e: any) => {
            reasons.push(`id=${row.id} err=${String(e?.message ?? e)}`);
          });
      }
      updatedCount++;
    }

    return c.json({
      ok: true,
      tenantId,
      days,
      since,
      dryRun,
      scanned: rows.length,
      updatedCount,
      skippedCount,
      hasMore: rows.length === 200,
      reasons: reasons.length > 0 ? reasons : undefined,
    });
  } catch (error) {
    return c.json({ ok: false, error: "Backfill failed", message: String(error) }, 500);
  }
});

/** =========================
 * Phase 5b: Vertical Backfill
 * POST /admin/backfill/vertical?tenantId=&dryRun=1&scope=all|settings|menu|staff|reservations&limit=200
 *
 * Populates new-path fields from legacy eyebrow fields:
 *   settings.verticalConfig      ← settings.eyebrow
 *   menu[i].verticalAttributes   ← menu[i].eyebrow
 *   staff[i].verticalAttributes  ← staff[i].eyebrow
 *   meta.verticalData            ← meta.eyebrowDesign
 *
 * dryRun=1 (default): scan only, no writes
 * dryRun=0: apply changes
 * scope=all (default): all 4 layers
 * limit=200: max D1 rows per call (KV has no limit since it's single-key arrays)
 *
 * Safe: idempotent, never overwrites existing new-path data,
 *       never deletes legacy fields, never creates eyebrow data for generic tenants.
 * ========================= */
app.post("/admin/backfill/vertical", async (c) => {
  // @deprecated Phase 8: backfill is complete for all tenants. Kept for emergency re-run only.
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'owner'); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c);
    const dryRun = c.req.query("dryRun") !== "0";
    const scope = c.req.query("scope") || "all";
    const limit = Math.min(Math.max(Number(c.req.query("limit") || "200"), 1), 1000);
    const kv = (c.env as any).SAAS_FACTORY;
    const db = (c.env as any).DB;
    if (!kv) return c.json({ ok: false, error: "KV_not_bound" }, 500);

    const report: Record<string, any> = {
      tenantId,
      dryRun,
      scope,
      timestamp: new Date().toISOString(),
    };
    const errors: string[] = [];

    // ── Settings backfill ──────────────────────────────────────────
    if (scope === "all" || scope === "settings") {
      const settingsKey = `settings:${tenantId}`;
      const raw = await kv.get(settingsKey, "json") as any;
      const sr: any = { scanned: 0, updated: 0, skipped: 0, alreadyMigrated: 0, legacyOnly: 0 };

      if (raw && typeof raw === "object") {
        sr.scanned = 1;
        const hasLegacy = raw.eyebrow && typeof raw.eyebrow === "object" && Object.keys(raw.eyebrow).length > 0;
        const hasNew = raw.verticalConfig && typeof raw.verticalConfig === "object" && Object.keys(raw.verticalConfig).length > 0;

        if (hasLegacy && hasNew) {
          sr.alreadyMigrated = 1;
          sr.skipped = 1;
        } else if (hasLegacy && !hasNew) {
          sr.legacyOnly = 1;
          sr.updated = 1;
          if (!dryRun) {
            const patched = { ...raw, verticalConfig: { ...raw.eyebrow } };
            // Also set vertical if not set (legacy eyebrow tenant)
            if (!patched.vertical) patched.vertical = "eyebrow";
            await kv.put(settingsKey, JSON.stringify(patched));
          }
        } else {
          // No eyebrow data — nothing to backfill
          sr.skipped = 1;
        }
      }
      report.settings = sr;
    }

    // ── Menu backfill ──────────────────────────────────────────────
    if (scope === "all" || scope === "menu") {
      const menuKey = `admin:menu:list:${tenantId}`;
      const menuRaw = await kv.get(menuKey);
      const mr: any = { scanned: 0, updated: 0, skipped: 0, alreadyMigrated: 0, legacyOnly: 0 };

      if (menuRaw) {
        try {
          const items: any[] = JSON.parse(menuRaw);
          mr.scanned = items.length;
          let changed = false;
          for (const item of items) {
            const hasLegacy = item.eyebrow && typeof item.eyebrow === "object" && Object.keys(item.eyebrow).length > 0;
            const hasNew = item.verticalAttributes && typeof item.verticalAttributes === "object";
            if (hasLegacy && hasNew) {
              mr.alreadyMigrated++;
              mr.skipped++;
            } else if (hasLegacy && !hasNew) {
              mr.legacyOnly++;
              mr.updated++;
              if (!dryRun) {
                item.verticalAttributes = { ...item.eyebrow };
                changed = true;
              }
            } else {
              mr.skipped++;
            }
          }
          if (changed && !dryRun) {
            await kv.put(menuKey, JSON.stringify(items));
          }
        } catch (e: any) {
          errors.push(`menu: JSON parse error — ${e?.message ?? e}`);
        }
      }
      report.menu = mr;
    }

    // ── Staff backfill ─────────────────────────────────────────────
    if (scope === "all" || scope === "staff") {
      const staffKey = `admin:staff:list:${tenantId}`;
      const staffRaw = await kv.get(staffKey);
      const str: any = { scanned: 0, updated: 0, skipped: 0, alreadyMigrated: 0, legacyOnly: 0 };

      if (staffRaw) {
        try {
          const items: any[] = JSON.parse(staffRaw);
          str.scanned = items.length;
          let changed = false;
          for (const item of items) {
            const hasLegacy = item.eyebrow && typeof item.eyebrow === "object" && Object.keys(item.eyebrow).length > 0;
            const hasNew = item.verticalAttributes && typeof item.verticalAttributes === "object";
            if (hasLegacy && hasNew) {
              str.alreadyMigrated++;
              str.skipped++;
            } else if (hasLegacy && !hasNew) {
              str.legacyOnly++;
              str.updated++;
              if (!dryRun) {
                item.verticalAttributes = { ...item.eyebrow };
                changed = true;
              }
            } else {
              str.skipped++;
            }
          }
          if (changed && !dryRun) {
            await kv.put(staffKey, JSON.stringify(items));
          }
        } catch (e: any) {
          errors.push(`staff: JSON parse error — ${e?.message ?? e}`);
        }
      }
      report.staff = str;
    }

    // ── ReservationMeta backfill ───────────────────────────────────
    if ((scope === "all" || scope === "reservations") && db) {
      const rr: any = { scanned: 0, updated: 0, skipped: 0, alreadyMigrated: 0, legacyOnly: 0, hasMore: false };

      // Find rows where meta has eyebrowDesign but no verticalData
      const rows: any[] = (await db.prepare(
        `SELECT id, meta
         FROM reservations
         WHERE tenant_id = ?
           AND meta IS NOT NULL
           AND json_extract(meta, '$.eyebrowDesign') IS NOT NULL
         LIMIT ?`
      ).bind(tenantId, limit + 1).all()).results || [];

      if (rows.length > limit) {
        rr.hasMore = true;
        rows.pop(); // remove the extra row used for hasMore detection
      }
      rr.scanned = rows.length;

      for (const row of rows) {
        try {
          const meta = JSON.parse(row.meta);
          const hasLegacy = meta.eyebrowDesign && typeof meta.eyebrowDesign === "object";
          const hasNew = meta.verticalData && typeof meta.verticalData === "object";

          if (hasLegacy && hasNew) {
            rr.alreadyMigrated++;
            rr.skipped++;
          } else if (hasLegacy && !hasNew) {
            rr.legacyOnly++;
            rr.updated++;
            if (!dryRun) {
              const patched = { ...meta, verticalData: { ...meta.eyebrowDesign } };
              await db.prepare("UPDATE reservations SET meta = ? WHERE id = ? AND tenant_id = ?")
                .bind(JSON.stringify(patched), row.id, tenantId)
                .run()
                .catch((e: any) => {
                  errors.push(`reservation id=${row.id} err=${e?.message ?? e}`);
                  rr.updated--; // undo count on failure
                });
            }
          } else {
            rr.skipped++;
          }
        } catch (e: any) {
          errors.push(`reservation id=${row.id} JSON parse error — ${e?.message ?? e}`);
          rr.skipped++;
        }
      }
      report.reservations = rr;
    }

    report.errors = errors.length > 0 ? errors : undefined;
    return c.json({ ok: true, ...report });
  } catch (error) {
    return c.json({ ok: false, error: "Backfill failed", message: String(error) }, 500);
  }
});

/** =========================
 * Phase 5b: Vertical Backfill Status (Readiness Report)
 * GET /admin/backfill/vertical/status?tenantId=
 *
 * Returns new-path coverage metrics for each layer.
 * Used to determine Phase 6 readiness (dual-write removal).
 * ========================= */
app.get("/admin/backfill/vertical/status", async (c) => {
  // @deprecated Phase 8: backfill is complete for all tenants. Kept for emergency re-run only.
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'owner'); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c);
    const kv = (c.env as any).SAAS_FACTORY;
    const db = (c.env as any).DB;
    if (!kv) return c.json({ ok: false, error: "KV_not_bound" }, 500);

    const status: Record<string, any> = { tenantId, timestamp: new Date().toISOString() };

    // ── Settings ───────────────────────────────────────────────────
    const settingsRaw = await kv.get(`settings:${tenantId}`, "json") as any;
    if (settingsRaw && typeof settingsRaw === "object") {
      const hasLegacy = settingsRaw.eyebrow && typeof settingsRaw.eyebrow === "object" && Object.keys(settingsRaw.eyebrow).length > 0;
      const hasNew = settingsRaw.verticalConfig && typeof settingsRaw.verticalConfig === "object" && Object.keys(settingsRaw.verticalConfig).length > 0;
      status.settings = {
        exists: true,
        vertical: settingsRaw.vertical || "generic",
        hasLegacy,
        hasNew,
        migrated: hasNew,
        needsBackfill: hasLegacy && !hasNew,
      };
    } else {
      status.settings = { exists: false, migrated: false, needsBackfill: false };
    }

    // ── Menu ───────────────────────────────────────────────────────
    const menuRaw = await kv.get(`admin:menu:list:${tenantId}`);
    if (menuRaw) {
      try {
        const items: any[] = JSON.parse(menuRaw);
        let total = items.length, legacyOnly = 0, newOnly = 0, both = 0, neither = 0;
        for (const item of items) {
          const hasL = item.eyebrow && typeof item.eyebrow === "object" && Object.keys(item.eyebrow).length > 0;
          const hasN = item.verticalAttributes && typeof item.verticalAttributes === "object";
          if (hasL && hasN) both++;
          else if (hasL && !hasN) legacyOnly++;
          else if (!hasL && hasN) newOnly++;
          else neither++;
        }
        status.menu = { total, legacyOnly, newOnly, both, neither, coverageRate: total > 0 ? Math.round(((both + newOnly) / total) * 100) : 100 };
      } catch { status.menu = { error: "JSON parse failed" }; }
    } else {
      status.menu = { total: 0, coverageRate: 100 };
    }

    // ── Staff ──────────────────────────────────────────────────────
    const staffRaw = await kv.get(`admin:staff:list:${tenantId}`);
    if (staffRaw) {
      try {
        const items: any[] = JSON.parse(staffRaw);
        let total = items.length, legacyOnly = 0, newOnly = 0, both = 0, neither = 0;
        for (const item of items) {
          const hasL = item.eyebrow && typeof item.eyebrow === "object" && Object.keys(item.eyebrow).length > 0;
          const hasN = item.verticalAttributes && typeof item.verticalAttributes === "object";
          if (hasL && hasN) both++;
          else if (hasL && !hasN) legacyOnly++;
          else if (!hasL && hasN) newOnly++;
          else neither++;
        }
        status.staff = { total, legacyOnly, newOnly, both, neither, coverageRate: total > 0 ? Math.round(((both + newOnly) / total) * 100) : 100 };
      } catch { status.staff = { error: "JSON parse failed" }; }
    } else {
      status.staff = { total: 0, coverageRate: 100 };
    }

    // ── Reservations ───────────────────────────────────────────────
    if (db) {
      const totalRow = await db.prepare(
        `SELECT COUNT(*) AS cnt FROM reservations WHERE tenant_id = ? AND meta IS NOT NULL AND json_extract(meta, '$.eyebrowDesign') IS NOT NULL`
      ).bind(tenantId).first() as any;
      const migratedRow = await db.prepare(
        `SELECT COUNT(*) AS cnt FROM reservations WHERE tenant_id = ? AND meta IS NOT NULL AND json_extract(meta, '$.eyebrowDesign') IS NOT NULL AND json_extract(meta, '$.verticalData') IS NOT NULL`
      ).bind(tenantId).first() as any;
      const totalWithLegacy = totalRow?.cnt ?? 0;
      const migrated = migratedRow?.cnt ?? 0;
      const legacyOnly = totalWithLegacy - migrated;
      status.reservations = {
        totalWithLegacy,
        migrated,
        legacyOnly,
        coverageRate: totalWithLegacy > 0 ? Math.round((migrated / totalWithLegacy) * 100) : 100,
      };
    } else {
      status.reservations = { error: "DB_not_bound" };
    }

    // ── Phase 6 Readiness ──────────────────────────────────────────
    const settingsReady = status.settings.migrated || !status.settings.needsBackfill;
    const menuReady = (status.menu.coverageRate ?? 0) === 100;
    const staffReady = (status.staff.coverageRate ?? 0) === 100;
    const reservationsReady = (status.reservations.coverageRate ?? 0) === 100;
    status.phase6Readiness = {
      settingsReady,
      menuReady,
      staffReady,
      reservationsReady,
      allReady: settingsReady && menuReady && staffReady && reservationsReady,
      summary: settingsReady && menuReady && staffReady && reservationsReady
        ? "Phase 6 へ移行可能（dual-write 停止 OK）"
        : "未移行データあり — backfill 実行が必要",
    };

    return c.json({ ok: true, ...status });
  } catch (error) {
    return c.json({ ok: false, error: "Status check failed", message: String(error) }, 500);
  }
});

/** =========================
 * GET /admin/onboarding-status?tenantId=
 * Returns checklist of setup tasks and completion rate.
 * J1: Onboarding progress card data source.
 * ========================= */
app.get("/admin/onboarding-status", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  try {
    const tenantId = getTenantId(c);
    const kv = (c.env as any).SAAS_FACTORY;
    const db = (c.env as any).DB;

    const items: Array<{ key: string; label: string; done: boolean; action: string; detail?: string }> = [];

    // Load settings — Phase 1a: resolve vertical for conditional checks
    let storeName = '';
    let bookingUrl = '';
    let vertical = 'generic';
    let repeatEnabled = false;
    let templateSet = false;
    if (kv) {
      try {
        const raw = await kv.get(`settings:${tenantId}`);
        if (raw) {
          const s = JSON.parse(raw);
          storeName = String(s?.storeName ?? '').trim();
          bookingUrl = String(s?.integrations?.line?.bookingUrl ?? '').trim();
          vertical = resolveVertical(s).vertical;
          const rc = getRepeatConfig(s);
          repeatEnabled = rc.enabled;
          templateSet = rc.template.trim().length > 0 && rc.template !== DEFAULT_REPEAT_TEMPLATE;
        }
      } catch { /* ignore */ }
    }
    if (!bookingUrl) {
      const webBase = String((c.env as any).WEB_BASE ?? '').trim();
      if (webBase) bookingUrl = webBase + '/booking';
    }

    items.push({ key: 'storeName', label: '店舗名設定', done: storeName.length > 0, action: '/admin/settings', detail: storeName || undefined });
    items.push({ key: 'bookingUrl', label: '予約URL設定（LINE連携）', done: bookingUrl.length > 0, action: '/admin/settings' });

    // Menu check
    let menuCount = 0;
    let menuEyebrowCount = 0;
    if (kv) {
      try {
        const menuRaw = await kv.get(`admin:menu:list:${tenantId}`);
        if (menuRaw) {
          const menu: any[] = JSON.parse(menuRaw);
          const active = Array.isArray(menu) ? menu.filter((m: any) => m.active !== false) : [];
          menuCount = active.length;
          menuEyebrowCount = active.filter((m: any) => m.verticalAttributes?.styleType).length;
        }
      } catch { /* ignore */ }
    }
    items.push({ key: 'menu', label: 'メニュー登録（1件以上）', done: menuCount > 0, action: '/admin/menu', detail: menuCount > 0 ? `${menuCount}件` : undefined });

    // Phase 4: vertical 固有チェックは registry 経由で注入
    const verticalChecks = getVerticalPlugin(vertical).getOnboardingChecks({
      menuVerticalCount: menuEyebrowCount,
      repeatEnabled,
      templateSet,
    });
    for (const item of verticalChecks) items.push(item);

    // Staff check
    let staffCount = 0;
    if (kv) {
      try {
        const staffRaw = await kv.get(`admin:staff:list:${tenantId}`);
        if (staffRaw) {
          const staff: any[] = JSON.parse(staffRaw);
          staffCount = Array.isArray(staff) ? staff.filter((s: any) => s.active !== false).length : 0;
        }
      } catch { /* ignore */ }
    }
    items.push({ key: 'staff', label: 'スタッフ登録（1名以上）', done: staffCount > 0, action: '/admin/staff', detail: staffCount > 0 ? `${staffCount}名` : undefined });

    // Phase 13: override vertical checklist items with real data
    // lineSetup: check if LINE Messaging API is configured (channelAccessToken exists)
    let lineConfigured = false;
    let surveyConfigured = false;
    try {
      const settingsRaw = await kv.get(`settings:${tenantId}`);
      if (settingsRaw) {
        const s = JSON.parse(settingsRaw);
        // LINE setup: check channelAccessToken in integrations.line
        lineConfigured = !!(s?.integrations?.line?.channelAccessToken);
        // Survey setup: check surveyEnabled + surveyQuestions length
        const vc = s?.verticalConfig;
        surveyConfigured = !!(vc?.surveyEnabled && Array.isArray(vc?.surveyQuestions) && vc.surveyQuestions.length > 0);
      }
    } catch { /* ignore */ }

    // Patch items: override done for lineSetup, staffSetup, surveySetup
    for (const item of items) {
      if (item.key === 'lineSetup') {
        item.done = lineConfigured;
        if (lineConfigured) item.detail = '連携済み';
      } else if (item.key === 'staffSetup') {
        item.done = staffCount > 0;
        if (staffCount > 0) item.detail = `${staffCount}名登録済み`;
      } else if (item.key === 'surveySetup') {
        item.done = surveyConfigured;
        if (surveyConfigured) item.detail = '設定済み';
      }
    }

    // Test reservation (last 30 days)
    let hasTestReservation = false;
    if (db) {
      try {
        const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const row: any = await db.prepare(
          `SELECT COUNT(*) as cnt FROM reservations WHERE tenant_id = ? AND slot_start >= ? AND ${SQL_ACTIVE_FILTER}`
        ).bind(tenantId, since30).first();
        hasTestReservation = (row?.cnt ?? 0) > 0;
      } catch { /* ignore */ }
    }
    items.push({ key: 'testReservation', label: 'テスト予約（直近30日に1件以上）', done: hasTestReservation, action: '/booking' });

    const completedCount = items.filter(i => i.done).length;
    const completionRate = Math.round((completedCount / items.length) * 100);

    return c.json({ ok: true, tenantId, completedCount, totalCount: items.length, completionRate, items });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to get onboarding status", message: String(error) }, 500);
  }
});

/** =========================
 * GET /admin/repeat-targets?tenantId=&days=28&limit=200&maxPerDay=50&order=oldest&excludeSentWithinDays=7
 * Returns customers whose last visit was >= days ago and have no future reservation.
 * J2: maxPerDay=daily send cap, order=oldest|newest, excludeSentWithinDays=exclude recently sent.
 * Fields: customerKey, lineUserId, lastReservationAt, lastMenuSummary, staffId, styleType, recommendedMessage
 * ========================= */
app.get("/admin/repeat-targets", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  try {
    const tenantId = getTenantId(c);
    const days = Math.min(Math.max(Number(c.req.query("days") || "28"), 7), 365);
    const limit = Math.min(Math.max(Number(c.req.query("limit") || "200"), 1), 500);
    // J2 params
    const maxPerDay = Math.min(Math.max(Number(c.req.query("maxPerDay") || "50"), 1), 500);
    const order: 'oldest' | 'newest' = c.req.query("order") === 'newest' ? 'newest' : 'oldest';
    const excludeSentWithinDays = Math.max(0, Number(c.req.query("excludeSentWithinDays") ?? "7"));
    const db = (c.env as any).DB;
    const kv = (c.env as any).SAAS_FACTORY;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

    // Cutoff: MAX(slot_start) < cutoff means no visit within last `days` days (and no future reservation)
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // P4: Load settings via eyebrow plugin (verticalConfig 優先・eyebrow フォールバック)
    let repeatTemplate = '';
    let intervalDays = 42;
    let storeName = '';
    let bookingUrl = '';
    if (kv) {
      try {
        const settingsRaw = await kv.get(`settings:${tenantId}`);
        if (settingsRaw) {
          const s = JSON.parse(settingsRaw);
          const rc = getRepeatConfig(s);
          repeatTemplate = rc.template;
          intervalDays = rc.intervalDays;
          storeName = String(s?.storeName ?? '').trim();
          bookingUrl = String(s?.integrations?.line?.bookingUrl ?? '').trim();
        }
      } catch { /* ignore */ }
    }
    // Phase 1a: use generic fallback instead of eyebrow-specific template
    if (!repeatTemplate) repeatTemplate = GENERIC_REPEAT_TEMPLATE;
    // Fallback bookingUrl from WEB_BASE env
    if (!bookingUrl) {
      const webBase = String((c.env as any).WEB_BASE ?? (c.env as any).ADMIN_WEB_BASE ?? '').trim();
      if (webBase) bookingUrl = webBase + '/booking';
    }
    const intervalWeeks = Math.round(intervalDays / 7);

    // I2: Load staff map from KV (staffId → staffName)
    const staffMap: Record<string, string> = {};
    if (kv) {
      try {
        const staffRaw = await kv.get(`admin:staff:list:${tenantId}`);
        if (staffRaw) {
          const staffList: Array<{ id: string; name: string }> = JSON.parse(staffRaw);
          for (const st of staffList) {
            if (st?.id && st?.name) staffMap[st.id] = st.name;
          }
        }
      } catch { /* ignore */ }
    }

    // J2: Load exclusion set (customers sent within excludeSentWithinDays) + today's sent count
    const excludeSet = new Set<string>();
    let todaySentCount = 0;
    if (db) {
      if (excludeSentWithinDays > 0) {
        try {
          const excludeSince = new Date(Date.now() - excludeSentWithinDays * 24 * 60 * 60 * 1000).toISOString();
          const exRows: any[] = (await db.prepare(
            `SELECT DISTINCT customer_key FROM message_logs WHERE tenant_id = ? AND type = 'repeat' AND sent_at >= ?`
          ).bind(tenantId, excludeSince).all()).results || [];
          for (const row of exRows) { if (row.customer_key) excludeSet.add(row.customer_key); }
        } catch { /* message_logs might not exist on older DBs */ }
      }
      try {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayRow: any = await db.prepare(
          `SELECT COUNT(*) as cnt FROM message_logs WHERE tenant_id = ? AND type = 'repeat' AND sent_at >= ?`
        ).bind(tenantId, todayStart.toISOString()).first();
        todaySentCount = todayRow?.cnt ?? 0;
      } catch { /* ignore */ }
    }
    const remainingCapacity = Math.max(0, maxPerDay - todaySentCount);

    // Query: get latest reservation per customerKey where MAX(slot_start) < cutoff
    // Note: menu_id/menu_name columns do not exist in D1 reservations table
    // J2: ORDER BY slot_start ASC (oldest) or DESC (newest)
    const orderBy = order === 'newest' ? 'r.slot_start DESC' : 'r.slot_start ASC';
    const rows: any[] = (await db.prepare(
      `SELECT
         r.id,
         json_extract(r.meta, '$.customerKey') as customerKey,
         r.line_user_id,
         r.slot_start as lastReservationAt,
         r.staff_id,
         json_extract(r.meta, '$.verticalData.styleType') as metaStyleType
       FROM reservations r
       INNER JOIN (
         SELECT json_extract(meta, '$.customerKey') as ck, MAX(slot_start) as maxSlot
         FROM reservations
         WHERE tenant_id = ? AND ${SQL_ACTIVE_FILTER}
           AND json_extract(meta, '$.customerKey') IS NOT NULL
         GROUP BY ck
         HAVING maxSlot < ?
       ) latest ON json_extract(r.meta, '$.customerKey') = latest.ck
                AND r.slot_start = latest.maxSlot
       WHERE r.tenant_id = ? AND r.${SQL_ACTIVE_FILTER}
       ORDER BY ${orderBy}
       LIMIT ?`
    ).bind(tenantId, cutoff, tenantId, limit).all()).results || [];

    const targets = rows.map((r: any) => {
      // lineUserId: extract from customerKey (line: prefix) or from column
      let lineUserId: string | null = null;
      if (typeof r.customerKey === 'string' && r.customerKey.startsWith('line:')) {
        lineUserId = r.customerKey.slice(5) || null;
      } else if (r.line_user_id) {
        lineUserId = r.line_user_id;
      }

      const styleType: string | null = r.metaStyleType || null;

      // P4: buildRepeatMessage via eyebrow plugin
      const staffName = (r.staff_id && staffMap[r.staff_id]) ? staffMap[r.staff_id] : '';
      const styleLabel = getStyleLabel(styleType);
      const recommendedMessage = buildRepeatMessage(repeatTemplate, {
        interval: String(intervalWeeks),
        storeName,
        style: styleLabel,
        staff: staffName,
        bookingUrl,
      });

      return {
        customerKey: r.customerKey,
        lineUserId,
        lastReservationAt: r.lastReservationAt,
        lastMenuSummary: null, // menu_name column not in D1 schema
        staffId: r.staff_id || null,
        styleType,
        recommendedMessage,
      };
    });

    // J2: Post-filter excluded customers + apply remainingCapacity cap
    const excludedCount = targets.filter(t => excludeSet.has(t.customerKey)).length;
    const filteredTargets = targets.filter(t => !excludeSet.has(t.customerKey));
    const cappedTargets = filteredTargets.slice(0, remainingCapacity > 0 ? remainingCapacity : filteredTargets.length);

    return c.json({
      ok: true, tenantId, days, cutoff,
      count: cappedTargets.length,
      targets: cappedTargets,
      // J2 meta
      todaySentCount,
      maxPerDay,
      remainingCapacity,
      excludedCount,
      order,
      excludeSentWithinDays,
    });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to get repeat targets", message: String(error) }, 500);
  }
});

/** =========================
 * POST /admin/repeat-send?tenantId=
 * Body: { customerKeys: string[], template?: string, dryRun?: boolean, cooldownDays?: number }
 * Sends LINE push to customerKeys that have a lineUserId.
 * dryRun=true (default) → returns counts/sample without sending.
 * I3: cooldown guard — skips customers sent to within cooldownDays (default 7).
 * I3: logs sends to D1 message_logs on dryRun=false.
 * ========================= */
app.post("/admin/repeat-send", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c);
    const db = (c.env as any).DB;
    const kv = (c.env as any).SAAS_FACTORY;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);
    if (!kv) return c.json({ ok: false, error: "KV_not_bound" }, 500);

    const body = await c.req.json().catch(() => null) as any;
    if (!body || !Array.isArray(body.customerKeys)) {
      return c.json({ ok: false, error: "missing customerKeys array" }, 400);
    }
    const customerKeys: string[] = (body.customerKeys as any[]).filter((k: any) => typeof k === 'string').slice(0, 500);
    const dryRun: boolean = body.dryRun !== false; // default: dryRun=true
    const customTemplate: string | null = typeof body.template === 'string' ? body.template : null;
    // I3: cooldown guard — default 7 days, 0 = disabled
    const cooldownDays: number = Math.max(0, Number(body.cooldownDays ?? 7));

    // Load channelAccessToken + default template from settings
    // Phase 1a: use getRepeatConfig (verticalConfig 優先 → eyebrow フォールバック → GENERIC)
    let channelAccessToken = '';
    let defaultTemplate = GENERIC_REPEAT_TEMPLATE;
    let intervalDays = 42;
    try {
      const raw = await kv.get(`settings:${tenantId}`);
      if (raw) {
        const s = JSON.parse(raw);
        channelAccessToken = String(s?.integrations?.line?.channelAccessToken ?? '').trim();
        const rc = getRepeatConfig(s);
        defaultTemplate = rc.template;
        intervalDays = rc.intervalDays;
      }
    } catch { /* ignore */ }

    const template = customTemplate || defaultTemplate;
    const intervalWeeks = Math.round(intervalDays / 7);
    const message = template.replace('{interval}', String(intervalWeeks));

    // Resolve lineUserId for each customerKey
    const lineUserMap: Record<string, string> = {}; // customerKey → lineUserId
    const nonLineKeys: string[] = [];
    for (const ck of customerKeys) {
      if (ck.startsWith('line:')) {
        const lu = ck.slice(5);
        if (lu) lineUserMap[ck] = lu;
      } else {
        nonLineKeys.push(ck);
      }
    }

    // For non-line: keys, query D1 for their line_user_id
    for (const ck of nonLineKeys) {
      try {
        const row: any = await db.prepare(
          `SELECT line_user_id FROM reservations
           WHERE tenant_id = ? AND json_extract(meta, '$.customerKey') = ? AND line_user_id IS NOT NULL
           ORDER BY slot_start DESC LIMIT 1`
        ).bind(tenantId, ck).first();
        if (row?.line_user_id) lineUserMap[ck] = row.line_user_id;
      } catch { /* ignore */ }
    }

    // I3: Build cooldown exclusion set (customers sent within cooldownDays)
    const cooldownSet = new Set<string>();
    if (cooldownDays > 0 && !dryRun) {
      try {
        const cooldownSince = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000).toISOString();
        const cooldownRows: any[] = (await db.prepare(
          `SELECT DISTINCT customer_key FROM message_logs
           WHERE tenant_id = ? AND type = 'repeat' AND channel = 'line'
             AND sent_at >= ?`
        ).bind(tenantId, cooldownSince).all()).results || [];
        for (const row of cooldownRows) {
          if (row.customer_key) cooldownSet.add(row.customer_key);
        }
      } catch { /* ignore: if message_logs missing, skip cooldown */ }
    }

    let sentCount = 0;
    let skippedCount = 0;
    const samples: Array<{ customerKey: string; lineUserId: string; status?: string }> = [];
    const errors: string[] = [];
    const skippedReasons: Array<{ customerKey: string; reason: string }> = [];

    for (const ck of customerKeys) {
      const lineUserId = lineUserMap[ck];
      if (!lineUserId) {
        skippedCount++;
        skippedReasons.push({ customerKey: ck, reason: 'no_line_user_id' });
        continue;
      }

      if (dryRun) {
        sentCount++;
        if (samples.length < 3) samples.push({ customerKey: ck, lineUserId });
        continue;
      }

      // I3: Cooldown check
      if (cooldownSet.has(ck)) {
        skippedCount++;
        skippedReasons.push({ customerKey: ck, reason: `cooldown_${cooldownDays}d` });
        continue;
      }

      if (!channelAccessToken) {
        skippedCount++;
        skippedReasons.push({ customerKey: ck, reason: 'no_token' });
        errors.push(`no_token:${ck}`);
        continue;
      }

      try {
        const ac = new AbortController();
        const tid = setTimeout(() => ac.abort(), 8000);
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${channelAccessToken}` },
          body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: message }] }),
          signal: ac.signal,
        });
        clearTimeout(tid);
        if (res.ok) {
          sentCount++;
          if (samples.length < 3) samples.push({ customerKey: ck, lineUserId, status: "sent" });
          // I3: Log the send to message_logs
          try {
            const logId = `ml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await db.prepare(
              `INSERT INTO message_logs (id, tenant_id, customer_key, channel, type, sent_at, payload_json)
               VALUES (?, ?, ?, 'line', 'repeat', ?, ?)`
            ).bind(logId, tenantId, ck, new Date().toISOString(), JSON.stringify({ lineUserId, messageLen: message.length })).run();
          } catch { /* ignore log failure */ }
        } else {
          const errText = await res.text().catch(() => '');
          skippedCount++;
          skippedReasons.push({ customerKey: ck, reason: `send_failed_${res.status}` });
          errors.push(`send_failed:${ck}:${res.status}:${errText.slice(0, 100)}`);
        }
      } catch (e: any) {
        skippedCount++;
        skippedReasons.push({ customerKey: ck, reason: 'send_error' });
        errors.push(`send_error:${ck}:${String(e?.message ?? e)}`);
      }
    }

    return c.json({
      ok: true,
      tenantId,
      dryRun,
      cooldownDays: dryRun ? undefined : cooldownDays,
      message: dryRun ? message : undefined,
      sentCount,
      skippedCount,
      total: customerKeys.length,
      samples: samples.length > 0 ? samples : undefined,
      skippedReasons: skippedReasons.length > 0 ? skippedReasons : undefined,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to send repeat messages", message: String(error) }, 500);
  }
});

/** =========================
 * GET /admin/repeat-metrics?tenantId=&days=90&windowDays=14
 * J3: Effect measurement — sent count, converted customers, conversion rate.
 * Uses message_logs (type=repeat) joined with reservations via customerKey.
 * ========================= */
app.get("/admin/repeat-metrics", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  try {
    const tenantId = getTenantId(c);
    const db = (c.env as any).DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

    const days = Math.min(Math.max(Number(c.req.query("days") || "90"), 7), 365);
    const windowDays = Math.min(Math.max(Number(c.req.query("windowDays") || "14"), 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Step 1: Total sent stats from message_logs
    let sentCount = 0;
    let uniqueCustomersSent = 0;
    try {
      const sentRow: any = await db.prepare(
        `SELECT COUNT(*) as sentCount, COUNT(DISTINCT customer_key) as uniqueCustomersSent
         FROM message_logs WHERE tenant_id = ? AND type = 'repeat' AND channel = 'line' AND sent_at >= ?`
      ).bind(tenantId, since).first();
      sentCount = sentRow?.sentCount ?? 0;
      uniqueCustomersSent = sentRow?.uniqueCustomersSent ?? 0;
    } catch { /* message_logs may be empty */ }

    // Step 2: Get first send per customer (for window calculation)
    let sentCustomers: any[] = [];
    try {
      sentCustomers = (await db.prepare(
        `SELECT customer_key, MIN(sent_at) as first_sent_at
         FROM message_logs WHERE tenant_id = ? AND type = 'repeat' AND channel = 'line' AND sent_at >= ?
         GROUP BY customer_key`
      ).bind(tenantId, since).all()).results || [];
    } catch { /* ignore */ }

    // Step 3: Check conversions — reservation after first send within windowDays
    let convertedCustomers = 0;
    let reservationsAfterSend = 0;
    for (const sc of sentCustomers) {
      try {
        const windowEnd = new Date(new Date(sc.first_sent_at).getTime() + windowDays * 24 * 60 * 60 * 1000).toISOString();
        const row: any = await db.prepare(
          `SELECT COUNT(*) as cnt FROM reservations
           WHERE tenant_id = ? AND json_extract(meta, '$.customerKey') = ?
             AND slot_start >= ? AND slot_start <= ? AND ${SQL_ACTIVE_FILTER}`
        ).bind(tenantId, sc.customer_key, sc.first_sent_at, windowEnd).first();
        if ((row?.cnt ?? 0) > 0) {
          convertedCustomers++;
          reservationsAfterSend += row.cnt;
        }
      } catch { /* ignore */ }
    }

    const conversionAfterSendRate = uniqueCustomersSent > 0
      ? Math.round((convertedCustomers / uniqueCustomersSent) * 100)
      : null;

    return c.json({
      ok: true, tenantId, days, windowDays, since,
      metrics: { sentCount, uniqueCustomersSent, reservationsAfterSend, convertedCustomers, conversionAfterSendRate },
    });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to get repeat metrics", message: String(error) }, 500);
  }
});

/** =========================
 * Availability (admin-managed slot status)
 * GET  /admin/availability?tenantId=&date=
 * PUT  /admin/availability  { staffId, date, time, status }
 * KV key: availability:${tenantId}:${staffId}:${date}  = JSON {[time]: 'open'|'half'|'closed'}
 * ========================= */
app.get("/admin/availability", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  try {
    const tenantId = getTenantId(c);
    const date = c.req.query("date") || new Date().toISOString().slice(0, 10);
    const kv = c.env.SAAS_FACTORY;

    const staffRaw = await kv.get(`admin:staff:list:${tenantId}`);
    const staffList: { id: string }[] = staffRaw ? JSON.parse(staffRaw) : [];

    const result: Record<string, Record<string, string>> = {};
    for (const staff of staffList) {
      const key = `availability:${tenantId}:${staff.id}:${date}`;
      const raw = await kv.get(key);
      result[staff.id] = raw ? JSON.parse(raw) : {};
    }

    return c.json({ ok: true, tenantId, date, staff: result });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to fetch availability", message: String(error) }, 500);
  }
});

app.put("/admin/availability", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const body = await c.req.json<{ staffId: string; date: string; time: string; status: string }>();

    if (!body.staffId || !body.date || !body.time || !body.status) {
      return c.json({ ok: false, error: "missing_fields", need: ["staffId", "date", "time", "status"] }, 400);
    }

    const validStatuses = ["open", "half", "closed"];
    if (!validStatuses.includes(body.status)) {
      return c.json({ ok: false, error: "invalid_status", valid: validStatuses }, 400);
    }

    const key = `availability:${tenantId}:${body.staffId}:${body.date}`;
    const raw = await kv.get(key);
    const current: Record<string, string> = raw ? JSON.parse(raw) : {};
    current[body.time] = body.status;
    await kv.put(key, JSON.stringify(current));

    return c.json({ ok: true, tenantId, staffId: body.staffId, date: body.date, time: body.time, status: body.status });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to save availability", message: String(error) }, 500);
  }
});

/** =========================
 * Admin Staff Shift (weekly pattern, KV-backed)
 * GET /admin/staff/:id/shift?tenantId=
 * PUT /admin/staff/:id/shift?tenantId=  body: StaffShift
 * KV key: admin:staff:shift:${tenantId}:${staffId}
 * ========================= */
app.get("/admin/staff/:id/shift", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const staffId = c.req.param("id");
  const kv = (c.env as any).SAAS_FACTORY;
  if (!kv) return c.json({ ok: false, error: "kv_binding_missing" }, 500);
  try {
    const raw = await kv.get(`admin:staff:shift:${tenantId}:${staffId}`);
    const data = raw ? JSON.parse(raw) : { staffId, weekly: [], exceptions: [] };
    return c.json({ ok: true, tenantId, data });
  } catch (e: any) {
    return c.json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});

app.put("/admin/staff/:id/shift", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c, null);
  const staffId = c.req.param("id");
  const kv = (c.env as any).SAAS_FACTORY;
  if (!kv) return c.json({ ok: false, error: "kv_binding_missing" }, 500);
  try {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, error: "bad_json" }, 400);
    await kv.put(`admin:staff:shift:${tenantId}:${staffId}`, JSON.stringify(body));
    return c.json({ ok: true, tenantId, data: body });
  } catch (e: any) {
    return c.json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});

/** =========================
 * Admin Customers
 * GET /admin/customers?tenantId=
 * ========================= */
app.get("/admin/customers", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "ADMIN_CUSTOMERS_V1";
  const tenantId = getTenantId(c, null);
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, stamp: STAMP, error: "DB_not_bound" }, 500);

  try {
    const result = await db
      .prepare(
        `SELECT id, name, phone, visit_count, last_visit_at, created_at
         FROM customers
         WHERE tenant_id = ?
         ORDER BY updated_at DESC
         LIMIT 200`
      )
      .bind(tenantId)
      .all();

    const customers = (result.results || []).map((r: any) => {
      const phone = r.phone ?? null;
      const customerKey = phone ? buildCustomerKey({ phone }) : null;
      return {
        id: r.id,
        name: r.name ?? "",
        phone,
        visitCount: r.visit_count ?? 0,
        lastVisitAt: r.last_visit_at ?? null,
        customerKey,
      };
    });

    return c.json({ ok: true, stamp: STAMP, tenantId, customers });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, error: "Failed to fetch customers", message: String(e?.message ?? e) }, 500);
  }
});

/** =========================
 * GET /admin/customers/:id/reservations?tenantId=
 * Reservation history for a customer (by customer UUID or phone fallback)
 * ========================= */
app.get("/admin/customers/:id/reservations", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "CUSTOMER_RESERVATIONS_V1";
  const tenantId = getTenantId(c, null);
  const customerId = c.req.param("id");
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, stamp: STAMP, error: "DB_not_bound" }, 500);

  try {
    // Get customer phone for secondary lookup
    const cust: any = await db
      .prepare("SELECT phone FROM customers WHERE id = ? AND tenant_id = ? LIMIT 1")
      .bind(customerId, tenantId)
      .first();

    const phone: string | null = cust?.phone ?? null;

    // Query reservations by customer_id OR customer_phone (phone fallback for older rows)
    const result = await db
      .prepare(
        `SELECT id, slot_start, start_at, duration_minutes,
                customer_name, customer_phone, staff_id, note, created_at, status, meta
         FROM reservations
         WHERE tenant_id = ?
           AND ${SQL_ACTIVE_FILTER}
           AND (customer_id = ? OR (? IS NOT NULL AND customer_phone = ?))
         ORDER BY slot_start DESC
         LIMIT 50`
      )
      .bind(tenantId, customerId, phone, phone)
      .all();

    const reservations = (result.results || []).map((r: any) => {
      const slotStr = String(r.slot_start || r.start_at || "");
      const dtMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(slotStr);
      let meta: any = undefined;
      if (r.meta) { try { meta = JSON.parse(r.meta); } catch {} }
      return {
        reservationId: r.id,
        date: dtMatch ? dtMatch[1] : "",
        time: dtMatch ? dtMatch[2] : "",
        name: r.customer_name ?? "",
        phone: r.customer_phone ?? undefined,
        staffId: r.staff_id ?? "any",
        note: r.note ?? undefined,
        durationMin: r.duration_minutes ?? 60,
        status: r.status ?? "active",
        createdAt: r.created_at ?? "",
        meta,
      };
    });

    return c.json({ ok: true, stamp: STAMP, tenantId, customerId, reservations });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

/** =========================
 * Admin Dashboard
 * GET /admin/dashboard?tenantId=&date=YYYY-MM-DD
 * Returns: kpis, schedule (today's reservations), customers (recent)
 * ========================= */
app.get("/admin/dashboard", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "ADMIN_DASHBOARD_V1";
  const tenantId = getTenantId(c, null);
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, stamp: STAMP, error: "DB_not_bound" }, 500);

  // Resolve date: query param → JST today fallback
  let date = (c.req.query("date") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    date = jst.toISOString().slice(0, 10);
  }
  const like = `${date}T%`;

  try {
    const [resResult, cusResult] = await Promise.all([
      db
        .prepare(
          `SELECT id, slot_start, start_at, customer_name, customer_phone, staff_id, duration_minutes
           FROM reservations
           WHERE tenant_id = ? AND slot_start LIKE ? AND ${SQL_ACTIVE_FILTER}
           ORDER BY slot_start ASC`
        )
        .bind(tenantId, like)
        .all(),
      db
        .prepare(
          `SELECT id, name, phone, visit_count, last_visit_at
           FROM customers
           WHERE tenant_id = ?
           ORDER BY updated_at DESC
           LIMIT 50`
        )
        .bind(tenantId)
        .all(),
    ]);

    const rows: any[] = resResult.results || [];
    const reservationsToday = rows.length;

    const schedule = rows.map((r: any) => {
      const slotStr = String(r.slot_start || r.start_at || "");
      const timeMatch = /T(\d{2}:\d{2})/.exec(slotStr);
      return {
        time: timeMatch ? timeMatch[1] : "",
        reservationId: r.id,
        customerName: r.customer_name ?? "",
        customerPhone: r.customer_phone ?? null,
        staffId: r.staff_id ?? "",
        durationMin: r.duration_minutes ?? 60,
      };
    });

    const customers = (cusResult.results || []).map((r: any) => ({
      id: r.id,
      name: r.name ?? "",
      phone: r.phone ?? null,
      visitCount: r.visit_count ?? 0,
      lastVisitAt: r.last_visit_at ?? null,
    }));

    return c.json({
      ok: true,
      stamp: STAMP,
      tenantId,
      date,
      kpis: {
        reservationsToday,
        revenueExpectedToday: 0, // Phase 1: no price in reservations table
      },
      schedule,
      customers,
    });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, error: "dashboard_error", message: String(e?.message ?? e) }, 500);
  }
});

/** =========================
 * Debug: list registered routes
 * ========================= */
app.get("/__debug/routes", (c) => {
  // @ts-ignore
  const routes = (app as any).routes ?? []
  return c.json({ ok:true, count: routes.length, routes })
})
app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));
app.onError((err, c) => {
  console.error(err)
  // debug=1 のときだけ詳細を返す（本番は隠す）
  try {
    const u = new URL(c.req.url)
    if (u.searchParams.get("debug") === "1") {
      const msg = String((err as any)?.message ?? err)
      const stack = String((err as any)?.stack ?? "")
      return c.json({ ok:false, error:"internal_error", message: msg, stack }, 500)
    }
  } catch {}
  return c.json({ ok:false, error:"internal_error" }, 500)
});// ✅ Module Worker entry（Durable Object を使う場合の定番）

// stamp: LINE_RESERVE_NOTIFY_V1_20260225
// Feature-flag: env.LINE_NOTIFY_ON_RESERVE = "1" enables push. Default = "0" (off).
async function notifyLineReservation(opts: {
  kv: any;
  tenantId: string;
  lineUserId: string;
  customerName: string | null;
  startAt: string;
  staffId: string;
  flag: string;
}): Promise<void> {
  const STAMP = "LINE_RESERVE_NOTIFY_V1_20260225";
  if (opts.flag !== "1") {
    console.log(`[${STAMP}] notify.skipped.flagOff tenantId=${opts.tenantId} flag=${opts.flag}`);
    return;
  }
  if (!opts.lineUserId) {
    console.log(`[${STAMP}] notify.skipped.noUserId tenantId=${opts.tenantId}`);
    return;
  }
  if (!opts.kv) {
    console.log(`[${STAMP}] notify.skipped.noKV tenantId=${opts.tenantId}`);
    return;
  }
  try {
    // Read channelAccessToken and storeAddress from KV (inline to avoid function ordering dependency)
    let accessToken = "";
    let storeAddress = "";
    try {
      const raw = await opts.kv.get(`settings:${opts.tenantId}`);
      const s = raw ? JSON.parse(raw) : {};
      accessToken = String(s?.integrations?.line?.channelAccessToken ?? "").trim();
      storeAddress = String(s?.storeAddress ?? "").trim();
    } catch { /* ignore KV read failure */ }
    if (!accessToken) {
      console.log(`[${STAMP}] skip: no channelAccessToken tenantId=${opts.tenantId}`);
      return;
    }
    // Build JST-formatted datetime
    const jst = (iso: string) => {
      try {
        return new Date(iso).toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit",
        });
      } catch { return iso; }
    };
    const nameStr = opts.customerName ? `\nお名前: ${opts.customerName}` : "";
    const addressStr = storeAddress ? `\n📍店舗住所\n${storeAddress}` : "";
    const text = `予約が確定しました✅\n日時: ${jst(opts.startAt)}${nameStr}${addressStr}`;
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 5000);
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + accessToken,
      },
      body: JSON.stringify({ to: opts.lineUserId, messages: [{ type: "text", text }] }),
      signal: ac.signal,
    });
    clearTimeout(tid);
    const bodyText = await res.text().catch(() => "");
    console.log(`[${STAMP}] notify.sent tenantId=${opts.tenantId} userId=${opts.lineUserId} status=${res.status} ok=${res.ok} body=${bodyText.slice(0, 200)}`);
  } catch (e: any) {
    console.log(`[${STAMP}] notify.error tenantId=${opts.tenantId} userId=${opts.lineUserId} err=${String(e?.message ?? e)}`);
  }
}

// ---- CUSTOMER KEY UTILS ----
// Normalize phone: keep digits only (strips +, -, spaces, parens etc.)
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

// Build canonical customerKey for repeat-customer detection.
/** 指名料を安全に正規化する（0以上の整数）*/
function normalizeNominationFee(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

// Priority: line:<lineUserId> > phone:<normalizedPhone> > email:<lowercase>
// Returns null if no stable identifier is available.
function buildCustomerKey(opts: { lineUserId?: string | null; phone?: string | null; email?: string | null }): string | null {
  if (opts.lineUserId && opts.lineUserId.trim()) return `line:${opts.lineUserId.trim()}`;
  if (opts.phone && opts.phone.trim()) {
    const digits = normalizePhone(opts.phone.trim());
    if (digits.length >= 7) return `phone:${digits}`;
  }
  if (opts.email && opts.email.trim()) {
    const e = opts.email.trim().toLowerCase();
    if (e.includes('@')) return `email:${e}`;
  }
  return null;
}

// ---- CUSTOMER UPSERT (CRM) ----
// upsert by (tenant_id, phone) when phone exists, else insert new.
// Best-effort: never throws; returns customerId or null on failure.
async function upsertCustomer(
  db: any,
  opts: { tenantId: string; name: string | null; phone: string | null; visitAt: string }
): Promise<string | null> {
  try {
    const now = new Date().toISOString();
    const visitDate = opts.visitAt.slice(0, 10); // YYYY-MM-DD

    if (opts.phone) {
      const existing: any = await db
        .prepare("SELECT id, visit_count FROM customers WHERE tenant_id = ? AND phone = ? LIMIT 1")
        .bind(opts.tenantId, opts.phone)
        .first();

      if (existing) {
        const newCount = (existing.visit_count || 0) + 1;
        await db
          .prepare(
            "UPDATE customers SET name = COALESCE(?, name), visit_count = ?, last_visit_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?"
          )
          .bind(opts.name, newCount, visitDate, now, existing.id, opts.tenantId)
          .run();
        return existing.id;
      }
    }

    // New customer
    const cid = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO customers (id, tenant_id, name, phone, created_at, updated_at, last_visit_at, visit_count) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
      )
      .bind(cid, opts.tenantId, opts.name, opts.phone, now, now, visitDate)
      .run();
    return cid;
  } catch (e: any) {
    console.error("[CUSTOMER_UPSERT] error:", String(e?.message ?? e));
    return null;
  }
}

  // ---- RESERVE (minimum) ----
  app.post("/reserve", async (c) => {
  const url = new URL(c.req.url)

  const debug = url.searchParams.get("debug") === "1"
  const lockTestMs = Math.max(0, Math.min(10000, Number(url.searchParams.get("lockTestMs") ?? "0") || 0))
  const body = await c.req.json().catch(() => null) as any
  const tenantId = getTenantId(c, body)
  if(!body){ return c.json({ ok:false, error:"bad_json" }, 400) }

  const requestedStaffId = String(body.staffId ?? "")
  let staffId = requestedStaffId
  const startAt = String(body.startAt ?? "")
  const endAt   = String(body.endAt ?? "")
  const customerName = body.customerName ? String(body.customerName) : null
  const lineUserId   = body.lineUserId   ? String(body.lineUserId).trim() : ""

  if(!staffId || !startAt || !endAt){
    return c.json({ ok:false, error:"missing_fields", need:["staffId","startAt","endAt"] }, 400)
  }

  const env = c.env as any
  if(!env.DB) return c.json({ ok:false, error:"DB_not_bound" }, 500)
  if(!env.SLOT_LOCK) return c.json({ ok:false, error:"SLOT_LOCK_not_bound" }, 500)

  // AUTO-ASSIGN: resolve "any" to an actual available staff member.
  // If all active staff are busy, reject — matches /slots bookableForMenu logic.
  let autoAssignInfo: any = null
  if(staffId === "any"){
    try{
      const kv = env.SAAS_FACTORY
      const staffRaw = kv ? await kv.get(`admin:staff:list:${tenantId}`) : null
      const allStaff: any[] = staffRaw ? JSON.parse(staffRaw) : []
      const activeIds = allStaff.filter((s: any) => s.active !== false).map((s: any) => String(s.id))
      if(activeIds.length > 0){
        // Find staff with overlapping reservations (not just exact start_at match)
        const busy = await env.DB.prepare(
          `SELECT DISTINCT staff_id FROM reservations WHERE tenant_id = ? AND start_at < ? AND end_at > ? AND ${SQL_ACTIVE_FILTER}`
        ).bind(tenantId, endAt, startAt).all()
        const busySet = new Set((busy.results || []).map((r: any) => String(r.staff_id)))
        // Count unassigned ('any'/NULL) reservations occupying capacity
        const anyBusyCount = [...busySet].filter(sid => sid === 'any' || sid === 'null' || sid === '').length
        const freeStaff = activeIds.find((sid: string) => !busySet.has(sid))
        autoAssignInfo = { activeIds, busyIds: [...busySet], anyBusyCount, freeStaff: freeStaff || null }
        if(freeStaff){
          staffId = freeStaff
        } else {
          // All active staff are busy — reject (matches /slots full logic)
          return c.json({ ok:false, error:"duration_overlap", reason: "all_staff_busy", tenantId, staffId, startAt, endAt,
            ...(debug ? { _debug: { requestedStaffId, autoAssignInfo } } : {})
          }, 409)
        }
      } else {
        // No active staff configured — treat as single-capacity
        const anyBusy = await env.DB.prepare(
          `SELECT COUNT(*) as cnt FROM reservations WHERE tenant_id = ? AND start_at < ? AND end_at > ? AND ${SQL_ACTIVE_FILTER}`
        ).bind(tenantId, endAt, startAt).first() as any
        const cnt = Number(anyBusy?.cnt ?? 0)
        autoAssignInfo = { activeIds: [], note: "no_active_staff", existingOverlapCount: cnt }
        if(cnt > 0){
          return c.json({ ok:false, error:"duration_overlap", reason: "single_capacity_full", tenantId, staffId, startAt, endAt,
            ...(debug ? { _debug: { requestedStaffId, autoAssignInfo } } : {})
          }, 409)
        }
      }
    }catch(e: any){ autoAssignInfo = { error: String(e?.message ?? e) } }
  }

  // DO instance: tenant + staff + date
  const date = new Date(startAt).toISOString().slice(0, 10) // "YYYY-MM-DD"
    // AUTO-INSERT: ensure (tenantId + ":" + staffId + ":" + date) exists before first use
  const id = env.SLOT_LOCK.idFromName((tenantId + ":" + staffId + ":" + date));
  const stub = env.SLOT_LOCK.get(id);
  const lockKey = startAt + "|" + endAt

  // acquire lock
  const lockRes = await stub.fetch("https://slotlock/lock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: lockKey, ttlSeconds: 30 }),
  })

  if(lockRes.status === 409){
    const j = await lockRes.json().catch(() => ({}))
    return c.json({ ok:false, error:"slot_locked", reason: "lock_conflict", ...j,
      ...(debug ? { _debug: { tenantId, requestedStaffId, resolvedStaffId: staffId, startAt, endAt, date, lockKey, doName: tenantId+":"+staffId+":"+date, autoAssignInfo } } : {})
    }, 409)
  }
  if(!lockRes.ok){
    const t = await lockRes.text().catch(() => "")
    return c.json({ ok:false, error:"lock_failed", status: lockRes.status, detail: t }, 500)
  }

  try {
    // ✅ duration minutes from startAt/endAt (reserve scope only)
    const startMs = Date.parse(startAt)
    const endMs = Date.parse(endAt)
    if(!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs){
      return c.json({ ok:false, error:"bad_time_range", startAt, endAt }, 400)
    }
    const durationMin = Math.round((endMs - startMs) / 60000)
    const rid = crypto.randomUUID()

    // ── Duration-based overlap check (same logic as /slots bookableForMenu) ──
    // Prevents reservations that overlap with existing ones for the same staff,
    // even when the start_at differs (e.g. 60-min menu starting at 06:00
    // overlaps with an existing reservation at 06:45).
    // Also checks unassigned (staff_id='any'/NULL) reservations which consume
    // capacity regardless of assigned staff.
    {
      const overlapRows = await env.DB.prepare(
        `SELECT id, start_at, end_at, staff_id FROM reservations
         WHERE tenant_id = ?
           AND (staff_id = ? OR staff_id = 'any' OR staff_id IS NULL)
           AND start_at < ? AND end_at > ?
           AND ${SQL_ACTIVE_FILTER}
         LIMIT 1`
      ).bind(tenantId, staffId, endAt, startAt).all()
      const conflicts = overlapRows.results || []
      if (conflicts.length > 0) {
        const conflict = conflicts[0] as any
        return c.json({
          ok: false, error: "duration_overlap", reason: "duration_overlap", tenantId, staffId, startAt, endAt,
          conflictWith: { id: conflict.id, startAt: conflict.start_at, endAt: conflict.end_at, staffId: conflict.staff_id },
          ...(debug ? { _debug: { requestedStaffId, resolvedStaffId: staffId, autoAssignInfo } } : {})
        }, 409)
      }
    }

    // Compute followup_at from retention settings (best-effort)
    let followupAt: string | null = null;
    try {
      const kv = (env as any).SAAS_FACTORY;
      if (kv) {
        const ret = await aiGetJson(kv, `ai:retention:${tenantId}`);
        if (ret?.enabled) {
          const delayMin = Number(ret?.followupDelayMin ?? AI_DEFAULT_RETENTION.followupDelayMin) || AI_DEFAULT_RETENTION.followupDelayMin;
          followupAt = new Date(Date.now() + delayMin * 60 * 1000).toISOString();
        }
      }
    } catch { /* retention KV miss is non-fatal */ }

    try {
    await env.DB.prepare(`INSERT INTO reservations (id, tenant_id, slot_start, duration_minutes, customer_name, customer_phone, staff_id, start_at, end_at, line_user_id, followup_at, followup_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      rid,
      tenantId,
      startAt,            // slot_start
      durationMin,        // duration_minutes
      customerName,
      (body.phone ? String(body.phone) : null), // customer_phone (optional)
      staffId,
      startAt,
      endAt,
      lineUserId || null,   // line_user_id
      followupAt,           // followup_at (null if retention disabled)
      followupAt ? "pending" : null  // followup_status
    ).run()
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "")
    // SQLite constraint (unique) => treat as duplicate slot
    if (msg.includes("UNIQUE constraint failed")) {
      return c.json({ ok:false, error:"duplicate_slot", reason: "unique_violation", tenantId, staffId, startAt,
        ...(debug ? { _debug: { requestedStaffId, resolvedStaffId: staffId, endAt, date, lockKey, autoAssignInfo, d1Error: msg } } : {})
      }, 409)
    }
    throw e
  }
  // LINE push notification — best-effort, does NOT affect reservation result
  await notifyLineReservation({
    kv: (env as any).SAAS_FACTORY,
    tenantId, lineUserId, customerName, startAt, staffId,
    flag: String((env as any).LINE_NOTIFY_ON_RESERVE ?? "0").trim(),
  }).catch(() => null);

  // Customer upsert — best-effort, does NOT affect reservation result
  const phone = body.phone ? String(body.phone) : null;
  const customerId = await upsertCustomer(env.DB, { tenantId, name: customerName, phone, visitAt: startAt });
  if (customerId) {
    await env.DB.prepare("UPDATE reservations SET customer_id = ? WHERE id = ? AND tenant_id = ?")
      .bind(customerId, rid, tenantId)
      .run()
      .catch((e: any) => console.error("[RESERVE_CUSTOMER_LINK] error:", String(e?.message ?? e)));
  }

  // customerKey + body.meta マージ
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const customerKey = buildCustomerKey({ lineUserId, phone, email });
  const bodyMeta: Record<string, any> = (body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)) ? body.meta : {};
  const finalMeta = { ...bodyMeta, ...(customerKey ? { customerKey } : {}) };
  if (Object.keys(finalMeta).length > 0) {
    await env.DB.prepare("UPDATE reservations SET meta = ? WHERE id = ? AND tenant_id = ?")
      .bind(JSON.stringify(finalMeta), rid, tenantId)
      .run()
      .catch((e: any) => console.error("[RESERVE_META] error:", String(e?.message ?? e)));
  }

  return c.json({ ok:true, id: rid, tenantId, staffId, startAt, endAt, ...(customerKey ? { customerKey } : {}) })
  } finally {
    // best-effort unlock
    await stub.fetch("https://slotlock/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: (startAt + "|" + endAt) }),
    }).catch(() => null)
    // 🧪 hold the lock for reproduction
    if(lockTestMs > 0) { await sleep(lockTestMs) }
  }
});

  // ---- DEBUG: show derived (tenantId + ":" + staffId + ":" + date)/(startAt + "|" + endAt) without touching /reserve ----
  app.get("/__debug/reserve-keys", async (c) => {
    const url = new URL(c.req.url)
    const tenantId = url.searchParams.get("tenantId") ?? c.req.header("x-tenant-id") ?? "default"
    const staffId  = url.searchParams.get("staffId") ?? ""
    const startAt  = url.searchParams.get("startAt") ?? ""
    const endAt    = url.searchParams.get("endAt") ?? ""

    if(!staffId || !startAt || !endAt){
      return c.json({ ok:false, error:"missing", need:["staffId","startAt","endAt"] }, 400)
    }

    // same logic as /reserve (date normalized)
    const date = new Date(startAt).toISOString().slice(0, 10)
    const doName = `${tenantId}:${staffId}:${date}`;
    const lockKey = `${startAt}|${endAt}`;
    const id = env.SLOT_LOCK.idFromName(doName);
    const stub = env.SLOT_LOCK.get(id);

    return c.json({ ok:true, tenantId, staffId, startAt, endAt, date, doName, lockKey })
  })




export { SlotLock };

// Queue consumer handler (no-op — queue binding exists in dashboard but not actively used)
async function queue(batch: MessageBatch<unknown>): Promise<void> {
  // Intentionally empty — acknowledge all messages to prevent re-delivery
  for (const msg of batch.messages) {
    msg.ack();
  }
}

// ============================================================
// GET /my/reservations — 顧客向け予約一覧（customerKey で照合）
// ============================================================
app.get("/my/reservations", async (c) => {
  const tenantId = getTenantId(c);
  const customerKey = c.req.query("customerKey");
  if (!customerKey || customerKey.trim().length < 4) {
    return c.json({ ok: false, error: "missing_customerKey" }, 400);
  }
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);
  try {
    const q = await db.prepare(
      `SELECT id, slot_start, start_at, end_at, duration_minutes, customer_name, staff_id, status, meta
       FROM reservations
       WHERE tenant_id = ?
         AND json_extract(meta, '$.customerKey') = ?
         AND ${SQL_ACTIVE_FILTER}
       ORDER BY start_at DESC
       LIMIT 20`
    ).bind(tenantId, customerKey.trim()).all();
    const rows: any[] = q.results || [];
    const reservations = rows.map((r: any) => {
      const slotStr = String(r.slot_start || r.start_at || "");
      const dtMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(slotStr);
      let meta: any = undefined;
      if (r.meta) { try { meta = JSON.parse(r.meta); } catch { /* ignore */ } }
      return {
        reservationId: r.id,
        date: dtMatch ? dtMatch[1] : "",
        time: dtMatch ? dtMatch[2] : "",
        name: r.customer_name ?? "",
        staffId: r.staff_id ?? "any",
        durationMin: r.duration_minutes ?? 60,
        status: r.status ?? "active",
        menuName: meta?.menuName ?? undefined,
        surveyAnswers: meta?.surveyAnswers ?? undefined,
      };
    });
    return c.json({ ok: true, tenantId, reservations });
  } catch (e: any) {
    console.error("[MY_RESERVATIONS]", String(e?.message ?? e));
    return c.json({ ok: false, error: "db_error" }, 500);
  }
});

// ── Outreach OS routes ──────────────────────────────────────────────────────
// Mounted at /admin/outreach/* — protected by existing admin auth middleware.
app.route("/admin/outreach", createOutreachRoutes(getTenantId));

// ── Outreach Email Inbound Webhook (public, no admin auth) ─────────────────
// POST /webhooks/email/inbound — receives inbound email from Resend or custom integration.
// Supports two payload formats:
//   1. Resend inbound webhook: { type, created_at, data: { from, to, subject, text, html, ... } }
//   2. Flat format: { from, to, subject, text, html, message_id }
// Looks up lead by sender email (tenant-scoped), routes to existing ingest pipeline.
// Protected by OUTREACH_WEBHOOK_SECRET (always required; 503 if not set, 401 if mismatch).
app.post("/webhooks/email/inbound", async (c) => {
  const db = c.env.DB;
  const kv = c.env.SAAS_FACTORY;
  const _t0 = Date.now();

  // Webhook secret verification (always required — reject if not configured)
  const webhookSecret = (c.env as any).OUTREACH_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error(JSON.stringify({ event: "OUTREACH_INBOUND_RECEIVED", status: "fail", reason: "webhook_secret_not_configured" }));
    return c.json({ ok: false, error: "webhook not configured" }, 503);
  }
  {
    const authHeader = c.req.header("x-webhook-secret") || c.req.header("authorization");
    const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader || "";
    let match = provided.length === webhookSecret.length;
    for (let i = 0; i < webhookSecret.length; i++) {
      match = match && (provided.charCodeAt(i) === webhookSecret.charCodeAt(i));
    }
    if (!match) {
      console.error(JSON.stringify({ event: "OUTREACH_INBOUND_RECEIVED", status: "fail", reason: "auth_mismatch" }));
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }
  }

  let rawBody: any;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid JSON body" }, 400);
  }

  // Normalize payload: support both Resend nested format and flat format
  const payload = rawBody?.data && typeof rawBody.data === "object" && rawBody.data.from
    ? rawBody.data
    : rawBody;

  const fromRaw = payload.from || "";
  const emailMatch = fromRaw.match(/<([^>]+)>/) || [null, fromRaw];
  const fromEmail = (emailMatch[1] || "").trim().toLowerCase();
  const replyText = (payload.text || payload.html || "").slice(0, 10000);
  const subject = payload.subject || "";
  const externalMessageId = payload.message_id || payload.messageId || payload.headers?.["message-id"] || "";
  const fromDomain = fromEmail.split("@")[1] || "";
  const subjectPreview = subject.slice(0, 80);
  const textPreview = replyText.replace(/\s+/g, " ").slice(0, 120);

  // P1: Structured receive log
  console.log(JSON.stringify({
    event: "OUTREACH_INBOUND_RECEIVED",
    fromDomain, subjectPreview, textLen: replyText.length,
    messageId: externalMessageId?.slice(0, 40) || null, authOk: true,
  }));

  if (!fromEmail || !fromEmail.includes("@")) {
    return c.json({ ok: false, error: "valid 'from' email is required" }, 400);
  }
  if (!replyText.trim()) {
    return c.json({ ok: false, error: "reply text (text or html) is required" }, 400);
  }

  // Idempotency
  if (externalMessageId) {
    const existing = await db
      .prepare("SELECT id, tenant_id FROM outreach_replies WHERE message_id = ?1 LIMIT 1")
      .bind(externalMessageId)
      .first<{ id: string; tenant_id: string }>();
    if (existing) {
      console.log(JSON.stringify({ event: "OUTREACH_INBOUND_RECEIVED", status: "skipped", reason: "duplicate", replyId: existing.id }));
      return c.json({ ok: true, skipped: true, reason: "duplicate_message_id", replyId: existing.id });
    }
  }

  // Lead lookup
  const leads = await db
    .prepare("SELECT id, tenant_id FROM sales_leads WHERE LOWER(contact_email) = ?1 ORDER BY updated_at DESC LIMIT 10")
    .bind(fromEmail)
    .all<{ id: string; tenant_id: string }>();

  const matchedLeads = leads.results ?? [];

  if (matchedLeads.length === 0) {
    console.log(JSON.stringify({ event: "OUTREACH_INBOUND_RECEIVED", status: "skipped", reason: "no_matching_lead", fromDomain }));
    return c.json({ ok: true, skipped: true, reason: "no_matching_lead", from: fromEmail });
  }

  const results: Array<{ tenantId: string; leadId: string; replyId: string; autoProcessed: boolean }> = [];
  let autoReplySentForThisEmail = false;

  for (const lead of matchedLeads) {
    const tenantId = lead.tenant_id;
    const leadId = lead.id;

    const replyId = `or_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const ts = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO outreach_replies
         (id, tenant_id, lead_id, campaign_id, message_id, reply_text, reply_source, from_email, subject, status, ai_handled, ai_response_sent, created_at)
         VALUES (?1, ?2, ?3, NULL, ?4, ?5, 'email', ?6, ?7, 'open', 0, 0, ?8)`
      )
      .bind(replyId, tenantId, leadId, externalMessageId || null, replyText, fromEmail, subject, ts)
      .run();

    await db
      .prepare("UPDATE sales_leads SET last_replied_at = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4")
      .bind(ts, ts, leadId, tenantId)
      .run();

    // P2: Classify with structured logging
    const openaiApiKey = (c.env as any).OPENAI_API_KEY;
    let classifyResult: any = null;
    try {
      console.log(JSON.stringify({ event: "OUTREACH_REPLY_CLASSIFY_START", tenantId, replyId, leadId }));
      const { classifyReplyIntent } = await import("./outreach/reply-classifier");
      classifyResult = await classifyReplyIntent(replyText, openaiApiKey);
      await db
        .prepare(
          `UPDATE outreach_replies SET intent = ?1, sentiment = ?2, intent_confidence = ?3 WHERE id = ?4 AND tenant_id = ?5`
        )
        .bind(classifyResult.intent, classifyResult.sentiment, classifyResult.confidence, replyId, tenantId)
        .run();
      console.log(JSON.stringify({
        event: "OUTREACH_REPLY_CLASSIFY_RESULT", tenantId, replyId, leadId,
        intent: classifyResult.intent, sentiment: classifyResult.sentiment,
        confidence: classifyResult.confidence,
      }));
    } catch (clsErr: any) {
      console.error(JSON.stringify({ event: "OUTREACH_REPLY_CLASSIFY_RESULT", tenantId, replyId, status: "fail", reason: clsErr?.message?.slice(0, 100) }));
    }

    // Auto-process with structured logging
    let autoProcessed = false;
    if (autoReplySentForThisEmail) {
      console.log(JSON.stringify({ event: "OUTREACH_AUTO_REPLY_DECISION", tenantId, replyId, decision: "skipped_duplicate_tenant" }));
    } else try {
      const { getAutoReplySettings, processReply } = await import("./outreach/reply-dispatcher");
      const arSettings = await getAutoReplySettings(kv, tenantId);
      console.log(JSON.stringify({ event: "OUTREACH_AUTO_REPLY_DECISION", tenantId, replyId, autoReplyEnabled: arSettings.autoReplyEnabled }));
      if (arSettings.autoReplyEnabled) {
        const uidFn = () => `or_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const nowFn = () => new Date().toISOString();
        const procResult = await processReply(
          { db, kv, tenantId, openaiApiKey, resendApiKey: (c.env as any).RESEND_API_KEY, emailFrom: (c.env as any).EMAIL_FROM, uid: uidFn, now: nowFn },
          {
            id: replyId, tenant_id: tenantId, lead_id: leadId,
            campaign_id: null, message_id: externalMessageId || null,
            reply_text: replyText, reply_source: "email",
            from_email: fromEmail, subject, status: "open" as any,
            sentiment: classifyResult?.sentiment || null,
            intent: classifyResult?.intent || null,
            intent_confidence: classifyResult?.confidence || null,
            ai_handled: 0, ai_response: null, ai_response_sent: 0,
            created_at: ts,
          }
        );
        autoProcessed = true;
        autoReplySentForThisEmail = true;
        console.log(JSON.stringify({
          event: "OUTREACH_AUTO_REPLY_SENT", tenantId, replyId, leadId,
          sent: procResult.sent, intent: procResult.intent,
          closeIntent: procResult.closeIntent || null,
          closeResponseType: procResult.closeResponseType || null,
          skippedReason: procResult.skippedReason || null,
        }));
      }
    } catch (procErr: any) {
      console.error(JSON.stringify({ event: "OUTREACH_AUTO_REPLY_SENT", tenantId, replyId, status: "fail", reason: procErr?.message?.slice(0, 100) }));
    }

    results.push({ tenantId, leadId, replyId, autoProcessed });
  }

  console.log(JSON.stringify({
    event: "OUTREACH_INBOUND_RECEIVED", status: "success",
    matchedLeads: matchedLeads.length, processed: results.length, durationMs: Date.now() - _t0,
  }));
  return c.json({ ok: true, processed: results.length, results });
});

// ── Phase 20: Booking link click tracker (public, no auth) ────────────────
// Usage: /track/click?t={tenantId}&l={leadId}&u={encodedBookingUrl}&c={closeLogId}
// Records a 'clicked' booking event then redirects to the actual booking URL.
app.get("/track/click", async (c) => {
  const tenantId = c.req.query("t") || "";
  const leadId = c.req.query("l") || "";
  const url = c.req.query("u") || "";
  const closeLogId = c.req.query("c") || "";

  if (!tenantId || !leadId || !url) {
    return c.redirect(url || "https://example.com", 302);
  }

  // Record click event (best-effort, don't block redirect)
  try {
    const db = c.env.DB;
    const id = `be_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await db.prepare(
      `INSERT INTO outreach_booking_events
       (id, tenant_id, lead_id, close_log_id, event_type, booking_url, created_at)
       VALUES (?1, ?2, ?3, ?4, 'clicked', ?5, ?6)`
    ).bind(id, tenantId, leadId, closeLogId || null, url, new Date().toISOString()).run();
  } catch (err: any) {
    console.error("[track/click] Error recording click:", err.message);
  }

  return c.redirect(url, 302);
});

// POST /booking-events/booked — Record a booked event (for webhook or manual trigger)
app.post("/booking-events/booked", async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{ tenant_id: string; lead_id: string; close_log_id?: string; variant_key?: string }>();

  if (!body.tenant_id || !body.lead_id) {
    return c.json({ ok: false, error: "tenant_id and lead_id required" }, 400);
  }

  const id = `be_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await db.prepare(
    `INSERT INTO outreach_booking_events
     (id, tenant_id, lead_id, close_log_id, event_type, variant_key, created_at)
     VALUES (?1, ?2, ?3, ?4, 'booked', ?5, ?6)`
  ).bind(id, body.tenant_id, body.lead_id, body.close_log_id || null, body.variant_key || null, new Date().toISOString()).run();

  // Update variant close_count if variant_key provided
  if (body.variant_key) {
    try {
      await db.prepare(
        `UPDATE outreach_close_variants SET close_count = close_count + 1, updated_at = ?1
         WHERE tenant_id = ?2 AND variant_key = ?3`
      ).bind(new Date().toISOString(), body.tenant_id, body.variant_key).run();
    } catch { /* best-effort */ }
  }

  return c.json({ ok: true, data: { id } });
});

export default { fetch: app.fetch, queue, scheduled };

/* === LINE_OAUTH_MIN_ROUTES_V1 ===
   Minimal LINE OAuth routes for production recovery.
   NOTE:
   - This assumes `app` exists in this module scope.
   - If your router is not `app`, rename below accordingly.
   Required env vars (adjust names if needed):
   - LINE_CHANNEL_ID
   - LINE_REDIRECT_URI
*/

app.get("/auth/line/start", async (c) => {
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

app.get("/auth/line/callback", async (c) => {
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

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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

/* === ADMIN_MEMBERS_V1 ===
   GET  /admin/members?tenantId=  → { ok, tenantId, data: AdminMembersStore }
   PUT  /admin/members            → body: { callerLineUserId, members[] }
                                    owner のみ更新可（callerLineUserId で自己検証）
=== */

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

// =============================================================================
// Billing (Stripe Checkout)
// =============================================================================

function getStripe(env: any): Stripe | null {
  const key: string = env.STRIPE_SECRET_KEY ?? '';
  if (!key) return null;
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

app.post('/billing/checkout', async (c) => {
  const env = c.env as any;
  const stripe = getStripe(env);
  if (!stripe) {
    return c.json({ ok: false, error: 'stripe_not_configured' }, 500);
  }

  let body: any = {};
  try { body = await c.req.json(); } catch {}

  const planId: string = String(body.planId ?? '');
  if (planId !== 'starter' && planId !== 'pro') {
    return c.json({ ok: false, error: 'invalid_plan' }, 400);
  }

  const priceId: string = planId === 'starter'
    ? (env.STRIPE_PRICE_STARTER ?? '')
    : (env.STRIPE_PRICE_PRO ?? '');

  if (!priceId) {
    return c.json({ ok: false, error: 'price_not_configured' }, 500);
  }

  const webOrigin: string = (env.WEB_ORIGIN ?? env.WEB_BASE ?? 'https://saas-factory-web-v2.pages.dev')
    .replace(/\/+$/, '');

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { planId },
      success_url: `${webOrigin}/signup?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${webOrigin}/signup?canceled=1`,
    });

    return c.json({ ok: true, url: session.url });
  } catch (err: any) {
    const msg: string = err?.message ?? 'checkout_failed';
    console.error('billing/checkout error:', msg);
    return c.json({ ok: false, error: 'checkout_failed', detail: msg }, 500);
  }
});

app.post('/billing/verify-session', async (c) => {
  const env = c.env as any;
  const stripe = getStripe(env);
  if (!stripe) {
    return c.json({ ok: false, error: 'stripe_not_configured' }, 500);
  }

  let body: any = {};
  try { body = await c.req.json(); } catch {}

  const sessionId: string = String(body.sessionId ?? '');
  if (!sessionId) {
    return c.json({ ok: false, error: 'missing_session_id' }, 400);
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return c.json({ ok: false, error: 'payment_not_completed', paymentStatus: session.payment_status });
    }
    const planId = (session.metadata?.planId ?? 'starter') as PlanId;
    return c.json({
      ok: true,
      planId,
      paymentStatus: session.payment_status,
      customerId: session.customer,
      subscriptionId: session.subscription,
    });
  } catch (err: any) {
    return c.json({ ok: false, error: 'session_not_found', detail: err.message }, 404);
  }
});

app.post('/billing/webhook', async (c) => {
  const env = c.env as any;
  const kv = env.SAAS_FACTORY as KVNamespace;
  const stripe = getStripe(env);
  const whSecret: string = env.STRIPE_WEBHOOK_SECRET ?? '';

  if (!stripe || !whSecret) {
    return c.json({ ok: false, error: 'webhook_not_configured' }, 500);
  }

  // 1. Signature verification
  const rawBody = await c.req.text();
  const sig = c.req.header('Stripe-Signature') ?? '';
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody, sig, whSecret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch {
    return c.json({ ok: false, error: 'signature_invalid' }, 401);
  }

  // 2. Tenant resolution helper
  async function resolveTenant(customerId: string) {
    const tenantId = await kv.get(`stripe:customer:${customerId}`);
    if (!tenantId) return null;
    const raw = await kv.get(`settings:${tenantId}`);
    const settings = raw ? JSON.parse(raw) : null;
    return { tenantId, settings };
  }

  async function saveSubscription(tenantId: string, settings: any, sub: Partial<SubscriptionInfo>) {
    const existing: SubscriptionInfo | undefined = settings?.subscription;
    const updated: SubscriptionInfo = {
      ...existing,
      ...sub,
      createdAt: existing?.createdAt ?? Date.now(),
    } as SubscriptionInfo;
    const merged = { ...(settings ?? {}), subscription: updated };
    await kv.put(`settings:${tenantId}`, JSON.stringify(merged));
  }

  // 3. Event dispatch
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = String(session.customer ?? '');
      const subscriptionId = String(session.subscription ?? '');
      const planId = (session.metadata?.planId ?? '') as PlanId;
      if (customerId) {
        const t = await resolveTenant(customerId);
        if (t) {
          await saveSubscription(t.tenantId, t.settings, {
            planId: planId || t.settings?.subscription?.planId || 'starter',
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId || undefined,
            status: 'active',
          });
        }
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = String(sub.customer ?? '');
      const t = await resolveTenant(customerId);
      if (t) {
        const stripeStatus = sub.status;
        const statusMap: Record<string, SubscriptionInfo['status']> = {
          active: 'active', past_due: 'past_due', canceled: 'cancelled',
          trialing: 'trialing', unpaid: 'past_due', incomplete: 'past_due',
          incomplete_expired: 'cancelled', paused: 'cancelled',
        };
        const planId = (sub.metadata?.planId ?? '') as PlanId;
        await saveSubscription(t.tenantId, t.settings, {
          status: statusMap[stripeStatus] ?? 'active',
          currentPeriodEnd: sub.current_period_end ? sub.current_period_end * 1000 : undefined,
          ...(planId ? { planId } : {}),
          stripeSubscriptionId: sub.id,
        });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = String(sub.customer ?? '');
      const t = await resolveTenant(customerId);
      if (t) {
        await saveSubscription(t.tenantId, t.settings, {
          status: 'cancelled',
          stripeSubscriptionId: sub.id,
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = String(invoice.customer ?? '');
      const t = await resolveTenant(customerId);
      if (t) {
        await saveSubscription(t.tenantId, t.settings, {
          status: 'past_due',
        });
      }
      break;
    }
  }

  return c.json({ ok: true, type: event.type });
});

app.post('/admin/billing/portal-session', async (c) => {
  const env = c.env as any;
  const kv = env.SAAS_FACTORY as KVNamespace;
  const stripe = getStripe(env);
  if (!stripe) {
    return c.json({ ok: false, error: 'stripe_not_configured' }, 500);
  }

  const tenantId = getTenantId(c);
  if (!tenantId || tenantId === 'default') {
    return c.json({ ok: false, error: 'missing_tenant_id' }, 400);
  }

  // Resolve customerId from tenant settings
  const raw = await kv.get(`settings:${tenantId}`);
  if (!raw) {
    return c.json({ ok: false, error: 'tenant_not_found' }, 404);
  }
  const settings = JSON.parse(raw);
  const customerId: string = settings?.subscription?.stripeCustomerId ?? '';
  if (!customerId) {
    return c.json({ ok: false, error: 'no_stripe_customer' }, 400);
  }

  const webOrigin: string = (env.WEB_ORIGIN ?? env.WEB_BASE ?? 'https://saas-factory-web-v2.pages.dev')
    .replace(/\/+$/, '');
  const returnUrl = `${webOrigin}/admin/billing?tenantId=${encodeURIComponent(tenantId)}`;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return c.json({ ok: true, url: session.url });
  } catch (err: any) {
    return c.json({ ok: false, error: 'portal_session_failed', detail: err.message }, 500);
  }
});

// ── Enterprise inquiry ──────────────────────────────────────────────────────
app.post('/billing/enterprise-inquiry', async (c) => {
  const env = c.env as any;
  const kv: KVNamespace = env.SAAS_FACTORY;

  let body: any = {};
  try { body = await c.req.json(); } catch {}

  const { company, name, email, phone, storeCount, vertical, message } = body;
  if (!company || !name || !email || !storeCount || !vertical || !message) {
    return c.json({ ok: false, error: 'missing_required_fields' }, 400);
  }

  // Store inquiry in KV with timestamp for later retrieval
  const inquiryId = `ent_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
  const inquiry = {
    id: inquiryId,
    company, name, email, phone: phone || null,
    storeCount, vertical, message,
    createdAt: new Date().toISOString(),
    status: 'new',
  };

  // Append to inquiry list
  const listKey = 'billing:enterprise:inquiries';
  const existing = await kv.get(listKey);
  const list = existing ? JSON.parse(existing) : [];
  list.unshift(inquiry);
  await kv.put(listKey, JSON.stringify(list.slice(0, 200))); // keep last 200

  // Also store individually for lookup
  await kv.put(`billing:enterprise:${inquiryId}`, JSON.stringify(inquiry), { expirationTtl: 7776000 }); // 90 days

  // TODO: Send notification email via Resend when configured

  return c.json({ ok: true, inquiryId });
});

// ── Support ticket submission ───────────────────────────────────────────────
app.post('/admin/support', async (c) => {
  const env = c.env as any;
  const kv = env.SAAS_FACTORY as KVNamespace;

  let body: any = {};
  try { body = await c.req.json(); } catch {}

  const tenantId = getTenantId(c, body);
  if (!tenantId || tenantId === 'default') {
    return c.json({ ok: false, error: 'missing_tenant_id' }, 400);
  }

  const validCategories = ['bug', 'feature', 'support', 'other'];
  const category = body.category;
  if (!category || !validCategories.includes(category)) {
    return c.json({ ok: false, error: 'invalid_category' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < 3) {
    return c.json({ ok: false, error: 'message_too_short' }, 400);
  }

  // Simple email validation if provided
  const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : '';
  if (contactEmail && !contactEmail.includes('@')) {
    return c.json({ ok: false, error: 'invalid_email' }, 400);
  }

  const validPriorities = ['low', 'medium', 'high'];
  const priority = validPriorities.includes(body.priority) ? body.priority : 'medium';

  const now = new Date();
  const ts = now.getTime();
  const rand = Math.random().toString(36).slice(2, 8);
  const ticketId = `${ts}-${rand}`;

  const ticket = {
    id: ticketId,
    tenantId,
    category,
    subject: typeof body.subject === 'string' ? body.subject.trim() : undefined,
    message,
    priority,
    wantsReply: body.wantsReply === true,
    contactEmail: contactEmail || undefined,
    pageUrl: typeof body.pageUrl === 'string' ? body.pageUrl : undefined,
    userAgent: typeof body.userAgent === 'string' ? body.userAgent.slice(0, 500) : undefined,
    status: 'new',
    source: 'admin_ui',
    createdAt: body.createdAt || now.toISOString(),
  };

  const kvKey = `support:ticket:${tenantId}:${ticketId}`;
  await kv.put(kvKey, JSON.stringify(ticket), { expirationTtl: 60 * 60 * 24 * 365 }); // 1 year TTL

  return c.json({ ok: true, id: ticketId, saved: true });
});

app.get('/admin/members', async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
  const raw = await kv.get(`admin:members:${tenantId}`);
  const store: AdminMembersStore = raw
    ? JSON.parse(raw)
    : { version: 1, members: [] };
  return c.json({ ok: true, tenantId, data: store });
});

app.put('/admin/members', async (c) => {
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
app.put('/admin/members/password', async (c) => {
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
app.get('/admin/members/me', async (c) => {
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

/* === AUTH_PASSWORD_LOGIN_V1 ===
   POST /auth/password/login
   Body: { email, password, tenantId? }
   Authenticates with email+password against admin:members KV.
   Returns identity, tenant, role, and onboarding state for session creation.
   No session/cookie issued here — Pages route handler signs the session.
=== */
app.post('/auth/password/login', async (c) => {
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
/* === /AUTH_PASSWORD_LOGIN_V1 === */

/* === BOOTSTRAP_KEY_V1 ===
   POST /admin/bootstrap-key?tenantId=
   Body: { callerLineUserId? }
   Issues a one-time bootstrap key (SHA-256 stored in KV, plain returned once).
   Caller must be owner (if members exist) or legacy allowlist / brand-new tenant.
=== */

interface AdminBootstrapStore {
  version: 1;
  keyHash: string;
  expiresAt: string;
  createdAt: string;
  usedAt?: string;
  usedBy?: string;
}

app.post('/admin/bootstrap-key', async (c) => {
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

/* === EMAIL_AUTH_V1 ===
   POST /auth/email/start   – generate magic link, send via Resend (or debug=1 returns URL)
   POST /auth/email/verify  – validate token, check RBAC, return identity info
                              (Pages callback signs the session cookie)
   Rate limit: max 3 sends per email per 60s (KV: email:rl:{email})
   D1 auto-init: CREATE TABLE IF NOT EXISTS runs on first call (idempotent, no separate migration needed)
=== */

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

app.post('/auth/email/start', async (c) => {
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
    const VALID_VERTICALS = new Set(['eyebrow', 'nail', 'dental', 'hair', 'esthetic', 'cleaning', 'handyman', 'generic']);
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

app.post('/auth/email/verify', async (c) => {
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
        : resolvedPlanId
          ? {
              planId: resolvedPlanId,
              status: 'active' as const,
              createdAt: Date.now(),
            }
          : undefined;
    // Phase 1a: seed vertical from signup selection
    const seedVertical = si.vertical ?? undefined;
    const seedSettings = mergeSettings(DEFAULT_ADMIN_SETTINGS, {
      storeName: storedName,
      tenant: { name: storedName, email },
      onboarding: { onboardingCompleted: false },
      ...(subscriptionSeed ? { subscription: subscriptionSeed as SubscriptionInfo } : {}),
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

/* === LINE_AUTH_EXCHANGE_V1 ===
   POST /auth/line/exchange
   Exchanges a LINE OAuth code for userId + displayName,
   checks allowedAdminLineUserIds in KV, and self-seeds on first login.
   Body: { code: string; tenantId?: string; redirectUri: string }
   Response: { ok, userId, displayName, allowed, seeded? }
*/
app.post("/auth/line/exchange", async (c) => {
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

/* === LINE_STATUS_ROUTE_V1 ===
   GET /admin/integrations/line/status
   Returns LINE env/connection status for the admin UI.
   Protected by /admin/* middleware (ADMIN_TOKEN).
*/
app.get("/admin/integrations/line/status", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c);
  const env = c.env as any;

  const channelId   = env.LINE_CHANNEL_ID ?? env.LINE_LOGIN_CHANNEL_ID ?? env.LINE_CLIENT_ID ?? "";
  const redirectUri = env.LINE_REDIRECT_URI ?? env.LINE_LOGIN_REDIRECT_URI ?? env.LINE_CALLBACK_URL ?? "";

  const loginReady = !!(channelId && redirectUri);
  const need: string[] = [];
  if (!channelId)   need.push("LINE_CHANNEL_ID");
  if (!redirectUri) need.push("LINE_REDIRECT_URI");

  return c.json({
    ok: true,
    tenantId,
    connected: loginReady,
    loginReady,
    need,
    line_session_present: false,
    stamp: "LINE_STATUS_v1",
    debug: false,
  });
});
/* === /LINE_STATUS_ROUTE_V1 === */

/* =========================================================================
 * LINE Messaging API — KV-backed (no D1 / no CONFIG_ENC_KEY needed)
 * Single source of truth: settings:{tenantId} KV → integrations.line.*
 *
 * GET  /admin/integrations/line/messaging/status  → MessagingStatusResponse
 * POST /admin/integrations/line/messaging/save    → MessagingStatusResponse
 * DELETE /admin/integrations/line/messaging       → MessagingStatusResponse
 * ========================================================================= */

/** Read integrations.line from KV settings */
async function readLineKv(kv: any, tenantId: string): Promise<any> {
  try {
    const raw = await kv.get(`settings:${tenantId}`);
    const s = raw ? JSON.parse(raw) : {};
    return s?.integrations?.line ?? {};
  } catch { return {}; }
}

/** Verify channelAccessToken via LINE Bot API (4-second timeout). Returns bot userId on success. */
async function verifyLineToken(token: string): Promise<{ status: "ok" | "ng"; userId?: string }> {
  try {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 4000);
    const r = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: "Bearer " + token },
      signal: ac.signal,
    });
    clearTimeout(tid);
    if (!r.ok) return { status: "ng" };
    const data = await r.json() as any;
    return { status: "ok", userId: String(data?.userId ?? "").trim() || undefined };
  } catch { return { status: "ng" }; }
}

// ── GET /admin/integrations/line/messaging/status ────────────────────────────
app.get("/admin/integrations/line/messaging/status", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "LINE_MSG_STATUS_V1_20260225";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);

    const line = await readLineKv(kv, tenantId);
    const accessToken = String(line?.channelAccessToken ?? "").trim();
    const secret      = String(line?.channelSecret      ?? "").trim();

    if (!accessToken && !secret) {
      return c.json({
        ok: true, tenantId, stamp: STAMP,
        kind: "unconfigured",
        checks: { token: "ng", webhook: "ng" },
      });
    }

    const tokenCheck = accessToken ? await verifyLineToken(accessToken) : { status: "ng" as const };
    const kind = accessToken && secret
      ? (tokenCheck.status === "ok" ? "linked" : "partial")
      : "partial";

    return c.json({
      ok: true, tenantId, stamp: STAMP, kind,
      checks: { token: tokenCheck.status, webhook: "ng" },
    });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "status_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── POST /admin/integrations/line/messaging/save ────────────────────────────
app.post("/admin/integrations/line/messaging/save", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'owner'); if (rbac) return rbac;
  const STAMP = "LINE_MSG_SAVE_V1_20260225";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);

    const body = await c.req.json().catch(() => ({} as any));
    const channelAccessToken = String(body?.channelAccessToken ?? "").trim();
    const channelSecret      = String(body?.channelSecret      ?? "").trim();
    // UI sends webhookUrl (display field); map to bookingUrl in KV
    const bookingUrl = String(body?.webhookUrl ?? body?.bookingUrl ?? "").trim() || undefined;

    if (!channelAccessToken) return c.json({ ok: false, stamp: STAMP, error: "missing_channelAccessToken" }, 400);
    if (!channelSecret)      return c.json({ ok: false, stamp: STAMP, error: "missing_channelSecret"      }, 400);

    // Read existing → deep-merge integrations.line
    const key = `settings:${tenantId}`;
    let existing: any = {};
    try { const r = await kv.get(key); if (r) existing = JSON.parse(r); } catch {}

    const existingLine = existing?.integrations?.line ?? {};
    const updatedLine: any = {
      ...existingLine,
      connected: true,
      channelAccessToken,
      channelSecret,
      ...(bookingUrl ? { bookingUrl } : {}),
    };
    const next = {
      ...existing,
      integrations: { ...(existing.integrations ?? {}), line: updatedLine },
    };
    await kv.put(key, JSON.stringify(next));

    // Verify token to give accurate status back; capture botUserId (= webhook destination)
    const tokenCheck = await verifyLineToken(channelAccessToken);
    const kind = tokenCheck.status === "ok" ? "linked" : "partial";

    // Write destination-to-tenant mapping + reverse lookup (no TTL = permanent until credentials change)
    let botUserId: string | null = null;
    let destinationMapped = false;
    let previousTenantId: string | null = null;
    if (tokenCheck.status === "ok" && tokenCheck.userId) {
      botUserId = tokenCheck.userId;

      // Clean up old mappings:
      // 1. If this tenant was previously mapped to a different bot, remove old mapping
      const oldBotUserId = await kv.get(`line:tenant2dest:${tenantId}`);
      if (oldBotUserId && oldBotUserId !== botUserId) {
        await kv.delete(`line:destination-to-tenant:${oldBotUserId}`);
      }
      // 2. If this bot was mapped to a different tenant, clean up that tenant's reverse lookup
      const existingMapping = await kv.get(`line:destination-to-tenant:${botUserId}`);
      if (existingMapping && existingMapping !== tenantId) {
        previousTenantId = existingMapping;
        await kv.delete(`line:tenant2dest:${existingMapping}`);
      }

      // Overwrite mapping: last-write-wins (bot belongs to whichever tenant saved last)
      await kv.put(`line:destination-to-tenant:${botUserId}`, tenantId);
      await kv.put(`line:tenant2dest:${tenantId}`, botUserId);
      destinationMapped = true;
    }

    return c.json({
      ok: true, tenantId, stamp: STAMP, kind,
      botUserId, destinationMapped,
      ...(previousTenantId ? { previousTenantId, remapped: true } : {}),
      checks: { token: tokenCheck.status, webhook: "ng" },
    });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "save_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── DELETE /admin/integrations/line/messaging ────────────────────────────────
app.delete("/admin/integrations/line/messaging", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'owner'); if (rbac) return rbac;
  const STAMP = "LINE_MSG_DELETE_V1_20260225";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);

    const key = `settings:${tenantId}`;
    let existing: any = {};
    try { const r = await kv.get(key); if (r) existing = JSON.parse(r); } catch {}

    // Clean up destination-to-tenant mapping before removing credentials
    const existingLine = existing?.integrations?.line ?? {};
    const oldBotUserId = existingLine.userId || null;
    // Try reverse lookup if userId not in settings
    const resolvedBotUserId = oldBotUserId || (await kv.get(`line:tenant2dest:${tenantId}`)) || null;
    if (resolvedBotUserId) {
      await kv.delete(`line:destination-to-tenant:${resolvedBotUserId}`);
      await kv.delete(`line:tenant2dest:${tenantId}`);
    }

    // Remove credential fields but keep metadata (userId, displayName, notify flags etc.)
    const { channelSecret: _s, channelAccessToken: _t, bookingUrl: _b, connected: _c, channelId: _id, ...restLine } =
      existingLine;

    const next = {
      ...existing,
      integrations: {
        ...(existing.integrations ?? {}),
        line: { ...restLine, connected: false },
      },
    };
    await kv.put(key, JSON.stringify(next));

    return c.json({
      ok: true, tenantId, stamp: STAMP,
      kind: "unconfigured",
      cleanedDestination: resolvedBotUserId,
      checks: { token: "ng", webhook: "ng" },
    });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "delete_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── POST /admin/integrations/line/remap ───────────────────────────────────────
// Re-generates destination-to-tenant + tenant2dest KV mappings from existing LINE settings.
// Cleans up stale mappings if botUserId changed. Returns 409 if destination already mapped to another tenant.
app.post("/admin/integrations/line/remap", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'owner'); if (rbac) return rbac;
  const STAMP = "LINE_REMAP_V1_20260305";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);

    // Read existing LINE settings for this tenant
    const key = `settings:${tenantId}`;
    let existing: any = {};
    try { const r = await kv.get(key); if (r) existing = JSON.parse(r); } catch {}

    const lineSettings = existing?.integrations?.line ?? {};
    const token = String(lineSettings.channelAccessToken ?? "").trim();
    if (!token) {
      return c.json({ ok: false, stamp: STAMP, error: "no_token", detail: "channelAccessToken not configured for this tenant" }, 400);
    }

    // Get botUserId from LINE API
    const botCheck = await verifyLineToken(token);
    if (botCheck.status !== "ok" || !botCheck.userId) {
      return c.json({ ok: false, stamp: STAMP, error: "bot_info_failed", detail: "Could not fetch bot info. Check channelAccessToken." }, 400);
    }
    const botUserId = botCheck.userId;

    // Clean up old mappings:
    // 1. If this tenant was previously mapped to a different bot
    let cleanedUpOld = false;
    const oldBotUserId = await kv.get(`line:tenant2dest:${tenantId}`);
    if (oldBotUserId && oldBotUserId !== botUserId) {
      await kv.delete(`line:destination-to-tenant:${oldBotUserId}`);
      cleanedUpOld = true;
    }
    // 2. If this bot was mapped to a different tenant, clean up that tenant's reverse lookup
    const existingMapping = await kv.get(`line:destination-to-tenant:${botUserId}`);
    let previousTenantId: string | null = null;
    if (existingMapping && existingMapping !== tenantId) {
      previousTenantId = existingMapping;
      await kv.delete(`line:tenant2dest:${existingMapping}`);
    }

    // Write new mappings (last-write-wins)
    await kv.put(`line:destination-to-tenant:${botUserId}`, tenantId);
    await kv.put(`line:tenant2dest:${tenantId}`, botUserId);

    return c.json({
      ok: true, stamp: STAMP, tenantId, botUserId,
      destinationMapped: true, cleanedUpOld,
      ...(previousTenantId ? { previousTenantId, remapped: true } : {}),
    });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "remap_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── GET /admin/integrations/line/mapping-status ──────────────────────────────
// Returns current destination mapping status for a tenant (for diagnostic UI).
app.get("/admin/integrations/line/mapping-status", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "LINE_MAPPING_STATUS_V1_20260305";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);

    // Get stored botUserId for this tenant
    const storedBotUserId = await kv.get(`line:tenant2dest:${tenantId}`);

    // If we have a stored botUserId, check the reverse mapping
    let mappedTenantId: string | null = null;
    if (storedBotUserId) {
      mappedTenantId = await kv.get(`line:destination-to-tenant:${storedBotUserId}`);
    }

    // Check if tenant has LINE credentials
    const key = `settings:${tenantId}`;
    let existing: any = {};
    try { const r = await kv.get(key); if (r) existing = JSON.parse(r); } catch {}
    const hasToken = !!String(existing?.integrations?.line?.channelAccessToken ?? "").trim();

    const isCorrect = storedBotUserId && mappedTenantId === tenantId;

    return c.json({
      ok: true, stamp: STAMP, tenantId,
      botUserId: storedBotUserId ?? null,
      mappedTenantId: mappedTenantId ?? null,
      hasToken,
      status: !hasToken ? "no_credentials" : !storedBotUserId ? "no_mapping" : isCorrect ? "ok" : "mismatch",
    });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, error: "status_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── POST /admin/integrations/line/last-webhook ──────────────────────────────
// Saves the most recent webhook receipt log for a tenant (diagnostic).
// KV key: line:last_webhook:{tenantId}  TTL: 7 days
// NOTE: This is admin-protected. Pages webhook uses /internal/line/last-webhook instead.
app.post("/admin/integrations/line/last-webhook", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_missing" }, 500);
    const body = await c.req.json().catch(() => ({} as any));
    const log = body?.log ?? body;
    await kv.put(`line:last_webhook:${tenantId}`, JSON.stringify(log), { expirationTtl: 604800 });
    return c.json({ ok: true });
  } catch { return c.json({ ok: false }, 500); }
});

// ── POST /internal/line/last-webhook ─────────────────────────────────────────
// Internal endpoint for Pages webhook to save receipt logs.
// Protected by shared secret (LINE_INTERNAL_TOKEN) instead of ADMIN_TOKEN.
// This avoids the /admin/* middleware which requires X-Admin-Token.
app.post("/internal/line/last-webhook", async (c) => {
  const env = c.env as any;
  const expected = String(env?.LINE_INTERNAL_TOKEN ?? "").trim();
  const provided = String(c.req.header("x-internal-token") ?? "").trim();
  if (!expected || !provided || provided !== expected) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  const tenantId = (c.req.query("tenantId") ?? "").trim();
  if (!tenantId) return c.json({ ok: false, error: "missing_tenantId" }, 400);
  try {
    const kv = env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_missing" }, 500);
    const body = await c.req.json().catch(() => ({} as any));
    const log = body?.log ?? body;
    await kv.put(`line:last_webhook:${tenantId}`, JSON.stringify(log), { expirationTtl: 604800 });
    return c.json({ ok: true });
  } catch { return c.json({ ok: false }, 500); }
});

// ── POST /internal/line/remap ────────────────────────────────────────────────
// Internal version of /admin/integrations/line/remap — uses LINE_INTERNAL_TOKEN
// instead of owner auth. For use by diagnostics endpoint auto-fix.
app.post("/internal/line/remap", async (c) => {
  const env = c.env as any;
  const expected = String(env?.LINE_INTERNAL_TOKEN ?? "").trim();
  const provided = String(c.req.header("x-internal-token") ?? "").trim();
  if (!expected || !provided || provided !== expected) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  const tenantId = (c.req.query("tenantId") ?? "").trim();
  if (!tenantId) return c.json({ ok: false, error: "missing_tenantId" }, 400);
  try {
    const kv = env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_missing" }, 500);

    const key = `settings:${tenantId}`;
    let existing: any = {};
    try { const r = await kv.get(key); if (r) existing = JSON.parse(r); } catch {}

    const lineSettings = existing?.integrations?.line ?? {};
    const token = String(lineSettings.channelAccessToken ?? "").trim();
    if (!token) return c.json({ ok: false, error: "no_token" }, 400);

    // Get botUserId from LINE API
    const botCheck = await verifyLineToken(token);
    if (botCheck.status !== "ok" || !botCheck.userId) {
      return c.json({ ok: false, error: "missing_user_id", detail: botCheck }, 400);
    }
    const botUserId = botCheck.userId;

    // Clean up old mappings
    const oldBotUserId = await kv.get(`line:tenant2dest:${tenantId}`);
    if (oldBotUserId && oldBotUserId !== botUserId) {
      await kv.delete(`line:destination-to-tenant:${oldBotUserId}`);
    }
    const existingMapping = await kv.get(`line:destination-to-tenant:${botUserId}`);
    if (existingMapping && existingMapping !== tenantId) {
      await kv.delete(`line:tenant2dest:${existingMapping}`);
    }

    // Write new mappings
    await kv.put(`line:destination-to-tenant:${botUserId}`, tenantId);
    await kv.put(`line:tenant2dest:${tenantId}`, botUserId);

    return c.json({ ok: true, tenantId, botUserId, destinationMapped: true });
  } catch (e: any) {
    return c.json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});

// ── POST /internal/line/last-result ──────────────────────────────────────────
// Saves the last webhook processing result (branch, reply status, etc.)
// Protected by shared secret (LINE_INTERNAL_TOKEN).
app.post("/internal/line/last-result", async (c) => {
  const env = c.env as any;
  const expected = String(env?.LINE_INTERNAL_TOKEN ?? "").trim();
  const provided = String(c.req.header("x-internal-token") ?? "").trim();
  if (!expected || !provided || provided !== expected) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  const tenantId = (c.req.query("tenantId") ?? "").trim();
  if (!tenantId) return c.json({ ok: false, error: "missing_tenantId" }, 400);
  try {
    const kv = env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_missing" }, 500);
    const body = await c.req.json().catch(() => ({} as any));
    const result = body?.result ?? body;
    await kv.put(`line:last_result:${tenantId}`, JSON.stringify(result), { expirationTtl: 604800 });
    return c.json({ ok: true });
  } catch { return c.json({ ok: false }, 500); }
});

// ── GET /internal/line/last-result ──────────────────────────────────────────
// Retrieves the last webhook processing result.
// Protected by shared secret (LINE_INTERNAL_TOKEN).
app.get("/internal/line/last-result", async (c) => {
  const env = c.env as any;
  const expected = String(env?.LINE_INTERNAL_TOKEN ?? "").trim();
  const provided = String(c.req.header("x-internal-token") ?? "").trim();
  if (!expected || !provided || provided !== expected) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  const tenantId = (c.req.query("tenantId") ?? "").trim();
  if (!tenantId) return c.json({ ok: false, error: "missing_tenantId" }, 400);
  try {
    const kv = env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_missing" }, 500);
    const raw = await kv.get(`line:last_result:${tenantId}`);
    if (!raw) return c.json({ ok: true, status: "never", result: null });
    return c.json({ ok: true, status: "found", result: JSON.parse(raw) });
  } catch { return c.json({ ok: false }, 500); }
});

// ── POST /internal/line/last-user ────────────────────────────────────────────
// Internal endpoint for Pages webhook to save last-seen LINE userId.
// Protected by shared secret (LINE_INTERNAL_TOKEN) — no RBAC needed.
app.post("/internal/line/last-user", async (c) => {
  const env = c.env as any;
  const expected = String(env?.LINE_INTERNAL_TOKEN ?? "").trim();
  const provided = String(c.req.header("x-internal-token") ?? "").trim();
  if (!expected || !provided || provided !== expected) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  const tenantId = (c.req.query("tenantId") ?? "").trim();
  if (!tenantId) return c.json({ ok: false, error: "missing_tenantId" }, 400);
  try {
    const kv = env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_missing" }, 500);
    const body = await c.req.json().catch(() => ({} as any));
    const userId = String(body?.userId ?? "").trim();
    if (!userId || !userId.startsWith("U")) {
      return c.json({ ok: false, error: "invalid_userId" }, 400);
    }
    await kv.put(`line:lastUser:${tenantId}`, userId, { expirationTtl: 86400 });
    return c.json({ ok: true, tenantId, userId });
  } catch { return c.json({ ok: false }, 500); }
});

// ── POST /internal/sales/lead-reply ──────────────────────────────────────────
// Internal endpoint for Pages webhook to upsert a sales lead from LINE conversation.
// Protected by LINE_INTERNAL_TOKEN (same as other /internal/* endpoints).
// Creates a new lead if none exists for this lineUserId+tenantId, or updates existing.
// Also saves the reply classification to lead_reply_classifications.
app.post("/internal/sales/lead-reply", async (c) => {
  const env = c.env as any;
  const expected = String(env?.LINE_INTERNAL_TOKEN ?? "").trim();
  const provided = String(c.req.header("x-internal-token") ?? "").trim();
  if (!expected || !provided || provided !== expected) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  const db = env?.DB;
  if (!db) return c.json({ ok: false, error: "db_missing" }, 500);

  try {
    const body = await c.req.json().catch(() => ({} as any));
    const tenantId = String(body?.tenantId ?? "").trim();
    const lineUserId = String(body?.lineUserId ?? "").trim();
    const rawReply = String(body?.rawReply ?? "").trim();
    const label = String(body?.label ?? "").trim();
    const displayName = String(body?.displayName ?? "").trim();

    if (!tenantId || !lineUserId) {
      return c.json({ ok: false, error: "tenantId and lineUserId required" }, 400);
    }

    const now = new Date().toISOString();

    // Upsert lead: find existing by lineUserId + tenantId
    let lead = await db.prepare(
      "SELECT id, status FROM sales_leads WHERE tenant_id = ? AND line_user_id = ? LIMIT 1"
    ).bind(tenantId, lineUserId).first() as any;

    let leadId: string;
    let created = false;

    if (!lead) {
      // Phase 1a: resolve industry from tenant settings instead of hardcoding 'eyebrow'
      let industry = 'shared';
      try {
        const kv = (c.env as any).SAAS_FACTORY;
        if (kv) {
          const sr = await kv.get(`settings:${tenantId}`);
          if (sr) { industry = resolveVertical(JSON.parse(sr)).vertical; }
        }
      } catch { /* ignore */ }
      // Create new lead
      leadId = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO sales_leads (id, tenant_id, industry, store_name, line_user_id, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'new', ?, ?, ?)`
      ).bind(
        leadId, tenantId, industry,
        displayName || `LINE:${lineUserId.slice(0, 8)}`,
        lineUserId, null, now, now
      ).run();
      created = true;
    } else {
      leadId = lead.id;
      // Update timestamp
      await db.prepare("UPDATE sales_leads SET updated_at = ? WHERE id = ?").bind(now, leadId).run();
    }

    // Save classification if label provided
    if (label && rawReply) {
      await db.prepare(
        `INSERT INTO lead_reply_classifications (id, lead_id, raw_reply, label, confidence, suggested_next_action, created_at)
         VALUES (?, ?, ?, ?, 1.0, NULL, ?)`
      ).bind(crypto.randomUUID(), leadId, rawReply, label, now).run();

      // Auto-update lead status based on label
      const statusMap: Record<string, string> = {
        interested: "interested",
        demo_request: "meeting",
        pricing_question: "interested",
        info_request: "contacted",
      };
      const newStatus = statusMap[label];
      if (newStatus && (!lead || lead.status === "new")) {
        await db.prepare("UPDATE sales_leads SET status = ?, updated_at = ? WHERE id = ?")
          .bind(newStatus, now, leadId).run();
      }
    }

    return c.json({ ok: true, leadId, created, tenantId, lineUserId: lineUserId.slice(0, 8) + "***" });
  } catch (e: any) {
    console.error("[internal/sales/lead-reply]", String(e?.message ?? e));
    return c.json({ ok: false, error: String(e?.message ?? e).slice(0, 200) }, 500);
  }
});

// ── GET /admin/integrations/line/last-webhook ───────────────────────────────
// Returns the most recent webhook receipt log for diagnostic UI.
app.get("/admin/integrations/line/last-webhook", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_missing" }, 500);
    const raw = await kv.get(`line:last_webhook:${tenantId}`);
    if (!raw) return c.json({ ok: true, status: "never", log: null });
    const log = JSON.parse(raw);
    return c.json({ ok: true, status: "found", log });
  } catch { return c.json({ ok: false }, 500); }
});

// ── GET /line/destination-to-tenant ─────────────────────────────────────────
// Resolves tenantId from a LINE webhook `destination` field (= bot channel userId).
// Called server-side by the Pages webhook handler (not from browser).
app.get("/line/destination-to-tenant", async (c) => {
  const destination = (c.req.query("destination") ?? "").trim();
  if (!destination) return c.json({ ok: false, error: "missing_destination" }, 400);
  const kv = (c.env as any).SAAS_FACTORY;
  if (!kv) return c.json({ ok: false, error: "kv_missing" }, 500);
  const tenantId = await kv.get(`line:destination-to-tenant:${destination}`);
  if (!tenantId) return c.json({ ok: false, error: "not_found" }, 404);
  return c.json({ ok: true, tenantId });
});

// ── POST /admin/integrations/line/last-user ─────────────────────────────────
// Saves the most-recently-seen LINE userId for a tenant (used by /reserve push notify).
// Called best-effort from Pages webhook handler on every message event.
// KV key: line:lastUser:${tenantId}  TTL: 24 h
// stamp: LINE_LAST_USER_V1_20260225
app.post("/admin/integrations/line/last-user", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const STAMP = "LINE_LAST_USER_POST_V1_20260225";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);

    const body = await c.req.json().catch(() => ({} as any));
    const userId = String(body?.userId ?? "").trim();
    if (!userId || !userId.startsWith("U")) {
      return c.json({ ok: false, stamp: STAMP, error: "invalid_userId" }, 400);
    }

    await kv.put(`line:lastUser:${tenantId}`, userId, { expirationTtl: 86400 }); // 24 h TTL
    return c.json({ ok: true, tenantId, stamp: STAMP, userId });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "save_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── GET /admin/integrations/line/last-user ───────────────────────────────────
// Returns the most-recently-saved userId for a tenant (for push notify testing).
app.get("/admin/integrations/line/last-user", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "LINE_LAST_USER_GET_V1_20260225";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);

    const userId = await kv.get(`line:lastUser:${tenantId}`);
    return c.json({ ok: true, tenantId, stamp: STAMP, userId: userId ?? null });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "get_error", detail: String(e?.message ?? e) }, 500);
  }
});

/* === LINE_RICHMENU_V1 === */

// ── Rich menu テンプレート ─────────────────────────────────────────────────
// beauty-default: 4-action layout (2500×1686, 2×2 grid)
// 将来テンプレート追加時は RICH_MENU_TEMPLATES に追加するだけで済む設計。

interface RichMenuTemplate {
  key: string;
  label: string;
  build: (ctx: { origin: string; tenantId: string }) => {
    payload: any;         // LINE create-richmenu JSON body
    imageUrl?: string;    // 画像URL（外部 or R2）
  };
}

function buildTenantBookingUrl(origin: string, tenantId: string): string {
  return `${origin}/booking?tenantId=${encodeURIComponent(tenantId)}`;
}
function buildTenantStoreInfoUrl(origin: string, tenantId: string): string {
  // 将来 /store?tenantId= に差し替え可能
  return `${origin}/booking?tenantId=${encodeURIComponent(tenantId)}#store-info`;
}
function buildTenantReservationsUrl(origin: string, tenantId: string): string {
  return `${origin}/booking/reservations?tenantId=${encodeURIComponent(tenantId)}`;
}
function buildTenantMenuUrl(origin: string, tenantId: string): string {
  // 将来 /menu?tenantId= に差し替え可能
  return `${origin}/booking?tenantId=${encodeURIComponent(tenantId)}#menu`;
}

const RICH_MENU_TEMPLATES: Record<string, RichMenuTemplate> = {
  "beauty-default": {
    key: "beauty-default",
    label: "美容サロン標準",
    build: ({ origin, tenantId }) => ({
      payload: {
        size: { width: 2500, height: 1686 },
        selected: true,
        name: `SaaS Factory Rich Menu [${tenantId}]`,
        chatBarText: "メニューを開く",
        areas: [
          {
            // 左上: 予約する
            bounds: { x: 0, y: 0, width: 1250, height: 843 },
            action: { type: "uri", label: "予約する", uri: buildTenantBookingUrl(origin, tenantId) },
          },
          {
            // 右上: メニュー
            bounds: { x: 1250, y: 0, width: 1250, height: 843 },
            action: { type: "uri", label: "メニュー", uri: buildTenantMenuUrl(origin, tenantId) },
          },
          {
            // 左下: 店舗情報 (postback → webhook が tenant settings を取得してチャット返信)
            bounds: { x: 0, y: 843, width: 1250, height: 843 },
            action: { type: "postback", label: "店舗情報", data: `action=store_info&tenantId=${tenantId}`, displayText: "店舗情報を見る" },
          },
          {
            // 右下: 予約一覧
            bounds: { x: 1250, y: 843, width: 1250, height: 843 },
            action: { type: "uri", label: "予約一覧", uri: buildTenantReservationsUrl(origin, tenantId) },
          },
        ],
      },
    }),
  },
  "beauty-default-v2": {
    key: "beauty-default-v2",
    label: "ミニマル高級感（白黒）",
    build: ({ origin, tenantId }) => ({
      payload: {
        size: { width: 2500, height: 1686 },
        selected: true,
        name: `SaaS Factory Rich Menu v2 [${tenantId}]`,
        chatBarText: "メニューを開く",
        areas: [
          {
            // 左上: 予約する (最重要CTA・黒背景)
            bounds: { x: 0, y: 0, width: 1250, height: 843 },
            action: { type: "uri", label: "予約する", uri: buildTenantBookingUrl(origin, tenantId) },
          },
          {
            // 右上: メニュー
            bounds: { x: 1250, y: 0, width: 1250, height: 843 },
            action: { type: "uri", label: "メニュー", uri: buildTenantMenuUrl(origin, tenantId) },
          },
          {
            // 左下: 予約確認
            bounds: { x: 0, y: 843, width: 1250, height: 843 },
            action: { type: "uri", label: "予約確認", uri: buildTenantReservationsUrl(origin, tenantId) },
          },
          {
            // 右下: 店舗情報
            bounds: { x: 1250, y: 843, width: 1250, height: 843 },
            action: { type: "uri", label: "店舗情報", uri: buildTenantStoreInfoUrl(origin, tenantId) },
          },
        ],
      },
    }),
  },
};

const RICHMENU_KV_PREFIX = "line:richmenu:";
const RICHMENU_IMAGE_VERSION = "v13"; // v13: 文字96px/900・サブ32px/70%白・視認性大幅向上

/** Pre-rendered 2500×1686 rich menu image (4 colored quadrants with icons).
 *  Top-left: Calendar icon (予約する / Blue)
 *  Top-right: Menu icon (メニュー / Green)
 *  Bottom-left: Store icon (店舗情報 / Amber)
 *  Bottom-right: Book icon (予約一覧 / Purple)
 *  To replace: regenerate PNG and update this constant + bump RICHMENU_IMAGE_VERSION. */
const RICHMENU_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAACcQAAAaWCAYAAACZfSwoAAAABmJLR0QA/wD/AP+gvaeTAAAgAElEQVR4nOzdWZNcZZ7f8d9zTmbWXqUdCSFWAQNN00Mv7h5PxFw4wns4wi/MF34pvrAjPBeeCy/jmW7P9AzTC9BszSYkgZaSasnKzHN8UVL3wEAJBFJVPv35EKIQOqj+J5OLE4+++Tzl3/2nnT4AAAAAwANx8ZEmSXLt+/85SfLrrfcOeSIAAAAAqFdz2AMAAAAAAAAAAADAt0EQBwAAAAAAAAAAQBUEcQAAAAAAAAAAAFRBEAcAAAAAAAAAAEAVBHEAAAAAAAAAAABUQRAHAAAAAAAAAABAFQRxAAAAAAAAAAAAVEEQBwAAAAAAAAAAQBUEcQAAAAAAAAAAAFRBEAcAAAAAAAAAAEAVBHEAAAAAAAAAAABUQRAHAAAAAAAAAABAFQRxAAAAAAAAAAAAVEEQBwAAAAAAAAAAQBUEcQAAAAAAAAAAAFRBEAcAAAAAAAAAAEAVBHEAAAAAAAAAAABUQRAHAAAAAAAAAABAFQRxAAAAAAAAAAAAVEEQBwAAAAAAAAAAQBUEcQAAAAAAAAAAAFRBEAcAAAAAAAAAAEAVBHEAAAAAAAAAAABUQRAHAAAAAAAAAABAFQRxAAAAAAAAAAAAVEEQBwAAAAAAAAAAQBUEcQAAAAAAAAAAAFRBEAcAAAAAAAAAAEAVBHEAAAAAAAAAAABUQRAHAAAAAAAAAABAFQRxAAAAAAAAAAAAVEEQBwAAAAAAAAAAQBUEcQAAAAAAAAAAAFRBEAcAAAAAAAAAAEAVBHEAAAAAAAAAAABUQRAHAAAAAAAAAABAFQRxAAAAAAAAAAAAVEEQBwAAAAAAAAAAQBUEcQAAAAAAAAAAAFRh0Pf9Yc8AAAAAANW6u/72+a8AAAAAwLfPDnEAAAAAAAAAAABUYRCfSAUAAACAB+fu+tvnvwIAAAAA3zo7xAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQBUEcAAAAAAAAAAAAVRDEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQBUEcAAAAAAAAAAAAVRDEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQBUEcAAAAAAAAAAAAVRDEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQBUEcAAAAAAAAAAAAVRDEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQBUEcAAAAAAAAAAAAVRDEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQBUEcAAAAAAAAAAAAVRDEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQBUEcAAAAAAAAAAAAVRDEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQBUEcAAAAAAAAAAAAVRDEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQBUEcAAAAAAAAAAAAVRDEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQBUEcAAAAAAAAAAAAVRDEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQBUEcAAAAAAAAAAAAVRDEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQhUHf94c9AwAAAABUbH/97e46nPU4AAAAAHhw7BAHAAAAAAAAAABAFQRxAAAAAAAAAAAAVEEQBwAAAAAAAAAAQBUEcQAAAAAAAAAAAFRBEAcAAAAAAAAAAEAVBHEAAAAAAAAAAABUQRAHAAAAAAAAAABAFQRxAAAAAAAAAAAAVEEQBwAAAAAAAAAAQBUEcQAAAAAAAAAAAFRBEAcAAAAAAAAAAEAVBHEAAAAAAAAAAABUQRAHAAAAAAAAAABAFQZJf9gzAAAAAEDF+s98sRwHAAAAAA+OHeIAAAAAAAAAAACogiAOAAAAAAAAAACAKgjiAAAAAAAAAAAAqIIgDgAAAAAAAAAAgCoI4gAAAAAAAAAAAKiCIA4AAAAAAAAAAIAqCOIAAAAAAAAAAACogiAOAAAAAAAAAACAKgjiAAAAAAAAAAAAqIIgDgAAAAAAAAAAgCoI4gAAAAAAAAAAAKiCIA4AAAAAAAAAAIAqCOIAAAAAAAAAAACogiAOAAAAAAAAAACAKgjiAAAAAAAAAAAAqIIgDgAAAAAAAAAAgCoI4gAAAAAAAAAAAKiCIA4AAAAAAAAAAIAqCOIAAAAAAAAAAACogiAOAAAAAAAAAACAKgjiAAAAAAAAAAAAqIIgDgAAAAAAAAAAgCoI4gAAAAAAAAAAAKiCIA4AAAAAAAAAAIAqCOIAAAAAAAAAAACogiAOAAAAAAAAAACAKgjiAAAAAAAAAAAAqIIgDgAAAAAAAAAAgCoI4gAAAAAAAAAAAKiCIA4AAAAAAAAAAIAqCOIAAAAAAAAAAACogiAOAAAAAAAAAACAKgjiAAAAAAAAAAAAqIIgDgAAAAAAAAAAgCoI4gAAAAAAAAAAAKiCIA4AAAAAAAAAAIAqCOIAAAAAAAAAAACogiAOAAAAAAAAAACAKgjiAAAAAAAAAAAAqIIgDgAAAAAAAAAAgCoI4gAAAAAAAAAAAKiCIA4AAAAAAAAAAIAqCOIAAAAAAAAAAACogiAOAAAAAAAAAACAKgjiAAAAAAAAAAAAqIIgDgAAAAAAAAAAgCoI4gAAAAAAAAAAAKiCIA4AAAAAAAAAAIAqDPq+P+wZAAAAAKBad5ff+vR3fm49DgAAAAAeFDvEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQBUEcAAAAAAAAAAAAVRDEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQBUEcAAAAAAAAAAAAVRDEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEAAAAAAAAAAFAFQRwAAAAAAAAAAABVEMQBAAAAAAAAAABQBUEcAAAAAAAAAAAAVRDEAQAAAAAAAAAAUAVBHAAAAAAAAAAAAFUQxAEA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50yf0ahYcsO94gI2BgzYVAOmGAyEkDgbNrDZbEjPvpu62eRN8u5mf7ubTtiUJaFkCR3TMdXE2DTbuPfei7qmn/77Q7ak0ZxzpmhmNJLvz3XttdEpz/NoZnRZPLrP90tERERERERERERERIMCA3FEREREREREREREREREREREREQ0KDAQR0RERERERERERERERERERERERIMCA3FEREREREREREREREREREREREQ0KDAQR0RERERERERERERERERERERERIMCA3FEREREREREREREREREREREREQ0KDAQR0RERERERERERERERERERERERIMCA3FEREREREREREREREREREREREQ0KDAQR0RERERERERERERERERERERERIMCA3FEREREREREREREREREREREREQ0KDAQR0RERERERERERERERERERERERIMCA3FEREREREREREREREREREREREQ0KDAQR0RERERERERERERERERERERERIMCA3FEREREREREREREREREREREREQ0KDAQR0RERERERERERERERERERERERIMCA3FEREREREREREREREREREREREQ0KDAQR0RERERERERERERERERERERERIMCA3FEREREREREREREREREREREREQ0KDAQR0RERERERERERERERERERERERIMCA3FEREREREREREREREREREREREQ0KDAQR0RERERERERERERERERERERERIMCA3FEREREREREREREREREREREREQ0KLhM0+zvNRAREREREREREQ1ep/bfzF7/n4iIiIiIiIiIiIrPxf03IiKiM5tn5KUAAFOJwlA6YCpRmGoMpi7399KIiIiIiAaFzP03bsgRERHRwOcLipCTBkyjtPOE6yQYholYe4knIiIiIqJBw9XfCyAiIqL+Fbrg2/AMvzjjuGkoMJUoUvtfRmTlN/tlbYWqXvBbmHIH1Jat0Fq2QG3ZChhqWeYOnf8tuBtmw0i1wZDbYMptMFKtMFKtUJvWQ48ezrhHCo6Eb8JipPa/BD12pOhrcg+7EP6Jt8HUkjCUCKCnoCebYSQaYaSaoHfsL1kAsm7R0zB1BaaWgKF0wEg0wUg1w4gfh9a+B1rbzpLM2xdSeDz8U5d0BkOVGEw9BSPZBD129NRr1tLfSyQiIiIiIiIi6neX3hbElPO92PROCpve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";
/** Pre-rendered 2500×1686 rich menu v2 image (ミニマル高級感・白黒ベース).
 *  Top-left: Calendar icon (予約する / Black BG — primary CTA)
 *  Top-right: Menu list icon (メニュー / White BG)
 *  Bottom-left: Clipboard icon (予約確認 / White BG)
 *  Bottom-right: Location pin icon (店舗情報 / Off-white BG) */
const RICHMENU_IMAGE_V2_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCAaWCcQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD50ooorsMAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAuW1spUO4znoKsgAdAB9KAMAD0paokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAnWopbZJAcAK3qKmopAZRBBIPUUlS3IxO9RVJQUUUUAT20AlJZvuj9auqioMKoH0FR2gxAvvmpqpEsKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUx4UkHzKPr3p9FAGZNGYnKn8DTKtXw5Q/WqtQykFFFFABRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/AKhfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRT4oXlOFH1PpVyK0jTlvmPv0oKjBspLG7/dUn6CpBaTH+HH1NaHSig1VJdTPNnN/dB/GmNDIn3kNadFAOkjJorSkt45eq4PqKpzWzxc/eX1oM5U2iGiiiggKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv8AXt+H8qhqa6/17fh/KoagoKKKKANC1/1C/j/Opqhtf9Qv4/zqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFKqlztUZJq3FZAcyHJ9B0oKjFvYqKpY4UEn2qQWsx/gx9TWgqhRhQAPaloNFSXUz/ALHN6D86a1tKvVD+HNaVFA/ZIySMcGitR4kkGGUGqk1kV+aP5h6d6CJU2titRRRQZhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/+D8f6VUq3f/wfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACpIIDM2OijqaYql2Cjqa04oxEgUf/AK6C4RuxURUUKowBS0+KKSeVIokZ5HIVVUZLE9AK6y2+F2vTxB3azgJ/gkkOR/3yCP1oO+jhqtb+FFuxyFFej+Gvh1qeka5a311NYyQwsWZUZifukDAKgdSKg1f4ZatfareXVvPp6RTTPIis7ggEkjgLQdn9k4j2fNyu99v1PP6K7T/hVGt/8/Wnf9/H/wDiK3/EngS+1aw0iC0eyjeyt/KlLlgGOF6YU5GQeuOtARynEOMpOLTXTueWUV2bfCnXFBIuNPY+gkfn/wAdrmNV0m90W7a1voTFKBkDqGHqD3FBy1sHWormqRaRjXVts+dB8vcelVq1iMjB6Vm3EXkyEdjyKDz6kLaojooooMwooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/AF7fh/Koamuv9e34fyqGoKCiiigDQtf9Qv4/zqaobX/UL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFKiNIwVRkmkq/aQ+Wm4j5m/SgqEeZj4YVhXA5J6mpKKKDpSsFFFFAwooooAKKKKAK9zbCQF0HzfzqjWtVO9h2nzF6HrQY1IdUVaKKKDEKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAKl/8Awfj/AEqpVu//AIPx/pVSpZSCiiikAUUUUAa1FFFWSFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFqxjyxkPbgVcqK0XbAvvzUtB0wVkdR8N4Um8V25cA+WjuufXGP61j69ez3+r3c1xK8jGZwNxzgZOAPatz4YgHxQmTjEL49+lXbvwz4Ve6meTxMEdpGLLtHBzyKD2IUJ1cJFQa+J7tLou5zvhLUbfSvEVneXblII2bewBOMqRnA+tVtcu4r/Wb66hJMU07uhIwSCxIrpv8AhF/CX/Q0j/vkUf8ACL+Ev+hpH/fIoJ+qV/Z+yvG17/EvTucXXS+LNbstW03Q4LV2Z7S28uYFSNrYUY9/unpV/wD4Rfwl/wBDSP8AvkUf8Iv4S/6Gkf8AfIoCGErwhKCcbSt9pdHfucajtGwZGKsOQQcEV2njKRr7wn4fvpyXuGQoznq3A6/lTf8AhF/CX/Q0j/vkVb8dW9ta+E9FhtLn7RAjkRyY++MdaDSlhp0qFXmatZbNPquxwFQXke+InuvNT0EbgQeh4oPHaurGTRQRgkelFByBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/qF/H+dTVDa/6hfx/nU1USFFFFMAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCS3j8yVQeg5NaVVLBfvt+FW6DopqyNrwz4Wu/FE80dtJFEkKgu8mcDOcDj6H8qpanpVzpWpy6dOA08bBfk5DZwRj6gipNF8Qah4fmeWwmEZkXa4ZQwYduDVW9vrjULuS7uZTJPK25nPGTQdknR9jFJPnvr2sbg+HviYjP8AZn/keP8A+Ko/4V54m/6Bn/keP/4qs0eI9bAwNY1HH/Xy/wDjS/8ACSa3/wBBjUf/AAJf/Gg2vg+0vvX+Ro/8K88Tf9Az/wAjx/8AxVH/AArzxN/0DP8AyPH/APFVnf8ACSa3/wBBjUf/AAJf/Gj/AISTW/8AoMaj/wCBL/40BfB9pfev8izf+C9e0y0ku7qwMcEYy7CVGwPoCTWJV241vVLuFobnUr2aJuqSTsyn8CapUHNWdK/7pO3n/wAAKSRBIhU9xS0UGJkkEEg9RRUt0u2dvfmoqDkas7BRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv8A+D8f6VUq3f8A8H4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDTg/wBSn+6KfUdscwIfbFSUHWtjq/hl/wAjTH/1xf8AlXO6l/yEbr/rs/8A6Ea6L4Zf8jTH/wBcX/lXO6l/yEbr/rs//oRoO+p/ukP8UvyRZn8OapbaVHqstoy2cmNsmR0PQ4zkA1StraW8uI7eCMySysFRR1JNadz4r1S70SPRpZUNrGFUYX5iq9AT6DA/Ks6zvJrC7iurd9k0LB0bGcEUGFRUeaPJe2l/XrYn1bRb/Q7gW+oQGGRl3KNwYEexHFO0jQdR12SSPT7YzNGu5/mCgDtyTTtd8QX3iK6S4vmQsi7FVFwqin6D4k1Dw5JM9i6DzlCurrkHHQ/UZP50FJUPbWbfJ+JmyxPBK8UqlJEYqynqCOorsfE//Ii+Hvx/lXH3E8l1PJPMxeWVi7se5JyTXYeJ/wDkRfD34/yoNsLb2da3b9UcXRRRQcBly/61/wDeNNpXO52Pqc0lBxsKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf8AUL+P86mqG1/1C/j/ADqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBdsf9U3+9VmqtgfkcehzVqg6YfCjqfAXhqx8R3d0l9K4EKKyxo2C+SefoMfqKydf0yDS9eudPgn3wxSBRI3OAQOuPTOD9Kzo5HibdG7Iw7qcGkJycmg65VqboxpqHvJ79zsx4F0QgH/hM9O/JP/jlH/CC6J/0Oenfkn/xyuLooNvrOH/58r75f5naf8ILon/Q56d+Sf8AxysbxHoNjoogNnrdtqfmZ3CED5MY64Y1iUUGdSvRlFqNJJ97v/MKKKKDlCiiigCjff64f7tV6nvDmcj0AFQUHLP4mFFFFBIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv/4Px/pVSrd//B+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAu2L5Qp3BzVms2CXypA3bofpWkDkZFB0U3dWOr+GX/I0x/9cX/lXO6l/wAhG6/67P8A+hGuh+GjqviqEE4LRSAe5xn+lYGrxPDqt5HIpVlncEHt8xoPSqf7pD/E/wAkb+oX/hiTwfb21tbBdWATc3lkMG/iJbuDzgZ7isDSpLSLUraS/QyWqyKZVHdc81UooMKmIc5Rk0tLdO3c6Dxnd6HealG+hxLHCIwHKRlFZsnopx29qk8FXugWdzcnXoUkVkAiLxmRQec8DPJ459q5uigpYpqt7flV+1tPuJr1oHvJ2tUKW7SMYlbqqZ4B/Cuu8T/8iL4e/H+VcXXa+LFMPgvw7DINshUttPXGB/iKDbCu9Os/L9UcVUc7+XCx74wKkqley7mEY6L1+tB5s3ZFaiiig5gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/AF7fh/Koamuv9e34fyqGoKCiiigDQtf9Qv4/zqaobX/UL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAT2T7ZcH+IYq/WSCVII6itSKQSoGHfrQbUnpY634f3+iWN7ctrAiBZAIXlTcq9dw6HBPH5GsjxBPp0+vXM2nx7bFpAUVRtyMDOB2BOcVl0UHdLEt0Y0bKyd79TtBqnw+wM6FqOf98//AB2j+1Ph7/0AtR/77P8A8dri6KDb6/L+SP8A4CjtP7U+Hv8A0AtR/wC+z/8AHaP7U+Hv/QC1H/vs/wDx2uLooD6/L+SP/gKOo1fUPBk2nyppmkX0F2QPLkdztU57/Oe3tXL0UUHNWrOq7tJeisFBOBmioLyXZHtHVv5UGLdlcpSPvkZvU02iig5AooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAqX/APB+P9KqVbv/AOD8f6VUqWUgooopAFFFFAGtRRRVkhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAVbtLjH7tz9D/SqlFA4ys7m5Z3c9hdRXVtIY5omDIw7GuvPxEtLrEmpeGdPvLjGDKcDP5qx/WvPoLzbhZOR61cDBhkEEe1B6OHxlSmmqb0fTR/mdp/wnWif9CZp35p/wDG6P8AhOtE/wChM0780/8AjdcXRQdH9pYjuv8AwGP+R2n/AAnWif8AQmad+af/ABuj/hOtE/6EzTvzT/43XF0UB/aWI7r/AMBj/kdqPHukId0Xg/Tkcchspwf+/dc94g8Q3niO8FzdlVCjbHGgwqD2/wAay6rz3ap8qYZvXsKDGvjqtSPLOWnol+Q65uBEuB949Pas8nJyaGYsSSck0UHmylzMKKKKCQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/wBQv4/zqaobX/UL+P8AOpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABUttP5Lc/dPWoqKATs7o1gQRkHINFZ8Fy0JweV9PSr0ciSjKnNB0xmpDqKKKCwooooAKKKimuEhHJy3oKBN23HySLEhZv/ANdZskhlcs3U0ssrStuY/QelMoOec+YKKKKCAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAqX/wDB+P8ASqlW7/8Ag/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABTkkeM5ViKbRQBaS+YffUH3FSC+iPUMPwqjRQWqki+b2L/AGj+FRtfj+FPzNVKKAdSRJJcSS8M3HoKjoooIbvuFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAZ91/r2/D+VQ1Ndf69vw/lUNQUFFFFAGha/6hfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAClVipypIPtSUUAWEvZF+8A36VKL6M9VYVSooLVSSL/ANti/wBr8qa1+v8AChP14qlRQHtJE0l3K/AO0e1Q0UUEtt7hRRRQIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf8A8H4/0qpVu/8A4Px/pVSpZSCiiikAUUUUAa1FFFWSFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAZ91/r2/D+VQ1Ndf69vw/lUNQUFFFFAGha/6hfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf8A8H4/0qpVu/8A4Px/pVSpZSCiiikAUUUUAa1FFFWSFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAZ91/r2/D+VQ1Ndf69vw/lUNQUFFFFAGha/6hfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf8A8H4/0qpVu/8A4Px/pVSpZSCiiikAUUUUAa1FFFWSFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAZ91/r2/D+VQ1Ndf69vw/lUNQUFFFFAGha/6hfx/nU1Q2v+oX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf8A8H4/0qpVu/8A4Px/pVSpZSCiiikAUUUUAa1FFFWSFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBY0/T7rVb+30+yhae6uZFhhiXq7scADPqTXZf8KM+I/wD0Kl7/AN9J/wDFVxVpd3FhdQ3dpPLb3EDiSKWJirxsDkMCOQQe9dD/AMLQ8df9Dl4h/wDBhL/8VUu/Qat1NT/hRnxH/wChUvf++k/+Ko/4UZ8R/wDoVL3/AL6T/wCKrL/4Wh46/wChy8Q/+DCX/wCKo/4Wh46/6HLxD/4MJf8A4ql7waGp/wAKM+I//QqXv/fSf/FUf8KM+I//AEKl7/30n/xVZf8AwtDx1/0OXiH/AMGEv/xVH/C0PHX/AEOXiH/wYS//ABVHvBoan/CjPiP/ANCpe/8AfSf/ABVH/CjPiP8A9Cpe/wDfSf8AxVZqfEzx7K6xx+L/ABG7sQqqt/MSSewG6vZfC8mv/DzSIvGPxQ8YeIQW+aw0D+0JDLct2Mi7unT5TwP4v7pTckNJM8R8T+AfE/gxIJNf0a6sI7gk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8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAor074ceK/AcuhP4Q8b6DFHbzymWPWrYHz4XPGWPJwMDpxxyp5NU/iJ8G9U8GQLrOm3EeueG5xvh1K1wwVT08wDOPTcOD7Hip5tbMdup57RRRVCCva/ghGngjwX4q+JV0iiS3gNhp28ffmbGcDv8AMYxkdt3vXjumaddaxqNrp1lE011dSrDFGOrMxwB+Zr1z48ala+GdJ0D4X6TIGt9GhWe+df8AlpcMCeff5mb/ALaD0qJa+6OPc8clleaR5ZXZ5HYszMcliepNNooqxBRRRQAV7Q/7K3izarprvhoBgD+8uJVP/os14vRUtPoNW6nsv/DLHi7/AKD3hX/wLl/+NUf8MseLv+g94V/8C5f/AI1XjVFK0u4XXY9l/wCGWPF3/Qe8K/8AgXL/APGqP+GWPF3/AEHvCv8A4Fy//Gq8aootLuF12PZf+GWPF3/Qe8K/+Bcv/wAaqSH9lTxZI+1tf8M/8AuJWP8A6LFeLUUWl3C67CyIY3ZDyVJFJRRViCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAqX/8H4/0qpVu/wD4Px/pVSpZSCiiikAUUUUAa1FFFWSFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABWl4at9Hu9esoNfvJrLSnkxc3EKlnjTHUAA57djWbRSA9j/4RT4B/wDQ/eIP/AR//jFH/CKfAP8A6H7xB/4CP/8AGK8coqeXzHfyPY/+EU+Af/Q/eIP/AAEf/wCMUf8ACKfAP/ofvEH/AICP/wDGK8coo5fML+R7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5dUF77njVFdl8Tvhjqvw01kWt0ftOn3GWs75B8k6eh9GHGR+IyK42rTvqiWrBRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigArS8Mad/bHiXSdNxn7XeQwY9dzhf61m13nwL03+1Pix4dhK5Edwbg+3lozj9VFJuyuC3Nb9pXUvt/wAWdRiBytnBBbj/AL9hz+rmvLa6n4p6l/a3xH8SXecq2oTIp9VViq/oorlqUVZIb3CiiiqEFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv/4Px/pVSrd//B+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA9B+AP/ACV7w7/10l/9EyVgfEf/AJKH4o/7C95/6Oet/wCAH/JXvDv/AF0l/wDRMlYHxH/5KH4o/wCwvef+jnqPtD6HO0UUVYgooooAK9l+F6nwR8JfGHjeUbLm/QaRp5PBJbhmHrywP/bM141XeeO/iRbeJfCXhrwvpGnS6bp2kQkyxPIH824OQXyAM8FjnA5duOlTJX0GtDg69g8bf8m5+Av+v25/9GTV4/XsHjb/AJNz8Bf9ftz/AOjJqUt0C6nkdrczWVzDdW7mOaF1kjcdVYHIP5ivV/2ip9O1rWfD/iewntmfWNKiluIopAWjcAEFgOR8rKOf7vtXklFNrW4r6WCiiiqAKKKKAPZv2aQNO1Dxb4ibhdM0WQ59CTvz+URrxmvavBqHwh+zv4r1yXEc/iCddPts9ZEHynH4NN/3zXitRHdsb2QUUUVYgooqS1tpby5itoQGlmcRoCwUFicDk8D8aAI6taXpV9reoQadptrLd3dwwSKGJcsx/wA9+1eq6X+zlqtnajUvG+uaX4W04csZplklPsADtyf94n2NWL74peEfhvYTaT8LdOaW+lUxz+IL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ACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoq9o2jXevXn2OyVGm2FwrNjOOw9/QVRpAFFXrXRbu80y91OJV+zWWzzSWwfmYKMDvyRn0yKo0AFFalt4fmnsYb17yxtopiwj8+XaW2nB4x70y60b7LA839padNt/gim3MfoMUXAzqKKu6vo95ol39kvYwkmxXGDkMpHBB/T6gimBSoqezsZr5pVhAJiieZsnHyqMmoKACirFxYzW1ta3EgUR3SM8eDyQGKnP4qajt4HuriKCPBeVwi5PcnAoAjop9xA9tPJBJgPG5RseoODTKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlW7/APg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABWz4j/499E/7Byf+jJKxq6jVdc1DTrLRIrW48tPsCtjYp58yT1FJgVPDyPDputXcwK2bWZgJb7rysylFHqQRu9gpNYVdH4su7jWYbTWVnle0nBQwFiUtZgBvRR0VTww9jjsa5yhAzovFGnXs+pQyQ2dxIhsLLDJGxB/0aPuBWDPbTWrhJ4ZImIztdSpx681veKNRvYNShjhvLiNBYWWFSRgB/o0fYGsGe5munDzzSSsBjc7Fjj05oQM0/DFzBBfzR3Ey24ubaW3SdukTOuATjoD0J7AmqupaNf6Q6i8t2jV+Y5Bho5B6q44YfQ1SCkgkA4HU+lX9N12/0pWigm3W7n95bSgPDJ/vIeD9evoaAKLyPK5eRmd2OSzHJJrb8PQyXGleIY4Y3kc2UeFRSSf9Jh7Cq/iWzt7LVCtrGYoZoYbhYiSfK8yNX2ZPPG7Az2xVjw9NJb6V4hkhkeNxZR4ZGII/0mHuKHsBmPpd/EjO9jdIijJZomAA/Kq1WX1S/lRke+unRhgq0rEEfnVagDZ1r/kCeHv+vWX/ANKJak8Ko8X9pXkgIso7GeOZj91mdCsa/UuVIHtntVm91m+03QNAjtZ/LRraViNinn7RJ6ik8TX1zr2m2erCeRoBiCe2DHy7ecDqq9AHA3D3DDtSGYOn3sum39vewHEtvKsqfVTkfyq34js4rHWbmO3H+jORNB/1ycB0/wDHWFZtdDHZN4hstFCttkSU6fM5/hXO9GP/AAFnH0jpiK+rn7Fo+l6aOGKNezD/AGpMbR/37VD/AMCNL4NUt4itlUEkpKAB3/dNVLWr9dT1W5u0XbE7nyl/uRjhF/BQB+FXfBrFfEVsykghJSCO37pqOgdSh/ZGpf8AQPu/+/Lf4VUIIJBGCOxq3/a+pf8AQQu/+/zf41UJJJJOSe5oAKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAZ91/r2/D+VQ1Ndf69vw/lUNQUFFFFAGha/6hfx/nU1Q2v8AqF/H+dTVRIUUUUwCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKANvwpNJbXF/PExSSKyldGHZhgg/nUPiaCNNVe5gULb3qrdxAdFDjJUf7rbl/4DT/Df3tT/AOwfN/IVe0ayj1/TbSKYnbpk5M5HUWjAux/4CVf8ZBU9RltR9i8N6hpY4aLTEuZh/wBNJbm3IH4II/xzXHV0VpfSanB4qvZQA89qshA6Lm6h4HsOlc7TQmb95ZXV14Z0U29tNMFa4BMaFsfMPSsaeyurUBri2mhB4BkQrn862by9urXwzoot7maEM1wSI3K5+YelY097dXQC3FzNMByBI5bH50IGQ12evKNZvtS0s83do7XFme7rtBki/wDZx7hh1auMrc8TXM1n4turm3kaOaKZXR16qwAINDAj8M/63Uf+wdcf+gVj118FvDJNdavZoqWt9p90TGvSCYJ88f05DD/ZYehrkKEBs61/yA/D/wD17S/+j5KpaL/yGbD/AK+I/wD0IVe1YGTw5oUyjKIk8DH0cSl8flItVvDdu914h02FBktcx/gNwyfoBzR0GRaz/wAhi+/6+JP/AEI1TqxqMy3OoXU6crJM7j6Fiar0CCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv/4Px/pVSrd//B+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACrd/qLX6WaMip9ltxAMH7wDM2f/HqqUUAXbHVHtLO8s2jWa3u0AZGONrqcq49xyPoSO9UqKKANy517Tr5opLvRRLMkMUJdbll3CNFQHGOOFFUb670+4iVbTTfsrhsl/PZ8j0wf88VRopWAuaZq1zpUjtB5bxyrslhlUPHKvoynr9eo7EVdGt6dG3mxeHbFZhyN8srxqfXYW5+hJH1rGoosBLeXc9/dS3VzIZZpWLO57mrmkarHpqXkU1ot1DeQiF0LlCAHVwQR7oKzqKANb+0tF/6AJ/8C3/wrLlZHldo08tCxKpnO0dhnvTaKALd5qLXlnY2zRqos42jVgfvAyM+T/31j8Kdp2qPYR3UJjWa3uojFJGxwD3Vh6FTgg/UdzVKigArS0nXZtIt76CONHF3EY8t1jbBXePfa7j/AIFWbRQAVc0fUjpGoxXoiWby9wKE4DAqVPP41Topga39paL/ANAE/wDgW/8AhWfeS2805e2tvs0ZAxHvL4/E1DRSsAUUUUwCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/wBe34fyqGoKCiiigDQtf9Qv4/zqaobX/UL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAWtP1BtPNwVQP58DwHJ6Bu9Qw3M9uJFhmkiEqeXIEYjeuQdpx1HA49qjopAW7LUWsrW/t1jVhewrCxJ+6BIj5H4oB+NVKKKYGvBrdmdNtrG90sXIti5RxOyH5iCQQPpUVxf6VJA6Q6P5MhGFk+0s20+uCOazaKVgCrWq6g2q6hNeugjaU5Kg5A4xVWimBp6Tr0+lWl9aLGksN5EYyr/8ALNiCN6++GYfjWZRRSA0dM1qTT4JbSW3gvLKYhnt5wdu4dGUggq2CRkH65qw3iGO2hlj0vTLeweZDG84d5Jdp4KqWOFBHBwM44zWNRRYAooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS/wD4Px/pVSrd/wDwfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/wBQv4/zqaobX/UL+P8AOpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/APg/H+lVKt3/APB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/AFC/j/Opqhtf9Qv4/wA6mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv8A+D8f6VUq3f8A8H4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf8AUL+P86mqG1/1C/j/ADqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS/wD4Px/pVSrd/wDwfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/wBQv4/zqaobX/UL+P8AOpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/APg/H+lVKt3/APB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/AFC/j/Opqhtf9Qv4/wA6mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv8A+D8f6VUq3f8A8H4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf8AUL+P86mqG1/1C/j/ADqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS/wD4Px/pVSrd/wDwfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/wBQv4/zqaobX/UL+P8AOpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/APg/H+lVKt3/APB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/AFC/j/Opqhtf9Qv4/wA6mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv8A+D8f6VUq3f8A8H4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf8AUL+P86mqG1/1C/j/ADqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS/wD4Px/pVSrd/wDwfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/wBQv4/zqaobX/UL+P8AOpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/APg/H+lVKt3/APB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/AFC/j/Opqhtf9Qv4/wA6mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv8A+D8f6VUq3f8A8H4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf8AUL+P86mqG1/1C/j/ADqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS/wD4Px/pVSrd/wDwfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/wBQv4/zqaobX/UL+P8AOpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/APg/H+lVKt3/APB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/AFC/j/Opqhtf9Qv4/wA6mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv8A+D8f6VUq3f8A8H4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf8AUL+P86mqG1/1C/j/ADqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABR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7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflR9tk/up+VFwsXqKo/bZP7qflTHuZHGC2B7UXHYddyB5MA5C8VBRRUjCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACipYbdpuRwvrVgWKd2Y/SnYLlKir32KP8AvP8AnR9ij/vP+dFhXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNFXvsUf95/zo+xR/3n/OiwXKNF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RRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAGbMoSVlHTNR1Ndf69vw/lUNQUFFFFAF6zXEW7uxqxUNr/AKhfx/nU1UiWFFFFMAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAKV6oEgb1FVqt3/8AB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/UL+P8AOpqhtf8AUL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv/wCD8f6VUq3f/wAH4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf9Qv4/wA6mqG1/wBQv4/zqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS//AIPx/pVSrd//AAfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/1C/j/ADqaobX/AFC/j/OpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/8Ag/H+lVKt3/8AB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/UL+P8AOpqhtf8AUL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv/wCD8f6VUq3f/wAH4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf9Qv4/wA6mqG1/wBQv4/zqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS//AIPx/pVSrd//AAfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/1C/j/ADqaobX/AFC/j/OpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/8Ag/H+lVKt3/8AB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/UL+P8AOpqhtf8AUL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv/wCD8f6VUq3f/wAH4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf9Qv4/wA6mqG1/wBQv4/zqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS//AIPx/pVSrd//AAfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/1C/j/ADqaobX/AFC/j/OpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/8Ag/H+lVKt3/8AB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/UL+P8AOpqhtf8AUL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv/wCD8f6VUq3f/wAH4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf9Qv4/wA6mqG1/wBQv4/zqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS//AIPx/pVSrd//AAfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/1C/j/ADqaobX/AFC/j/OpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/8Ag/H+lVKt3/8AB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/UL+P8AOpqhtf8AUL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv/wCD8f6VUq3f/wAH4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf9Qv4/wA6mqG1/wBQv4/zqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS//AIPx/pVSrd//AAfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/1C/j/ADqaobX/AFC/j/OpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/8Ag/H+lVKt3/8AB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/UL+P8AOpqhtf8AUL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv/wCD8f6VUq3f/wAH4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoopVUswVRkmgBKnis5JOW+Ue/WrEFqsQDNy/8qnoNo0u5ClnEvUFj71IIox0Rfyp1FBoopDTGh6ov5UxrWJv4MfSpaKBtJlKSxYcxnd7GqzKVOCCD71rUyWFJhhhz2PpQZypLoZlFPliaFsN+B9aZQYNWCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/AF7fh/Koamuv9e34fyqGoKCiiigDQtf9Qv4/zqaobX/UL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABUkVvJLyBgepqe3tOjyD6LVvpQaxp31ZXSyjX7xLH8qlEMa9EX8qfW1pHg7WtaQS2tmwhPSWU7FP0z1/Cg6aVCU3y043fkYnlp/cX8qY1vE3VB+HFdq/ws11U3CSxc/3VkbP6riue1XQdS0Rwl/aSQ5OFY8q30YcGg2q4KtSV6kGl6GLJYg8xtj2NVZI3jOGGK1KRkV12sARQcUqaexlUVNcWxhO4cp/KoaDFprRhRRRQIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAKl/wDwfj/SqlW7/wDg/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFX7WDyl3MPmP6VWtIvMlyei81oUG1KPUK1dB8M6l4jldLGJdkf35HO1F/H/Csqu2t5HtfhfK0DGNprva5U4JGR/gKD0MJRhUk3PZJv7hB8KNayM3WnAd/nf/AOJrr7f4ceHIYVSSzedwMGR5nBY+uAQK8gtpvIuYpiMiN1fHrg5r0HX9J0HxZfDVE8UWVoJI1XypAu4Y9cuCPyoPVwM8O4ycKSctNHJfqjoj8PPDJH/INx/23k/+KrldS+FN6b2U6bc2otScoJ3bePY4U96htvBeh21xFOfGOnMI3D7Rs5wc4/1lY3jnVbbWPEU9xaP5kIVY1fs2ByR7ZoLxc6Cpc1Wiou+iUld/ch+t+A9Y0K1N1MsM0C/feBi2z6ggGudrtvh3K8tprdpIzNA1oWMZPGcEdPxriaDycVSpqEKtNWUr6b7PuMliWVCp/A+lZroUYq3UVq1VvosgSDtwaDzqkbq5TooooMAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/AF7fh/Koamuv9e34fyqGoKCiiigDQtf9Qv4/zqaobX/UL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFWbODcfMYcDoKrxoZHCjua1FUKoUdBxQaU43dxaKKKDoOx8LaJYafpb+JdcTfbocW0BGfNb1x356D2JPFZuueNtX1qRgbh7W3/AIYIWKgD3I5P41tzf8VP8Pomi/4+dHOHjX+JAMZx/u859jWJ4U0S01Fru+1J2XT7CMSShPvOTnCj64P+TQevUU0oUKGkZK9+/e/p2MSO4mik8yOWRH/vKxB/Our0Lx3Mq/2dr4/tDT5flYyjc6D1z1P8/Sn2uteFtVuV0+48PpZQSsES4il+dCeATx/j+NYGq6FcabrsukLmWUSBI8D7+7G38wRQYR9ph7VKM+ZXtpf7mn3Lni/w2NAvUe2fzbC6XzLeTOePTPfGRz3BFYFdt4+nj03TtL8NxOJGtIxJK55O7BAHt1Jx6EVxNBlj6cKdeUYfd2fVfICAwIIyDWbcQ+S+P4T0rSqK5i82IjuORQcM43RnUUUUHMFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS/8A4Px/pVSrd/8Awfj/AEqpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigC/ZJth3f3jU9MtxiFPpT6DqirIK7T/AJpb/wBvn9a4uu0/5pb/ANvn9aD0MD/y8/ws46OKSXd5cbvtUs20ZwB1J9qmh028ns5r2K3ka2gIEkoHyqT0qzoGu3Ph/UFu7cK4I2SRt0kQ9Qa0PEnisarAmn6dbCw0yP5hAuBvbrlse/b/ACAxhCi6blKWva33a9u5ztFdLaeP9UsrWG2jt9PKRIEUtByQBjnmqut+Lb7XrVba5htERX3gxRbTnBHXPvQEqdFRupu/a3/BNn4b/wDMa/68z/WuLrtPhv8A8xr/AK8z/WuLoNsR/u1H/t78wpsib42X1FOooOAyaKdIMSMPQmm0HIFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAGfdf69vw/lUNTXX+vb8P5VDUFBRRRQBoWv+oX8f51NUNr/qF/H+dTVRIUUUUwCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKALNimZGb0FXarWA/dsferNB0017oUUUUFnS+AtZXStcWGcj7LeDyJQ3Tn7pP48fQmtW3gs/Durax4b1KQwWOoKPJnPROpQn25wT6rXDdK7jXv+Kq8HWmtL815Yfubn1K8c/yP4mg9XB1W6TitXC7XmnpJfqQ2ngaLTrpL3VNY05dPiYPujk3NKBzgDHf8fxrR0KeDWfEeqeLbpCllZLmPd1JC4H44GcerCvPURpHVEUszHAA6k123i118N+G7Dw1Cw86UCe7I7nPT8/0UUF4atBRc4xtGOu97y2icjqeoS6rqFxfTn95O5cj09B+A4qrRRQeRKTk3J7sKKKKBGZOmyVl96ZU96MTfUCoKDkkrMKKKKBBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS/wD4Px/pVSrd/wDwfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKANOA5hT6Cn1BZtuhA/unFT0HVF3QV2n/NLf8At8/rXF12n/NLf+3z+tB6GB/5ef4Wc9oGiNr961nHdQwTeWWjEn/LRh/CP89qv3/hP+xdEa71a4+z30jbbe0XBLAHkt6DH9PXFc/HI8TrJGzI6kFWU4IPqKnv9Ru9UuDcXtw88pAG5z2HagxhUoqm1KN5eun/AA66G5aeANUvbWG5juNPCSoHUNPyARnniqut+Er7QbVbm5mtHRn2ARS7jnBPTHtWJRQEqlFxsoO/e/8AwDtPhv8A8xr/AK8z/WuLrtPhv/zGv+vM/wBa4ug2xH+7Uf8At78woopHbYjN6DNBwGZKcyOfUmm0UUHIFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAGfdf69vw/lUNTXX+vb8P5VDUFBRRRQBoWv+oX8f51NUNr/qF/H+dTVRIUUUUwCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKALtgf3bD3qzVOwbDsvqM1coOmm/dCiiigsK6v4e6rHa6pJpl1hrTUU8l1bpu7fnkj8RXKU5HaN1dGKspyCOoNBth6zo1FUXQ7jw14V/s7xVeyX3FppOZvMYcNxlD+XzfhXKa7qsmt6tc38mR5r5VT/Co4A/LFdZ4k8dwap4ZhtLclb25Ci7wpGAOvPfJ/SuEoOzHTpRiqNB3ju/V7L5IKKKKDzQooooAoXpzN9BUFSXDb5nPvio6Dkk7sKKKKBBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS/8A4Px/pVSrd/8Awfj/AEqpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCezk2SbT0bj8av1k9K0beYTJz94daDalLoS12igv8AC1tvOy8+bHbkf4iuLre8N+Lbjw8k1ubeK7s5zmS3l6E+o/8A1Gg9HB1YQlJTdlJNX7XK3hy70y11DGrWguLSVDGx5zFn+Me4rW16/wBF0rTH0TRAl35xD3F64BJwchVP+fzJqz/wnWif9CZp35p/8bo/4TrRP+hM0780/wDjdB2Q9jCm6aqx9eV3s9+hQtL/AMHpawrc6TqDzhAJGWbhmxyRyKq63deHJ7VV0jT7u2nD5Z5ZNwK4PGMn2rZ/4TrRP+hM0780/wDjdH/CdaJ/0Jmnfmn/AMboCToyjy+0j/4A7/kHw4BCa3IeEW0OT2HX/A1xddXqvjtrrTpdP0zS7XS4JhiXycZYdxwAOfpXKUHLiqlPkhSpu/LfXbdhVa9k2oEHVuv0qw7iNSzdBWZJIZXLHvQedUlZWG0UUUHOFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAGfdf69vw/lUNTXX+vb8P5VDUFBRRRQBoWv+oX8f51NUNr/qF/H+dTVRIUUUUwCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAHRP5cit6GtQEEAjoayauWc/HlMfpQa05W0LVFFFBuFPidYzlkDfWmUUAnYsm6jx/qgarsQzEgAD0FJRQNyb3CiiigQUyeTyoy3foPrT6z7qfzXwPujp70ETlZENFFFBzBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv8A+D8f6VUq3f8A8H4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAp0btGwZTyKbRQBpQzrMOOG7ipKyQSDkHBq1FfEcSDPuOtBtGp3LlFRpcRP0cfQ8VJQap3CiimtKifecD8aAHU15FjXcxwKryXyjiMZPqaqvI0hyxyaDOVRLYdPO0zeijoKjoooMG76sKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/UL+P8AOpqhtf8AUL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFAODkUUUAXre6D4VzhvX1qxWTU8V28fB+Zfeg2jU6Mv0VEl1E/wDFtPvUoIPQg0GqaewUUUjOq/eYD6mgBaCQBknAqCS9jX7uWP6VUlneb7xwPQUESqJEtzdb8on3e59arUUUGDbbuwooooEFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS//AIPx/pVSrd//AAfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKASOhIoooACxPUmiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/wBe34fyqGoKCiiigDQtf9Qv4/zqaobX/UL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUdKKKAF3N6n86SiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAqX/wDB+P8ASqlW7/8Ag/H+lVKllIKKKKQBRRRQBrUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBn3X+vb8P5VDU11/r2/D+VQ1BQUUUUAaFr/qF/H+dTVDa/wCoX8f51NVEhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/AMH4/wBKqVbv/wCD8f6VUqWUgooopAFFFFAGtRRRVkhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAGfdf69vw/lUNTXX+vb8P5VDUFBRRRQBoWv+oX8f51NUNr/AKhfx/nU1USFFFFMAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiig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NDAyq2r2V4fD+hyxuyOklwyspwVIZcEVi1p31zDJoWlwJIrSxNOXUdVyVx/KgC3q0SXz2mu26KqXcgW5RRgRXAwWGOwb7w+pH8NVfFf/ACNOsf8AX9P/AOjGp3h6/ht55LK9fbY3gCSNjPlMDlJP+Anr6gsO9ReI7iK68Q6pcQOJIpbuZ0cdGUuSD+VAGjpc9tB4RvmurT7Uh1C3ATzCmD5c3ORWZd3mnTQMlvpf2eQ4xJ9oZsfgamiuoV8LXVqZFE730Mip3KiOUE/mw/OsqgDW8IOkfivRnkxsF9ATnoPnFZ10kkd1MkoIkV2D59c81GrFGDKSGByCOoNb96LDxLKb8X1vp9/Lzcw3AZY5H7ujAEDd1KnGCTgnsAU/CySSeJtJWLO83kO3HY7xVPUXjk1C5eLHltK5XHpk4rXt5LLw0kk8N7Ff6m6NHEYA3lW24YLlmA3PgnAAwM5zxisCgAooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/8Ag/H+lVKt3/8AB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/UL+P8AOpqhtf8AUL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv/wCD8f6VUq3f/wAH4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf9Qv4/wA6mqG1/wBQv4/zqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS//AIPx/pVSrd//AAfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/1C/j/ADqaobX/AFC/j/OpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/8Ag/H+lVKt3/8AB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/UL+P8AOpqhtf8AUL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv/wCD8f6VUq3f/wAH4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf9Qv4/wA6mqG1/wBQv4/zqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS//AIPx/pVSrd//AAfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/1C/j/ADqaobX/AFC/j/OpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/8Ag/H+lVKt3/8AB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/UL+P8AOpqhtf8AUL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv/wCD8f6VUq3f/wAH4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf9Qv4/wA6mqG1/wBQv4/zqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS//AIPx/pVSrd//AAfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/1C/j/ADqaobX/AFC/j/OpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/8Ag/H+lVKt3/8AB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/UL+P8AOpqhtf8AUL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv/wCD8f6VUq3f/wAH4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf9Qv4/wA6mqG1/wBQv4/zqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS//AIPx/pVSrd//AAfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/1C/j/ADqaobX/AFC/j/OpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/8Ag/H+lVKt3/8AB+P9KqVLKQUUUUgCiiigDWoooqyQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDPuv9e34fyqGprr/Xt+H8qhqCgooooA0LX/UL+P8AOpqhtf8AUL+P86mqiQooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUv/wCD8f6VUq3f/wAH4/0qpUspBRRRSAKKKKANaiiirJCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAM+6/17fh/Koamuv9e34fyqGoKCiiigDQtf9Qv4/wA6mqG1/wBQv4/zqaqJCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFS//AIPx/pVSrd//AAfj/SqlSykFFFFIAooooA1qKKKskKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAz7r/Xt+H8qhqa6/17fh/KoagoKKKKANC1/1C/j/ADqaobX/AFC/j/OpqokKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVL/8Ag/H+lVKt3/8AB+P9KqVLKQUUUUgCiiigDWopqNuQMO4p1WSFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAZ91/r2/D+VQ1JcNumcj1qOoKCiiigDQtf9Qv4/wA6mqCzbMOPQ1PVIlhRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCpf/wfj/SqlWr5suq+gqrUspBRRRSAKKKKAJ4LkxDaRlf5VZF3Cf4iPwrPop3Cxofaof7/AOho+1Q/3/0NZ9FFxWND7VD/AH/0NH2qH+/+hrPoouFjQ+1Q/wB/9DR9qh/v/oaz6KLhY0PtUP8Af/Q0faof7/6Gs+ii4WND7VD/AH/0NH2qH+/+hrPoouFjQ+1Q/wB/9DR9qh/v/oaz6KLhY0PtUP8Af/Q0faof7/6Gs+ii4WND7VD/AH/0NH2qH+/+hrPoouFjQ+1Q/wB/9DR9qh/v/oaz6KLhY0PtUP8Af/Q0faof7/6Gs+ii4WND7VD/AH/0NH2qH+/+hrPoouFjQ+1Q/wB/9DR9qh/v/oaz6KLhY0PtUP8Af/Q0faof7/6Gs+ii4WND7VD/AH/0NH2qH+/+hrPoouFjQ+1Q/wB/9DR9qh/v/oaz6KLhY0PtUP8Af/Q0faof7/6Gs+ii4WND7VD/AH/0NH2qH+/+hrPoouFjQ+1Q/wB/9DR9qh/v/oaz6KLh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igAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/2Q==";
function getRichMenuImage(templateKey?: string): { bytes: Uint8Array; contentType: string } {
  const isV2 = templateKey === "beauty-default-v2";
  const base64 = isV2 ? RICHMENU_IMAGE_V2_BASE64 : RICHMENU_IMAGE_BASE64;
  const contentType = isV2 ? "image/jpeg" : "image/png";
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return { bytes, contentType };
}

// ── GET /admin/integrations/line/richmenu/status ──────────────────────────
app.get("/admin/integrations/line/richmenu/status", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  try {
    const tenantId = getTenantId(c, null);
    const kv = (c.env as any)?.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_not_bound" }, 500);

    // LINE credentials
    const line = await readLineKv(kv, tenantId);
    const accessToken = String(line?.channelAccessToken ?? "").trim();
    const linked = !!(accessToken && line?.connected);

    // Rich menu state from dedicated KV
    let rm: any = null;
    try {
      const raw = await kv.get(`${RICHMENU_KV_PREFIX}${tenantId}`);
      if (raw) rm = JSON.parse(raw);
    } catch {}

    const configured = !!(rm?.richMenuId);

    // Resolve origin for preview URLs
    const origin = (c.env as any)?.WEB_ORIGIN || "https://saas-factory-web-v2.pages.dev";

    return c.json({
      ok: true,
      tenantId,
      linked,
      configured,
      templateKey: rm?.templateKey ?? null,
      richMenuId: rm?.richMenuId ?? null,
      lastPublishedAt: rm?.lastPublishedAt ?? null,
      menuVersion: rm?.menuVersion ?? null,
      previewUrls: {
        booking: buildTenantBookingUrl(origin, tenantId),
        storeInfo: buildTenantStoreInfoUrl(origin, tenantId),
        menu: buildTenantMenuUrl(origin, tenantId),
        reservations: buildTenantReservationsUrl(origin, tenantId),
      },
      webhookUrl: `${origin}/api/line/webhook?tenantId=${encodeURIComponent(tenantId)}`,
    });
  } catch (e: any) {
    return c.json({ ok: false, error: "status_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── POST /admin/integrations/line/richmenu/publish ────────────────────────
app.post("/admin/integrations/line/richmenu/publish", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c, null);
    const kv = (c.env as any)?.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_not_bound" }, 500);

    // Get LINE credentials
    const line = await readLineKv(kv, tenantId);
    const accessToken = String(line?.channelAccessToken ?? "").trim();
    if (!accessToken) {
      return c.json({ ok: false, error: "missing_line_config", step: "validate", detail: "LINE channelAccessToken が未設定です。先に LINE Messaging API を連携してください。" }, 400);
    }

    // Verify token first
    const tokenCheck = await verifyLineToken(accessToken);
    if (tokenCheck.status !== "ok") {
      return c.json({ ok: false, error: "missing_line_config", step: "verify_token", detail: "LINE channelAccessToken が無効です。LINE Developers Console でトークンを再発行してください。" }, 400);
    }

    const origin = (c.env as any)?.WEB_ORIGIN || "https://saas-factory-web-v2.pages.dev";
    const templateKey = "beauty-default-v2";
    const template = RICH_MENU_TEMPLATES[templateKey];
    if (!template) {
      return c.json({ ok: false, error: "template_not_found", detail: `テンプレート '${templateKey}' が見つかりません。` }, 400);
    }

    // Build payload
    const { payload } = template.build({ origin, tenantId });

    // Read existing state (used for version increment + post-publish cleanup)
    let existing: any = null;
    try {
      const raw = await kv.get(`${RICHMENU_KV_PREFIX}${tenantId}`);
      if (raw) existing = JSON.parse(raw);
    } catch {}

    // NOTE: Old menu deletion moved to AFTER new default is set (safe republish).
    // This ensures users always have a valid rich menu during the transition.

    // Step 1: Create rich menu
    const createRes = await fetch("https://api.line.me/v2/bot/richmenu", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + accessToken,
      },
      body: JSON.stringify(payload),
    });
    if (!createRes.ok) {
      const errBody = await createRes.text().catch(() => "");
      return c.json({ ok: false, error: "create_richmenu_failed", step: "create", status: createRes.status, detail: errBody }, 502);
    }
    const createData = await createRes.json() as any;
    const richMenuId = createData?.richMenuId;
    if (!richMenuId) {
      return c.json({ ok: false, error: "create_richmenu_failed", step: "create", detail: "LINE API returned no richMenuId: " + JSON.stringify(createData) }, 502);
    }

    // Step 2: Upload rich menu image (2500×1686)
    const { bytes: imageBytes, contentType: imageContentType } = getRichMenuImage(templateKey);
    const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: "POST",
      headers: {
        "Content-Type": imageContentType,
        Authorization: "Bearer " + accessToken,
      },
      body: imageBytes,
    });
    if (!uploadRes.ok) {
      const errBody = await uploadRes.text().catch(() => "");
      // Clean up created menu
      await fetch(`https://api.line.me/v2/bot/richmenu/${richMenuId}`, {
        method: "DELETE", headers: { Authorization: "Bearer " + accessToken },
      }).catch(() => {});
      return c.json({ ok: false, error: "upload_image_failed", step: "upload_image", status: uploadRes.status, detail: errBody }, 502);
    }

    // Step 3: Set as default for all users
    const setDefaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken },
    });
    if (!setDefaultRes.ok) {
      const errBody = await setDefaultRes.text().catch(() => "");
      // Menu created + image uploaded but not set as default — cleanup
      await fetch(`https://api.line.me/v2/bot/richmenu/${richMenuId}`, {
        method: "DELETE", headers: { Authorization: "Bearer " + accessToken },
      }).catch(() => {});
      return c.json({ ok: false, error: "set_default_failed", step: "set_default", status: setDefaultRes.status, detail: errBody }, 502);
    }

    // Step 4: Save state to KV (only after ALL LINE API calls succeeded)
    const menuVersion = (existing?.menuVersion ?? 0) + 1;
    const state = {
      richMenuId,
      templateKey,
      menuVersion,
      imageVersion: RICHMENU_IMAGE_VERSION,
      lastPublishedAt: new Date().toISOString(),
      publishedBy: c.req.header("x-session-user-id") || "unknown",
    };
    try {
      await kv.put(`${RICHMENU_KV_PREFIX}${tenantId}`, JSON.stringify(state));
    } catch (kvErr: any) {
      // LINE API succeeded but KV save failed — menu is live but state is stale.
      // Return success with warning so UI knows to retry status fetch.
      console.error(`[RICHMENU] KV save failed for tenant=${tenantId}: ${kvErr?.message}`);
      return c.json({ ok: false, error: "kv_save_failed", step: "kv_save", richMenuId, detail: "リッチメニューは LINE に公開されましたが、状態の保存に失敗しました。ページを再読み込みしてください。" }, 500);
    }

    // Step 5: Clean up old rich menu (best-effort, after new default is live)
    if (existing?.richMenuId && existing.richMenuId !== richMenuId) {
      try {
        await fetch(`https://api.line.me/v2/bot/richmenu/${existing.richMenuId}`, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + accessToken },
        });
        console.log(`[RICHMENU] tenant=${tenantId} action=cleanup_old oldRichMenuId=${existing.richMenuId}`);
      } catch { /* best-effort: old menu auto-deactivates when new default is set */ }
    }

    console.log(`[RICHMENU] tenant=${tenantId} action=publish richMenuId=${richMenuId} version=${menuVersion}`);

    return c.json({
      ok: true,
      tenantId,
      richMenuId,
      templateKey,
      menuVersion,
      lastPublishedAt: state.lastPublishedAt,
      previewUrls: {
        booking: buildTenantBookingUrl(origin, tenantId),
        storeInfo: buildTenantStoreInfoUrl(origin, tenantId),
        menu: buildTenantMenuUrl(origin, tenantId),
        reservations: buildTenantReservationsUrl(origin, tenantId),
      },
    });
  } catch (e: any) {
    const safeDetail = String(e?.message ?? e).slice(0, 500);
    console.error(`[RICHMENU] publish_error tenant=${getTenantId(c, null)}: ${safeDetail}`);
    return c.json({ ok: false, error: "publish_error", step: "unknown", detail: safeDetail }, 500);
  }
});

// ── DELETE /admin/integrations/line/richmenu ───────────────────────────────
app.delete("/admin/integrations/line/richmenu", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c, null);
    const kv = (c.env as any)?.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_not_bound" }, 500);

    let rm: any = null;
    try {
      const raw = await kv.get(`${RICHMENU_KV_PREFIX}${tenantId}`);
      if (raw) rm = JSON.parse(raw);
    } catch {}

    if (rm?.richMenuId) {
      const line = await readLineKv(kv, tenantId);
      const accessToken = String(line?.channelAccessToken ?? "").trim();
      if (accessToken) {
        // Unset default
        await fetch("https://api.line.me/v2/bot/user/all/richmenu", {
          method: "DELETE", headers: { Authorization: "Bearer " + accessToken },
        }).catch(() => {});
        // Delete menu
        await fetch(`https://api.line.me/v2/bot/richmenu/${rm.richMenuId}`, {
          method: "DELETE", headers: { Authorization: "Bearer " + accessToken },
        }).catch(() => {});
      }
    }

    await kv.delete(`${RICHMENU_KV_PREFIX}${tenantId}`);
    console.log(`[RICHMENU] tenant=${tenantId} action=delete richMenuId=${rm?.richMenuId ?? "none"}`);
    return c.json({ ok: true, tenantId, deleted: rm?.richMenuId ?? null });
  } catch (e: any) {
    return c.json({ ok: false, error: "delete_error", detail: String(e?.message ?? e) }, 500);
  }
});

/* === /LINE_RICHMENU_V1 === */

// ══════════════════════════════════════════════════════════════════════════════
// Multi-LINE Account Management (LINE_MULTI_ACCOUNT_V1)
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /admin/integrations/line/accounts ─────────────────────────────────────
app.get("/admin/integrations/line/accounts", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "viewer"); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c, null);
    const kv = (c.env as any)?.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_not_bound" }, 500);

    const raw = await kv.get(`settings:${tenantId}`, "json") as any;
    const accounts = Array.isArray(raw?.lineAccounts) ? raw.lineAccounts : [];

    // Fallback: synthesize from existing integrations.line if no accounts exist
    if (accounts.length === 0 && raw?.integrations?.line?.connected && raw?.integrations?.line?.channelAccessToken) {
      const line = raw.integrations.line;
      const synthesized = {
        id: "legacy-single",
        key: "booking-main",
        name: line.displayName || "メインアカウント",
        purpose: "booking",
        industry: "shared",
        channelId: line.channelId || "",
        channelSecret: line.channelSecret || "",
        channelAccessToken: line.channelAccessToken || "",
        basicId: "",
        inviteUrl: "",
        status: "active",
        botUserId: line.userId || "",
        createdAt: line.connectedAt ? new Date(line.connectedAt).toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        synthesized: true,
      };
      return c.json({ ok: true, tenantId, accounts: [synthesized], synthesized: true });
    }

    return c.json({ ok: true, tenantId, accounts, synthesized: false });
  } catch (e: any) {
    return c.json({ ok: false, error: "fetch_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── POST /admin/integrations/line/accounts ────────────────────────────────────
app.post("/admin/integrations/line/accounts", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c, null);
    const kv = (c.env as any)?.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_not_bound" }, 500);

    const body = await c.req.json() as any;
    if (!body.name || !body.channelAccessToken || !body.channelSecret) {
      return c.json({ ok: false, error: "missing_fields", hint: "name, channelAccessToken, channelSecret required" }, 400);
    }

    // Verify token
    const botCheck = await verifyLineToken(body.channelAccessToken);
    if (botCheck.status !== "ok") {
      return c.json({ ok: false, error: "invalid_token", hint: "channelAccessToken verification failed" }, 400);
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const account = {
      id,
      key: String(body.key || body.name).replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 40),
      name: String(body.name).slice(0, 80),
      purpose: (["booking", "sales", "support", "broadcast", "internal"].includes(body.purpose) ? body.purpose : "booking"),
      industry: (["hair", "nail", "eyebrow", "esthetic", "dental", "shared"].includes(body.industry) ? body.industry : "shared"),
      channelId: String(body.channelId || ""),
      channelSecret: String(body.channelSecret),
      channelAccessToken: String(body.channelAccessToken),
      basicId: body.basicId ? String(body.basicId) : undefined,
      inviteUrl: body.inviteUrl ? String(body.inviteUrl) : undefined,
      status: "active" as const,
      botUserId: botCheck.userId || "",
      createdAt: now,
      updatedAt: now,
    };

    // Read existing settings
    const settingsKey = `settings:${tenantId}`;
    let settings: any = {};
    try { const s = await kv.get(settingsKey, "json"); if (s) settings = s; } catch {}

    const accounts = Array.isArray(settings.lineAccounts) ? [...settings.lineAccounts] : [];
    accounts.push(account);
    settings.lineAccounts = accounts;

    // Register destination mapping
    if (botCheck.userId) {
      await kv.put(`line:destination-to-tenant:${botCheck.userId}`, tenantId);
    }

    // Auto-set routing.booking.default if this is the first booking account
    if (account.purpose === "booking") {
      const routing = settings.lineRouting || {};
      if (!routing.booking?.default) {
        routing.booking = { ...routing.booking, default: id };
        settings.lineRouting = routing;

        // Sync to integrations.line for backward compatibility
        settings.integrations = settings.integrations || {};
        settings.integrations.line = {
          ...(settings.integrations.line || {}),
          connected: true,
          channelId: account.channelId,
          channelSecret: account.channelSecret,
          channelAccessToken: account.channelAccessToken,
          userId: account.botUserId,
          displayName: account.name,
          connectedAt: Date.now(),
        };
        if (botCheck.userId) {
          await kv.put(`line:tenant2dest:${tenantId}`, botCheck.userId);
        }
      }
    }

    await kv.put(settingsKey, JSON.stringify(settings));
    return c.json({ ok: true, tenantId, account });
  } catch (e: any) {
    return c.json({ ok: false, error: "create_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── PUT /admin/integrations/line/accounts/:id ─────────────────────────────────
app.put("/admin/integrations/line/accounts/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c, null);
    const accountId = c.req.param("id");
    const kv = (c.env as any)?.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_not_bound" }, 500);

    const body = await c.req.json() as any;
    const settingsKey = `settings:${tenantId}`;
    let settings: any = {};
    try { const s = await kv.get(settingsKey, "json"); if (s) settings = s; } catch {}

    const accounts: any[] = Array.isArray(settings.lineAccounts) ? settings.lineAccounts : [];
    const idx = accounts.findIndex((a: any) => a.id === accountId);
    if (idx === -1) return c.json({ ok: false, error: "not_found" }, 404);

    const existing = accounts[idx];
    const tokenChanged = body.channelAccessToken && body.channelAccessToken !== existing.channelAccessToken;

    let botUserId = existing.botUserId;
    if (tokenChanged) {
      const botCheck = await verifyLineToken(body.channelAccessToken);
      if (botCheck.status !== "ok") {
        return c.json({ ok: false, error: "invalid_token" }, 400);
      }
      // Remove old mapping, create new
      if (existing.botUserId) {
        await kv.delete(`line:destination-to-tenant:${existing.botUserId}`);
      }
      botUserId = botCheck.userId || "";
      if (botUserId) {
        await kv.put(`line:destination-to-tenant:${botUserId}`, tenantId);
      }
    }

    const updated = {
      ...existing,
      ...(body.name != null ? { name: String(body.name).slice(0, 80) } : {}),
      ...(body.key != null ? { key: String(body.key).replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 40) } : {}),
      ...(body.purpose != null && ["booking", "sales", "support", "broadcast", "internal"].includes(body.purpose) ? { purpose: body.purpose } : {}),
      ...(body.industry != null && ["hair", "nail", "eyebrow", "esthetic", "dental", "shared"].includes(body.industry) ? { industry: body.industry } : {}),
      ...(body.channelId != null ? { channelId: String(body.channelId) } : {}),
      ...(body.channelSecret != null ? { channelSecret: String(body.channelSecret) } : {}),
      ...(body.channelAccessToken != null ? { channelAccessToken: String(body.channelAccessToken) } : {}),
      ...(body.basicId !== undefined ? { basicId: body.basicId ? String(body.basicId) : undefined } : {}),
      ...(body.inviteUrl !== undefined ? { inviteUrl: body.inviteUrl ? String(body.inviteUrl) : undefined } : {}),
      ...(body.status != null && ["active", "inactive"].includes(body.status) ? { status: body.status } : {}),
      botUserId,
      updatedAt: new Date().toISOString(),
    };
    accounts[idx] = updated;
    settings.lineAccounts = accounts;

    // If this is the booking default, sync integrations.line
    const routing = settings.lineRouting || {};
    if (routing.booking?.default === accountId) {
      settings.integrations = settings.integrations || {};
      settings.integrations.line = {
        ...(settings.integrations.line || {}),
        connected: updated.status === "active",
        channelId: updated.channelId,
        channelSecret: updated.channelSecret,
        channelAccessToken: updated.channelAccessToken,
        userId: updated.botUserId,
        displayName: updated.name,
        connectedAt: Date.now(),
      };
      if (updated.botUserId) {
        await kv.put(`line:tenant2dest:${tenantId}`, updated.botUserId);
      }
    }

    await kv.put(settingsKey, JSON.stringify(settings));
    return c.json({ ok: true, tenantId, account: updated });
  } catch (e: any) {
    return c.json({ ok: false, error: "update_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── DELETE /admin/integrations/line/accounts/:id ──────────────────────────────
app.delete("/admin/integrations/line/accounts/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c, null);
    const accountId = c.req.param("id");
    const kv = (c.env as any)?.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_not_bound" }, 500);

    const settingsKey = `settings:${tenantId}`;
    let settings: any = {};
    try { const s = await kv.get(settingsKey, "json"); if (s) settings = s; } catch {}

    const accounts: any[] = Array.isArray(settings.lineAccounts) ? settings.lineAccounts : [];
    const idx = accounts.findIndex((a: any) => a.id === accountId);
    if (idx === -1) return c.json({ ok: false, error: "not_found" }, 404);

    const account = accounts[idx];

    // Soft delete: set status to inactive
    accounts[idx] = { ...account, status: "inactive", updatedAt: new Date().toISOString() };
    settings.lineAccounts = accounts;

    // Remove destination mapping
    if (account.botUserId) {
      await kv.delete(`line:destination-to-tenant:${account.botUserId}`);
    }

    // Remove routing references
    const routing = settings.lineRouting || {};
    if (routing.booking?.default === accountId) {
      routing.booking = { ...routing.booking, default: undefined };
    }
    if (routing.support?.default === accountId) {
      routing.support = { ...routing.support, default: undefined };
    }
    if (routing.sales) {
      for (const [k, v] of Object.entries(routing.sales)) {
        if (v === accountId) delete routing.sales[k];
      }
    }
    settings.lineRouting = routing;

    await kv.put(settingsKey, JSON.stringify(settings));
    return c.json({ ok: true, tenantId, accountId, status: "inactive" });
  } catch (e: any) {
    return c.json({ ok: false, error: "delete_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── GET /admin/integrations/line/routing ──────────────────────────────────────
app.get("/admin/integrations/line/routing", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "viewer"); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c, null);
    const kv = (c.env as any)?.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_not_bound" }, 500);

    const raw = await kv.get(`settings:${tenantId}`, "json") as any;
    return c.json({ ok: true, tenantId, routing: raw?.lineRouting || {} });
  } catch (e: any) {
    return c.json({ ok: false, error: "fetch_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── PUT /admin/integrations/line/routing ──────────────────────────────────────
app.put("/admin/integrations/line/routing", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c, null);
    const kv = (c.env as any)?.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "kv_not_bound" }, 500);

    const body = await c.req.json() as any;
    const settingsKey = `settings:${tenantId}`;
    let settings: any = {};
    try { const s = await kv.get(settingsKey, "json"); if (s) settings = s; } catch {}

    const oldDefault = settings.lineRouting?.booking?.default;
    const routing = { ...(settings.lineRouting || {}), ...body };
    settings.lineRouting = routing;

    // If booking.default changed, sync integrations.line
    const newDefault = routing.booking?.default;
    if (newDefault && newDefault !== oldDefault) {
      const accounts: any[] = Array.isArray(settings.lineAccounts) ? settings.lineAccounts : [];
      const defaultAccount = accounts.find((a: any) => a.id === newDefault && a.status === "active");
      if (defaultAccount) {
        settings.integrations = settings.integrations || {};
        settings.integrations.line = {
          ...(settings.integrations.line || {}),
          connected: true,
          channelId: defaultAccount.channelId,
          channelSecret: defaultAccount.channelSecret,
          channelAccessToken: defaultAccount.channelAccessToken,
          userId: defaultAccount.botUserId,
          displayName: defaultAccount.name,
          connectedAt: Date.now(),
        };
        if (defaultAccount.botUserId) {
          await kv.put(`line:tenant2dest:${tenantId}`, defaultAccount.botUserId);
        }
      }
    }

    await kv.put(settingsKey, JSON.stringify(settings));
    return c.json({ ok: true, tenantId, routing });
  } catch (e: any) {
    return c.json({ ok: false, error: "save_error", detail: String(e?.message ?? e) }, 500);
  }
});

/* === /LINE_MULTI_ACCOUNT_V1 === */

/* === /LINE_MESSAGING_ROUTES_V1 === */

/* === AI_CONCIERGE_V1 === */
// AI接客設定 endpoints
// KV keys: ai:settings:{tenantId} / ai:policy:{tenantId} / ai:faq:{tenantId} / ai:retention:{tenantId}

const AI_DEFAULT_SETTINGS = {
  enabled: false,
  voice: "friendly",
  answerLength: "normal",
  character: "",
};

const AI_DEFAULT_POLICY = {
  prohibitedTopics: [] as string[],
  hardRules: [
    "Do not confirm prices or availability without checking official info.",
    "Do not provide medical/illegal advice.",
    "Never claim actions were taken (booking created) — booking is form-only.",
  ],
};

const AI_DEFAULT_RETENTION = {
  enabled: false,
  templates: [] as any[],
  followupDelayMin: 43200,          // 30 days in minutes
  followupTemplate: "{{customerName}}様、先日はご来店ありがとうございました！またのご来店をお待ちしております。",
  nextRecommendationDaysByMenu: {} as Record<string, number>,
};

const AI_DEFAULT_UPSELL = {
  enabled: false,
  items: [] as Array<{ id: string; keyword: string; message: string; enabled: boolean }>,
};

// helper: safe KV JSON get
async function aiGetJson(kv: any, key: string): Promise<any> {
  try {
    const v = await kv.get(key, "json");
    return v || null;
  } catch {
    try {
      const v2 = await kv.get(key);
      return v2 ? JSON.parse(v2) : null;
    } catch {
      return null;
    }
  }
}

// extractResponseText: OpenAI Responses API / Chat Completions 両対応の堅牢なテキスト抽出
// 優先順位:
//   A) resp.output_text (string, 非空)
//   B) resp.output[].content[].text  (type=output_text/text/その他を問わず text フィールドがあれば採用)
//   C) resp.output[].content が文字列ならそれ
//   D) resp.choices[0].message.content  (Chat Completions 互換保険)
//   E) resp.response ネスト（再帰1段）
function extractResponseText(resp: any): string {
  if (!resp || typeof resp !== "object") return "";

  // A) 最上位 output_text
  if (typeof resp.output_text === "string" && resp.output_text.trim()) {
    return resp.output_text.trim();
  }

  // B / C) output 配列を走査
  if (Array.isArray(resp.output)) {
    const parts: string[] = [];
    for (const item of resp.output) {
      if (Array.isArray(item?.content)) {
        // B) content が配列 → 各要素の text フィールドを拾う（type は問わない）
        for (const part of item.content) {
          if (typeof part?.text === "string" && part.text.trim()) {
            parts.push(part.text.trim());
          }
        }
      } else if (typeof item?.content === "string" && item.content.trim()) {
        // C) content が文字列
        parts.push(item.content.trim());
      } else if (typeof item?.text === "string" && item.text.trim()) {
        // item 直下の text
        parts.push(item.text.trim());
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }

  // D) Chat Completions 互換: choices[0].message.content
  const choiceContent = (resp as any)?.choices?.[0]?.message?.content;
  if (typeof choiceContent === "string" && choiceContent.trim()) {
    return choiceContent.trim();
  }

  // E) ネストされた resp.response を1段再帰（ループ防止のため1回のみ）
  if (resp.response && typeof resp.response === "object" && resp.response !== resp) {
    const nested = extractResponseText(resp.response);
    if (nested) return nested;
  }

  return "";
}

// GET /admin/ai — combined: settings + policy + retention
app.get("/admin/ai", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "AI_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const [sLegacy, p, r, settingsDoc] = await Promise.all([
      aiGetJson(kv, `ai:settings:${tenantId}`),
      aiGetJson(kv, `ai:policy:${tenantId}`),
      aiGetJson(kv, `ai:retention:${tenantId}`),
      aiGetJson(kv, `settings:${tenantId}`),
    ]);
    // Prefer unified settings.ai, fall back to legacy ai:settings:{tenantId}
    const s = settingsDoc?.ai || sLegacy;
    return c.json({
      ok: true, tenantId, stamp: STAMP,
      settings: { ...AI_DEFAULT_SETTINGS, ...(s || {}) },
      policy: { ...AI_DEFAULT_POLICY, ...(p || {}) },
      retention: { ...AI_DEFAULT_RETENTION, ...(r || {}) },
      source: settingsDoc?.ai ? "unified" : (sLegacy ? "legacy" : "default"),
    });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// PUT /admin/ai — save settings/policy/retention (partial merge)
app.put("/admin/ai", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const STAMP = "AI_PUT_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body: any = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, stamp: STAMP, error: "bad_json" }, 400);
    const saved: string[] = [];
    if (body.settings != null && typeof body.settings === "object") {
      const legacyKey = `ai:settings:${tenantId}`;
      const ex = (await aiGetJson(kv, legacyKey)) || {};
      const mergedAi = { ...AI_DEFAULT_SETTINGS, ...ex, ...body.settings };
      await kv.put(legacyKey, JSON.stringify(mergedAi));

      // dual-write: settings:{tenantId}.ai に統合
      const settingsKey = `settings:${tenantId}`;
      let settingsDoc: any = {};
      try { const raw = await kv.get(settingsKey, "json"); if (raw && typeof raw === "object") settingsDoc = raw; } catch {}
      settingsDoc.ai = {
        enabled: mergedAi.enabled === true,
        voice: mergedAi.voice ?? "friendly",
        answerLength: mergedAi.answerLength ?? "normal",
        character: mergedAi.character ?? "",
      };
      await kv.put(settingsKey, JSON.stringify(settingsDoc));

      saved.push("settings");
    }
    if (body.policy != null && typeof body.policy === "object") {
      const key = `ai:policy:${tenantId}`;
      const ex = (await aiGetJson(kv, key)) || {};
      await kv.put(key, JSON.stringify({ ...AI_DEFAULT_POLICY, ...ex, ...body.policy }));
      saved.push("policy");
    }
    if (body.retention != null && typeof body.retention === "object") {
      const key = `ai:retention:${tenantId}`;
      const ex = (await aiGetJson(kv, key)) || {};
      await kv.put(key, JSON.stringify({ ...AI_DEFAULT_RETENTION, ...ex, ...body.retention }));
      saved.push("retention");
    }
    return c.json({ ok: true, tenantId, stamp: STAMP, saved });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// GET /admin/ai/faq
app.get("/admin/ai/faq", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "AI_FAQ_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const faqRaw = await aiGetJson(kv, `ai:faq:${tenantId}`);
    const faq = Array.isArray(faqRaw) ? faqRaw : [];
    return c.json({ ok: true, tenantId, stamp: STAMP, faq });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// POST /admin/ai/faq
app.post("/admin/ai/faq", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const STAMP = "AI_FAQ_POST_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body: any = await c.req.json().catch(() => null);
    if (!body?.question || !body?.answer) {
      return c.json({ ok: false, stamp: STAMP, error: "missing_fields", hint: "question and answer required" }, 400);
    }
    const key = `ai:faq:${tenantId}`;
    const faqRaw = await aiGetJson(kv, key);
    const faq: any[] = Array.isArray(faqRaw) ? faqRaw : [];
    const item = {
      id: crypto.randomUUID(),
      question: String(body.question).trim(),
      answer: String(body.answer).trim(),
      tags: Array.isArray(body.tags) ? body.tags : [],
      enabled: body.enabled !== false,
      updatedAt: Date.now(),
    };
    faq.push(item);
    await kv.put(key, JSON.stringify(faq));
    return c.json({ ok: true, tenantId, stamp: STAMP, item });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// DELETE /admin/ai/faq/:id
app.delete("/admin/ai/faq/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const STAMP = "AI_FAQ_DELETE_V1";
  const tenantId = getTenantId(c, null);
  const id = c.req.param("id");
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const key = `ai:faq:${tenantId}`;
    const faqRaw = await aiGetJson(kv, key);
    const faq: any[] = Array.isArray(faqRaw) ? faqRaw : [];
    const before = faq.length;
    const next = faq.filter((f: any) => f.id !== id);
    await kv.put(key, JSON.stringify(next));
    return c.json({ ok: true, tenantId, stamp: STAMP, id, deleted: before - next.length });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// GET /admin/ai/policy
app.get("/admin/ai/policy", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "AI_POLICY_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const p = await aiGetJson(kv, `ai:policy:${tenantId}`);
    return c.json({ ok: true, tenantId, stamp: STAMP, policy: { ...AI_DEFAULT_POLICY, ...(p || {}) } });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// PUT /admin/ai/policy
app.put("/admin/ai/policy", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const STAMP = "AI_POLICY_PUT_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body: any = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, stamp: STAMP, error: "bad_json" }, 400);
    const key = `ai:policy:${tenantId}`;
    const ex = (await aiGetJson(kv, key)) || {};
    const merged = {
      ...AI_DEFAULT_POLICY, ...ex,
      ...(body.prohibitedTopics != null ? { prohibitedTopics: Array.isArray(body.prohibitedTopics) ? body.prohibitedTopics : [] } : {}),
      ...(body.hardRules != null ? { hardRules: Array.isArray(body.hardRules) ? body.hardRules : [] } : {}),
    };
    await kv.put(key, JSON.stringify(merged));
    return c.json({ ok: true, tenantId, stamp: STAMP, policy: merged });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// GET /admin/ai/retention
app.get("/admin/ai/retention", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "AI_RETENTION_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const r = await aiGetJson(kv, `ai:retention:${tenantId}`);
    return c.json({ ok: true, tenantId, stamp: STAMP, retention: { ...AI_DEFAULT_RETENTION, ...(r || {}) } });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// PUT /admin/ai/retention
app.put("/admin/ai/retention", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const STAMP = "AI_RETENTION_PUT_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body: any = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, stamp: STAMP, error: "bad_json" }, 400);
    const key = `ai:retention:${tenantId}`;
    const ex = (await aiGetJson(kv, key)) || {};
    const merged = { ...AI_DEFAULT_RETENTION, ...ex, ...body };
    await kv.put(key, JSON.stringify(merged));
    return c.json({ ok: true, tenantId, stamp: STAMP, retention: merged });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// === Intent Classification & suggestedActions Builder (INTENT_V1) ===
type AiIntent = "booking" | "hours" | "menu" | "price" | "location" | "first_visit" | "cancel_policy" | "generic";

function classifyIntent(message: string): AiIntent {
  const m = message.toLowerCase();
  // Order matters: more specific intents first
  if (/予約|空き|ご予約|booking|reserve|フォーム|予約したい|今日.*行ける|明日.*行ける/.test(m)) return "booking";
  if (/キャンセル|取り消し|cancel/.test(m)) return "cancel_policy";
  if (/初めて|初回|はじめて|first|ビギナー|未経験/.test(m)) return "first_visit";
  if (/料金|値段|価格|いくら|price|費用|金額/.test(m)) return "price";
  if (/メニュー|施術|コース|menu|プラン/.test(m)) return "menu";
  if (/営業時間|何時|開店|閉店|営業日|hours|オープン|クローズ|定休日|休み|お休み/.test(m)) return "hours";
  if (/場所|住所|どこ|アクセス|行き方|最寄り|location|address|地図/.test(m)) return "location";
  return "generic";
}

function buildSuggestedActions(intent: AiIntent, bookingUrl: string): { type: string; label?: string; url?: string }[] {
  if (!bookingUrl) return [];
  switch (intent) {
    case "booking":
      return [{ type: "open_booking_form", label: "予約フォームを開く", url: bookingUrl }];
    case "hours":
    case "location":
      return [{ type: "open_booking_form", label: "予約する", url: bookingUrl }];
    case "menu":
    case "price":
      return [{ type: "open_booking_form", label: "メニューを選んで予約", url: bookingUrl }];
    case "first_visit":
      return [{ type: "open_booking_form", label: "初回予約はこちら", url: bookingUrl }];
    case "cancel_policy":
      return [{ type: "open_booking_form", label: "新しい予約を入れる", url: bookingUrl }];
    case "generic":
      return [];
  }
}

function buildCtaText(intent: AiIntent, bookingUrl: string): string {
  if (!bookingUrl) return "";
  switch (intent) {
    case "booking":
      return `\n\nご予約はこちらからどうぞ：${bookingUrl}`;
    case "menu":
    case "price":
      return `\n\n気になるメニューがあれば、こちらからご予約いただけます：${bookingUrl}`;
    case "first_visit":
      return `\n\n初めての方も安心してご予約いただけます：${bookingUrl}`;
    case "hours":
    case "location":
      return `\n\nご来店お待ちしております。ご予約はこちら：${bookingUrl}`;
    case "cancel_policy":
      return `\n\n新しいご予約はこちらからどうぞ：${bookingUrl}`;
    case "generic":
      return "";
  }
}

function resolveBookingUrl(storeSettings: any, env: any, tenantId: string): string {
  return storeSettings?.integrations?.line?.bookingUrl
    || (env?.WEB_BASE ? `${env.WEB_BASE}/booking?tenantId=${tenantId}` : "");
}

// GET /sales-ai/config — lightweight sales AI config read (no auth)
// Used by LINE webhook to load per-account sales AI configuration.
// Completely separate from tenant AI接客 (ai:settings:{tenantId}).
// Supports two lookup modes:
//   1. ?accountId=xxx  — direct KV lookup (fast)
//   2. ?tenantId=xxx   — reverse lookup: settings:{tenantId} → lineAccounts[purpose=sales] → owner:sales-ai:{id}
app.get("/sales-ai/config", async (c) => {
  let accountId = (c.req.query("accountId") ?? "").trim();
  const tenantId = (c.req.query("tenantId") ?? "").trim();
  const kv = (c.env as any)?.SAAS_FACTORY;
  if (!kv) return c.json({ ok: true, accountId: accountId || null, config: null });

  // Reverse lookup: tenantId → first active sales lineAccount → fallback to tenantId as accountId
  if (!accountId && tenantId) {
    try {
      const settings = await kv.get(`settings:${tenantId}`, "json") as any;
      const salesAcct = (settings?.lineAccounts ?? []).find(
        (a: any) => a?.purpose === "sales" && a?.status === "active" && a?.id
      );
      if (salesAcct) {
        accountId = salesAcct.id;
        console.log(`[SALES_AI_CFG] tenantId reverse lookup: ${tenantId} → accountId=${accountId}`);
      }
    } catch {}
    // Legacy single-account fallback: use tenantId as accountId
    if (!accountId) {
      accountId = tenantId;
      console.log(`[SALES_AI_CFG] legacy fallback: using tenantId=${tenantId} as accountId`);
    }
  }

  if (!accountId) return c.json({ ok: false, error: "missing accountId (no sales lineAccount found)" }, 400);

  try {
    let raw = await kv.get(`owner:sales-ai:${accountId}`, "json") as any;
    // Auto-seed: when no config exists and ?seed=llm is passed, create one with LLM enabled
    if (!raw && c.req.query("seed") === "llm") {
      raw = {
        enabled: true,
        welcomeMessage: "",
        fallbackMessage: "申し訳ありません、ただいま応答できません。後ほどご連絡いたします。",
        tone: "friendly",
        goal: "demo",
        cta: { label: "", url: "" },
        intents: [],
        llm: { enabled: true, model: "gpt-4o", systemPrompt: "", temperature: 0.7, maxTokens: 800 },
        handoffMessage: "担当者よりご連絡します。少々お待ちください。",
        seededAt: new Date().toISOString(),
      };
      await kv.put(`owner:sales-ai:${accountId}`, JSON.stringify(raw));
      console.log(`[SALES_AI_CFG] auto-seeded config for accountId=${accountId}`);
    }
    if (!raw) return c.json({ ok: true, accountId, config: null });
    // Return only webhook-relevant fields (exclude internal metadata)
    const config = {
      enabled: raw.enabled ?? false,
      welcomeMessage: raw.welcomeMessage ?? "",
      fallbackMessage: raw.fallbackMessage ?? "",
      handoffMessage: raw.handoffMessage ?? "",
      tone: raw.tone ?? "friendly",
      goal: raw.goal ?? "demo",
      cta: raw.cta ?? { label: "", url: "" },
      intents: Array.isArray(raw.intents) ? raw.intents.map((i: any) => ({
        key: i.key, label: i.label, keywords: i.keywords ?? [],
        reply: i.reply ?? "", ctaLabel: i.ctaLabel ?? "", ctaUrl: i.ctaUrl ?? "",
      })) : [],
      llm: raw.llm ?? { enabled: false, model: "", systemPrompt: "", temperature: 0.7, maxTokens: 800 },
    };
    return c.json({ ok: true, accountId, config });
  } catch {
    return c.json({ ok: true, accountId, config: null });
  }
});

// POST /sales-ai/chat — LLM fallback for sales LINE (internal only, x-internal-token auth)
// Completely separate from tenant AI接客 (POST /ai/chat).
app.post("/sales-ai/chat", async (c) => {
  const env = c.env as any;

  // ── Auth: require LINE_INTERNAL_TOKEN (same as /internal/* routes) ──
  const expected = String(env?.LINE_INTERNAL_TOKEN ?? "").trim();
  const provided = String(c.req.header("x-internal-token") ?? "").trim();
  if (!expected || !provided || provided !== expected) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }

  const apiKey: string | undefined = env?.OPENAI_API_KEY;
  if (!apiKey) return c.json({ ok: false, error: "not_configured" });

  const body: any = await c.req.json().catch(() => ({}));
  let accountId = String(body?.accountId ?? "").trim();
  const tenantId = String(body?.tenantId ?? "").trim();
  const message = String(body?.message ?? "").trim();
  if (!message) return c.json({ ok: false, error: "missing message" }, 400);

  const kv = env?.SAAS_FACTORY;
  if (!kv) return c.json({ ok: false, error: "kv_unavailable" }, 500);

  // Reverse lookup: tenantId → first active sales lineAccount → fallback to tenantId as accountId
  if (!accountId && tenantId) {
    try {
      const settings = await kv.get(`settings:${tenantId}`, "json") as any;
      const salesAcct = (settings?.lineAccounts ?? []).find(
        (a: any) => a?.purpose === "sales" && a?.status === "active" && a?.id
      );
      if (salesAcct) {
        accountId = salesAcct.id;
        console.log(`[SALES_AI_CHAT] tenantId reverse lookup: ${tenantId} → accountId=${accountId}`);
      }
    } catch {}
    // Legacy single-account fallback: use tenantId as accountId
    if (!accountId) {
      accountId = tenantId;
      console.log(`[SALES_AI_CHAT] legacy fallback: using tenantId=${tenantId} as accountId`);
    }
  }

  if (!accountId) return c.json({ ok: false, error: "missing accountId (no sales lineAccount found)" }, 400);

  try {
    const raw = await kv.get(`owner:sales-ai:${accountId}`, "json") as any;
    if (!raw?.llm?.enabled) return c.json({ ok: false, error: "llm_disabled" });

    const config = raw;
    const model = config.llm.model?.trim() || "gpt-4o";
    const intentSummary = (config.intents ?? []).map((i: any) => `${i.label}(${i.key})`).join(", ");
    const systemPrompt = [
      `あなたはLumiBookの営業アシスタントです。トーン: ${config.tone ?? "friendly"}。ゴール: ${config.goal ?? "demo"}。`,
      `既存のキーワード応答（${intentSummary}）にマッチしなかったメッセージに対して、自然で有用な返答を生成してください。`,
      `CTAがある場合: ${config.cta?.url || "なし"}`,
      config.llm.systemPrompt ? `\nカスタム指示:\n${config.llm.systemPrompt}` : "",
    ].filter(Boolean).join("\n");

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: config.llm.temperature ?? 0.7,
        max_output_tokens: config.llm.maxTokens ?? 800,
      }),
    });
    const openaiStatus = openaiRes.status;
    const openaiData = await openaiRes.json().catch(() => null) as any;
    if (!openaiRes.ok || !openaiData) {
      const errPreview = JSON.stringify(openaiData ?? {}).slice(0, 300);
      console.log(`[SALES_AI_CHAT] openai_error status=${openaiStatus} model=${model} accountId=${accountId} body=${errPreview}`);
      return c.json({ ok: false, error: "openai_error", openaiHttpStatus: openaiStatus, openaiErrorPreview: errPreview });
    }
    const answer = extractResponseText(openaiData);
    if (!answer) {
      const keys = Object.keys(openaiData ?? {}).join(",");
      console.log(`[SALES_AI_CHAT] empty response model=${model} accountId=${accountId} keys=${keys}`);
      return c.json({ ok: false, error: "empty_response", openaiHttpStatus: openaiStatus, openaiKeys: keys });
    }

    console.log(`[SALES_AI_CHAT] ok model=${model} accountId=${accountId} answerLen=${answer.length}`);
    return c.json({ ok: true, answer, model });
  } catch (e: any) {
    console.error(`[SALES_AI_CHAT] error: ${String(e?.message ?? e).slice(0, 200)}`);
    return c.json({ ok: false, error: "internal_error", detail: String(e?.message ?? e).slice(0, 200) }, 500);
  }
});

// GET /ai/enabled — lightweight AI enabled check (no auth, single KV read)
// GET /admin/ai/usage — AI Core usage log (recent entries)
app.get("/admin/ai/usage", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const kv = (c.env as any)?.SAAS_FACTORY;
  if (!kv) return c.json({ ok: true, tenantId, usage: [] });
  try {
    const { readRecentUsageLogs } = await import("./ai/usage-log");
    const logs = await readRecentUsageLogs(kv, tenantId, limit);
    return c.json({ ok: true, tenantId, usage: logs });
  } catch (err: any) {
    return c.json({ ok: false, tenantId, error: err?.message ?? "usage_log_error" }, 500);
  }
});

// ── Agent Core Admin Endpoints ────────────────────────────────────────────

// ── LINE Core Admin Endpoints ─────────────────────────────────────────────

// GET /admin/line-core/status — LINE Core health status
app.get("/admin/line-core/status", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  try {
    const lc = new LineCore(c.env as any);
    const status = await lc.getHealthStatus(tenantId);
    const coreSettings = await lc.getCoreSettings(tenantId);
    return c.json({ ok: true, tenantId, status, coreSettings });
  } catch (err: any) {
    return c.json({ ok: false, tenantId, error: err?.message ?? "status_error" }, 500);
  }
});

// GET /admin/line-core/logs — recent LINE inbound/outbound logs
app.get("/admin/line-core/logs", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  try {
    const lc = new LineCore(c.env as any);
    const logs = await lc.getRecentLogs(tenantId, limit);
    return c.json({ ok: true, tenantId, logs });
  } catch (err: any) {
    return c.json({ ok: false, tenantId, error: err?.message ?? "logs_error" }, 500);
  }
});

// POST /admin/line-core/test-push — test push message (owner only)
app.post("/admin/line-core/test-push", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  try {
    const body: any = await c.req.json().catch(() => ({}));
    const userId = String(body?.userId ?? "").trim();
    const text = String(body?.text ?? "LINE Core テスト送信").trim();
    if (!userId) return c.json({ ok: false, error: "userId required" }, 400);
    const lc = new LineCore(c.env as any);
    const result = await lc.pushText(tenantId, userId, text, `test:${tenantId}:${Date.now()}`);
    return c.json({ ok: true, tenantId, result });
  } catch (err: any) {
    return c.json({ ok: false, tenantId, error: err?.message ?? "test_push_error" }, 500);
  }
});

// POST /admin/line-core/webhook-check — verify webhook signature works
app.post("/admin/line-core/webhook-check", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  try {
    const lc = new LineCore(c.env as any);
    const config = await lc.getTenantConfig(tenantId);
    return c.json({
      ok: true,
      tenantId,
      configured: !!config,
      hasToken: !!config?.messaging?.channelAccessToken,
      hasSecret: !!config?.messaging?.channelSecret,
      botUserId: config?.messaging?.botUserId ?? null,
    });
  } catch (err: any) {
    return c.json({ ok: false, tenantId, error: err?.message ?? "check_error" }, 500);
  }
});

// GET /admin/agents — list registered agent types
app.get("/admin/agents", async (c) => {
  return c.json({ ok: true, agents: listAgents() });
});

// GET /admin/agents/logs — recent agent execution logs
app.get("/admin/agents/logs", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const agentId = c.req.query("agentId");
  const kv = (c.env as any)?.SAAS_FACTORY;
  if (!kv) return c.json({ ok: true, tenantId, logs: [] });
  try {
    const logs = agentId
      ? await readAgentLogs(kv, tenantId, agentId, limit)
      : await readRecentAgentLogs(kv, tenantId, limit);
    return c.json({ ok: true, tenantId, logs });
  } catch (err: any) {
    return c.json({ ok: false, tenantId, error: err?.message ?? "agent_log_error" }, 500);
  }
});

// POST /admin/agents/trigger — manually trigger an agent (for testing)
app.post("/admin/agents/trigger", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  try {
    const body: any = await c.req.json().catch(() => ({}));
    const { agentType, triggerType, payload } = body;
    if (!agentType || !triggerType) {
      return c.json({ ok: false, error: "agentType and triggerType required" }, 400);
    }
    const { runAgent } = await import("./agents/core");
    const result = await runAgent(
      { tenantId, agentType, triggerType, triggerPayload: payload ?? {} },
      c.env as any,
    );
    return c.json({ ok: true, tenantId, result: { status: result?.state?.status, agentId: result?.state?.agentId, steps: result?.steps?.length ?? 0 } });
  } catch (err: any) {
    return c.json({ ok: false, tenantId, error: err?.message ?? "trigger_error" }, 500);
  }
});

app.get("/ai/enabled", async (c) => {
  const tenantId = getTenantId(c, null);
  const kv = (c.env as any)?.SAAS_FACTORY;
  if (!kv) return c.json({ ok: true, tenantId, enabled: false, source: "no_kv" });
  // Prefer unified settings:{tenantId}.ai, fall back to legacy ai:settings:{tenantId}
  const settingsDoc = await aiGetJson(kv, `settings:${tenantId}`);
  if (settingsDoc?.ai?.enabled !== undefined) {
    const enabled = settingsDoc.ai.enabled === true;
    console.log(`[AI_GATE] tenant=${tenantId} enabled=${enabled} source=unified path=/ai/enabled`);
    return c.json({ ok: true, tenantId, enabled, source: "unified" });
  }
  const s = await aiGetJson(kv, `ai:settings:${tenantId}`);
  const enabled = s?.enabled === true;
  console.log(`[AI_GATE] tenant=${tenantId} enabled=${enabled} source=legacy path=/ai/enabled`);
  return c.json({ ok: true, tenantId, enabled, source: "legacy" });
});

// POST /ai/chat — OpenAI Responses API (AI_CHAT_V4)
// V4変更点: intent分類 + intent別suggestedActions + CTA自然挿入
app.post("/ai/chat", async (c) => {
  const STAMP = "AI_CHAT_V4";
  const env = c.env as any;
  let tenantId = "default";
  const isDebug = c.req.query("debug") === "1";
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  try {
    const body: any = await c.req.json().catch(() => ({}));
    tenantId = getTenantId(c, body);

    // 1. OPENAI_API_KEY チェック（未設定は not_configured を 200 で返す）
    const apiKey: string | undefined = env?.OPENAI_API_KEY;
    if (!apiKey) {
      return c.json({ ok: false, stamp: STAMP, tenantId, error: "not_configured", detail: "OPENAI_API_KEY missing" });
    }

    // 2. ユーザーメッセージ検証
    const message = String(body?.message ?? "").trim();
    if (!message) {
      return c.json({ ok: false, stamp: STAMP, tenantId, error: "missing_message", detail: "message is required" });
    }

    // 3. モデル選択（env.OPENAI_MODEL → "gpt-4o"）
    const model = String(env?.OPENAI_MODEL || "gpt-4o").trim() || "gpt-4o";

    // 4. テナントの AI 設定・ポリシー・FAQ・upsell・店舗設定・メニュー を KV から取得
    const kv = env?.SAAS_FACTORY;
    let aiSettings: any = { voice: "friendly", character: "", answerLength: "normal" };
    let aiPolicy: any = { prohibitedTopics: [] as string[], hardRules: [] as string[] };
    let aiFaq: any[] = [];
    let aiUpsell: any = { ...AI_DEFAULT_UPSELL };
    let storeSettings: any = null;
    let menuList: any[] = [];
    if (kv) {
      const [s, p, f, u, ss, ml] = await Promise.all([
        aiGetJson(kv, `ai:settings:${tenantId}`),
        aiGetJson(kv, `ai:policy:${tenantId}`),
        aiGetJson(kv, `ai:faq:${tenantId}`),
        aiGetJson(kv, `ai:upsell:${tenantId}`),
        aiGetJson(kv, `settings:${tenantId}`),
        aiGetJson(kv, `admin:menu:list:${tenantId}`),
      ]);
      // Prefer unified settings.ai, fall back to legacy ai:settings:{tenantId}
      const unifiedAi = ss?.ai;
      const legacyAi = s;
      const aiSource = unifiedAi ? "unified" : (legacyAi ? "legacy" : "default");
      const effectiveAi = unifiedAi || legacyAi;
      if (effectiveAi && typeof effectiveAi === "object") aiSettings = { ...aiSettings, ...effectiveAi };

      if (p && typeof p === "object") aiPolicy = { ...aiPolicy, ...p };
      if (Array.isArray(f)) aiFaq = f.filter((x: any) => x.enabled !== false);
      if (u && typeof u === "object") aiUpsell = { ...AI_DEFAULT_UPSELL, ...u };
      if (ss && typeof ss === "object") storeSettings = ss;
      if (Array.isArray(ml)) menuList = ml.filter((m: any) => m.active !== false);
    }

    console.log(`[AI_SETTINGS_LOAD]`, JSON.stringify({
      tenantId,
      enabled: aiSettings.enabled ?? false,
      voice: aiSettings.voice,
      answerLength: aiSettings.answerLength,
      characterPresent: !!aiSettings.character,
      source: kv ? (storeSettings?.ai ? "unified" : "legacy") : "default",
    }));

    // aiConfig snapshot — returned in ALL responses for webhook observability
    const aiConfig = {
      enabled: aiSettings.enabled === true,
      voice: aiSettings.voice ?? "friendly",
      answerLength: aiSettings.answerLength ?? "normal",
      character: aiSettings.character ? String(aiSettings.character).slice(0, 50) : "",
    };

    // 4.4 AI 有効判定（管理画面の「AI接客を有効化」トグルを反映）
    if (aiSettings.enabled !== true) {
      console.log(`[AI_GATE] tenant=${tenantId} enabled=false path=/ai/chat`);
      return c.json({ ok: false, stamp: STAMP, tenantId, error: "ai_disabled", aiConfig });
    }

    // 4.5 レート制限（KV, 60 req / 10 min per tenantId+IP）
    const ip = c.req.header("cf-connecting-ip") || c.req.header("x-real-ip") || "unknown";
    const rlKey = `ai:rl:${tenantId}:${ip}`;
    if (kv) {
      try {
        const rlRaw = await kv.get(rlKey);
        const rl = rlRaw ? JSON.parse(rlRaw) : { count: 0, windowStart: Date.now() };
        const now = Date.now();
        if (now - rl.windowStart > 600000) { rl.count = 1; rl.windowStart = now; }
        else { rl.count++; }
        if (rl.count > 60) {
          return c.json({ ok: false, stamp: STAMP, tenantId, error: "rate_limited" }, 429);
        }
        await kv.put(rlKey, JSON.stringify(rl), { expirationTtl: 700 });
      } catch { /* RL errors are non-fatal */ }
    }

    // 4.6 FAQ 優先マッチ：enabled な FAQ に質問が一致したら OpenAI をスキップ
    const faqMatch = aiFaq.find((fItem: any) => {
      const q = String(fItem.question ?? "").toLowerCase().trim();
      const m = message.toLowerCase();
      return q && (m === q || m.includes(q) || q.includes(m));
    });
    if (faqMatch) {
      let faqAnswer = String(faqMatch.answer ?? "").trim();
      if (faqAnswer) {
        const faqIntent = classifyIntent(message);
        const faqBookingUrl = resolveBookingUrl(storeSettings, env, tenantId);
        const suggestedActions = buildSuggestedActions(faqIntent, faqBookingUrl);
        const cta = buildCtaText(faqIntent, faqBookingUrl);
        if (cta) faqAnswer = faqAnswer + cta;
        return c.json({ ok: true, stamp: STAMP, tenantId, answer: faqAnswer, suggestedActions, intent: faqIntent, source: "faq", aiConfig });
      }
    }

    // 5. 店舗情報コンテキスト構築（未設定項目は安全に省略）
    const storeContextLines: string[] = [];
    if (storeSettings) {
      const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];
      const sn = storeSettings.storeName;
      if (sn) storeContextLines.push(`店舗名: ${sn}`);
      const addr = storeSettings.storeAddress;
      if (addr) storeContextLines.push(`住所: ${addr}`);
      const bh = storeSettings.businessHours;
      if (bh?.openTime && bh?.closeTime) storeContextLines.push(`営業時間: ${bh.openTime}〜${bh.closeTime}`);
      const cw: number[] = storeSettings.closedWeekdays;
      if (Array.isArray(cw) && cw.length > 0) {
        storeContextLines.push(`定休日: ${cw.map((d: number) => WEEKDAY_NAMES[d] ?? String(d)).join("・")}曜日`);
      }
      const bookingUrl = storeSettings.integrations?.line?.bookingUrl
        || (env?.WEB_BASE ? `${env.WEB_BASE}/booking?tenantId=${tenantId}` : "");
      if (bookingUrl) storeContextLines.push(`予約ページURL: ${bookingUrl}`);
      const cancel = storeSettings.rules?.cancelMinutes;
      if (typeof cancel === "number" && cancel > 0) {
        const h = Math.floor(cancel / 60);
        const m = cancel % 60;
        const txt = h > 0 ? (m > 0 ? `${h}時間${m}分前` : `${h}時間前`) : `${m}分前`;
        storeContextLines.push(`キャンセル期限: 予約の${txt}まで`);
      }
    }
    // メニュー要約（上位10件、名前・価格・所要時間のみ）
    if (menuList.length > 0) {
      const menuSummary = menuList.slice(0, 10).map((m: any) => {
        const parts = [m.name];
        if (typeof m.price === "number") parts.push(`¥${m.price.toLocaleString()}`);
        if (typeof m.durationMin === "number") parts.push(`${m.durationMin}分`);
        return parts.join(" / ");
      }).join("\n");
      storeContextLines.push(`\nメニュー一覧:\n${menuSummary}`);
    }
    const storeBlock = storeContextLines.length > 0
      ? "\n\n## 店舗情報（この情報に基づいて正確に案内してください）\n" + storeContextLines.join("\n")
      : "";

    // 5.1 FAQ / ポリシーブロック
    const faqBlock = aiFaq.length > 0
      ? "\n\n## FAQ（よくある質問と回答）\n" +
        aiFaq.slice(0, 20).map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")
      : "";
    const hardRulesBlock = (aiPolicy.hardRules as string[]).length > 0
      ? "\n\n## 禁止ルール\n" + (aiPolicy.hardRules as string[]).map((r: string) => `- ${r}`).join("\n")
      : "";
    const prohibitedBlock = (aiPolicy.prohibitedTopics as string[]).length > 0
      ? "\n\n## 禁止トピック: " + (aiPolicy.prohibitedTopics as string[]).join(", ")
      : "";

    // voice / answerLength を具体的な日本語指示に変換
    const voiceMap: Record<string, string> = {
      friendly: "親しみやすく温かい口調で話してください。絵文字を適度に使い、お客様との距離が近い接客をしてください。",
      formal: "丁寧で礼儀正しい敬語を使ってください。「です・ます」調で、落ち着いた品のある接客をしてください。",
      casual: "気さくでカジュアルな口調で話してください。堅苦しくない、友達のような自然体の接客をしてください。",
      professional: "専門的で信頼感のある口調で話してください。的確で簡潔に、プロフェッショナルな接客をしてください。",
    };
    const answerLengthMap: Record<string, string> = {
      short: "回答は1〜2文の簡潔なものにしてください。",
      normal: "回答は適度な長さ（3〜4文程度）にしてください。",
      long: "回答は丁寧に詳しく説明してください。",
    };
    const voiceInstruction = voiceMap[aiSettings.voice] ?? voiceMap.friendly;
    const lengthInstruction = answerLengthMap[aiSettings.answerLength] ?? answerLengthMap.normal;

    // Phase 13: vertical-aware AI prompt injection
    const verticalPlugin = getVerticalPlugin(storeSettings?.vertical);
    const verticalAiHint = verticalPlugin.aiConfig?.systemPromptHint
      ? `\n## 業種情報\n${verticalPlugin.aiConfig.systemPromptHint}`
      : "";
    const verticalSafetyNotes = verticalPlugin.aiConfig?.safetyNotes
      ? `\n## 業種固有の注意事項\n${verticalPlugin.aiConfig.safetyNotes}`
      : "";
    const verticalBookingEmphasis = verticalPlugin.aiConfig?.bookingEmphasis
      ? `\n予約誘導のヒント: ${verticalPlugin.aiConfig.bookingEmphasis}`
      : "";

    const systemContent = [
      storeSettings?.storeName
        ? `あなたは「${storeSettings.storeName}」のAIアシスタントです。`
        : "あなたはお店のAIアシスタントです。",
      aiSettings.character ? `キャラクター設定: ${aiSettings.character}` : "",
      voiceInstruction,
      lengthInstruction,
      verticalAiHint,
      storeBlock,
      "",
      "## 絶対に守るルール",
      "- 予約はフォームでのみ確定します。あなたは予約を作ったり確約したりしません。",
      "- 店舗情報セクションに記載された情報はそのまま案内してください。",
      "- 店舗情報セクションに無い情報は「お問い合わせください」と案内してください。",
      "- 料金は店舗情報のメニュー一覧に記載がある場合のみ案内し、空き枠は断定しません。",
      "- 予約に関する質問には「予約フォームからご予約ください」と案内してください（URLはシステムが自動追記するため回答文に含めないでください）。",
      "- 医療・法律・政治・宗教などのアドバイスはしません。",
      "- booking created や reservation confirmed などの行動を起こしたとは絶対に言いません。",
      faqBlock,
      hardRulesBlock,
      prohibitedBlock,
      verticalSafetyNotes,
      verticalBookingEmphasis,
    ].filter(Boolean).join("\n");

    console.log(`[AI_PROMPT_BUILD]`, JSON.stringify({
      tenantId,
      voice: aiSettings.voice,
      answerLength: aiSettings.answerLength,
      characterPreview: String(aiSettings.character ?? "").slice(0, 40) || "(none)",
      usedDefaultCharacter: !aiSettings.character,
      storeBlockLen: storeBlock.length,
      faqCount: aiFaq.length,
      model,
      systemPromptLen: systemContent.length,
    }));

    // 6. AI Core 経由での呼び出し（fallback: 従来の直接 OpenAI Responses API）
    let answer = "";
    let aiCoreUsed = false;

    // 6a. AI Core path — unified provider routing with fallback
    try {
      const aiCore = new AICore(env as any);
      if (aiCore.hasProvider("openai") || aiCore.hasProvider("gemini")) {
        const aiCoreVars: Record<string, string> = {
          characterLine: [
            storeSettings?.storeName
              ? `あなたは「${storeSettings.storeName}」のAIアシスタントです。`
              : "あなたはお店のAIアシスタントです。",
            aiSettings.character ? `キャラクター設定: ${aiSettings.character}` : "",
          ].filter(Boolean).join("\n"),
          voiceInstruction,
          lengthInstruction,
          verticalAiHint,
          storeBlock,
          faqBlock,
          hardRulesBlock,
          prohibitedBlock,
          verticalSafetyNotes,
          verticalBookingEmphasis,
          message,
        };

        const result = await aiCore.generateText({
          capability: "text_generation",
          tenantId,
          app: "booking",
          feature: "concierge",
          task: "booking_reply",
          promptKey: "booking.concierge.reply.v1",
          variables: aiCoreVars,
          maxOutputTokens: 1600,
          fallbackEnabled: true,
          channel: "line",
        });

        if (result.meta.success && result.text) {
          answer = result.text;
          aiCoreUsed = true;
          console.log(`[AI_CORE] booking_reply success provider=${result.meta.provider} model=${result.meta.model} latency=${result.meta.latencyMs}ms fallback=${result.meta.fallbackUsed}`);
        }
      }
    } catch (aiCoreErr: any) {
      console.error(`[AI_CORE] booking_reply failed, falling back to legacy:`, aiCoreErr?.message ?? aiCoreErr);
    }

    // 6b. Legacy direct OpenAI Responses API (fallback if AI Core didn't produce answer)
    if (!answer) {
      const openaiPayload = {
        model,
        store: false,
        max_output_tokens: 1600,
        input: [
          { role: "system", content: systemContent },
          { role: "user", content: message },
        ],
      };

      let openaiRes: any = null;
      let openaiStatus = 0;
      try {
        const r = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(openaiPayload),
        });
        openaiStatus = r.status;
        openaiRes = await r.json().catch(() => null);
      } catch (fetchErr: any) {
        return c.json({ ok: false, stamp: STAMP, tenantId, error: "upstream_error", detail: String(fetchErr?.message ?? fetchErr) });
      }

      if (!openaiRes || openaiStatus !== 200) {
        const detail = openaiRes?.error?.message ?? openaiRes?.error ?? `HTTP ${openaiStatus}`;
        return c.json({ ok: false, stamp: STAMP, tenantId, error: "upstream_error", detail: String(detail) });
      }

      // retrieve ポーリング（incomplete / in_progress / queued のとき最大 3 回待つ）
      const statusHistory: string[] = [String(openaiRes?.status ?? "unknown")];
      const RETRY_DELAYS_MS = [250, 400, 650] as const;
      const responseId: string | undefined = openaiRes?.id;
      const needsPoll = (s: string) => s === "incomplete" || s === "in_progress" || s === "queued";

      if (responseId && needsPoll(openaiRes?.status)) {
        for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
          await sleep(RETRY_DELAYS_MS[i]);
          try {
            const rr = await fetch(`https://api.openai.com/v1/responses/${responseId}`, {
              method: "GET",
              headers: { "Authorization": `Bearer ${apiKey}` },
            });
            if (rr.ok) {
              const retrieved: any = await rr.json().catch(() => null);
              if (retrieved && typeof retrieved === "object") {
                openaiRes = retrieved;
                statusHistory.push(String(retrieved?.status ?? "unknown"));
              }
            }
          } catch {
            // retrieve 失敗は無視して最後の状態を使い続ける
          }
          if (!needsPoll(openaiRes?.status)) break;
        }
      }

      if (openaiRes?.status === "incomplete") {
        const rawHint = isDebug ? {
          statusHistory,
          outputTypes: Array.isArray(openaiRes?.output)
            ? openaiRes.output.map((x: any) => x?.type ?? null)
            : null,
          incompleteDetails: openaiRes?.incomplete_details ?? null,
        } : undefined;
        return c.json({
          ok: false, stamp: STAMP, tenantId,
          error: "incomplete",
          detail: "OpenAI response did not complete (token limit exceeded)",
          ...(rawHint !== undefined ? { rawHint } : {}),
        });
      }

      answer = extractResponseText(openaiRes);
      if (!answer) {
        const rawHint = isDebug ? {
          statusHistory,
          keys: Object.keys(openaiRes),
          responseStatus: openaiRes?.status,
          outputLength: Array.isArray(openaiRes?.output) ? openaiRes.output.length : null,
          outputTypes: Array.isArray(openaiRes?.output)
            ? openaiRes.output.map((x: any) => x?.type ?? null)
            : null,
          hasOutputText: typeof openaiRes?.output_text === "string",
          outputTextLen: typeof openaiRes?.output_text === "string" ? openaiRes.output_text.length : 0,
          firstContentInfo: Array.isArray(openaiRes?.output) && openaiRes.output.length > 0
            && Array.isArray(openaiRes.output[0]?.content)
            ? openaiRes.output[0].content.map((x: any) => ({
                type: x?.type ?? null,
                hasText: typeof x?.text === "string",
                textLen: typeof x?.text === "string" ? x.text.length : 0,
              }))
            : null,
        } : undefined;
        return c.json({
          ok: false, stamp: STAMP, tenantId,
          error: "empty_response",
          detail: isDebug ? "No text extracted (debug)" : "No text extracted",
          ...(rawHint !== undefined ? { rawHint } : {}),
        });
      }
    }

    // 10. Intent分類 + suggestedActions + CTA挿入
    const intent = classifyIntent(message);
    const bookingUrl = resolveBookingUrl(storeSettings, env, tenantId);
    const suggestedActions = buildSuggestedActions(intent, bookingUrl);
    const cta = buildCtaText(intent, bookingUrl);
    if (cta) answer = answer + cta;

    // 11. Upsell injection: キーワードに一致する upsell メッセージを末尾追記
    if (aiUpsell.enabled && Array.isArray(aiUpsell.items) && aiUpsell.items.length > 0) {
      const matchedUpsells = (aiUpsell.items as any[]).filter((item: any) => {
        if (item.enabled === false) return false;
        const kw = String(item.keyword ?? "").toLowerCase().trim();
        return kw && (message.toLowerCase().includes(kw) || answer.toLowerCase().includes(kw));
      });
      if (matchedUpsells.length > 0) {
        const upsellText = matchedUpsells.map((u: any) => String(u.message ?? "")).filter(Boolean).join("\n");
        if (upsellText) answer = answer + "\n\n" + upsellText;
      }
    }

    console.log(`[LINE_AI_REPLY]`, JSON.stringify({
      tenantId,
      intent,
      answerLen: answer.length,
      model,
      voice: aiSettings.voice,
      answerLength: aiSettings.answerLength,
      source: "openai",
    }));

    return c.json({ ok: true, stamp: STAMP, tenantId, answer, suggestedActions, intent, aiConfig });

  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e), aiConfig: typeof aiConfig !== "undefined" ? aiConfig : undefined });
  }
});

/* === /AI_CONCIERGE_V1 === */

/* === AI_SALES_OPS_V1 === */
// KV keys: ai:upsell:{tenantId}
// DB cols: followup_at, followup_status, followup_sent_at, followup_error (added in 0007)

// GET /admin/ai/upsell
app.get("/admin/ai/upsell", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "AI_UPSELL_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const u = await aiGetJson(kv, `ai:upsell:${tenantId}`);
    return c.json({ ok: true, tenantId, stamp: STAMP, upsell: { ...AI_DEFAULT_UPSELL, ...(u || {}) } });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// PUT /admin/ai/upsell
app.put("/admin/ai/upsell", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const STAMP = "AI_UPSELL_PUT_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body: any = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, stamp: STAMP, error: "bad_json" }, 400);
    const key = `ai:upsell:${tenantId}`;
    const ex = (await aiGetJson(kv, key)) || {};
    const merged = { ...AI_DEFAULT_UPSELL, ...ex, ...body };
    await kv.put(key, JSON.stringify(merged));
    return c.json({ ok: true, tenantId, stamp: STAMP, upsell: merged });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// GET /admin/ai/followups — last 50 followup rows for a tenant
app.get("/admin/ai/followups", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const STAMP = "AI_FOLLOWUPS_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const db = (c.env as any).DB;
    if (!db) return c.json({ ok: false, stamp: STAMP, error: "db_missing" }, 500);
    const { results } = await db.prepare(
      `SELECT id, line_user_id, customer_name, slot_start, followup_at, followup_status, followup_sent_at, followup_error
       FROM reservations
       WHERE tenant_id = ? AND followup_status IS NOT NULL
       ORDER BY followup_at DESC
       LIMIT 50`
    ).bind(tenantId).all();
    return c.json({ ok: true, tenantId, stamp: STAMP, followups: results ?? [] });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

/* === /AI_SALES_OPS_V1 === */

// POST /ai/dedup — LINE イベント重複排除 check-and-set (管理者認証不要)
// key: "ai:evt:{tenantId}:{eventKey}"  TTL: 30-300秒
// 返却: { isNew: true } → 未処理（続行可）  { isNew: false } → 重複（スキップ推奨）
app.post("/ai/dedup", async (c) => {
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ isNew: true });
    const body: any = await c.req.json().catch(() => null);
    const key = body?.key ? String(body.key) : "";
    // セキュリティ: ai:evt: プレフィックスのみ許可
    if (!key || !key.startsWith("ai:evt:")) return c.json({ isNew: true });
    const ttl = Math.min(300, Math.max(30, Number(body.ttlSeconds ?? 120)));
    const existing = await kv.get(key);
    if (existing !== null) return c.json({ isNew: false });
    await kv.put(key, "1", { expirationTtl: ttl });
    return c.json({ isNew: true });
  } catch {
    return c.json({ isNew: true }); // エラー時は処理継続（best-effort）
  }
});

// POST /ai/pushq — push 送信失敗時のリトライキュー enqueue (管理者認証不要)
// key: ai:pushq:{tenantId}:{id}  TTL: 最大 600秒（10分）
// token は受け取らず、tenantId + userId + messages のみ保存。
// 再送信時は Workers が config を KV から再取得する設計（実装は別途）。
app.post("/ai/pushq", async (c) => {
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "no_kv" });
    const body: any = await c.req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const userId   = String(body?.userId   ?? "").trim();
    if (!tenantId || !userId) return c.json({ ok: false, error: "missing_fields" });
    const ttl = Math.min(600, Math.max(60, Number(body.ttlSeconds ?? 600)));
    const id  = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key = `ai:pushq:${tenantId}:${id}`;
    await kv.put(key, JSON.stringify({
      tenantId,
      userId,
      messages: Array.isArray(body.messages) ? body.messages : [],
      enqueuedAt: new Date().toISOString(),
    }), { expirationTtl: ttl });
    return c.json({ ok: true, key });
  } catch {
    return c.json({ ok: false, error: "internal" });
  }
});

// POST /ai/linelog — LINE push 結果ログを KV に記録（直近50件・認証不要）
// key: ai:linelog:{tenantId}  TTL: 7日
// body: { tenantId, type, uid(先頭8文字), pushStatus, pushBodySnippet, aiMs }
app.post("/ai/linelog", async (c) => {
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "no_kv" });

    const body: any = await c.req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    if (!tenantId) return c.json({ ok: false, error: "missing_tenantId" });

    const entry = {
      ts:              new Date().toISOString(),
      type:            String(body?.type            ?? "unknown").slice(0, 32),
      uid:             String(body?.uid             ?? "").slice(0, 12),
      pushStatus:      Number(body?.pushStatus      ?? 0),
      pushBodySnippet: String(body?.pushBodySnippet ?? "").slice(0, 200),
      aiMs:            Number(body?.aiMs            ?? 0),
    };

    const kvKey = `ai:linelog:${tenantId}`;
    let logs: any[] = [];
    try {
      const raw = await kv.get(kvKey);
      if (raw) logs = JSON.parse(raw);
    } catch { /* ignore */ }

    logs.unshift(entry);               // 最新を先頭に
    if (logs.length > 50) logs = logs.slice(0, 50);

    await kv.put(kvKey, JSON.stringify(logs), { expirationTtl: 86400 * 7 });
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false, error: "internal" });
  }
});

// GET /ai/linelog?tenantId=xxx — ログ取得（ADMIN_TOKEN 必須）
app.get("/ai/linelog", async (c) => {
  const env = c.env as any;
  const kv  = env.SAAS_FACTORY;
  if (!kv) return c.json({ ok: false, error: "no_kv" }, 500);

  // 簡易 admin 認証（X-Admin-Token ヘッダー or ?token= クエリ）
  const adminToken = String(env.ADMIN_TOKEN ?? "").trim();
  if (adminToken) {
    const provided =
      c.req.header("X-Admin-Token") ??
      c.req.query("token") ??
      "";
    if (provided !== adminToken) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }
  }

  const tenantId = c.req.query("tenantId") ?? "";
  if (!tenantId) return c.json({ ok: false, error: "missing_tenantId" }, 400);

  let logs: any[] = [];
  try {
    const raw = await kv.get(`ai:linelog:${tenantId}`);
    if (raw) logs = JSON.parse(raw);
  } catch { /* ignore */ }

  return c.json({ ok: true, tenantId, count: logs.length, logs });
});

// Cron scheduled handler — AI followup LINE送信 + pushq consumer (*/5 * * * *)
async function scheduled(_event: any, env: Env, _ctx: any): Promise<void> {
  const kv = (env as any).SAAS_FACTORY;
  if (!kv) return;

  // ── Outreach followup automation (Phase 4) ────────────────────────────────
  const db = (env as any).DB;
  if (db) {
    const OUTREACH_STAMP = "OUTREACH_FOLLOWUP_CRON_V1";
    try {
      const nowIso = new Date().toISOString();
      // Phase 4.5: Clear stale processing locks (older than 5 minutes)
      const staleCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await db.prepare(
        "UPDATE outreach_followups SET processing_at = NULL WHERE status = 'scheduled' AND processing_at IS NOT NULL AND processing_at < ?"
      ).bind(staleCutoff).run();

      // Find scheduled followups that are due and not being processed
      const followups = await db.prepare(
        `SELECT f.id, f.tenant_id, f.lead_id, f.step, f.attempt_count
         FROM outreach_followups f
         WHERE f.status = 'scheduled' AND f.scheduled_at <= ? AND f.processing_at IS NULL
         LIMIT 20`
      ).bind(nowIso).all();

      for (const row of (followups.results ?? []) as any[]) {
        const { id: fId, tenant_id: fTenantId, lead_id: fLeadId, step: fStep, attempt_count: fAttempts } = row;
        try {
          // Phase 4.5: Acquire processing lock
          await db.prepare(
            "UPDATE outreach_followups SET processing_at = ?, attempt_count = ? WHERE id = ? AND processing_at IS NULL"
          ).bind(nowIso, (fAttempts ?? 0) + 1, fId).run();
          // Check lead is still in contactable state
          const lead = await db.prepare(
            "SELECT id, pipeline_stage, store_name, contact_email, line_url FROM sales_leads WHERE id = ? AND tenant_id = ?"
          ).bind(fLeadId, fTenantId).first();

          if (!lead || ['lost', 'customer', 'meeting'].includes((lead as any).pipeline_stage)) {
            await db.prepare("UPDATE outreach_followups SET status = 'skipped' WHERE id = ?").bind(fId).run();
            continue;
          }

          // Check unsub
          const unsubKey = `outreach:unsub:${fTenantId}:${fLeadId}`;
          if (await kv.get(unsubKey) === "1") {
            await db.prepare("UPDATE outreach_followups SET status = 'skipped' WHERE id = ?").bind(fId).run();
            continue;
          }

          // Read outreach settings for send mode
          let sendMode: "safe" | "real" = "safe";
          try {
            const settingsRaw = await kv.get(`outreach:settings:${fTenantId}`);
            if (settingsRaw) sendMode = JSON.parse(settingsRaw).sendMode ?? "safe";
          } catch { /* default safe */ }

          // Generate followup message (AI when key available, otherwise template)
          const stepLabel = fStep === "first_followup" ? "1回目" : fStep === "second_followup" ? "2回目" : "最終";
          const isBreakup = fStep === "breakup";
          let fSubject: string;
          let fBody: string;

          const openaiKey = (env as any).OPENAI_API_KEY;
          if (openaiKey) {
            try {
              const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages: [
                    { role: "system", content: isBreakup
                      ? `あなたはB2B営業の担当者です。最終フォローアップ（breakup）メールを書いてください。丁寧に、しかし明確に「最後のご連絡」であることを伝え、今後は連絡しない旨を伝えてください。短く3-4文で。件名と本文をJSON形式で返してください: {"subject":"...", "body":"..."}`
                      : `あなたはB2B営業の担当者です。${stepLabel}のフォローアップメールを書いてください。前回の営業メールへの返信がない状況です。丁寧で簡潔に、3-4文で。件名と本文をJSON形式で返してください: {"subject":"...", "body":"..."}` },
                    { role: "user", content: `宛先: ${(lead as any).store_name}様` },
                  ],
                  response_format: { type: "json_object" },
                  temperature: 0.3, max_tokens: 300,
                }),
              });
              if (aiRes.ok) {
                const aiData = (await aiRes.json()) as any;
                const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");
                fSubject = parsed.subject || `${(lead as any).store_name}様 — フォローアップ（${stepLabel}）`;
                fBody = parsed.body || `${(lead as any).store_name}様\n\nフォローアップのご連絡です。`;
              } else {
                throw new Error(`AI ${aiRes.status}`);
              }
            } catch {
              // Fallback to template
              fSubject = `${(lead as any).store_name}様 — フォローアップ（${stepLabel}）`;
              fBody = isBreakup
                ? `${(lead as any).store_name}様\n\n何度かご連絡させていただきましたが、お忙しいところ恐縮です。\n本メールを最後のご連絡とさせていただきます。\nもし今後ご興味が出ましたら、いつでもお気軽にご連絡ください。`
                : `${(lead as any).store_name}様\n\n先日ご連絡させていただいた件につきまして、${stepLabel}のフォローアップをお送りいたします。\nご興味がございましたら、お気軽にご返信ください。`;
            }
          } else {
            fSubject = `${(lead as any).store_name}様 — フォローアップ（${stepLabel}）`;
            fBody = isBreakup
              ? `${(lead as any).store_name}様\n\n何度かご連絡させていただきましたが、お忙しいところ恐縮です。\n本メールを最後のご連絡とさせていただきます。\nもし今後ご興味が出ましたら、いつでもお気軽にご連絡ください。`
              : `${(lead as any).store_name}様\n\n先日ご連絡させていただいた件につきまして、${stepLabel}のフォローアップをお送りいたします。\nご興味がございましたら、お気軽にご返信ください。`;
          }

          // Save as draft
          const msgId = `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          await db.prepare(
            `INSERT INTO lead_message_drafts (id, lead_id, tenant_id, kind, subject, body, status, tone, created_at)
             VALUES (?, ?, ?, 'email', ?, ?, 'sent', 'friendly', ?)`
          ).bind(msgId, fLeadId, fTenantId, fSubject, fBody, nowIso).run();

          // Actually send via resolveProvider (real mode uses Resend, safe mode logs only)
          const { resolveProvider: resolveFuProvider } = await import("./outreach/send-provider");
          const fuProvider = resolveFuProvider(sendMode, {
            RESEND_API_KEY: (env as any).RESEND_API_KEY,
            EMAIL_FROM: (env as any).EMAIL_FROM,
          });
          const fuSendResult = await fuProvider.send({
            leadId: fLeadId,
            tenantId: fTenantId,
            channel: "email",
            to: (lead as any).contact_email || "",
            subject: fSubject,
            body: fBody,
          });

          // Record delivery event with actual send result
          const evtStatus = fuSendResult.success ? "sent" : "failed";
          const evtId = `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          await db.prepare(
            `INSERT INTO outreach_delivery_events (id, tenant_id, lead_id, message_id, channel, event_type, status, metadata_json, created_at)
             VALUES (?, ?, ?, ?, 'email', ?, ?, ?, ?)`
          ).bind(evtId, fTenantId, fLeadId, msgId, evtStatus, evtStatus, JSON.stringify({ provider: fuProvider.name, sendMode, step: fStep, messageId: fuSendResult.messageId || null, error: fuSendResult.error || null }), nowIso).run();

          // Update followup record (Phase 4.5: include provider_message_id, clear processing_at)
          const fuStatus = fuSendResult.success ? "sent" : "failed";
          await db.prepare(
            "UPDATE outreach_followups SET status = ?, sent_at = ?, message_id = ?, provider_message_id = ?, processing_at = NULL WHERE id = ?"
          ).bind(fuStatus, nowIso, msgId, fuSendResult.messageId || `${fuProvider.name}_${fId}`, fId).run();

          // Phase 4.5: Record normalized outreach event
          const oEvtId = `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          await db.prepare(
            `INSERT INTO outreach_events (id, tenant_id, lead_id, type, metadata, created_at)
             VALUES (?, ?, ?, 'followup_send', ?, ?)`
          ).bind(oEvtId, fTenantId, fLeadId, JSON.stringify({ step: fStep, messageId: msgId, sendMode, provider: fuProvider.name, sent: fuSendResult.success }), nowIso).run();

          // Update last_contacted_at only if actually sent
          if (fuSendResult.success) {
            await db.prepare(
              "UPDATE sales_leads SET last_contacted_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?"
            ).bind(nowIso, nowIso, fLeadId, fTenantId).run();

            // Breakup: mark lead as 'lost' to prevent further outreach
            if (isBreakup) {
              await db.prepare(
                "UPDATE sales_leads SET pipeline_stage = 'lost', updated_at = ? WHERE id = ? AND tenant_id = ? AND pipeline_stage NOT IN ('meeting', 'customer')"
              ).bind(nowIso, fLeadId, fTenantId).run();
            }
          }

          console.log(`[${OUTREACH_STAMP}] ${fuStatus} ${fStep} to ${fLeadId} (${sendMode}, provider=${fuProvider.name})`);
        } catch (itemErr: any) {
          console.error(`[${OUTREACH_STAMP}] Error processing followup ${fId}:`, itemErr?.message);
          // Phase 4.5: Clear processing lock so it can be retried next cron
          try {
            await db.prepare("UPDATE outreach_followups SET processing_at = NULL WHERE id = ?").bind(fId).run();
          } catch { /* ignore cleanup error */ }
        }
      }
    } catch (cronErr: any) {
      console.error(`[${OUTREACH_STAMP}] Cron error:`, cronErr?.message);
    }
  }

  // ── AI followup (D1 が必要) ────────────────────────────────────────────────
  if (db) {
    const STAMP = "AI_FOLLOWUP_CRON_V1";
    try {
      const now = new Date().toISOString();
      const { results } = await db.prepare(
        `SELECT id, tenant_id, line_user_id, customer_name, slot_start
         FROM reservations
         WHERE followup_status = 'pending'
           AND followup_at IS NOT NULL
           AND followup_at <= ?
         LIMIT 50`
      ).bind(now).all();

      if (results && results.length > 0) {
        for (const row of results) {
          const { id, tenant_id: tId, line_user_id: lineUserId, customer_name: custName, slot_start: slotStart } = row as any;

          // No LINE user → skip
          if (!lineUserId) {
            await db.prepare(`UPDATE reservations SET followup_status = 'skipped', followup_sent_at = ? WHERE id = ?`)
              .bind(now, id).run().catch(() => null);
            continue;
          }

          // Fetch channelAccessToken from KV settings
          let channelAccessToken: string | null = null;
          try {
            const settingsRaw = await kv.get(`settings:${tId}`);
            if (settingsRaw) {
              const s = JSON.parse(settingsRaw);
              channelAccessToken = s?.integrations?.line?.channelAccessToken ?? null;
            }
          } catch { /* ignore */ }

          if (!channelAccessToken) {
            await db.prepare(`UPDATE reservations SET followup_status = 'skipped', followup_sent_at = ?, followup_error = ? WHERE id = ?`)
              .bind(now, "no_channel_token", id).run().catch(() => null);
            continue;
          }

          // Fetch retention template
          let template = "{{customerName}}様、先日はご来店ありがとうございました！またのご来店をお待ちしております。";
          try {
            const ret = await aiGetJson(kv, `ai:retention:${tId}`);
            if (ret?.enabled && ret?.followupTemplate) template = String(ret.followupTemplate);
          } catch { /* ignore */ }

          // Build message
          const visitDate = slotStart ? new Date(slotStart).toLocaleDateString("ja-JP") : "";
          const msg = template
            .replace("{{customerName}}", custName || "お客様")
            .replace("{{visitDate}}", visitDate);

          // Send LINE push
          try {
            const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${channelAccessToken}`,
              },
              body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: msg }] }),
            });
            if (lineRes.ok) {
              await db.prepare(`UPDATE reservations SET followup_status = 'sent', followup_sent_at = ? WHERE id = ?`)
                .bind(now, id).run().catch(() => null);
            } else {
              const errText = await lineRes.text().catch(() => `HTTP ${lineRes.status}`);
              await db.prepare(`UPDATE reservations SET followup_status = 'failed', followup_sent_at = ?, followup_error = ? WHERE id = ?`)
                .bind(now, errText.slice(0, 200), id).run().catch(() => null);
            }
          } catch (sendErr: any) {
            await db.prepare(`UPDATE reservations SET followup_status = 'failed', followup_sent_at = ?, followup_error = ? WHERE id = ?`)
              .bind(now, String(sendErr?.message ?? sendErr).slice(0, 200), id).run().catch(() => null);
          }
        }
      }
    } catch (e: any) {
      console.error(`[${STAMP}] error:`, String(e?.message ?? e));
    }
  }

  // ── pushq consumer: push 失敗リトライ (KV のみ・token 不保持設計) ──────────
  // key: ai:pushq:{tenantId}:{id}  → channelAccessToken は settings KV から再取得
  const PUSHQ_STAMP = "PUSHQ_CONSUMER_V1";
  try {
    const { keys } = await kv.list({ prefix: "ai:pushq:", limit: 50 });
    if (keys && keys.length > 0) {
      console.log(`[${PUSHQ_STAMP}] processing ${keys.length} items`);
      for (const { name: qKey } of keys) {
        try {
          const raw = await kv.get(qKey);
          if (!raw) continue; // already expired/deleted

          const item = JSON.parse(raw) as { tenantId: string; userId: string; messages: any[] };
          const { tenantId: tId, userId, messages } = item;
          if (!tId || !userId || !Array.isArray(messages)) {
            await kv.delete(qKey);
            continue;
          }

          // channelAccessToken を settings KV から再取得（token は pushq に保存しない）
          let channelAccessToken: string | null = null;
          try {
            const settingsRaw = await kv.get(`settings:${tId}`);
            if (settingsRaw) {
              const s = JSON.parse(settingsRaw);
              channelAccessToken = s?.integrations?.line?.channelAccessToken ?? null;
            }
          } catch { /* ignore */ }

          if (!channelAccessToken) {
            // token が消えた場合はリトライ不可 → 破棄
            console.log(`[${PUSHQ_STAMP}] discard key=...${qKey.slice(-12)} reason=no_token`);
            await kv.delete(qKey);
            continue;
          }

          const pushRes = await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${channelAccessToken}`,
            },
            body: JSON.stringify({ to: userId, messages }),
          });
          const pushBody = await pushRes.text().catch(() => "");

          // uid/token は先頭6文字のみログ
          console.log(
            `[${PUSHQ_STAMP}] tenant=${tId} uid=${userId.slice(0, 6)}*** ` +
            `st=${pushRes.status} ok=${pushRes.ok} body=${pushBody.slice(0, 80)}`
          );

          if (pushRes.ok) {
            await kv.delete(qKey); // 成功 → キューから削除
          }
          // 失敗時は TTL 切れまで残す（次の cron で再試行）
        } catch (itemErr: any) {
          console.error(`[${PUSHQ_STAMP}] item error:`, String(itemErr?.message ?? itemErr));
        }
      }
    }
  } catch (pushqErr: any) {
    console.error(`[${PUSHQ_STAMP}] list error:`, String(pushqErr?.message ?? pushqErr));
  }

  // ── Phase 7: Learning Auto Refresh (every 24h per tenant) ──────────────
  if (db) {
    const LEARN_STAMP = "LEARNING_AUTO_REFRESH_V1";
    try {
      // Only run at JST midnight-ish (hour 0-1) to minimize cron load
      const learnNowJst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
      const learnHour = learnNowJst.getHours();
      if (learnHour >= 0 && learnHour <= 1) {
        const { autoRefreshAllTenants } = await import("./outreach/learning");
        const learnUid = () => `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const learnNow = () => new Date().toISOString();
        const result = await autoRefreshAllTenants(db, learnUid, learnNow);
        if (result.tenantsProcessed > 0) {
          console.log(`[${LEARN_STAMP}] Processed ${result.tenantsProcessed} tenants, ${result.totalUpdated} patterns, ${result.totalTemplates} templates`);
        }
      }
    } catch (learnErr: any) {
      console.error(`[${LEARN_STAMP}] error:`, String(learnErr?.message ?? learnErr));
    }
  }

  // ── Phase 8.2: Source Quality Daily Aggregation (JST midnight) ──────────
  if (db) {
    const SQD_STAMP = "SOURCE_QUALITY_DAILY_V1";
    try {
      const sqdNowJst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
      const sqdHour = sqdNowJst.getHours();
      // Run at JST 1-2 AM (after learning refresh at 0-1)
      if (sqdHour >= 1 && sqdHour <= 2) {
        const { aggregateSourceQualityDaily } = await import("./outreach/source-quality-daily");
        const sqdUid = () => `sqd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const sqdNow = () => new Date().toISOString();
        const result = await aggregateSourceQualityDaily(db, sqdUid, sqdNow);
        if (result.rowsUpserted > 0) {
          console.log(`[${SQD_STAMP}] ${result.tenantsProcessed} tenants, ${result.rowsUpserted} rows upserted`);
        }
      }
    } catch (sqdErr: any) {
      console.error(`[${SQD_STAMP}] error:`, String(sqdErr?.message ?? sqdErr));
    }
  }

  // ── Phase 11: Auto Outreach Scheduler (runs at configured times) ────────
  if (db) {
    const SCHED_STAMP = "OUTREACH_SCHEDULER_V1";
    try {
      const { processScheduledJobs } = await import("./outreach/automation");
      const schedUid = () => `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const schedNow = () => new Date().toISOString();
      const schedResult = await processScheduledJobs(db, kv, schedUid, schedNow, {
        GOOGLE_MAPS_API_KEY: (env as any).GOOGLE_MAPS_API_KEY,
        OPENAI_API_KEY: (env as any).OPENAI_API_KEY,
        RESEND_API_KEY: (env as any).RESEND_API_KEY,
        EMAIL_FROM: (env as any).EMAIL_FROM,
      });
      if (schedResult.processed > 0 || schedResult.errors > 0) {
        console.log(`[${SCHED_STAMP}] processed=${schedResult.processed} errors=${schedResult.errors}`);
      }
    } catch (schedErr: any) {
      console.error(`[${SCHED_STAMP}] error:`, String(schedErr?.message ?? schedErr));
    }
  }

  // ── Phase 13: Auto Action Engine (cron) ────────────────────────────────
  if (db) {
    const AAE_STAMP = "AUTO_ACTION_ENGINE_V1";
    try {
      const { processAutoActions } = await import("./outreach/action-engine");
      const aaeUid = () => `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const aaeNow = () => new Date().toISOString();
      const aaeResult = await processAutoActions(db, kv, aaeUid, aaeNow, {
        GOOGLE_MAPS_API_KEY: (env as any).GOOGLE_MAPS_API_KEY,
        OPENAI_API_KEY: (env as any).OPENAI_API_KEY,
      });
      if (aaeResult.processed > 0 || aaeResult.errors > 0) {
        console.log(`[${AAE_STAMP}] processed=${aaeResult.processed} skipped=${aaeResult.skipped} errors=${aaeResult.errors}`);
      }
    } catch (aaeErr: any) {
      console.error(`[${AAE_STAMP}] error:`, String(aaeErr?.message ?? aaeErr));
    }
  }

  // ── Phase 14: Auto Reply Engine (cron) ────────────────────────────────
  if (db) {
    const ARE_STAMP = "AUTO_REPLY_ENGINE_V1";
    try {
      const { processUnhandledReplies, getAutoReplySettings } = await import("./outreach/reply-dispatcher");
      const areUid = () => `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const areNow = () => new Date().toISOString();

      // Process all tenants that have unhandled replies
      const tenantRows = await db
        .prepare("SELECT DISTINCT tenant_id FROM outreach_replies WHERE ai_handled = 0 LIMIT 20")
        .all<{ tenant_id: string }>();

      for (const row of tenantRows.results ?? []) {
        const tid = row.tenant_id;
        const arSettings = await getAutoReplySettings(kv, tid);
        if (!arSettings.autoReplyEnabled) continue;

        const areResult = await processUnhandledReplies({
          db, kv, tenantId: tid,
          openaiApiKey: (env as any).OPENAI_API_KEY,
          resendApiKey: (env as any).RESEND_API_KEY,
          emailFrom: (env as any).EMAIL_FROM,
          uid: areUid, now: areNow,
        });
        if (areResult.processed > 0 || areResult.errors > 0) {
          console.log(`[${ARE_STAMP}] tenant=${tid} processed=${areResult.processed} sent=${areResult.sent} skipped=${areResult.skipped} errors=${areResult.errors}`);
        }
      }
    } catch (areErr: any) {
      console.error(`[AUTO_REPLY_ENGINE_V1] error:`, String(areErr?.message ?? areErr));
    }
  }

  // ── Phase 15: Auto Close Engine (cron) ────────────────────────────────
  if (db) {
    const ACE_STAMP = "AUTO_CLOSE_ENGINE_V1";
    try {
      const { classifyCloseIntent } = await import("./outreach/close-classifier");
      const { getCloseSettings, generateCloseResponse } = await import("./outreach/close-generator");
      const { CLOSE_INTENT_TO_STAGE } = await import("./outreach/types");
      const aceUid = () => `cl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const aceNow = () => new Date().toISOString();

      // Find tenants with replies that have been classified (intent set) but not close-evaluated
      const tenantRows = await db
        .prepare(
          `SELECT DISTINCT tenant_id FROM outreach_replies
           WHERE intent IS NOT NULL AND close_intent IS NULL
           LIMIT 20`
        )
        .all<{ tenant_id: string }>();

      for (const row of tenantRows.results ?? []) {
        const tid = row.tenant_id;
        const closeSettings = await getCloseSettings(kv, tid);
        if (!closeSettings.auto_close_enabled) continue;

        // Get unprocessed replies (classified by Phase 14 but not close-evaluated)
        const replies = await db
          .prepare(
            `SELECT id, lead_id, reply_text, intent, close_intent
             FROM outreach_replies
             WHERE tenant_id = ?1 AND intent IS NOT NULL AND close_intent IS NULL
             ORDER BY created_at ASC LIMIT 10`
          )
          .bind(tid)
          .all();

        let evaluated = 0;
        for (const reply of replies.results ?? []) {
          try {
            const result = await classifyCloseIntent(
              reply.reply_text as string,
              (env as any).OPENAI_API_KEY
            );

            // Update reply
            await db
              .prepare(
                `UPDATE outreach_replies
                 SET close_intent = ?1, close_confidence = ?2, recommended_next_step = ?3,
                     deal_temperature = ?4, handoff_required = ?5
                 WHERE id = ?6 AND tenant_id = ?7`
              )
              .bind(
                result.close_intent, result.close_confidence, result.recommended_next_step,
                result.deal_temperature, result.recommended_next_step === "human_followup" ? 1 : 0,
                reply.id, tid
              )
              .run();

            // Update lead
            const closeStage = CLOSE_INTENT_TO_STAGE[result.close_intent] || null;
            await db
              .prepare(
                `UPDATE sales_leads
                 SET deal_temperature = ?1, handoff_required = ?2, close_stage = ?3, close_evaluated_at = ?4, updated_at = ?5
                 WHERE id = ?6 AND tenant_id = ?7`
              )
              .bind(
                result.deal_temperature,
                result.recommended_next_step === "human_followup" ? 1 : 0,
                closeStage, aceNow(), aceNow(),
                reply.lead_id, tid
              )
              .run();

            // Close log
            await db
              .prepare(
                `INSERT INTO outreach_close_logs
                 (id, tenant_id, lead_id, reply_id, close_intent, close_confidence, deal_temperature,
                  suggested_action, execution_status, handoff_required, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
              )
              .bind(
                aceUid(), tid, reply.lead_id, reply.id,
                result.close_intent, result.close_confidence, result.deal_temperature,
                result.recommended_next_step,
                "suggested",
                result.recommended_next_step === "human_followup" ? 1 : 0,
                aceNow()
              )
              .run();

            evaluated++;

            // Auto-send close response if enabled and confidence is high enough
            if (
              closeSettings.auto_close_enabled &&
              result.close_confidence >= closeSettings.close_confidence_threshold &&
              result.close_intent !== "not_close_relevant" &&
              result.close_intent !== "cold_lead" &&
              result.recommended_next_step !== "human_followup" &&
              result.recommended_next_step !== "mark_lost"
            ) {
              const lead = await db
                .prepare("SELECT store_name FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
                .bind(reply.lead_id as string, tid)
                .first<{ store_name: string }>();

              // Phase 18: Inject learning context into close response
              let closeLearningCtx = null;
              try {
                const { getLearningContext } = await import("./outreach/learning");
                closeLearningCtx = await getLearningContext(db, tid);
              } catch { /* learning optional */ }

              const closeResp = await generateCloseResponse({
                closeIntent: result.close_intent,
                dealTemperature: result.deal_temperature,
                recommendedNextStep: result.recommended_next_step,
                replyText: reply.reply_text as string,
                storeName: lead?.store_name || "弊社",
                settings: closeSettings,
                openaiApiKey: (env as any).OPENAI_API_KEY,
                learningContext: closeLearningCtx,
              });

              // Log the auto-generated response (but don't auto-send unless specific settings are on)
              const shouldAutoSend =
                (result.recommended_next_step === "send_pricing" && closeSettings.auto_send_pricing_enabled) ||
                (result.recommended_next_step === "send_demo_link" && closeSettings.auto_send_demo_link_enabled) ||
                (result.recommended_next_step === "send_booking_link" && closeSettings.auto_send_booking_link_enabled);

              // Actually send if auto-send is enabled for this action
              let closeSent = false;
              let closeError: string | null = null;
              if (shouldAutoSend) {
                try {
                  const { resolveProvider: resolveCloseProvider } = await import("./outreach/send-provider");
                  let closeSendMode: "safe" | "real" = "safe";
                  try {
                    const osRaw = await kv.get(`outreach:settings:${tid}`);
                    if (osRaw) closeSendMode = JSON.parse(osRaw).sendMode ?? "safe";
                  } catch { /* default safe */ }
                  const closeProvider = resolveCloseProvider(closeSendMode, {
                    RESEND_API_KEY: (env as any).RESEND_API_KEY,
                    EMAIL_FROM: (env as any).EMAIL_FROM,
                  });
                  const leadContact = await db
                    .prepare("SELECT contact_email FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
                    .bind(reply.lead_id, tid)
                    .first<{ contact_email: string | null }>();
                  if (leadContact?.contact_email) {
                    const closeSendResult = await closeProvider.send({
                      leadId: reply.lead_id as string,
                      tenantId: tid,
                      channel: "email",
                      to: leadContact.contact_email,
                      subject: "Re: お問い合わせありがとうございます",
                      body: closeResp.response_text,
                    });
                    closeSent = closeSendResult.success;
                    if (!closeSendResult.success) closeError = closeSendResult.error || "close_send_failed";
                  } else {
                    closeError = "no_contact_email";
                  }
                } catch (sendErr: any) {
                  closeError = sendErr.message || "close_dispatch_error";
                }
              }

              await db
                .prepare(
                  `INSERT INTO outreach_close_logs
                   (id, tenant_id, lead_id, reply_id, close_intent, close_confidence, deal_temperature,
                    suggested_action, ai_response, execution_status, handoff_required, created_at)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
                )
                .bind(
                  aceUid(), tid, reply.lead_id, reply.id,
                  result.close_intent, result.close_confidence, result.deal_temperature,
                  result.recommended_next_step, closeResp.response_text,
                  shouldAutoSend ? (closeSent ? "auto_sent" : `failed:${closeError}`) : "pending_review",
                  closeResp.handoff_required ? 1 : 0,
                  aceNow()
                )
                .run();

              // Phase 18: Track booking event if a link was sent
              if (closeSent && (result.recommended_next_step === "send_booking_link" || result.recommended_next_step === "send_demo_link" || result.recommended_next_step === "send_pricing")) {
                try {
                  await db.prepare(
                    `INSERT INTO outreach_booking_events
                     (id, tenant_id, lead_id, event_type, created_at)
                     VALUES (?1, ?2, ?3, 'link_sent', ?4)`
                  ).bind(aceUid(), tid, reply.lead_id, aceNow()).run();
                } catch { /* booking event tracking is best-effort */ }
              }

              // Phase 18: Auto-handoff for escalations
              if (closeResp.handoff_required) {
                try {
                  await db.prepare(
                    `INSERT INTO outreach_handoffs
                     (id, tenant_id, lead_id, reply_id, reason, priority, status, created_at)
                     VALUES (?1, ?2, ?3, ?4, 'escalation', ?5, 'open', ?6)`
                  ).bind(
                    aceUid(), tid, reply.lead_id, reply.id,
                    result.deal_temperature === "hot" ? "urgent" : "high",
                    aceNow()
                  ).run();
                } catch { /* handoff creation is best-effort */ }
              }
            }
          } catch (innerErr: any) {
            console.error(`[${ACE_STAMP}] reply ${reply.id} error:`, innerErr.message);
          }
        }

        if (evaluated > 0) {
          console.log(`[${ACE_STAMP}] tenant=${tid} evaluated=${evaluated}`);
        }
      }
    } catch (aceErr: any) {
      console.error(`[AUTO_CLOSE_ENGINE_V1] error:`, String(aceErr?.message ?? aceErr));
    }
  }

  // ── Phase 17: Auto Campaign Runner (cron) ────────────────────────────
  if (db) {
    const ACR_STAMP = "AUTO_CAMPAIGN_RUNNER_V1";
    try {
      const { runAutoCampaign } = await import("./outreach/automation");
      const acrUid = () => `ac_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const acrNow = () => new Date().toISOString();

      // Find tenants with autoCampaignEnabled
      // Use a simple heuristic: check tenants that have new leads with scores
      const tenantRows = await db
        .prepare(
          `SELECT DISTINCT tenant_id FROM sales_leads
           WHERE pipeline_stage = 'new' AND contact_email IS NOT NULL AND score >= 60
           LIMIT 20`
        )
        .all<{ tenant_id: string }>();

      const { writeHealthSnapshot, checkAndAutoPause } = await import("./outreach/monitoring");

      for (const row of tenantRows.results ?? []) {
        const tid = row.tenant_id;

        // Phase 18: Auto-pause check before processing
        const wasPaused = await checkAndAutoPause(db, kv, tid);
        if (wasPaused) {
          console.log(`[${ACR_STAMP}] tenant=${tid} auto-paused, skipping`);
          continue;
        }

        const acrResult = await runAutoCampaign(db, kv, tid, acrUid, acrNow, {
          OPENAI_API_KEY: (env as any).OPENAI_API_KEY,
          RESEND_API_KEY: (env as any).RESEND_API_KEY,
          EMAIL_FROM: (env as any).EMAIL_FROM,
        });
        if (acrResult.processed > 0 || acrResult.errors > 0) {
          console.log(`[${ACR_STAMP}] tenant=${tid} processed=${acrResult.processed} drafted=${acrResult.drafted} sent=${acrResult.sent} skipped=${acrResult.skipped} errors=${acrResult.errors}`);
        }

        // Phase 18: Write health snapshot
        try {
          await writeHealthSnapshot(db, tid, "AUTO_CAMPAIGN", acrResult.sent, acrResult.errors, acrUid, acrNow);
        } catch { /* monitoring is best-effort */ }
      }
    } catch (acrErr: any) {
      console.error(`[${ACR_STAMP}] error:`, String(acrErr?.message ?? acrErr));
    }
  }

  // ── LINE 1日前リマインド ────────────────────────────────────────────────────
  if (db) {
    const REM_STAMP = "LINE_REMINDER_V1";
    const DRY_RUN = String((env as any).REMINDER_DRY_RUN ?? "").trim() === "1";
    try {
      // 現在の JST 時刻
      const nowJst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
      const nowHour = nowJst.getHours();

      // 翌日の日付（JST）を YYYY-MM-DD 形式で取得
      const tomorrow = new Date(nowJst);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }); // "YYYY-MM-DD"

      // 翌日の予約を取得（LINE ユーザー ID が登録済みのもの）
      const { results: remRows } = await db.prepare(
        `SELECT r.id, r.tenant_id, r.line_user_id, r.customer_name, r.slot_start,
                r.staff_id, r.meta
         FROM reservations r
         WHERE r.${SQL_ACTIVE_FILTER}
           AND r.line_user_id IS NOT NULL
           AND r.line_user_id != ''
           AND substr(r.slot_start, 1, 10) = ?
         LIMIT 100`
      ).bind(tomorrowStr).all();

      if (!remRows || remRows.length === 0) {
        console.log(`[${REM_STAMP}] no rows for tomorrow=${tomorrowStr} hour=${nowHour}`);
      } else {
        // テナント別にグルーピング
        const byTenant = new Map<string, typeof remRows>();
        for (const row of remRows) {
          const tid = String((row as any).tenant_id ?? "");
          if (!tid) continue;
          if (!byTenant.has(tid)) byTenant.set(tid, []);
          byTenant.get(tid)!.push(row);
        }

        for (const [tId, rows] of byTenant) {
          // テナント設定を KV から取得
          let settings: any = {};
          try {
            const raw = await kv.get(`settings:${tId}`);
            if (raw) settings = JSON.parse(raw);
          } catch { /* ignore */ }

          const reminderCfg = settings?.notifications?.lineReminder;
          if (!reminderCfg?.enabled) {
            console.log(`[${REM_STAMP}] tenant=${tId} reminder disabled → skip`);
            continue;
          }

          const sendAtHour: number = typeof reminderCfg.sendAtHour === "number" ? reminderCfg.sendAtHour : 18;
          if (nowHour !== sendAtHour) {
            // 指定時刻と JST 時刻が一致しない → スキップ
            continue;
          }

          const accessToken = String(settings?.integrations?.line?.channelAccessToken ?? "").trim();
          if (!accessToken) {
            console.log(`[${REM_STAMP}] tenant=${tId} no channelAccessToken → skip`);
            continue;
          }

          const storeName = String(settings?.storeName ?? "").trim();
          const storeAddress = String(settings?.storeAddress ?? "").trim();

          // スタッフ一覧を KV から取得（staffName 解決用）
          let staffMap: Record<string, string> = {};
          try {
            const staffRaw = await kv.get(`admin:staff:list:${tId}`);
            if (staffRaw) {
              const list: any[] = JSON.parse(staffRaw);
              for (const s of list) {
                if (s?.id && s?.name) staffMap[String(s.id)] = String(s.name);
              }
            }
          } catch { /* ignore */ }

          // メニュー一覧を KV から取得（menuName 解決用）
          let menuMap: Record<string, string> = {};
          try {
            const menuRaw = await kv.get(`admin:menu:list:${tId}`);
            if (menuRaw) {
              const list: any[] = JSON.parse(menuRaw);
              for (const m of list) {
                if (m?.id && m?.name) menuMap[String(m.id)] = String(m.name);
              }
            }
          } catch { /* ignore */ }

          const templateStr = String(reminderCfg.template ?? "").trim() ||
            "【{storeName}】明日 {date} {time} のご予約があります。";

          const nowIso = new Date().toISOString();

          for (const row of rows) {
            const resId = String((row as any).id ?? "");
            const lineUserId = String((row as any).line_user_id ?? "");
            const slotStart = String((row as any).slot_start ?? "");
            const staffId = String((row as any).staff_id ?? "");

            // 予約日時を JST に変換
            let dateStr = "";
            let timeStr = "";
            try {
              const d = new Date(slotStart);
              dateStr = d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
              timeStr = d.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
            } catch { /* ignore */ }

            // meta から menuId を取得
            let menuName = "";
            try {
              const meta = (row as any).meta ? JSON.parse(String((row as any).meta)) : {};
              const menuId = String(meta?.menuId ?? "");
              menuName = menuId ? (menuMap[menuId] ?? "") : (String(meta?.menuName ?? ""));
            } catch { /* ignore */ }

            const staffName = staffId ? (staffMap[staffId] ?? "") : "";

            // 管理 URL（Workers は origin を知らないので settings から bookingUrl ベースを作る）
            const bookingUrl = String(settings?.integrations?.line?.bookingUrl ?? "").trim();
            const manageUrl = bookingUrl
              ? bookingUrl.replace(/\/booking(\?.*)?$/, `/booking/reservations?tenantId=${encodeURIComponent(tId)}`)
              : "";

            // テンプレート変数を置換
            const msg = templateStr
              .replace(/\{storeName\}/g, storeName)
              .replace(/\{date\}/g, dateStr)
              .replace(/\{time\}/g, timeStr)
              .replace(/\{menuName\}/g, menuName)
              .replace(/\{staffName\}/g, staffName)
              .replace(/\{address\}/g, storeAddress)
              .replace(/\{manageUrl\}/g, manageUrl);

            if (DRY_RUN) {
              // ドライラン：DB に dry_run として記録のみ（LINE 送信なし）
              try {
                await db.prepare(
                  `INSERT OR IGNORE INTO reminder_logs (tenant_id, reservation_id, kind, sent_at, status)
                   VALUES (?, ?, 'day_before', ?, 'dry_run')`
                ).bind(tId, resId, nowIso).run();
              } catch { /* ignore duplicate */ }
              console.log(`[${REM_STAMP}] DRY_RUN tenant=${tId} res=${resId} to=${lineUserId.slice(0, 6)}***`);
              continue;
            }

            // 重複防止: reminder_logs に INSERT（UNIQUE 制約違反 = 送信済み → スキップ）
            let inserted = false;
            try {
              const ins = await db.prepare(
                `INSERT OR IGNORE INTO reminder_logs (tenant_id, reservation_id, kind, sent_at, status)
                 VALUES (?, ?, 'day_before', ?, 'pending')`
              ).bind(tId, resId, nowIso).run();
              inserted = (ins?.meta?.changes ?? 0) > 0;
            } catch { /* ignore */ }

            if (!inserted) {
              console.log(`[${REM_STAMP}] skip(dup) tenant=${tId} res=${resId}`);
              continue;
            }

            // LINE push 送信
            try {
              const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: msg }] }),
              });
              if (lineRes.ok) {
                await db.prepare(
                  `UPDATE reminder_logs SET status = 'sent' WHERE tenant_id = ? AND reservation_id = ? AND kind = 'day_before'`
                ).bind(tId, resId).run().catch(() => null);
                console.log(`[${REM_STAMP}] sent tenant=${tId} res=${resId} to=${lineUserId.slice(0, 6)}***`);
              } else {
                const errTxt = await lineRes.text().catch(() => `HTTP ${lineRes.status}`);
                await db.prepare(
                  `UPDATE reminder_logs SET status = 'failed', error = ? WHERE tenant_id = ? AND reservation_id = ? AND kind = 'day_before'`
                ).bind(errTxt.slice(0, 200), tId, resId).run().catch(() => null);
                console.log(`[${REM_STAMP}] failed tenant=${tId} res=${resId} err=${errTxt.slice(0, 80)}`);
              }
            } catch (sendErr: any) {
              await db.prepare(
                `UPDATE reminder_logs SET status = 'failed', error = ? WHERE tenant_id = ? AND reservation_id = ? AND kind = 'day_before'`
              ).bind(String(sendErr?.message ?? sendErr).slice(0, 200), tId, resId).run().catch(() => null);
            }
          }
        }
      }
    } catch (remErr: any) {
      console.error(`[${REM_STAMP}] error:`, String(remErr?.message ?? remErr));
    }
  }

  // ── Agent Core Scheduler ─────────────────────────────────────────────────
  // Process all due scheduled agents across tenants
  try {
    const agentResult = await runAllDueAgents(env as any);
    if (agentResult.totalProcessed > 0) {
      console.log(`[AGENT_SCHEDULER] tenants=${agentResult.tenants} processed=${agentResult.totalProcessed}`);
    }
  } catch (agentErr: any) {
    console.error("[AGENT_SCHEDULER] error:", String(agentErr?.message ?? agentErr));
  }
}


















