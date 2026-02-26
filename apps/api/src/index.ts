import { Hono } from "hono";
import { cors } from "hono/cors";

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

function getTenantId(c, body) {
  try {
    const url = new URL(c.req.url)
    return (
      url.searchParams.get("tenantId")
      ?? (body?.tenantId ?? null)
      ?? c.req.header("x-tenant-id")
      ?? "default"
    )
  } catch {
    return (body?.tenantId ?? null) ?? c.req.header("x-tenant-id") ?? "default"
  }
}
app.get("/__build", (c) => c.json({ ok: true, stamp: "API_BUILD_V1" }));


// --- slots (DUMMY V1) ---
    // === ADMIN_SETTINGS_V1 ===
  // GET/PUT admin settings (KV)
  app.get('/admin/settings', async (c) => {
    const debug = c.req.query('debug') === '1'
    const tenantId =
      (c.req.query('tenantId') || c.req.header('x-tenant-id') || 'default').trim() || 'default'

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

    return c.json({
      ok:true,
      tenantId,
      data,
      debug: debug ? { keyDefault, keyTenant, hasDefault: !!sDefault, hasTenant: !!sTenant } : undefined
    })
  })

  app.put('/admin/settings', async (c) => {
    const tenantId =
      (c.req.query('tenantId') || c.req.header('x-tenant-id') || 'default').trim() || 'default'

    const envAny: any = (c as any).env || (c as any)
    const kv = (envAny && (envAny.SAAS_FACTORY || envAny.KV || envAny.SAAS_FACTORY_KV)) || null
    if(!kv){
      return c.json({ ok:false, error:'kv_binding_missing', tenantId, seen:Object.keys(envAny||{}) }, 500)
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
    if(body.notifications != null && typeof body.notifications === 'object') patch.notifications = body.notifications
    if(body.assignment != null && typeof body.assignment === 'object') patch.assignment = body.assignment
    if(body.exceptions != null && Array.isArray(body.exceptions)) patch.exceptions = body.exceptions

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
    // onboarding: shallow merge
    if(body.onboarding != null && typeof body.onboarding === 'object') {
      patch.onboarding = { ...(existing.onboarding || {}), ...body.onboarding }
    }

    const merged = { ...existing, ...patch }
    await kv.put(key, JSON.stringify(merged))

    return c.json({ ok:true, tenantId, key, saved: merged })
  })
  // === /ADMIN_SETTINGS_V1 ===
// === SLOTS_SETTINGS_V1 ===
  // settings-driven slots generator (multi-tenant)
  app.get('/slots', async (c) => {
    const debug = c.req.query('debug') === '1'

    const tenantId =
      (c.req.query('tenantId') || c.req.header('x-tenant-id') || 'default').trim() || 'default'
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
    const durMs  = slotMinutes * 60 * 1000

    const dayStart = date + 'T00:00:00+09:00'
    const dayEnd   = date + 'T23:59:59+09:00'

    let reservations: Array<{start_at:string,end_at:string,staff_id?:string}> = []
    try{
      if(staffId === 'any'){
        const q = await db
          .prepare(`SELECT start_at, end_at, staff_id FROM reservations WHERE tenant_id = ? AND start_at < ? AND end_at > ? ORDER BY start_at`)
          .bind(tenantId, dayEnd, dayStart)
          .all()
        reservations = (q.results || []) as any
      } else {
        const q = await db
          .prepare(`SELECT start_at, end_at, staff_id FROM reservations WHERE tenant_id = ? AND staff_id = ? AND start_at < ? AND end_at > ? ORDER BY start_at`)
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
    const slots: Array<{time:string, available:boolean, status:SlotStatus}> = []
    for(let t = openMs; t + durMs <= closeMs; t += stepMs){
      const end = t + durMs
      const dt = jstDate(t)
      const time = pad2(dt.getUTCHours()) + ':' + pad2(dt.getUTCMinutes())

      let available = true
      let status: SlotStatus = 'available'

      if(staffId !== 'any'){
        // ── Specific staff ──
        // 1. D1 conflict (already filtered to this staff in the query above)
        for(const r of resAll){
          if(overlaps(t, end, r.a0, r.a1)){ available = false; break }
        }
        // 2. Availability override
        const ovr = singleAvail[time]
        if(available && ovr === 'closed') available = false
        // 3. Status
        if(!available)      status = 'full'
        else if(ovr === 'half') status = 'few'
        else                status = 'available'

      } else {
        // ── Any staff ── aggregate across active staff
        if(activeStaffIds.length === 0){
          // No active staff list: fall back to global conflict check (any conflict → unavailable)
          for(const r of resAll){ if(overlaps(t, end, r.a0, r.a1)){ available = false; break } }
          status = available ? 'available' : 'full'
        } else {
          // ── Count-based aggregation (correct capacity model) ──
          // 'any' reservations consume ONE staff slot each — not all staff.
          // 1) Count how many 'any' reservations conflict with this time window
          let anyConflictCount = 0
          for(const r of (resByStaff['any'] || [])){ if(overlaps(t, end, r.a0, r.a1)) anyConflictCount++ }

          // 2) Collect status of each staff member (only own D1 + KV, NOT 'any' resv)
          const staffStatuses: SlotStatus[] = []
          for(const sid of activeStaffIds){
            // Own D1 conflict check (excludes 'any' reservations)
            let ownConflict = false
            for(const r of (resByStaff[sid] || [])){ if(overlaps(t, end, r.a0, r.a1)){ ownConflict = true; break } }
            if(ownConflict) continue

            const ovr = (allStaffAvail[sid] || {})[time]
            if(ovr === 'closed') continue  // admin closed this staff for this time

            staffStatuses.push(ovr === 'half' ? 'few' : 'available')
          }

          // 3) Deduct 'any' reservations from available capacity
          const remainingCount = staffStatuses.length - anyConflictCount
          if(remainingCount <= 0){
            available = false
            status = 'full'
          } else {
            available = true
            // Sort best-first (available > few), skip 'any'-consumed slots, take remaining
            const sorted = staffStatuses.slice().sort((a, b) => a === b ? 0 : a === 'available' ? -1 : 1)
            const remaining = sorted.slice(anyConflictCount)
            status = remaining.some(s => s === 'available') ? 'available' : 'few'
          }
        }
      }

      slots.push({ time, available, status })
    }

    return c.json({
      ok:true, tenantId, staffId, date,
      settings: debug ? { openTime, closeTime, slotIntervalMin, slotMinutes, closedWeekdays, weekday, hitDefaultKey, hitTenantKey } : undefined,
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

app.post("/admin/menu", async (c) => {
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

    const id = `menu_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newItem: MenuItem = {
      id,
      name: name.trim(),
      price,
      durationMin,
      active: active !== undefined ? active : true,
      sortOrder: sortOrder !== undefined ? sortOrder : menu.length,
      };
    menu.push(newItem);
    await kv.put(key, JSON.stringify(menu));

    return c.json({ ok: true, tenantId, data: newItem }, 201);
  } catch (error) {
    return c.json({ ok: false, error: "Failed to create menu", message: String(error) }, 500);
  }
})
/**
 * --- Staff (multi-tenant, KV) ---
 * key: admin:staff:list:${tenantId}
 */
app.get("/admin/staff", async (c) => {
  const tenantId = c.req.query("tenantId") || "default"
  const key = `admin:staff:list:${tenantId}`

  const raw = await c.env.SAAS_FACTORY.get(key)
  const data = raw ? JSON.parse(raw) : []

  return c.json({ ok: true, tenantId, data })
})

app.post("/admin/staff", async (c) => {
  const tenantId = c.req.query("tenantId") || "default"
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
  const tenantId = c.req.query("tenantId") || "default"
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
app.put("/admin/settings", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;

    const patch = await c.req.json().catch(() => ({} as any));

    const currentRaw = await kv.get(`settings:${tenantId}`);
    const current = currentRaw ? JSON.parse(currentRaw) : {};

    const next = deepMerge({ ...(current || {}) }, patch);
    await kv.put(`settings:${tenantId}`, JSON.stringify(next));

    return c.json({ ok: true, tenantId, data: next });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to save settings", message: String(error) }, 500);
  }
});

/** =========================
 * Admin Reservations (READ / UPDATE / DELETE)
 * GET  /admin/reservations?tenantId=&date=YYYY-MM-DD
 * PATCH /admin/reservations/:id  { staffId?, name?, phone?, note? }
 * DELETE /admin/reservations/:id  → mark status='cancelled'
 * ========================= */
app.get("/admin/reservations", async (c) => {
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
                       customer_name, customer_phone, staff_id, note, created_at, status
                FROM reservations
                WHERE tenant_id = ? AND slot_start LIKE ? AND status != 'cancelled'
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
      };
    });

    return c.json({ ok: true, tenantId, date, reservations });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to fetch reservations", message: String(error) }, 500);
  }
});

app.on(["PUT", "PATCH"], "/admin/reservations/:id", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const id = c.req.param("id");
    const db = (c.env as any).DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

    const body = await c.req.json<{ staffId?: string | null; name?: string; phone?: string | null; note?: string | null }>()
      .catch(() => ({} as any));

    // Build SET clause dynamically (only provided fields)
    const sets: string[] = [];
    const vals: unknown[] = [];
    if ("staffId" in body) { sets.push("staff_id = ?"); vals.push(body.staffId ?? null); }
    if ("name" in body && body.name !== undefined) { sets.push("customer_name = ?"); vals.push(body.name); }
    if ("phone" in body) { sets.push("customer_phone = ?"); vals.push(body.phone ?? null); }
    if ("note" in body) { sets.push("note = ?"); vals.push(body.note ?? null); }

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
      },
    });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to update reservation", message: String(error) }, 500);
  }
});

app.delete("/admin/reservations/:id", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const id = c.req.param("id");
    const db = (c.env as any).DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

    const existing: any = await db
      .prepare("SELECT id, status FROM reservations WHERE id = ? AND tenant_id = ?")
      .bind(id, tenantId).first();
    if (!existing) return c.json({ ok: false, error: "not_found" }, 404);
    if (existing.status === "cancelled") return c.json({ ok: false, error: "already_cancelled" }, 409);

    await db.prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ? AND tenant_id = ?")
      .bind(id, tenantId).run();

    return c.json({ ok: true, tenantId, id, status: "cancelled" });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to cancel reservation", message: String(error) }, 500);
  }
});

/** =========================
 * Availability (admin-managed slot status)
 * GET  /admin/availability?tenantId=&date=
 * PUT  /admin/availability  { staffId, date, time, status }
 * KV key: availability:${tenantId}:${staffId}:${date}  = JSON {[time]: 'open'|'half'|'closed'}
 * ========================= */
app.get("/admin/availability", async (c) => {
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
    // Read channelAccessToken from KV (inline to avoid function ordering dependency)
    let accessToken = "";
    try {
      const raw = await opts.kv.get(`settings:${opts.tenantId}`);
      const s = raw ? JSON.parse(raw) : {};
      accessToken = String(s?.integrations?.line?.channelAccessToken ?? "").trim();
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
    const text = `予約が確定しました✅\n日時: ${jst(opts.startAt)}${nameStr}`;
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

  // ---- RESERVE (minimum) ----
  app.post("/reserve", async (c) => {
  const url = new URL(c.req.url)

  const debug = url.searchParams.get("debug") === "1"
  const lockTestMs = Math.max(0, Math.min(10000, Number(url.searchParams.get("lockTestMs") ?? "0") || 0))
  const body = await c.req.json().catch(() => null) as any
  const tenantId = getTenantId(c, body)
  if(!body){ return c.json({ ok:false, error:"bad_json" }, 400) }

  const staffId = String(body.staffId ?? "")
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

  // DO instance: tenant + staff + date
  const date = new Date(startAt).toISOString().slice(0, 10) // "YYYY-MM-DD"
    // AUTO-INSERT: ensure (tenantId + ":" + staffId + ":" + date) exists before first use
  const id = env.SLOT_LOCK.idFromName((tenantId + ":" + staffId + ":" + date));
  const stub = env.SLOT_LOCK.get(id);

  // acquire lock
  const lockRes = await stub.fetch("https://slotlock/lock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // AUTO-INSERT: ensure (startAt + "|" + endAt) exists before first use
    body: JSON.stringify({ key: (startAt + "|" + endAt), ttlSeconds: 30 }),
  })

  if(lockRes.status === 409){
    const j = await lockRes.json().catch(() => ({}))
    return c.json({ ok:false, error:"slot_locked", ...j }, 409)
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

    // NOTE: At-least-once safety: add DB uniqueness later (migration) for hard guarantee
    try {
    await env.DB.prepare(`INSERT INTO reservations (id, tenant_id, slot_start, duration_minutes, customer_name, customer_phone, staff_id, start_at, end_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      rid,
      tenantId,
      startAt,            // slot_start
      durationMin,        // duration_minutes
      customerName,
      (body.phone ? String(body.phone) : null), // customer_phone (optional)
      staffId,
      startAt,
      endAt
    ).run()
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "")
    // SQLite constraint (unique) => treat as duplicate slot
    if (msg.includes("UNIQUE constraint failed")) {
      return c.json({ ok:false, error:"duplicate_slot", tenantId, staffId, startAt }, 409)
    }
    throw e
  }
  // LINE push notification — best-effort, does NOT affect reservation result
  await notifyLineReservation({
    kv: (env as any).SAAS_FACTORY,
    tenantId, lineUserId, customerName, startAt, staffId,
    flag: String((env as any).LINE_NOTIFY_ON_RESERVE ?? "0").trim(),
  }).catch(() => null);
  return c.json({ ok:true, id: rid, tenantId, staffId, startAt, endAt })
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

export default { fetch: app.fetch, queue };

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

  const stateObj = { tenantId, returnTo, ts: Date.now() };
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

/* === LINE_STATUS_ROUTE_V1 ===
   GET /admin/integrations/line/status
   Returns LINE env/connection status for the admin UI.
   Protected by /admin/* middleware (ADMIN_TOKEN).
*/
app.get("/admin/integrations/line/status", async (c) => {
  const tenantId = c.req.query("tenantId") || "default";
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

/** Verify channelAccessToken via LINE Bot API (4-second timeout) */
async function verifyLineToken(token: string): Promise<"ok" | "ng"> {
  try {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 4000);
    const r = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: "Bearer " + token },
      signal: ac.signal,
    });
    clearTimeout(tid);
    return r.ok ? "ok" : "ng";
  } catch { return "ng"; }
}

// ── GET /admin/integrations/line/messaging/status ────────────────────────────
app.get("/admin/integrations/line/messaging/status", async (c) => {
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

    const tokenCheck = accessToken ? await verifyLineToken(accessToken) : "ng";
    const kind = accessToken && secret
      ? (tokenCheck === "ok" ? "linked" : "partial")
      : "partial";

    return c.json({
      ok: true, tenantId, stamp: STAMP, kind,
      checks: { token: tokenCheck, webhook: "ng" },
    });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "status_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── POST /admin/integrations/line/messaging/save ────────────────────────────
app.post("/admin/integrations/line/messaging/save", async (c) => {
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

    // Verify token to give accurate status back
    const tokenCheck = await verifyLineToken(channelAccessToken);
    const kind = tokenCheck === "ok" ? "linked" : "partial";

    return c.json({
      ok: true, tenantId, stamp: STAMP, kind,
      checks: { token: tokenCheck, webhook: "ng" },
    });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "save_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── DELETE /admin/integrations/line/messaging ────────────────────────────────
app.delete("/admin/integrations/line/messaging", async (c) => {
  const STAMP = "LINE_MSG_DELETE_V1_20260225";
  const tenantId = getTenantId(c, null);
  try {
    const kv = (c.env as any).SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);

    const key = `settings:${tenantId}`;
    let existing: any = {};
    try { const r = await kv.get(key); if (r) existing = JSON.parse(r); } catch {}

    // Remove credential fields but keep metadata (userId, displayName, notify flags etc.)
    const { channelSecret: _s, channelAccessToken: _t, bookingUrl: _b, connected: _c, channelId: _id, ...restLine } =
      existing?.integrations?.line ?? {};

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
      checks: { token: "ng", webhook: "ng" },
    });
  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "delete_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── POST /admin/integrations/line/last-user ─────────────────────────────────
// Saves the most-recently-seen LINE userId for a tenant (used by /reserve push notify).
// Called best-effort from Pages webhook handler on every message event.
// KV key: line:lastUser:${tenantId}  TTL: 24 h
// stamp: LINE_LAST_USER_V1_20260225
app.post("/admin/integrations/line/last-user", async (c) => {
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

// POST /ai/chat — OpenAI Responses API (AI_CHAT_V3)
// V3変更点: max_output_tokens 1600 (推論モデル対応), incomplete/in_progress retrieve polling
app.post("/ai/chat", async (c) => {
  const STAMP = "AI_CHAT_V3";
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

    // 4. テナントの AI 設定・ポリシー・FAQ を KV から取得
    const kv = env?.SAAS_FACTORY;
    let aiSettings: any = { voice: "friendly", character: "", answerLength: "normal" };
    let aiPolicy: any = { prohibitedTopics: [] as string[], hardRules: [] as string[] };
    let aiFaq: any[] = [];
    if (kv) {
      const [s, p, f] = await Promise.all([
        aiGetJson(kv, `ai:settings:${tenantId}`),
        aiGetJson(kv, `ai:policy:${tenantId}`),
        aiGetJson(kv, `ai:faq:${tenantId}`),
      ]);
      if (s && typeof s === "object") aiSettings = { ...aiSettings, ...s };
      if (p && typeof p === "object") aiPolicy = { ...aiPolicy, ...p };
      if (Array.isArray(f)) aiFaq = f.filter((x: any) => x.enabled !== false);
    }

    // 5. system プロンプト構築
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
      "あなたはお店のAIアシスタントです。",
      aiSettings.character ? `キャラクター設定: ${aiSettings.character}` : "",
      `口調: ${aiSettings.voice}`,
      `回答の長さ: ${aiSettings.answerLength}`,
      "",
      "## 絶対に守るルール",
      "- 予約はフォームでのみ確定します。あなたは予約を作ったり確約したりしません。",
      "- 料金・空き枠・規約など不確実な情報は断定しません。",
      "- 予約に関する質問には「予約フォームからご確認ください」と案内してください。",
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
    const answer = extractResponseText(openaiRes);
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

    // 10. suggestedActions（予約関連キーワードで open_booking_form を提案）
    const bookingKw = ["予約", "ご予約", "booking", "reserve", "フォーム", "予約フォーム"];
    const needsBooking = bookingKw.some((k) => answer.includes(k) || message.includes(k));
    const suggestedActions = needsBooking ? [{ type: "open_booking_form", url: "/booking" }] : [];

    return c.json({ ok: true, stamp: STAMP, tenantId, answer, suggestedActions });

  } catch (e: any) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) });
  }
});

/* === /AI_CONCIERGE_V1 === */


















