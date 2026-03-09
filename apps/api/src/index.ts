import { Hono } from "hono";
import { cors } from "hono/cors";
import Stripe from "stripe";
import { resolveVertical, DEFAULT_ADMIN_SETTINGS, mergeSettings } from "./settings";
import type { PlanId, SubscriptionInfo } from "./settings";
import { getRepeatConfig, getStyleLabel, buildRepeatMessage, eyebrowOnboardingChecks } from "./verticals/eyebrow";

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

app.get("/__build", (c) => c.json({ ok: true, stamp: "API_BUILD_V1" }));


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

    const DEFAULT_SETTINGS: any = {
      businessName: "Default Shop",
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

    // P1: inject resolved vertical fields (backward-compat: legacy eyebrow also kept)
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
    // eyebrow: deep merge (repeat sub-object も保持) + P2: verticalConfig に正規化
    if(body.eyebrow != null && typeof body.eyebrow === 'object') {
      const existingEyebrow = existing.eyebrow || {}
      patch.eyebrow = { ...existingEyebrow, ...body.eyebrow }
      if(body.eyebrow.repeat != null && typeof body.eyebrow.repeat === 'object') {
        patch.eyebrow.repeat = { ...(existingEyebrow.repeat || {}), ...body.eyebrow.repeat }
      }
      // P2: eyebrow → verticalConfig に変換（明示的な vertical/verticalConfig 指定がない場合のみ）
      if(body.vertical == null && body.verticalConfig == null) {
        patch.vertical = 'eyebrow'
        patch.verticalConfig = {
          consentText: patch.eyebrow.consentText,
          repeat: patch.eyebrow.repeat,
        }
      }
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
      businessName: "Default Shop",
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
};
function defaultMenu() {
  return [
    { id: "cut",   name: "カット",   price: 5000,  durationMin: 60,  active: true, sortOrder: 1 },
    { id: "color", name: "カラー",   price: 8000,  durationMin: 90,  active: true, sortOrder: 2 },
    { id: "perm",  name: "パーマ",   price: 10000, durationMin: 120, active: true, sortOrder: 3 },
  ];
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

    return c.json({ ok: true, tenantId, data: defaultMenu() });
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

    // eyebrow: 眉毛特化属性（styleType/firstTimeOnly/genderTarget）— optional
    const eyebrow = body?.eyebrow && typeof body.eyebrow === 'object' ? body.eyebrow : undefined;

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
      if (eyebrow !== undefined) updated.eyebrow = eyebrow;
      else if ('eyebrow' in body && body.eyebrow === null) delete updated.eyebrow;
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
    if (eyebrow !== undefined) newItem.eyebrow = eyebrow;
    if (body.imageKey) newItem.imageKey = String(body.imageKey);
    if (body.imageUrl) newItem.imageUrl = String(body.imageUrl);
    menu.push(newItem);
    await kv.put(key, JSON.stringify(menu));

    return c.json({ ok: true, tenantId, data: newItem }, 201);
  } catch (error) {
    return c.json({ ok: false, error: "Failed to create menu", message: String(error) }, 500);
  }
})

