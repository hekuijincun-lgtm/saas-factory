import { Hono } from "hono";
import { cors } from "hono/cors";
import Stripe from "stripe";
import { resolveVertical, DEFAULT_ADMIN_SETTINGS, mergeSettings, GENERIC_REPEAT_TEMPLATE } from "./settings";
import type { PlanId, SubscriptionInfo } from "./settings";
import { getRepeatConfig, getStyleLabel, buildRepeatMessage, DEFAULT_REPEAT_TEMPLATE } from "./verticals/eyebrow";
import { getVerticalPlugin } from "./verticals/registry";
import { registerOwnerRoutes, getOwnerIds, bootstrapOwnerIfEmpty, isPrincipalAllowed, normalizePrincipal } from "./routes/owner";
import { registerOwnerLeadRoutes } from "./routes/ownerLeads";
import { createOutreachRoutes } from "./outreach/routes";

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
type MenuItem = {
  id: string;
  name: string;
  price: number;
  durationMin: number;
  active: boolean;
  sortOrder: number;
  verticalAttributes?: Record<string, any>;
};

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
    const menu: any[] = raw ? JSON.parse(raw) : [];
    const idx = menu.findIndex((m: any) => m.id === itemId);
    if (idx < 0) return c.json({ ok: false, error: "menu_item_not_found" }, 404);

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



