// booking.ts — Public booking/reservation routes extracted from index.ts
// Routes: GET /slots, GET /slots__legacy, GET /ping, POST /reserve, GET /my/reservations

import {
  getTenantId,
  CANCELLED_STATUS,
  SQL_ACTIVE_FILTER,
  normalizePhone,
  buildCustomerKey,
} from '../helpers';
import { AI_DEFAULT_RETENTION, aiGetJson } from './ai';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ---- LINE RESERVATION NOTIFICATION ----
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

/** 指名料を安全に正規化する（0以上の整数）*/
function normalizeNominationFee(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
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

export function registerBookingRoutes(app: any) {

// === SLOTS_SETTINGS_V1 ===
  // settings-driven slots generator (multi-tenant)
  app.get('/slots', async (c: any) => {
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

app.get('/slots__legacy', async (c: any) => {
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

    const reserved = new Set<string>(rows.map((x: any) => String(x.slot_start)));

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
});

app.get("/ping", (c: any) => c.text("pong"));

  // ---- RESERVE (minimum) ----
  app.post("/reserve", async (c: any) => {
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

  // ── クーポン使用記録 ───────────────────────────────────────────────
  const couponId = body.couponId ? String(body.couponId).trim() : null;
  if (couponId) {
    try {
      const useId = `use_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO coupon_uses (id, coupon_id, tenant_id, line_user_id, reservation_id) VALUES (?, ?, ?, ?, ?)`)
          .bind(useId, couponId, tenantId, lineUserId || '', rid),
        env.DB.prepare(`UPDATE coupons SET used_count = used_count + 1 WHERE id = ? AND tenant_id = ?`)
          .bind(couponId, tenantId),
      ]);
    } catch (e: any) {
      console.error("[RESERVE_COUPON] error:", String(e?.message ?? e));
    }
  }

  // customerKey + body.meta マージ
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const customerKey = buildCustomerKey({ lineUserId, phone, email });
  const bodyMeta: Record<string, any> = (body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)) ? body.meta : {};
  const finalMeta = { ...bodyMeta, ...(couponId ? { couponId } : {}), ...(customerKey ? { customerKey } : {}) };
  if (Object.keys(finalMeta).length > 0) {
    await env.DB.prepare("UPDATE reservations SET meta = ? WHERE id = ? AND tenant_id = ?")
      .bind(JSON.stringify(finalMeta), rid, tenantId)
      .run()
      .catch((e: any) => console.error("[RESERVE_META] error:", String(e?.message ?? e)));
  }

  // ── Auto-create pet profile from survey answers (pet vertical) ──
  // If surveyAnswers contain pet_name and no pet_ids (= new pet, not selected from existing),
  // auto-register the pet profile in KV so it appears in admin karte.
  try {
    const survey = bodyMeta?.surveyAnswers as Record<string, string> | undefined;
    if (survey?.pet_name && !survey?.pet_ids) {
      const petKey = `pet:profiles:${tenantId}`;
      const rawPets = await env.SAAS_FACTORY.get(petKey);
      const pets: any[] = rawPets ? JSON.parse(rawPets) : [];
      const now = new Date().toISOString();
      const newPet = {
        id: `pet_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        customerKey: customerKey || "",
        ownerName: customerName || "",
        name: survey.pet_name,
        species: survey.pet_species || "dog",
        breed: survey.pet_breed || "",
        size: survey.pet_size || "",
        age: survey.pet_age || "",
        allergies: survey.pet_allergy || "",
        vaccinations: [],
        groomingHistory: [{ date: startAt.slice(0, 10), reservationId: rid, note: "予約時自動登録" }],
        createdAt: now,
        updatedAt: now,
      };
      pets.push(newPet);
      await env.SAAS_FACTORY.put(petKey, JSON.stringify(pets));
    }
  } catch (e: any) {
    console.error("[RESERVE_PET_AUTO] error:", String(e?.message ?? e));
  }

  // ── Auto-generate estimate if estimateMode is enabled ──
  try {
    const settingsRaw = await env.SAAS_FACTORY.get(`settings:${tenantId}`);
    const settings: any = settingsRaw ? JSON.parse(settingsRaw) : {};
    if (settings.estimateMode === 'enabled') {
      const generateEstimate = async () => {
        try {
          const db = env.DB;
          const kv = env.SAAS_FACTORY;
          if (!db || !kv) return;

          // Resolve pet info — prefer surveyAnswers, fallback to pet profile
          const petId = bodyMeta?.petId || bodyMeta?.surveyAnswers?.pet_ids || null;
          let breed = bodyMeta?.surveyAnswers?.pet_breed || '';
          let size = bodyMeta?.surveyAnswers?.pet_size || '';
          const menuName = bodyMeta?.menuName || '';
          const menuId = bodyMeta?.menuId || '';

          // If breed/size missing but petId available, fetch from pet profile
          if ((!breed || !size) && petId) {
            try {
              const petsRaw = await kv.get(`pet:profiles:${tenantId}`);
              const pets: any[] = petsRaw ? JSON.parse(petsRaw) : [];
              const pet = pets.find((p: any) => p.id === petId);
              if (pet) {
                if (!breed && pet.breed) breed = pet.breed;
                if (!size && pet.size) size = pet.size;
              }
            } catch { /* ignore */ }
          }

          // Get breed pricing or menu default
          let price = 0;
          let duration = 0;
          let source = 'default';

          // Try body.meta.pricing first (booking form already calculated price)
          const metaPricing = bodyMeta?.pricing;
          if (metaPricing?.totalPrice > 0) {
            price = metaPricing.totalPrice;
            source = 'booking_pricing';
          } else if (metaPricing?.menuPrice > 0) {
            price = metaPricing.menuPrice;
            source = 'booking_pricing';
          }
          if (!price && menuId && breed && size) {
            const row: any = await db
              .prepare("SELECT price, duration_minutes FROM breed_size_pricing WHERE tenant_id = ? AND menu_id = ? AND breed = ? AND size = ? LIMIT 1")
              .bind(tenantId, menuId, breed, size)
              .first();
            if (row) {
              price = row.price;
              duration = row.duration_minutes;
              source = 'breed_pricing';
            }
          }

          // Fallback to menu default (by ID or name match)
          if (!price) {
            try {
              const menuListRaw = await kv.get(`admin:menu:list:${tenantId}`);
              const menus: any[] = menuListRaw ? JSON.parse(menuListRaw) : [];
              const menu = menuId
                ? menus.find((m: any) => m.id === menuId)
                : menuName
                  ? menus.find((m: any) => m.name === menuName)
                  : menus[0]; // last resort: first menu
              if (menu) {
                price = menu.price ?? 0;
                duration = menu.durationMin ?? 60;
                if (!menuId && menu.id) { /* capture for later use */ }
              }
            } catch { /* ignore KV error */ }
          }

          // Final fallback: if still 0, query reservation row for menu info
          if (!price) {
            try {
              const resRow: any = await db
                .prepare("SELECT meta FROM reservations WHERE id = ? AND tenant_id = ? LIMIT 1")
                .bind(rid, tenantId)
                .first();
              if (resRow?.meta) {
                const resMeta = typeof resRow.meta === 'string' ? JSON.parse(resRow.meta) : resRow.meta;
                const resMenuId = resMeta?.menuId;
                if (resMenuId) {
                  const menuListRaw = await kv.get(`admin:menu:list:${tenantId}`);
                  const menus: any[] = menuListRaw ? JSON.parse(menuListRaw) : [];
                  const m = menus.find((mm: any) => mm.id === resMenuId);
                  if (m) { price = m.price ?? 0; duration = m.durationMin ?? 60; }
                }
              }
            } catch { /* ignore */ }
          }

          // Get pet grooming history for AI
          let groomingHistory: any[] = [];
          if (petId) {
            const petsRaw = await kv.get(`pet:profiles:${tenantId}`);
            const pets: any[] = petsRaw ? JSON.parse(petsRaw) : [];
            const pet = pets.find((p: any) => p.id === petId);
            if (pet?.groomingHistory) groomingHistory = pet.groomingHistory.slice(0, 5);
          }

          // Try AI estimate with 5s timeout
          let aiResult: any = null;
          const openaiApiKey: string = (env as any).OPENAI_API_KEY || '';
          if (openaiApiKey && breed && size) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            try {
              const historyCtx = groomingHistory.length > 0
                ? groomingHistory.map((g: any) => `${g.date}: ${g.course || ''}${g.notes ? ' (' + g.notes + ')' : ''}`).join('\n')
                : 'なし';
              const resp = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiApiKey}` },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages: [
                    { role: "system", content: `ペットサロンの料金見積もりアシスタントです。料金表をもとに見積もりをJSON形式で出力してください。
{"estimated_price":数値,"estimated_duration_minutes":数値,"breakdown":[{"item":"項目名","price":数値,"duration":数値}],"ai_reasoning":"理由"}` },
                    { role: "user", content: `犬種:${breed} サイズ:${size} メニュー:${menuName} 基本料金:¥${price} 基本時間:${duration}分\n過去施術:${historyCtx}` },
                  ],
                  temperature: 0.2, max_tokens: 400, response_format: { type: "json_object" },
                }),
                signal: controller.signal,
              });
              clearTimeout(timeout);
              if (resp.ok) {
                const json: any = await resp.json();
                const content = json?.choices?.[0]?.message?.content;
                if (content) aiResult = JSON.parse(content);
              }
            } catch { /* timeout or error — use fallback */ }
          }

          const estPrice = aiResult?.estimated_price ?? price;
          const estDuration = aiResult?.estimated_duration_minutes ?? duration;
          const breakdown = aiResult?.breakdown ?? [{ item: `${menuName}（${breed}・${size}）`, price, duration }];
          const reasoning = aiResult?.ai_reasoning ?? (source === 'breed_pricing' ? '犬種別料金表から算出' : 'メニューデフォルト料金');

          const estimateId = `est_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
          const now = new Date().toISOString();
          await db.prepare(
            `INSERT INTO estimates (id, tenant_id, reservation_id, customer_id, pet_id, estimated_price, estimated_duration_minutes, breakdown, ai_reasoning, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
          ).bind(estimateId, tenantId, rid, null, petId, estPrice, estDuration, JSON.stringify(breakdown), reasoning, now, now).run();
        } catch (err: any) {
          console.error("[ESTIMATE_AUTO] error:", String(err?.message ?? err));
        }
      };

      const execCtx = (c as any).executionCtx ?? (c as any).execution;
      if (execCtx?.waitUntil) {
        execCtx.waitUntil(generateEstimate());
      } else {
        generateEstimate().catch(() => null);
      }
    }
  } catch (e: any) {
    console.error("[ESTIMATE_MODE_CHECK] error:", String(e?.message ?? e));
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
  app.get("/__debug/reserve-keys", async (c: any) => {
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
    const env = c.env as any;
    const id = env.SLOT_LOCK.idFromName(doName);
    const stub = env.SLOT_LOCK.get(id);

    return c.json({ ok:true, tenantId, staffId, startAt, endAt, date, doName, lockKey })
  })

// ============================================================
// GET /my/reservations — 顧客向け予約一覧（customerKey で照合）
// ============================================================
app.get("/my/reservations", async (c: any) => {
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

// ---- CANCEL RESERVATION ----
app.post("/my/reservations/:reservationId/cancel", async (c: any) => {
  const tenantId = getTenantId(c);
  const reservationId = c.req.param("reservationId");
  const body = await c.req.json().catch(() => null) as any;
  const customerKey = body?.customerKey || c.req.query("customerKey");

  if (!customerKey || customerKey.trim().length < 4) {
    return c.json({ ok: false, error: "missing_customerKey" }, 400);
  }
  if (!reservationId) {
    return c.json({ ok: false, error: "missing_reservationId" }, 400);
  }

  const env = c.env as any;
  const db = env.DB;
  const kv = env.SAAS_FACTORY;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    // 1. 予約データ取得 + 本人確認
    const row = await db.prepare(
      `SELECT id, start_at, status, meta FROM reservations WHERE tenant_id = ? AND id = ?`
    ).bind(tenantId, reservationId).first();

    if (!row) return c.json({ ok: false, error: "not_found" }, 404);

    let meta: any = {};
    try { meta = row.meta ? JSON.parse(row.meta) : {}; } catch { /* ignore */ }
    if (meta.customerKey !== customerKey.trim()) {
      return c.json({ ok: false, error: "forbidden" }, 403);
    }
    if (row.status === CANCELLED_STATUS) {
      return c.json({ ok: false, error: "already_cancelled" }, 400);
    }

    // 2. キャンセルポリシー確認
    let cancelPolicy = { allowCancel: true, deadlineHours: 24, allowSameDay: false, message: "" };
    if (kv) {
      const settings = await kv.get(`settings:${tenantId}`, "json").catch(() => null) as any;
      if (settings?.cancelPolicy) {
        cancelPolicy = { ...cancelPolicy, ...settings.cancelPolicy };
      } else if (settings?.rules?.cancelMinutes) {
        // legacy: rules.cancelMinutes → deadlineHours 変換
        cancelPolicy.deadlineHours = Math.floor(settings.rules.cancelMinutes / 60);
      }
    }

    if (!cancelPolicy.allowCancel) {
      return c.json({ ok: false, error: "cancel_not_allowed", message: cancelPolicy.message || "キャンセルは受け付けておりません" }, 400);
    }

    // 3. 期限チェック
    const startAt = new Date(row.start_at);
    const now = new Date();
    const hoursUntil = (startAt.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntil < cancelPolicy.deadlineHours) {
      return c.json({
        ok: false, error: "deadline_passed",
        message: `キャンセル期限（予約の${cancelPolicy.deadlineHours}時間前まで）を過ぎています`,
      }, 400);
    }

    // 当日チェック（JST）
    const jstOffset = 9 * 60 * 60 * 1000;
    const nowJST = new Date(now.getTime() + jstOffset);
    const startJST = new Date(startAt.getTime() + jstOffset);
    const isSameDay = nowJST.toISOString().slice(0, 10) === startJST.toISOString().slice(0, 10);
    if (isSameDay && !cancelPolicy.allowSameDay) {
      return c.json({ ok: false, error: "same_day_cancel_not_allowed", message: "当日キャンセルはお受けできません" }, 400);
    }

    // 4. キャンセル実行
    await db.prepare(
      `UPDATE reservations SET status = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?`
    ).bind(CANCELLED_STATUS, tenantId, reservationId).run();

    console.log(`[CANCEL] tenant=${tenantId} reservation=${reservationId}`);
    return c.json({ ok: true, tenantId, reservationId, status: CANCELLED_STATUS });
  } catch (e: any) {
    console.error("[CANCEL]", String(e?.message ?? e));
    return c.json({ ok: false, error: "db_error" }, 500);
  }
});

// ============================================================
// GET /public/booking/monthly-status — 月次予約チェック
// ============================================================
app.get("/public/booking/monthly-status", async (c: any) => {
  const tenantId = getTenantId(c, null);
  const yearMonth = (c.req.query("yearMonth") || "").trim();
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return c.json({ ok: false, error: "bad_yearMonth", hint: "YYYY-MM" }, 400);
  }
  const env = c.env as any;
  const db = env.DB;
  const kv = env.SAAS_FACTORY;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  // Read monthlyBookingLimit from KV settings
  let limit: number | null = null;
  try {
    const raw = kv ? await kv.get(`settings:${tenantId}`) : null;
    if (raw) {
      const s = JSON.parse(raw);
      const v = s?.monthlyBookingLimit;
      if (v != null && Number.isFinite(Number(v))) limit = Number(v);
    }
  } catch { /* ignore */ }

  // Count active bookings for this month
  const startDate = `${yearMonth}-01T00:00:00+09:00`;
  const endMonth = yearMonth.split("-");
  const y = Number(endMonth[0]);
  const m = Number(endMonth[1]);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const endDate = `${nextMonth}-01T00:00:00+09:00`;

  let booked = 0;
  try {
    const q = await db.prepare(
      `SELECT COUNT(*) as cnt FROM reservations WHERE tenant_id = ? AND start_at >= ? AND start_at < ? AND ${SQL_ACTIVE_FILTER}`
    ).bind(tenantId, startDate, endDate).first() as any;
    booked = Number(q?.cnt ?? 0);
  } catch { /* ignore */ }

  const isFull = limit != null ? booked >= limit : false;
  return c.json({ ok: true, yearMonth, limit, booked, isFull });
});

// ============================================================
// GET /public/time-blocks — 公開用ブロック取得
// ============================================================
app.get("/public/time-blocks", async (c: any) => {
  const tenantId = getTenantId(c, null);
  const month = (c.req.query("month") || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ ok: false, error: "bad_month", hint: "YYYY-MM" }, 400);
  }
  const env = c.env as any;
  const db = env.DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  const startDate = `${month}-01`;
  const endMonth = month.split("-");
  const y = Number(endMonth[0]);
  const m = Number(endMonth[1]);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const endDate = `${nextMonth}-01`;

  try {
    const q = await db.prepare(
      `SELECT id, date, block_type, available_slots, note, time_range FROM time_blocks WHERE tenant_id = ? AND date >= ? AND date < ? ORDER BY date`
    ).bind(tenantId, startDate, endDate).all();
    const blocks = (q.results || []).map((r: any) => ({
      id: r.id,
      date: r.date,
      blockType: r.block_type,
      availableSlots: r.available_slots ? JSON.parse(r.available_slots) : null,
      note: r.note || "",
      timeRange: r.time_range || null,
    }));
    return c.json({ ok: true, blocks });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ============================================================
// GET /admin/time-blocks — 管理者用ブロック取得
// ============================================================
app.get("/admin/time-blocks", async (c: any) => {
  const tenantId = getTenantId(c, null);
  const month = (c.req.query("month") || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ ok: false, error: "bad_month", hint: "YYYY-MM" }, 400);
  }
  const env = c.env as any;
  const db = env.DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  const startDate = `${month}-01`;
  const endMonth = month.split("-");
  const y = Number(endMonth[0]);
  const m = Number(endMonth[1]);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const endDate = `${nextMonth}-01`;

  try {
    const q = await db.prepare(
      `SELECT id, date, block_type, available_slots, note, time_range, created_at FROM time_blocks WHERE tenant_id = ? AND date >= ? AND date < ? ORDER BY date`
    ).bind(tenantId, startDate, endDate).all();
    const blocks = (q.results || []).map((r: any) => ({
      id: r.id,
      date: r.date,
      blockType: r.block_type,
      availableSlots: r.available_slots ? JSON.parse(r.available_slots) : null,
      note: r.note || "",
      timeRange: r.time_range || null,
      createdAt: r.created_at,
    }));
    return c.json({ ok: true, blocks });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ============================================================
// POST /admin/time-blocks — ブロック作成
// ============================================================
app.post("/admin/time-blocks", async (c: any) => {
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ ok: false, error: "bad_json" }, 400);
  const tenantId = getTenantId(c, body);
  const env = c.env as any;
  const db = env.DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  const date = String(body.date || "").trim();
  const blockType = String(body.blockType || "").trim();
  const availableSlots = body.availableSlots ? JSON.stringify(body.availableSlots) : null;
  const note = body.note ? String(body.note).trim() : null;
  const timeRange = body.timeRange ? String(body.timeRange).trim() : null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ ok: false, error: "bad_date", hint: "YYYY-MM-DD" }, 400);
  }
  if (!["closed", "full", "partial"].includes(blockType)) {
    return c.json({ ok: false, error: "bad_blockType", hint: "closed | full | partial" }, 400);
  }

  const id = crypto.randomUUID();
  try {
    await db.prepare(
      `INSERT INTO time_blocks (id, tenant_id, date, block_type, available_slots, note, time_range) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, tenantId, date, blockType, availableSlots, note, timeRange).run();
    return c.json({ ok: true, id, date, blockType });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ============================================================
// DELETE /admin/time-blocks/:id — ブロック削除
// ============================================================
app.delete("/admin/time-blocks/:id", async (c: any) => {
  const tenantId = getTenantId(c, null);
  const blockId = c.req.param("id");
  const env = c.env as any;
  const db = env.DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const existing = await db.prepare(
      `SELECT id FROM time_blocks WHERE id = ? AND tenant_id = ?`
    ).bind(blockId, tenantId).first();
    if (!existing) return c.json({ ok: false, error: "not_found" }, 404);
    await db.prepare(`DELETE FROM time_blocks WHERE id = ? AND tenant_id = ?`).bind(blockId, tenantId).run();
    return c.json({ ok: true, deleted: blockId });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ============================================================
// POST /admin/time-blocks/ai-parse — AIチャット空き枠パース
// ============================================================
app.post("/admin/time-blocks/ai-parse", async (c: any) => {
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ ok: false, error: "bad_json" }, 400);
  const tenantId = getTenantId(c, body);
  const env = c.env as any;
  const db = env.DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  const message = String(body.message || "").trim();
  const yearMonth = String(body.yearMonth || "").trim();
  if (!message) return c.json({ ok: false, error: "missing_message" }, 400);
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return c.json({ ok: false, error: "bad_yearMonth", hint: "YYYY-MM" }, 400);
  }

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return c.json({ ok: false, error: "openai_not_configured" }, 500);

  const systemPrompt = `あなたはペットサロンの空き枠管理アシスタントです。
オーナーの自然言語入力から予約ブロック情報をJSONで返してください。
入力例: 「6日14時〜19時空き、8日はClosed、12日は満員、29日は9:00と13:00が空いてる」
出力形式（JSON配列のみ、説明不要）:
[
{"date":"${yearMonth}-06","blockType":"partial","availableSlots":["14:00","15:00","16:00","17:00","18:00","19:00"],"timeRange":"14:00〜19:00","note":""},
{"date":"${yearMonth}-08","blockType":"closed","availableSlots":null,"timeRange":null,"note":"Closed"},
{"date":"${yearMonth}-12","blockType":"full","availableSlots":null,"timeRange":null,"note":"満員"},
{"date":"${yearMonth}-29","blockType":"partial","availableSlots":["9:00","13:00"],"timeRange":null,"note":""}
]
blockTypeルール:
closed: 定休・完全クローズ
full: 予約満員（当日受付不可）
partial: 一部時間のみ空き（availableSlotsに空き時間を列挙）

timeRangeルール:
- 「14時〜19時」のような連続した時間帯の場合、"14:00〜19:00" の形式でセットする
- 個別の時間が列挙されている場合（例: 9:00と13:00）はnullにする
- closed/fullの場合はnullにする

今月: ${yearMonth}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return c.json({ ok: false, error: "openai_error", status: res.status, detail: errText.slice(0, 300) }, 502);
    }

    const data = await res.json() as any;
    const raw = (data.choices?.[0]?.message?.content || "").trim();

    // Extract JSON array from response (may be wrapped in ```json ... ```)
    let jsonStr = raw;
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    let blocks: any[];
    try {
      blocks = JSON.parse(jsonStr);
    } catch {
      return c.json({ ok: false, error: "parse_failed", raw: raw.slice(0, 500) }, 422);
    }

    if (!Array.isArray(blocks)) {
      return c.json({ ok: false, error: "not_array", raw: raw.slice(0, 500) }, 422);
    }

    // Validate and insert
    let inserted = 0;
    for (const b of blocks) {
      const date = String(b.date || "").trim();
      const blockType = String(b.blockType || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!["closed", "full", "partial"].includes(blockType)) continue;

      const availableSlots = b.availableSlots ? JSON.stringify(b.availableSlots) : null;
      const note = b.note ? String(b.note).trim() : null;
      const timeRange = b.timeRange ? String(b.timeRange).trim() : null;
      const id = crypto.randomUUID();

      await db.prepare(
        `INSERT INTO time_blocks (id, tenant_id, date, block_type, available_slots, note, time_range) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, tenantId, date, blockType, availableSlots, note, timeRange).run();
      inserted++;
    }

    return c.json({ ok: true, inserted, parsed: blocks.length });
  } catch (e: any) {
    return c.json({ ok: false, error: "ai_parse_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── GET /public/reservations — 公開予約履歴（LINE userId） ────────────────
app.get("/public/reservations", async (c: any) => {
  const tenantId = getTenantId(c, null);
  const lineUserId = (c.req.query("lineUserId") || "").trim();
  const limit = Math.min(Number(c.req.query("limit") || 5), 20);
  if (!tenantId || !lineUserId) {
    return c.json({ ok: false, error: "missing_params" }, 400);
  }
  const db = (c.env as any)?.DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const rows = await db.prepare(
      `SELECT id, start_at, end_at, customer_name, meta FROM reservations
       WHERE tenant_id = ? AND line_user_id = ?
       ORDER BY start_at DESC LIMIT ?`
    ).bind(tenantId, lineUserId, limit).all();

    const data = (rows.results || []).map((r: any) => {
      let menuName = "";
      if (r.meta) { try { const m = JSON.parse(r.meta); menuName = m?.menuName ?? ""; } catch {} }
      return { id: r.id, start_at: r.start_at, end_at: r.end_at, customer_name: r.customer_name, menu_name: menuName };
    });

    return c.json({ ok: true, tenantId, data });
  } catch (e: any) {
    return c.json({ ok: false, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// ── GET /public/karte — 公開カルテ取得（LINE userId で認証） ─────────────
app.get("/public/karte", async (c: any) => {
  const tenantId = getTenantId(c, null);
  const userId = (c.req.query("userId") || "").trim();
  if (!tenantId || !userId) {
    return c.json({ ok: false, error: "missing_params", hint: "tenantId & userId required" }, 400);
  }
  const db = (c.env as any)?.DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const row = await db.prepare(
      "SELECT * FROM customer_kartes WHERE tenant_id = ? AND customer_id = ?"
    ).bind(tenantId, userId).first();
    return c.json({ ok: true, tenantId, data: row ?? null });
  } catch (e: any) {
    return c.json({ ok: false, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// ── POST /public/karte — 公開カルテ作成・更新（upsert） ──────────────────
app.post("/public/karte", async (c: any) => {
  const body = await c.req.json().catch(() => ({} as any));
  const tenantId = body.tenantId || getTenantId(c, null);
  const userId = (body.userId || "").trim();
  if (!tenantId || !userId) {
    return c.json({ ok: false, error: "missing_params", hint: "tenantId & userId required" }, 400);
  }
  const db = (c.env as any)?.DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  const { customerName, petName, petBreed, petAge, petWeight, allergies, cutStyle, notes } = body;
  const id = `${tenantId}:${userId}`;

  try {
    await db.prepare(`
      INSERT INTO customer_kartes (id, tenant_id, customer_id, customer_name, pet_name, pet_breed, pet_age, pet_weight, allergies, cut_style, notes, first_visit_date, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, date('now'), datetime('now'))
      ON CONFLICT(tenant_id, customer_id) DO UPDATE SET
        customer_name = ?4, pet_name = ?5, pet_breed = ?6, pet_age = ?7, pet_weight = ?8,
        allergies = ?9, cut_style = ?10, notes = ?11, updated_at = datetime('now')
    `).bind(
      id, tenantId, userId,
      customerName ?? null, petName ?? null, petBreed ?? null, petAge ?? null, petWeight ?? null,
      allergies ?? null, cutStyle ?? null, notes ?? null,
    ).run();

    return c.json({ ok: true, tenantId, id });
  } catch (e: any) {
    return c.json({ ok: false, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

} // end registerBookingRoutes