/** PATCH /admin/menu/:id — update existing menu item (including eyebrow) */
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
    if (body.eyebrow !== undefined) {
      if (body.eyebrow === null) delete updated.eyebrow;
      else updated.eyebrow = body.eyebrow;
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

  return c.json({ ok: true, tenantId, data })
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
  const item = { ...body, id }

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
      // eyebrowDesign/consentLog/verticalData を sub-merge
      if (body.meta?.eyebrowDesign && existingMeta.eyebrowDesign) {
        mergedMeta.eyebrowDesign = { ...existingMeta.eyebrowDesign, ...body.meta.eyebrowDesign };
      }
      if (body.meta?.consentLog && existingMeta.consentLog) {
        mergedMeta.consentLog = { ...existingMeta.consentLog, ...body.meta.consentLog };
      }
      // P3: verticalData sub-merge (新形式) + eyebrowDesign から自動派生
      if (body.meta?.verticalData && existingMeta.verticalData) {
        mergedMeta.verticalData = { ...existingMeta.verticalData, ...body.meta.verticalData };
      }
      if (mergedMeta.eyebrowDesign?.styleType && !mergedMeta.verticalData) {
        mergedMeta.verticalData = { styleType: mergedMeta.eyebrowDesign.styleType };
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
    const styleRawRes = await db.prepare(
      `SELECT
         COALESCE(json_extract(meta, '$.verticalData.styleType'), json_extract(meta, '$.eyebrowDesign.styleType')) as metaStyleType,
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

      // Merge customerKey into existing meta (preserve other fields like eyebrowDesign)
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

    // Load settings — P4: use eyebrow plugin for repeat config
    let storeName = '';
    let bookingUrl = '';
    let eyebrowRepeatEnabled = false;
    let eyebrowTemplateSet = false;
    if (kv) {
      try {
        const raw = await kv.get(`settings:${tenantId}`);
        if (raw) {
          const s = JSON.parse(raw);
          storeName = String(s?.storeName ?? '').trim();
          bookingUrl = String(s?.integrations?.line?.bookingUrl ?? '').trim();
          const rc = getRepeatConfig(s);
          eyebrowRepeatEnabled = rc.enabled;
          eyebrowTemplateSet = rc.template.trim().length > 0 && rc.template !== '前回のご来店からそろそろ{interval}週が経ちます。眉毛のリタッチはいかがでしょうか？';
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
          menuEyebrowCount = active.filter((m: any) => m.eyebrow?.styleType).length;
        }
      } catch { /* ignore */ }
    }
    items.push({ key: 'menu', label: 'メニュー登録（1件以上）', done: menuCount > 0, action: '/admin/menu', detail: menuCount > 0 ? `${menuCount}件` : undefined });
    // P4: eyebrow 固有チェックは eyebrowOnboardingChecks から注入
    const eyebrowItems = eyebrowOnboardingChecks({ menuEyebrowCount, repeatEnabled: eyebrowRepeatEnabled, templateSet: eyebrowTemplateSet });
    const menuEyebrowItem = eyebrowItems.find(i => i.key === 'menuEyebrow')!;
    items.push(menuEyebrowItem);

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

    // P4: repeatConfig via eyebrow plugin
    const repeatConfigItem = eyebrowItems.find(i => i.key === 'repeatConfig')!;
    items.push(repeatConfigItem);

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
    if (!repeatTemplate) repeatTemplate = '前回のご来店からそろそろ{interval}週が経ちます。眉毛のリタッチはいかがでしょうか？';
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
         COALESCE(json_extract(r.meta, '$.verticalData.styleType'), json_extract(r.meta, '$.eyebrowDesign.styleType')) as metaStyleType
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

      // styleType: verticalData.styleType または eyebrowDesign.styleType (SQL COALESCE 済み)
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
    let channelAccessToken = '';
    let defaultTemplate = '前回のご来店からそろそろ{interval}週が経ちます。眉毛のリタッチはいかがでしょうか？';
    let intervalDays = 42;
    try {
      const raw = await kv.get(`settings:${tenantId}`);
      if (raw) {
        const s = JSON.parse(raw);
        channelAccessToken = String(s?.integrations?.line?.channelAccessToken ?? '').trim();
        if (s?.eyebrow?.repeat?.template) defaultTemplate = s.eyebrow.repeat.template;
        if (s?.eyebrow?.repeat?.intervalDays) intervalDays = Number(s.eyebrow.repeat.intervalDays) || 42;
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

  // customerKey + body.meta マージ — best-effort (eyebrowDesign.styleType 等を保持)
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const customerKey = buildCustomerKey({ lineUserId, phone, email });
  const bodyMeta: Record<string, any> = (body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)) ? body.meta : {};
  // P3: dual-write verticalData (primary) alongside eyebrowDesign (legacy)
  if (bodyMeta.eyebrowDesign?.styleType && !bodyMeta.verticalData) {
    bodyMeta.verticalData = { styleType: bodyMeta.eyebrowDesign.styleType };
  }
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

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { planId },
    success_url: `${webOrigin}/signup?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${webOrigin}/lp/eyebrow?canceled=1#pricing`,
  });

  return c.json({ ok: true, url: session.url });
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

    await kv.put(`signup:init:${tenantId}`, JSON.stringify({
      storeName, ownerEmail: rawEmail,
      ...(stripeInfo ? { stripe: stripeInfo } : {}),
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
    const si: { storeName?: string; stripe?: { sessionId?: string; planId: string; customerId: string; subscriptionId: string } } = JSON.parse(signupInitRaw);
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
    const seedSettings = mergeSettings(DEFAULT_ADMIN_SETTINGS, {
      storeName: storedName,
      tenant: { name: storedName, email },
      onboarding: { onboardingCompleted: false },
      ...(si.stripe ? {
        subscription: {
          planId: si.stripe.planId as PlanId,
          stripeCustomerId: si.stripe.customerId || undefined,
          stripeSubscriptionId: si.stripe.subscriptionId || undefined,
          stripeSessionId: si.stripe.sessionId || undefined,
          status: 'active' as const,
          createdAt: Date.now(),
        },
      } : {}),
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
};

const RICHMENU_KV_PREFIX = "line:richmenu:";
const RICHMENU_IMAGE_VERSION = "v4"; // v4: 予約一覧 (was 相談する) + 店舗情報 postback

/** Pre-rendered 2500×1686 rich menu image (4 colored quadrants with icons).
 *  Top-left: Calendar icon (予約する / Blue)
 *  Top-right: Menu icon (メニュー / Green)
 *  Bottom-left: Store icon (店舗情報 / Amber)
 *  Bottom-right: Book icon (予約一覧 / Purple)
 *  To replace: regenerate PNG and update this constant + bump RICHMENU_IMAGE_VERSION. */
const RICHMENU_IMAGE_BASE64 = "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EEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQIRu0zTjngEAAAAAYp1af2uqOeNnAAAAAGD07BAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABAhG7TjHsEAAAAAMjXVHPGEQAAAAAYPTvEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAAROg2TTPuGQAAAAAg1qnlt18crccBAAAAwPlihzgAAAAAAAAAAAAiCOIAAAAAAAAAAACIIIgDAAAAAAAAAAAggiAOAAAAAAAAAACACII4AAAAAAAAAAAAIgjiAAAAAAAAAAAAiCCIAwAAAAAAAAAAIIIgDgAAAAAAAAAAgAiCOAAAAAAAAAAAACII4gAAAAAAAAAAAIggiAMAAAAAAAAAACCCIA4AAAAAAAAAAIAIgjgAAAAAAAAAAAAiCOIAAAAAAAAAAACIIIgDAAAAAAAAAAAggiAOAAAAAAAAAACACII4AAAAAAAAAAAAIgjiAAAAAAAAAAAAiCCIAwAAAAAAAAAAIIIgDgAAAAAAAAAAgAiCOAAAAAAAAAAAACII4gAAAAAAAAAAAIggiAMAAAAAAAAAACCCIA4AAAAAAAAAAIAIgjgAAAAAAAAAAAAiCOIAAAAAAAAAAACIIIgDAAAAAAAAAAAggiAOAAAAAAAAAACACII4AAAAAAAAAAAAIgjiAAAAAAAAAAAAiCCIAwAAAAAAAAAAIIIgDgAAAAAAAAAAgAiCOAAAAAAAAAAAACII4gAAAAAAAAAAAIggiAMAAAAAAAAAACBCtxn3BAAAAAAQrDl9bM44AgAAAACjZ4c4AAAAAAAAAAAAIgjiAAAAAAAAAAAAiCCIAwAAAAAAAAAAIIIgDgAAAAAAAAAAgAiCOAAAAAAAAAAAACII4gAAAAAAAAAAAIggiAMAAAAAAAAAACCCIA4AAAAAAAAAAIAIgjgAAAAAAAAAAAAiCOIAAAAAAAAAAACIIIgDAAAAAAAAAAAggiAOAAAAAAAAAACACII4AAAAAAAAAAAAIgjiAAAAAAAAAAAAiCCIAwAAAAAAAAAAIIIgDgAAAAAAAAAAgAiCOAAAAAAAAAAAACII4gAAAAAAAAAAAIggiAMAAAAAAAAAACBCt2macc8AAAAAALFOr7+dPFqPAwAAAIDzxw5xAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABG6TdOMewYAAAAAiHVq/e3NRwAAAABg9OwQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEbpNM+4RAAAAACDYqfW3UwtxFuQAAAAA4LyxQxwAAAAAAAAAAAARBHEAAAAAAAAAAABEEMQBAAAAAAAAAAAQQRAHAAAAAAAAAABABEEcAAAAAAAAAAAAEQRxAAAAAAAAAAAARBDEAQAAAAAAAAAAEEEQBwAAAAAAAAAAQARBHAAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAECE7rgHAABYrcnrPz3uEbhAjj/2N+MeAQAAAGDNuvnOyXGPwAXy0LeOj3sEAIB3TBAHAFzypt7/+XGPwAUiiAMAAAAYn1vuEsStFYI4AOBS5pWpAAAAAAAAAAAARBDEAQAAAAAAAAAAEMErUwGAOF6rmWPy+k+PewQAAAAAlvGDb82PewRG5KY7J8Y9AgDAyAjiAIA4cw9/cdwjMCKCOAAAAICL17775sY9AiMiiAMAknhlKgAAAAAAAAAAABEEcQAAAAAAAAAAAEQQxAEAAAAAAAAAABBBEAcAAAAAAAAAAEAEQRwAAAAAAAAAAAARuuMeAADgYtLqb6j+jo9Wd9uHqrvx2mpNba5Wb6aaxaPVzB+spcM/rsWf7qvF575Zg7mXL9hcnfVXVXfL3mpNblr2mqXDT9biC/eP7DNbvXU18b5Pjux5Z9MsvFrz+79yXj8DAAAAgIvP5HSrdt7Uqyuv7dXm7Z2anm1Vf6pVC8ebmnu9qYMvLtXzT5yopx5erGNHBhdsro1b23X5zm5NzS6/r8grLyzVTx5bHNln9iZadcNtEyN73tkcPzaoxx5YOK+fAQBwsRDEAQBUVas7VZN7PlsTuz5Vre7UW8/31lWrt67aM1dW74o7qm76k5p/+qs1919fqmbhyIiH6VTnsl3V3bq3ulv3Vm/r3mpNbl7xtoWnvz7iIG62pt7/+ZE972wGrz0niAMAAABYQ7r9Vn3gY5N1w+396vZbbznfn2xVf7JVGza36+obevWh352qx/fN14P/fLzmjzUjnaXVrtq8vVPbdnbr8l/q1uU7uzW9/q0zvdkTDy6MNIibmG7VLXdNjux5Z/Pqy4I4AGDtEMQBAGtee/aqmvnIl6uz/uq3f1OnXxPv+2T1rrijXv/Xz9TSwcdXPUfnst01deMfVXfr3mr11q36eQAAAABwMdm4tV2/9ZmZ2vju5Xdfe7NOt2rPrRN19Z5efePLR+vl55dWPcfmKzp1y29P1rad3epPrhzAAQBwaXn73zYBAAK1Z66s2TvvPbcY7o33T7+nZn/93upsum7Vs3Rmd1Rv+21iOAAAAADirN/crk98bvacYrg3mrmsXZ/43ExtubKz6lk2bmnXjut7YjgAgFCCOABgzWp1Jmrm9r+q9tSW1T2nt65mbvvravXXj2w2AAAAAEjR7bXq43+4rtZtWF2A1p/8+XMmpoVsAAAsTxAHAKxZk3s+W52Nu0byrPa6bTV985+O5FkAAAAAkGTvxybqXZevfme3OrlT3IfvnhrJswAAyCSIAwDWpPb0e2pi9x+seF2z8FotHfpRNfOHV7y2f83vVOeya0c0IQAAAABc+mYua9eNH5lc8br5uaZe+d+lOn60WfHaXR/s1+btownsAADI0x33AAAA4zCx6/er1RmyENcs1bGHvlDzP/77qsGJqmpV/5q7avqDf7H8fa12Te6+p47u++ORzzuYe6WWDj5ave23j/zZ71Rz/P9q/umvre4ZbyM0BAAAAODSdcOtE9XtL39+MKh64Gtz9eh35mswqKpW1bUf6Nftvze97H2tVtWNd0zUt//22MjnPXakqQPPnairfqU38me/U3OvNfWjf1tY1TOOHx2MbB4AgIudIA4AWHta7ZrYeffQS47951/W/JN/94bfNLXwzD9VDRZr3a99adn7+jt+s459/8+rObG6xbjB3IE68dL3T/9bOvJMtae21Ia7v7eq547SYO5AzT38xXGPAQAAAMBFqtWq2n3LkBquqh74x7n64f3zv/hFU/XEvy/U0omq37hnetn7fvnmft3/lblanF95R7lhjr46qBf2n6gX9y/VC/tP1KGXlmp6fbvu+cLFE8QdfXVQ++6bG/cYAACXDEEcALDmdDddX63Jdy17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";
const RICHMENU_IMAGE_CONTENT_TYPE = "image/png";

function getRichMenuImageBytes(): Uint8Array {
  const binaryStr = atob(RICHMENU_IMAGE_BASE64);
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
    const templateKey = "beauty-default";
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
    const imageBytes = getRichMenuImageBytes();
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
    const [s, p, r] = await Promise.all([
      aiGetJson(kv, `ai:settings:${tenantId}`),
      aiGetJson(kv, `ai:policy:${tenantId}`),
      aiGetJson(kv, `ai:retention:${tenantId}`),
    ]);
    return c.json({
      ok: true, tenantId, stamp: STAMP,
      settings: { ...AI_DEFAULT_SETTINGS, ...(s || {}) },
      policy: { ...AI_DEFAULT_POLICY, ...(p || {}) },
      retention: { ...AI_DEFAULT_RETENTION, ...(r || {}) },
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
      const key = `ai:settings:${tenantId}`;
      const ex = (await aiGetJson(kv, key)) || {};
      await kv.put(key, JSON.stringify({ ...AI_DEFAULT_SETTINGS, ...ex, ...body.settings }));
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

// GET /ai/enabled — lightweight AI enabled check (no auth, single KV read)
app.get("/ai/enabled", async (c) => {
  const tenantId = getTenantId(c, null);
  const kv = (c.env as any)?.SAAS_FACTORY;
  if (!kv) return c.json({ ok: true, tenantId, enabled: false });
  const s = await aiGetJson(kv, `ai:settings:${tenantId}`);
  const enabled = s?.enabled === true;  // strict: only true when explicitly enabled
  console.log(`[AI_GATE] tenant=${tenantId} enabled=${enabled} path=/ai/enabled`);
  return c.json({ ok: true, tenantId, enabled });
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
      if (s && typeof s === "object") aiSettings = { ...aiSettings, ...s };
      if (p && typeof p === "object") aiPolicy = { ...aiPolicy, ...p };
      if (Array.isArray(f)) aiFaq = f.filter((x: any) => x.enabled !== false);
      if (u && typeof u === "object") aiUpsell = { ...AI_DEFAULT_UPSELL, ...u };
      if (ss && typeof ss === "object") storeSettings = ss;
      if (Array.isArray(ml)) menuList = ml.filter((m: any) => m.active !== false);
    }

    // 4.4 AI 有効判定（管理画面の「AI接客を有効化」トグルを反映）
    if (aiSettings.enabled !== true) {
      console.log(`[AI_GATE] tenant=${tenantId} enabled=false path=/ai/chat`);
      return c.json({ ok: false, stamp: STAMP, tenantId, error: "ai_disabled", detail: "AI is disabled for this tenant" });
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
        return c.json({ ok: true, stamp: STAMP, tenantId, answer: faqAnswer, suggestedActions, intent: faqIntent, source: "faq" });
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

    const systemContent = [
      storeSettings?.storeName
        ? `あなたは「${storeSettings.storeName}」のAIアシスタントです。`
        : "あなたはお店のAIアシスタントです。",
      aiSettings.character ? `キャラクター設定: ${aiSettings.character}` : "",
      `口調: ${aiSettings.voice}`,
      `回答の長さ: ${aiSettings.answerLength}`,
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
    ].filter(Boolean).join("\n");

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

    return c.json({ ok: true, stamp: STAMP, tenantId, answer, suggestedActions, intent });

  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) });
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

  // ── AI followup (D1 が必要) ────────────────────────────────────────────────
  const db = (env as any).DB;
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


