app.on(["PUT","PATCH"], "/admin/menu/:id", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const id = c.req.param("id");

    const key = `admin:menu:list:${tenantId}`;
    const list = ((await c.env.SAAS_FACTORY.get(key, "json")) as any[]) ?? [];

    const idx = list.findIndex((x) => x && x.id === id);
    if (idx < 0) return c.json({ ok: false, error: "not_found" }, 404);

    const patch = await c.req.json<any>();
    const updated = { ...list[idx], ...patch, id };

    list[idx] = updated;
    await c.env.SAAS_FACTORY.put(key, JSON.stringify(list));

    return c.json({ ok: true, tenantId, data: updated });
  } catch (e: any) {
    return c.json({ ok: false, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
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
    const VALID_VERTICALS = new Set(['eyebrow', 'nail', 'dental', 'hair', 'esthetic', 'generic']);
    const signupVertical: string | undefined = (typeof body.vertical === 'string' && VALID_VERTICALS.has(body.vertical))
      ? body.vertical : undefined;

    await kv.put(`signup:init:${tenantId}`, JSON.stringify({
      storeName, ownerEmail: rawEmail,
      ...(stripeInfo ? { stripe: stripeInfo } : {}),
      ...(fallbackPlanId ? { planId: fallbackPlanId } : {}),
      ...(signupVertical ? { vertical: signupVertical } : {}),
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
    const si: { storeName?: string; planId?: string; stripe?: { sessionId?: string; planId: string; customerId: string; subscriptionId: string } } = JSON.parse(signupInitRaw);
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
    // Determine subscription seed: Stripe-verified takes priority, then fallback planId
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
const RICHMENU_IMAGE_VERSION = "v10"; // v10: 3色(白/黒/グレージュ#C5B9A8) アイコン背景円+アクセントライン

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
const RICHMENU_IMAGE_V2_BASE64 = "iVBORw0KGgoAAAANSUhEUgAACcQAAAaWCAYAAACZfSwoAAAABmJLR0QA/wD/AP+gvaeTAAAgAElEQVR4nOzdTYxdZ3nA8efemXFi4QQUQ2IYdsSbcWyqBgE2dEFAfIlITSSUlR07gpaqUqtKFBLHIQqJY0KpUCtVhQYl5ittNzFSUD4QRIJAkBBUNW68sc0ixMSx6gqRwHjuPR9djD04tuMZz5z74ef8flJkz9Wcc96bu7l6/D/n7dR1XQcAAAAAMDCv/O63ERGx5so3jHopAAAAAJBad9QLAAAAAAAAAAAAgCYI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAAAAAAAEhBEAcAAAAAAAAAAEAKgjgAAAAAAAAAAABSEMQBAAAAAAAAAACQgiAOAAAAAAAAAACAFARxAAAAAAAAAAAApCCIAwAAAAAAAAAAIAVBHAAAAAAAAAAAACkI4gAAAAAA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tCZOnCi32y2TySSz2azY2Fg9/PDDObr+n//8p55++mnp2hCxU6dOuc4wduxYLVq0KNfXeduECRM0YsSIXF1jt9v11VdfKTMzU+np6crIyFBGRobS0tKUmZnpKaslJCTI4XAoNTXV857s36WlpcnhcCgzM1NpaWlyu91KTEyUblJ2K2o6d+6sFStWGB3Dq9atW6cRI0YoMzNTjzzyiFasWKGwsDCjYwEAgFxISUqQJIWElTY6CgAAKKIyMzNVt25dXbp0Sb1791Z0dLTRkaRrs6b09HSFhIQUq1MAsudagYGBstlsRscBAABAISo+31oBACjhHnjgAa1du1bHjh3TrFmztGXLFn366afq0aOH7rvvPr300ktq165dropx+/bt04svvujZFe6RRx5RdHS0KlWqVICf5Paee+45lSlTRhEREXI6nbrvvvv0f//3fzm6NjExUWPGjJGu7XKXlzJcfHy8li1bJkn6/e9/r6CgoFyvkV8nTpxQZmZmnoaMFy5cUIsWLQokV34FBwfnaPe3bAkJCQWap6hzu92aMWOGZsyYIbfbrT59+mj27Nm5+ncIAAAAAACKh23btunSpUtSETsu9fjx42rTpo0kKSAgQAEBAb+5c7+RsgtwkpSamiqHwyFJ2rFjR5E+gQEAAADeRyEOAIBi5r777tPKlSt14sQJzZ49W//617907Ngx9e7dWw0aNNCYMWPUunXrW65x8eJFRUZGav369XK73SpdurQiIyPVr1+/PO805219+vRRqVKl9Oyzz+rw4cOKiIjQ3//+99vmi4yM1IULFxQcHKwZM2bk6d4TJ05UZmamatSooQ8//NCQ8tG9997r+Ry5FRAQcMvfh4aGqly5cipdurRKlSqlwMBABQQEqFSpUgoKClJAQIDCwsIUFBSkwMBAhYaGeopsfn5+noJg9lPB1w9A/f39b1ogbNKkib766istWrRIHTt2zPVn+l8ul0tJSUnSdUe1pqeny263F7lhbF5lZmYqIiJCa9eulclk0rhx4/TCCy8YHQsAAAAAABSQmJgYSVL9+vX14IMPGh3nprJPGZCkK1euGB0HAAAAuCkKcQAAFFN16tTRsmXL9OKLL+q1117T5s2bdfjwYXXv3l0NGzbUmDFjfrVLWGZmppYvX67p06d7dt7q2rWroqKiFB4ebtAn+W2dOnXS8uXL1a9fP61evVrBwcGaNm3ab77/k08+0apVq6RrR57mZae7jz76SFu2bJF0tRhn1E5cKSkp0rUd1XIrLCxMkydPVpkyZVSmTBmVLVv2hn8acbSFxWKRru145g1ms1mlS189biz7n74kMTFR/fv31wcffCCbzabo6Gh17drV6FgAAAAAAKCAnDhxQnFxcZKkZ5991ug4NwgPD1f//v0VFBQkf39/WSwWhYaGGh3rlrJ3i0tISCiSc08AAAAULJPbW38rCQAADHX06FFNmzZNO3bs8PzsoYce0pgxY/SnP/1J7733nl599VWdOnVKklStWjXNmjVLjzzyiIGpc2bdunUaNmyY3G63Ro4cqbFjx/7qPXa7Xc2aNdO3336rxo0ba9OmTTKbzbm6T1ZWllq1aqVjx46padOm2rRpkxc/Rc65XC6Fh4fL7XZr9erVat++vSE5vOnRRx/V0aNHtWLFCnXu3NnoOEXaDz/8oB49eujkyZMqU6aMVq1apcaNGxsdCwAA5FNK0tUHUkLCfK/MDwBAcbdu3Tpt375dc+bMMezBuyFDhuidd95ReHi4jh07JpvNZkgOAAAAwBewQxwAAD6ifv36WrdunT777DNFRUVp7969OnDggLp06aLw8HBdvHhRurbj2AsvvKChQ4cWm8Fajx49dOXKFY0dO1azZ89WcHCwRowYccN75s6dq2+//VbBwcGaP39+rstw2WscO3ZMFotFU6ZM8eInyJ3U1FTPTmp52SGuKPL2DnG+6vPPP1evXr108eJFVa1aVe+8845q1KhhdCwAAAAAAHzW4cOHFRERIbvdrkOHDik6OlrNmjUr1Aw//fSTNm7cKEkaOHBgsZnZAQAAAEVV7v+mGAAAFGkNGzbUxo0bFRsbq0aNGkmSpwzn7++v1atXKyIiotgN1v7617/qhRdekCRNnjxZa9as8fzum2++0dy5cyVJkyZNUtWqVXO9/hdffKFZs2ZJkgYPHqz69et7LXtuZR+XKqnIHz+RUxTibi82NladOnXSxYsX1bBhQ23fvp0yHAAAAAAABax27doaMmSILBaLTp8+rS5duigiIkKpqamFlmHhwoVyOBwKDAzUM888U2j3BQAAAHwVhTgAAHxUkyZNtGXLFq1bt0516tSRJGVmZqpr164aNmyYTp8+bXTEXBs3bpz69u0rSRo5cqQOHjwop9Op559/Xna7Xc2bN9fAgQNzva7D4dCwYcOUmZmpe+6556ZHsham6weuvrZDnMvlMjpKkRQdHa2BAwcqIyNDnTt31qZNmxQeHm50LAAAAAAAfF5AQIAiIyP1/vvvq1atWnK73YqJidGf/vQn7du3r8Dvf+XKFa1atUqSNGDAAOYBAAAAgBdQiAMAwMe1adNGH3zwgebPn6/KlSvL6XRq7dq1evDBB/XKK6/o0qVLRkfMlVmzZqlRo0ay2+3q16+fJk2apE8//VRhYWGKjo6WyWTK9ZozZ87U8ePHZTKZNGfOHAUGBhZI9pxKTk72vA4JCTE0i7dkF+KysrKMjlKkOBwORUREKDIyUi6XS88//7zeeustBQQEGB0NAAAAAIASpWHDhoqLi1NERISsVqtOnTqlP//5z4qKiirQecayZcuUmpoqm82m5557rsDuAwAAAJQkFOIAACgBzGazevXqpYMHD2ry5MkqU6aM7Ha7Fi9erIYNGyo6Olp2u93omDni5+enFStWqGLFijp//rzmz58vSYqKilLlypV/9f6LFy/ecmi5bds2vf7665Kkvn37qlmzZgWYPmeuPzLVVwpxZvPVr51Op9PoKEVGQkKCnnrqKcXExMhqtWrOnDmaOHGi598VAAAAAAAoXDabTePHj9eOHTtUp04dOZ1OzZ49W4899pi+//57r98vKSlJixcvliT16dNHFSpU8Po9AAAAgJKIv20DAKAEsdls+tvf/qbPP/9cw4cPl81mU1JSkiIjI9W4cWPFxsYaHTFHwsPDNW/ePM+f27Ztq969e9/wnqysLA0ZMkT16tXTwoULb7rOyZMnNXjwYLlcLtWsWVNRUVEFnj0nfPHIVApxN/rPf/6jtm3bau/evQoNDdW6devUv39/o2MBAAAAAABJ999/v3bv3q1hw4bJZDLp888/V/PmzbV27Vqv3ic6OlqXL1+WzWbT8OHDvbo2AAAAUJJZjQ4AAAAKX+nSpRUZGakBAwZowoQJio2N1ffff6/+/furadOmioqKUr169YyOeUsffvihJKlMmTKaO3fur35vtVpVtmxZZWZmavr06erYsaOqVavm+f2VK1fUu3dvJScnKzAwUMuXLy8y5bPsHeICAgJktRbdr2snT57Uli1bdPjwYZ0/f15ZWVkKCQnRXXfdpfr166tdu3a65557JApxN9i3b5/69euny5cvq1KlSlq/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fK/XunVrLVy4UJL08ccf+1QhLiUlRc8884x27tzp+VlAQIB69OihYcOGFdiTn2azWa1atVKrVq20efNmjRkzRmfOnNHQoUO1b98+zZkzRxaLpUDuDQAAAAAAbtSrVy/de++96tOnj86dO6ehQ4fq8OHD2rp1qxwOh6pUqVJgD1gCOfXDDz9IUpGfzQUFBcnf39/oGLl2s9k2AAAofBTiAACAV5w5c0Y9evRQSkqKWrZsqZdffjnXawQGBiohISFX15QqVcqzY5zZbNYDDzyg4OBghYaGymazKSQkRMHBwQoICFBoaKiCgoIUHR2tn376SfPmzctVIU6ShgwZop07d2rv3r2KiIjQ//3f/6lSpUq5/KS3lpycLBWBHeIOHTokSapXr54CAgLyvV69evU8rw8fPqzevXvne82i4Mcff1TPnj311VdfSZJMJpO6d++uSZMmKTw8vNBydOzYUU2aNNGIESMUGxur1atXKzExUUuXLi2Ww0MAAAAAAIqjBx54QHv27FG/fv108OBBLV26VJLk5+enZcuWqXTp0kZHRAn3448/SpLuueceQ3P88Y9/1MGDBxUSEqKgoKB8n6pQVKWmpiolJUUpKSlenyMDAIDfRiEOAADkW0pKinr06KGzZ8+qatWqWrJkSZ6O16xdu7bGjx+vgIAABQUFKSws7FevAwMDVapUKc9rSdq+fbt69uwpPz8/7dix47b3SU5O1tSpU/XZZ5/pwIEDeuihh3Kc0Ww2a+HChWrSpIkSEhIUERGhd955J9ef9Vayj0w1eoe406dPS158WrRs2bIqV66cfvnlF506dcoraxrtwIED6tevny5evChJqlWrlmbNmqUmTZoYkqdMmTJasWKFxo0bp0WLFik2NlajR4/W3LlzDckDAAAAAEBJdOedd2rTpk1q1aqVvvzyS0lSeHi4ypcvb3Q0lHBJSUmeB5J/97vfGZolNDTUZ0tw1wsODlZwcLDuvPNOo6MAAFCiUIgDAAD5kpWVpaefflpffPGFgoODtXLlSpUpUyZPa1WrVk0RERFez/i/+vTpoxkzZigzM1NvvvlmrgpxklSxYkVNnjxZzz//vHbt2qV169apR48eXstXVHaIyy7mBQUFeX3NM2fOeG1No6xbt04RERGy2+0ymUwaMWKExowZIz8/P0NzmUwmRUVFyeVy6Y033tDKlSv1wAMP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3/pWent7kySvf/3ryzJ3OWzYsCEf//jH881vfjP9/f0veGxdXV1e9apX5V3velfOO++8UZ3jmTuA6+rqPCEOAAAADsHq1atz0UUXZcWKFamoqMi1116b97///aN+ntNPPz3/+Z//mYsvvjg9PT35i7/4i+zevTtXXHHFqJ+LY8vy5cuTJHPmzCn3KAAAR5wgDgAYl/r6+vKzn/0sSXLOOeeM2rqXXHJJ7rrrrnz729/OF77whTQ2No7a2klSXV2d6upD+xFraGgoXV1dyTgP4n5TR0dHOjo6DnrcjTfemCRZuHBhzjjjjDGYrPxuuummXHPNNdm5c2eSZP78+Tn33HMzZ86cNDY2ZufOnenp6cmKFStyzz33pKurK7fffntuv/32vOIVr8gXv/jFUdvC4r777kv2bz1cWVk5KmsCAADAseKBBx7IpZdemk2bNqWqqip/+7d/m0svvfSIne/UU0/Nrbfemje+8Y3ZsmVLrr766lRVVeW9733vETsnxdbX15e1a9cmSebNm1fucQAAjjhBHAAwLt1///0Hnih27rnnjtq6F1xwQWpqarJ3797ccccded3rXjdqax+urq6uDAwMJON0y9RD9YMf/CC/+MUvkiTve9/7yj3OmPjc5z534Cl6p556aj71qU/lrLPOet7jh4aGsnTp0lx//fX59re/nXvuuSfnnntu/vEf/zF/8Ad/cNjzPPO0xWMlRgQAAIDR8vWvfz1//ud/nr6+vtTV1eXLX/5yLrzwwiN+3pNPPjnf/va387rXvS6bN2/Oxz72sbS0tOQtb3nLET83xbNy5coMDg4mnhAHABwjPB4CABiX7rnnniR5zu03D0dra+uBrVJvvfXWUVt3NDyzXWqOoifEHczAwECuueaaJMkJJ5yQP/7jPy73SEfcPffck89+9rNJkne84x35/ve//4IxXJJUVlbmtNNOy1e/+tXccccdmTdvXnbu3Jl3vvOd+bd/+7fDmmfp0qV5+OGHk2TUt2IFAACAohocHMx1112XK664In19fZk2bVpuu+22MYnhnjF//vzccsstmTBhQkqlUj74wQ/mm9/85pidn+J44oknDvx97ty5ZZ0FAGAsCOIAgHHpu9/9bnKEAp7Xvva1SZLvfe97B55CNx6sWbPmwN+LEsTdcMMNWbZsWZLk4x//eGpqaso90hF37bXXZmhoKK95zWvyhS98IVVVVSN6/0tf+tJ85zvfyZlnnpmBgYFceeWVuffeew95nn/6p39K9selL3/5yw95HQAAADhWdHd355JLLsnf/d3fJUkWL16cu+66K6eddtqYz3LSSSfl5ptvTkNDQwYHB/Onf/qnufPOO8d8Do5uy5cvT5JMmTIlLS0t5R4HAOCIs2UqADDurFu37sATrV7/+teP+voXXHBB/vqv/zq7d+/Oj3/843Hz1KyVK1cmSVpaWjJx4sRyj3PYli5demDb0Fe/+tVjegd1uSxfvjxLly5NRUVFPvnJT6aiouKQ1pk4cWJuueWW/P7v/35++ctf5vLLL89Pf/rTTJgwYUTr/PSnP803vvGNJMm73/3uQ54HAAAAjhV33HFHrrzyymzevDlJ8s53vjNLlixJbW1t2WZavHhxbrrpplx66aXp7+/P2972ttxyyy1ZvHjxqJ1j+/btectb3pL29va0tbWlvr4+bW1tSZL29vZRO0+57Nu3L7t3706SbN26NV1dXZk2bVo+97nPlXu0MfFMEOfpcADAsUIQBwCMO7feemtKpVJmzJiR008/fdTXnzlzZmbMmJG1a9fmvvvuGzdB3IoVK5Ikc+bMKfcoh239+vV5+9vfnv7+/kyZMiXXX399uUcaEw899FCSZNasWZk3b95hrVVfX5+vfvWrOe+887Jly5Z84hOfyBe+8IVhv7+3tzcf+MAHMjQ0lFNOOSVve9vbDmseAAAAKLK9e/fmmmuuyVe+8pWUSqXU1tZmyZIleec731nu0ZIkr3rVq/IP//APec973pNJkyaN+u4CAwMD+clPfjKqa453Z555ZrlHGDOPP/54sn8bXgCAY4EtUwGAcefmm29OkrzxjW88Yk+0eia0u++++47I+ofimSfEHe1B3JYtW3LxxRdn/fr1qaury4033pgpU6aUe6wxsXPnzmQU75yePXt2rrnmmiTJ1772taxevXpY7xsYGMhll12W5cuXp7q6Otdff/0xsV0tAAAAHIqlS5fm3HPPzY033njgJs1vfetb4yaGe8Yb3/jG3HDDDfnWt76VWbNmlXscjhKlUim//vWvkyQLFy4s9zgAAGPCE+IAgHHl/vvvz7Jly5L9F/mOlNNPPz233357mpqajtg5RqoIT4hbuXJl3vSmN2XFihWpqqrKl770pZx99tnlHmvMPLPV7dq1a0dtzUsvvTQ33HBDVqxYkS996Uv59Kc//YLH79u3L1deeWW+853vJEk+85nPZNGiRaM2DwAAABTFtm3b8qlPfSpf/epXMzg4mCS5+OKL8/nPfz6tra3lHu85XXLJJUdk3dbW1nz/+99PY2NjGhsbD2yXWlNTM66unx2OXbt2ZWBgIH19fdm2bVtKpVK5RxoTa9asObBdrCAOADhWCOIAgHHlhhtuSJKceOKJefGLX3zEzvMnf/Inedvb3pbGxsYjdo6R2LlzZzZs2JAcxUHc97///VxxxRXp7u5ObW1tbrjhhrzuda8r91hj6pknD3Z1deVnP/tZzjjjjMNes6amJh/4wAfyoQ99KP/xH/+R66677nmf9tbV1ZV3vetd+dGPfpQk+djHPpbLL7/8sGcAAACAIhkaGsrNN9+cj3/84+nq6kqSTJgwIUuWLMmb3vSmco9XFjU1NTnttNPKPcYR1dzcfODvo73l7G/RRqtBAAAgAElEQVR6//vfnyRpa2s7EBSW88n9z9yEmyR33nlnHnrooWG/t1QqZfv27dmxY0c+9KEPZcaMGUdoSgCA0SWIAwDGjRUrVuS2225LklxxxRVH9Fzj7S7fhx56KENDQ8n+GPBosnv37nzyk5/Ml7/85ZRKpbS2tuamm27KOeecU+7Rxtxxxx2Xc845J3fffXc+8YlP5JZbbhmVC55/+Id/mA9/+MPp6urKj3/84+f8bG+77bZ89KMfzfr161NVVZVrr702f/Znf3bY5wYAAIAiWbp0aT7ykY/kgQceOPDaH/3RH+Wzn/1sOjo6yjobxfCd73wn3d3d5R7jOV1//fWH/N5LL71UEAcAHDUEcQDAuPGpT30qg4OD6ezszMUXX1zuccbU0qVLkyT19fU5+eSTyz3OsAwNDeXWW2/NNddck/Xr1ydJFi1alK985SuZPXt2uccrm2uvvTavfvWr86Mf/Sjve9/78vd///epr68/rDUnTpyYs88+O3fffXfuueeeZwVxDz74YD796U/nzjvvTPbf0f7P//zPOe+88w73WwEAAIDCWLZsWZYsWZLbbrvtwFaZM2bMyJIlS/La17623ONRMM3Nzamurk57e3u5RxkVvb29qa72a2UA4OjhJxcAYFzYunVr7rvvviTJe9/73tTV1ZV7pDH14IMPJklOPfXUsm6hMBwDAwO5/fbb8/nPfz6/+tWvkv3balx55ZX5yEc+csz92/22RYsWZcmSJfnwhz+cW265JQ8//HA+97nPHfYT804//fTcfffdefDBB7Nz585897vfzY033njg/5uKiopccsklue6669zRDgAAAPutXr06X/ziF/O1r30tg4ODSZKGhoZ84AMfyAc/+MHDvokNftsTTzxR7hEAAI55gjgAYFyYMGFCHnjggdx44415y1veUu5xxtS+ffvyox/9KEly2mmnlXuc57Vq1ar8+7//e2666aZs2LDhwOvnnHNOPvOZz2ThwoVlnW88ueyyy1JXV5cPf/jDWb58ed7whjfkpJNOylvf+tacf/75mT9//ojW27t374FQ8ic/+Unmz5+fvr6+ZH8Id/755+cv//Ivs3jx4iPy/QAAAMDR6Prrr88nPvGJDAwMJEmqqqry5je/OVdffXWmTZtW7vEAAIAjRBAHAIwbdXV1ueKKK8o9xpj74Q9/mO7u7iTJ+eefX+5xDiiVSnnkkUfygx/8ILfddtuBp9g946yzzspHP/rRvPzlLy/bjOPZW9/61ixevDhXX311vve97+XRRx/NVVddlauuuiodHR1ZsGBB5syZk8mTJ6elpSX19fXp7e1Nf39/9uzZk66urqxbty7r1q3L6tWrD1y8fyaE6+joyIUXXph3v/vdWbBgQZm/WwAAABh/Lrvssvzwhz/MnXfemde85jW56qqrcsopp5R7LAAA4AgTxAFAwT2zFURVVVW5R+F5fOMb30j2B06veMUryj3OAV/5ylfyV3/1V896ra6uLhdddFEuv/zyvPSlLy3bbEeLefPm5etf/3oeffTR3HTTTfmv//qvrF+/Plu2bMmWLVty7733Dnuturq6LFq0KGeccUYuuOCCLF682P/XAAAA8AKampryr//6r3nyySdz4oknlnscAABgjAjiAKDA9u3bl6VLlyb7YyvGnyeffDK33HJLkuQNb3jDuAqcLr/88gPbfp555pm56KKLcuGFF6a9vb3cox11TjrppHz2s5/NkiVLsmLFijz88MN5/PHHs3HjxvT09GTnzp0Hjm1qakptbW06Ojpy/PHHZ8aMGZk1a1ZOPvnkA9umAgAAAMNTW1srhgMAgGOMIA4AjhLXX3997rzzzmT/095aWlqe9fXe3t709vYe+O+hoaE89thj2bx5c5LknHPOGeOJjw29vb2prq5OdfXI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AAAAAAAAAACFIIgDAAAAAAAAAACgEARxAAAAAAAAAAAAFIIgDgAAAAAAAAAAgEIQxAEAAAAAAAAAAFAIgjgAAAAAAAAAAAAKQRAHAAAAAAAAAABAIQjiAAAAAAAAAAAAKARBHAAAAAAAAAAAAIUgiAMAAAAAAAAAAKAQBHEAAAAAAAAAAAAUgiAOAAAAAAAAAACAQhDEAQAAAAAAAAAAUAiCOAAAAAAAAAAAAApBEAcAAAAAAAAAAEAhCOIAAAAAAAAAAAAoBEEcAAAAAAAAAAAAhSCIAwAAAAAAAAAAoBAEcQAAAAAAAAAAABSCIA4AAAAAAAAAAIBCEMQBAAAAAAAAAABQCII4AAAAAAAAAAAACkEQBwAAAAAAAAAAQCEI4gAAAAAAAAAAACgEQRwAAAAAAAAAAACFIIgDAAAAAAAAAACgEARxAAAAAAAAAAAAFIIgDgAAAAAAAAAAgEIQxAEAAAAAAAAAAFAIgjgAAAAAAAAAAAAKQRAHAAAAAAAAAABAIQjiAAAAAAAAAAAAKARBHAAAAAAAAAAAAIUgiAMAAAAAAAAAAKAQBHEAAAAAAAAAAAAUgiAOAAAAAAAAAACAQhDEAQAAAAAAAAAAUAiCOAAAAAAAAAAAAApBEAcAAAAAAAAAAEAhCOIAAAAAAAAAAAAoBEEcAAAAAAAAAAAAhSCIAwAAAAAAAAAAoBAEcQAAAAAAAAAAABSCIA4AAAAAAAAAAIBCEMQBAAAAAAAAAABQCII4AAAAAAAAAAAACkEQBwAAAAAAAAAAQCEI4gAAAAAAAAAAACgEQRwAAAAAAAAAAACFIIgDAAAAAAAAAACgEARxAAAAAAAAAAAAFIIgDgAAAAAAAAAAgEIQxAEAAAAAAAAAAFAIgjgAAAAAAAAAAAAKQRAHAAAAAAAAAABAIQjiAAAAAAAAAAAAKARBHAAAAAAAAAAAAIUgiAMAAAAAAAAAAKAQBHEAAAAAAAAAAAAUgiAOAAAAAAAAAACAQhDEAQAAAAAAAAAAUAiCOAAAAAAAAAAAAApBEAcAAAAAAAAAAEAhCOIAAAAAAAAAAAAoBEEcAAAAAAAAAAAAhSCIAwAAAAAAAAAAoBAEcQAAAAAAAAAAABSCIA4AAAAAAAAAAIBCEMQBAAAAAAAAAABQCII4AAAAAAAAAAAACkEQBwAAAAAAAAAAQCEI4gAAAAAA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EQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAA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s9k8mueLL77Q4sWLpVPXphbkCoJhw4blX6mRkZGhjIwMr+fwhf79+/usIW7dunWS5LP5PDV58mTt3r1bJpNJzz33nMfjZs+eLZ1q2rruuut8Xte9996b/zcJllKlSik5OVnJyclau3atxo4dq7lz52rRokVatGiRbrrpJnXr1k3NmzfXvHnz5HA4VKxYMdWrV88n658+IY5rOgAAAAAA8K29e/fm33owePDggJ/W760FCxaof//+kqQ6depo8ODBPp0/NTVVW7ZsUcWKFdWgQQOfzh0se/bs0cqVK7Vy5UqPMq8OHTpo+PDh2rdvn/7973+rRYsW5zyzc+dOff311z6rcfPmzdKp5r2RI0f6bF6dytb8dZMJAABAYdEQBwBAmKhRo4ZmzJihTZs2aejQoZo7d67Wrl2r1q1bq1q1anrhhRfUsGFDrxrjVq1apeeeey7/VLj77rtPo0ePVtmyZf34Ti6te/fuKlGihHr27Cmn06lq1arpjjvu8GjskSNH1LdvX+nUKXdNmjTxev2dO3dq8uTJkqTKlSsH5SrJrVu3Kjc3VxaLb76uHT16VL/88oskefy39IWDBw/q7bffliS1bNnS49PpcnJy9NVXX0mnrryNjY31a52h4M4779Sdd96pXbt2ady4cfr444+1efNmdenSRUOGDMlvCG3YsKHHzaGXcvqEuISEBJ/MBwAAAAAATsrKytKXX34pSXrxxReDXc5FZWRkqEOHDnI6nbruuus0ZcoUn2VSZxo9enREnYq2Z88eSZLVar3o6XCnlS5dWklJSVq4cKGmTJly3oa4bdu2acCAAT6vNTs72+fzDho0iIY4AAAQsmiIAwAgzFSrVk0ffPCBtm7dqmHDhunLL7/Upk2b9K9//Uu33nqr+vbte8ldlpmZmXrllVc0c+ZMud1uFS9eXK+88oratWsXMtcmPv7440pMTFSnTp20fv169ezZUyNHjrxkfa+88or279+v+Pj4/EYsb7366qvKzc1VxYoVtXz5clmt1oK9iUK44YYb8t+HL2zYsEEul0uGYQT0hLi3335bhw8fVnx8fP4uY0/MmTNHWVlZstls6tixo19rDDUVKlTQ0KFD1bdvX40bN06TJk3Szp07818vWbKk8vLyfBJMc0IcAAAAAADRbf369WrdurVycnJ05ZVXatasWSpRooRf1oqkZjid0RB3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a+89PDywYMECDBs2DAcOHMCaNWswfPhwAMCIESPQvXt3/PzzzzeNW3W2mhvi7L21Kzc3F8eOHQMA7Nq1C2fOnLE51sSJE/HAAw/c9P67776L77//Hqi+mayoqMj2gpu43bt3Y9SoUTAYDOjSpQtWrlxpaeB0hMOHDwMibNwSERERERER0e3FxsZCqVTWWT6xRphS7S5dugStVgtUT2WwR8+ePS1jTZuykSNH4tChQ/jvf/+LWbNm2fTvy9GjR5GamgoAlj1gIiIiarrYEEdEROQgGo3G8j/gDU1ZWRnKyspEjZmbm4vc3Fy7N4neeustpKamIjIy0qpbyB5++GEMHDgQW7duxYwZM9C/f3/L6NA2bdqgTZs2dtXjCDUNcR4eHnbF+fHHH2E0GoHq8Qs1J1dtMXTo0JveW7hwIZYsWQIAGDhwINq1a4f333/fjoqbrjVr1mDSpEmoqqpCbGws1q9f79AxpteuXUNSUhIA4L777nNYHiIiIiIiIiICVq9ezRvaG5EjR44A1be73XXXXc4up1F45JFH4OPjg5KSEmzbtu22h6BvZdWqVQCAzp07C96D1ul0WL16teCcQlVVVUGtVmPw4MEICwtzeD4iIqKmjA1xREREDhIbG4uZM2c6uwzs2LEDx48fR3h4OF544YU6zX3gwAHLyM63334bffv2tSveunXrsGbNGri6uuLLL7+0eqToBx98gH379qGkpARz5syxNHEJcfjwYVy6dAmjR4+2oXJhxLohbuPGjZbXXbt2RXx8vOAYy5cvR2Vl5U3vf/7555g3bx4AID4+Hp9//rlN39emTqfTYerUqZYNu65du+KHH36An5+fQ/MuX74cAKBQKNgQR0REREREREQkQE1DXPfu3eHq6urschoFhUKBJ598El9//TXWrl0ruCGusLAQW7ZsAaongwilVqsxadIkwetstWXLFvz66691lo+IiKgpYkMcERGRg0RHR2PChAnOLgN5eXk4fvw4mjVrVqf1pKWlYfHixUD1CT97x8deunQJkydPBgDMnDkTnTt3tnpts2bN8Oqrr2LevHn44YcfMG7cOEFjImvWSCQSBAYGYuDAgTZ9DdYS44a4lJSUG8Yt9OrVCzNmzBAc58svv7ypIW7x4sWYPXs2UD0WYs2aNVAoFDbX2lQdPXoUkydPttzcN2jQICxZsgRubm6C4uza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AAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAADfIlnAAAKHUlEQVQAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFIQxAEAAAAAAAAAAJCCIA4AAAAAAAAAAIAUBHEAAAAAAAAAAACkIIgDAAAAAAAAAAAgBUEcAAAAAAAAAAAAKQjiAAAAAAAAAAAASEEQBwAAAAAAAAAAQAqCOAAAAAAAAAAAAFL4b02BiXbqejRqAAAAAElFTkSuQmCC";
const RICHMENU_IMAGE_CONTENT_TYPE = "image/png";

function getRichMenuImageBytes(templateKey?: string): Uint8Array {
  const base64 = templateKey === "beauty-default-v2" ? RICHMENU_IMAGE_V2_BASE64 : RICHMENU_IMAGE_BASE64;
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
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

    // Step 2: Upload rich menu image (2500×1686 PNG)
    const imageBytes = getRichMenuImageBytes(templateKey);
    const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: "POST",
      headers: {
        "Content-Type": RICHMENU_IMAGE_CONTENT_TYPE,
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

    // 6. OpenAI Responses API 呼び出し
    // - background は送らない（reasoning モデルの incomplete 回避）
    // - temperature は送らない（reasoning モデル非対応）
    // - max_output_tokens: 1600（推論トークン消費分の余裕を確保）
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

    // 7. retrieve ポーリング（incomplete / in_progress / queued のとき最大 3 回待つ）
    // incomplete: トークン上限で切れた可能性。retrieve で完了確認を試みる。
    // in_progress/queued: 非同期処理中。retrieve で completed になるまで待つ。
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

    // 8. polling 後も incomplete なら incomplete エラー（500 にしない）
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

    // 9. テキスト抽出（モジュールレベルの extractResponseText を使用）
    let answer = extractResponseText(openaiRes);
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
}


















