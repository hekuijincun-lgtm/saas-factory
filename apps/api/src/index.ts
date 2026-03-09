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
            // 左下: 店舗情報
            bounds: { x: 0, y: 843, width: 1250, height: 843 },
            action: { type: "uri", label: "店舗情報", uri: buildTenantStoreInfoUrl(origin, tenantId) },
          },
          {
            // 右下: 相談する (message action → webhook/AI concierge が将来 intent 化)
            bounds: { x: 1250, y: 843, width: 1250, height: 843 },
            action: { type: "message", label: "相談する", text: "予約について相談したい" },
          },
        ],
      },
    }),
  },
};

const RICHMENU_KV_PREFIX = "line:richmenu:";
const RICHMENU_IMAGE_VERSION = "v3"; // v3: production 2500×1686 4-quadrant PNG with Noto Sans JP text + icons

/** Pre-rendered 2500×1686 rich menu image (4 colored quadrants with icons).
 *  Top-left: Calendar icon (予約する / Blue)
 *  Top-right: Menu icon (メニュー / Green)
 *  Bottom-left: Store icon (店舗情報 / Amber)
 *  Bottom-right: Chat icon (相談する / Purple)
 *  To replace: regenerate PNG and update this constant + bump RICHMENU_IMAGE_VERSION. */
const RICHMENU_IMAGE_BASE64 = "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HrzR/3B8g2wvT3Pa2fgcupL2fa//08t3fekfvebnP/nIA8sPvPknlr/xSz+1vPd3PrFcvvLEjX1BG4+71rly+coTy2986uPLj73nrcuHHvzU8urnvWi545Zbr/pr/7l7Pm9ZlmX52Y+8e+prhWvx8zFPcxrYcd7WzS9u+tV/19YRjkjzPM1pYMd5R2h+17MvLt/311+wfMufv3u5ePHC1i+HMjfddGH59u+6d/mr3/95yx13nsRvfSOOcHZwbDaepzkN7PiMDnma52lOAzvOO3rz1zzvxct3f+U3XPPzv/jx31q+7Sf+5vL3P/D26OtinOvd+E/85q8ub3jTf7/8wkffd81f872v/1NU1ghcAAAgAElEQVTLH37u5w98dft19LODfjaepzkNTmHHF77jz31481dxCiGORO88zfM0H0/TvCM0v+22C8t//l+/cPmil179/234uT76kcvLQw9eWR5++Mpy+XK2z1f+kTue9vP/5C0Px17LFuZ9/+v+Pd5yy4XljjsuLnfeeXF54Rdc335+632Xlu/7no8sly51P1tHODtOjeZ5mmfpPYeueVs2v/e5Ny/33nvz8mtf/8blvofvXz728P2bvRbby9I7T/M8zcfTNE/zZfnxf+XfW77mC/7QVT/3v7/nl5YffMubxn5BzePW7Pw//ep/eflXX/7aq37u//nAO5Zv/j//uwGvbL+cHXma52mepfccuuadQvPN35PsFCIAXZwrsB9/+Xuef+5luPs+9vjytrc9snzw/ZeXxx6b+Hyfc3aceyHszQe/ELfh93/zLcvy0pfftrzq1bcvz3v+tX97+0Uvu2359/+jP7j8Nz/w8ejro5vfd+RpTgM7ztP8jA7AaM4V6PC1L3rFNS/DvfW+9y//1S/+xNgv6OyIW3te/xdvftPyhc957vLlz3/JUz73J17yyuWPvegVyz/60LsGvEI4n9935GlOAzvOO5Xmm75v1KlEOBLN8zSngR3nHaH5G77z7uV1r7/2JauHHrqy/N8/9cDyxh/7neW9735s7mU4du3xy8vy7ndeWn7sf/v08g9++oHl4YevXPPXftU/f+fyrd9+T/T1JR3h7ODYbDxPcxrY8Rkd8jTP05wGdpyn+bL8pVf9i1f9+KOPX16+92d/dHlCo127kY0/fuXK8h//zI8ujz3x+FU//+9cYztH4OygnY3naU6D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n3no9Pjkm17zmR9r/sQevOOj4+O/+o9O/HWPdL3h5f9wjOCFuOd+/feN67/qW0/0NWceWPYW/bvk0Tu+9vO+fDztxS9b9H3OnL70fzm1hcvOu9g3xnO++u8+7q+/672/Oj78z/7zi/re93zwjePDP/GN43lf/+px7Qu+4vzf+/IrxnVf8BfHC7/1F8bd7//18eF//jdP+Oq5WM7r9Wmap3me5nAYPOtz6Eo7G89LNj979uz4tf/trqm/x9f/989Y7XvdedvD4wf++scXfe3Zs2fHS152zXjJy68Zn/tFV40/99JrnvDX3/wHp8ev/eid4+Z3PbDw1V7Yj/+3t42XfevTxpe/4rrxlGsvP++fX/O0o4txL/6qq8cH3nFqvP3n7ln9NTzaj/03t43/8tXPHi/6iqs/83O33fzg+OA7T49f/KE7Fn/f1rPjxredGje+7dR4/ouvGi95+TXjuf/uVeP6P3PluPYZVzzu1zx4+uw4fd+ZceqeM+P+u8+Mu257eNz0rtPjrT9zz6qvrbX5LtN8fZrmaZ6n+WHZmQtxhkcDO87TnH333Ff843Hldc855+fuu/m3x303vW2MS9j4nX/w8+OBT928ymu8VM/52v9u65dwnkd3ffj+O8cDd/zROf/8zOl5/+/cj73u74+rn/+l49rP/bKL/prTt31g2uvZwod/4q+PL/5HHxlXXP30E3/t6dv+cMpr2hUP3ffpcdubXjNufcM/PtHX3f/R3xsf+JGXjxv+yneP67/yW85718kxxhiXXT7u//i713uxnMPfSWhgx3ma52l+RAca2HGe5rSz8TnOnj07vvgvXT3+6iufccFLaI92x8cfGm/9v+9Z/bLSo/3aj941bnz7qfEf/9fPGM978YU/svTqp14+/ux/cPX46I0PTL0QN8YY/+JVt49v/K5njeueefn47dfdO979hpO/G9yhueV9D4xb3nfufy8v/uqnjOuedcW45mmXjydfc/m4946Hx02/f3p87P0PTn89zo48zWlgx3ma523dfCcuxG0d4RBpTgM7ztN8fWcffmg8fOqucy6vfOptP3bJ3/fUx98zbv3177/k77OGXbsQ99gd3/am14zbHvWOfAmf+Nf/43jB3/7pcflV1x77a0/fftP441/8jsjrmuVCZ8fdH/iN8Ywv+YYTfZ8HPv2R8bFf+gcrvrLdct8tvztu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";
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


















