import { getTenantId, checkTenantMismatch, requireRole, setTenantDebugHeaders, CANCELLED_STATUS, SQL_ACTIVE_FILTER, normalizePhone, buildCustomerKey } from '../helpers';
import { resolveVertical, GENERIC_REPEAT_TEMPLATE } from '../settings';
import { getRepeatConfig, getStyleLabel, buildRepeatMessage, DEFAULT_REPEAT_TEMPLATE } from '../verticals/eyebrow';
import { getVerticalPlugin } from '../verticals/registry';
import { geocodeAddress } from '../lib/geocode';
import { getTravelMinutes } from '../lib/distanceMatrix';

export function registerAdminDataRoutes(app: any) {

/** =========================
 * Reservations CRUD (admin)
 * GET    /admin/reservations?tenantId=&date=YYYY-MM-DD
 * GET    /admin/reservations/:id?tenantId=
 * PUT    /admin/reservations/:id  (partial update)
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

// ── GET /admin/reservations/travel-check — 移動時間チェック ───────────────
app.get("/admin/reservations/travel-check", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  const date = c.req.query("date");
  const customerId = c.req.query("customerId");
  const startTime = c.req.query("startTime");
  if (!date || !customerId || !startTime) {
    return c.json({ ok: false, error: "date, customerId, startTime required" }, 400);
  }

  const apiKey = (c.env as any).GOOGLE_MAPS_API_KEY;
  if (!apiKey) return c.json({ ok: false, error: "GOOGLE_MAPS_API_KEY not configured" }, 500);

  try {
    // Get target customer's location
    const target: any = await db.prepare(
      "SELECT id, name, lat, lng FROM customers WHERE id = ? AND tenant_id = ? LIMIT 1"
    ).bind(customerId, tenantId).first();
    if (!target) return c.json({ ok: false, error: "customer_not_found" }, 404);
    if (!target.lat || !target.lng) {
      return c.json({ ok: true, travelFromPrev: null, travelToNext: null, prevCustomerName: null, nextCustomerName: null, warning: "対象顧客の住所が未登録です" });
    }

    const slotTarget = `${date}T${startTime}`;

    // Get previous reservation on the same day (before startTime)
    const prevRes: any = await db.prepare(
      `SELECT r.customer_id, c.name, c.lat, c.lng, r.slot_start
       FROM reservations r
       LEFT JOIN customers c ON c.id = r.customer_id AND c.tenant_id = r.tenant_id
       WHERE r.tenant_id = ? AND r.slot_start >= ? AND r.slot_start < ? AND r.status != 'cancelled'
       ORDER BY r.slot_start DESC LIMIT 1`
    ).bind(tenantId, `${date}T00:00`, slotTarget).first();

    // Get next reservation on the same day (after startTime)
    const nextRes: any = await db.prepare(
      `SELECT r.customer_id, c.name, c.lat, c.lng, r.slot_start
       FROM reservations r
       LEFT JOIN customers c ON c.id = r.customer_id AND c.tenant_id = r.tenant_id
       WHERE r.tenant_id = ? AND r.slot_start > ? AND r.slot_start < ? AND r.status != 'cancelled'
       ORDER BY r.slot_start ASC LIMIT 1`
    ).bind(tenantId, slotTarget, `${date}T23:59`).first();

    let travelFromPrev: number | null = null;
    let travelToNext: number | null = null;
    let prevCustomerName: string | null = null;
    let nextCustomerName: string | null = null;
    let warning: string | null = null;

    if (prevRes?.lat && prevRes?.lng) {
      prevCustomerName = prevRes.name ?? null;
      travelFromPrev = await getTravelMinutes(prevRes.lat, prevRes.lng, target.lat, target.lng, apiKey);
    }

    if (nextRes?.lat && nextRes?.lng) {
      nextCustomerName = nextRes.name ?? null;
      travelToNext = await getTravelMinutes(target.lat, target.lng, nextRes.lat, nextRes.lng, apiKey);
    }

    // Check if travel time exceeds gap between reservations
    if (travelFromPrev !== null && prevRes?.slot_start) {
      const prevTime = new Date(prevRes.slot_start).getTime();
      const targetTime = new Date(slotTarget).getTime();
      const gapMinutes = (targetTime - prevTime) / 60000;
      if (travelFromPrev > gapMinutes) {
        warning = "移動時間が予約間隔より長い可能性があります";
      }
    }

    return c.json({ ok: true, travelFromPrev, travelToNext, prevCustomerName, nextCustomerName, warning });
  } catch (e: any) {
    return c.json({ ok: false, error: "travel_check_error", message: String(e?.message ?? e) }, 500);
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
 * GET /admin/customers/:id?tenantId=
 * Single customer detail
 * ========================= */
app.get("/admin/customers/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const customerId = c.req.param("id");
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const row: any = await db
      .prepare("SELECT id, name, phone, email, notes, visit_count, last_visit_at, created_at, updated_at FROM customers WHERE id = ? AND tenant_id = ? LIMIT 1")
      .bind(customerId, tenantId)
      .first();

    if (!row) return c.json({ ok: false, error: "not_found" }, 404);

    const phone = row.phone ?? null;
    const customerKey = phone ? buildCustomerKey({ phone }) : (row.email ? buildCustomerKey({ email: row.email }) : null);
    return c.json({
      ok: true,
      tenantId,
      customer: {
        id: row.id,
        name: row.name ?? "",
        phone,
        email: row.email ?? null,
        notes: row.notes ?? null,
        visitCount: row.visit_count ?? 0,
        lastVisitAt: row.last_visit_at ?? null,
        createdAt: row.created_at ?? null,
        updatedAt: row.updated_at ?? null,
        customerKey,
      },
    });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

/** =========================
 * PUT /admin/customers/:id?tenantId=
 * Update customer fields (name, phone, email, notes)
 * ========================= */
app.put("/admin/customers/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const role = await requireRole(c, "admin"); if (role) return role;
  const tenantId = getTenantId(c, null);
  const customerId = c.req.param("id");
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const body = await c.req.json();
    const { name, phone, email, notes, address } = body;

    // Verify customer exists
    const existing: any = await db
      .prepare("SELECT id FROM customers WHERE id = ? AND tenant_id = ? LIMIT 1")
      .bind(customerId, tenantId)
      .first();
    if (!existing) return c.json({ ok: false, error: "not_found" }, 404);

    const now = new Date().toISOString();

    // If address provided, attempt geocoding
    let lat: number | null = null;
    let lng: number | null = null;
    if (address) {
      const apiKey = (c.env as any).GOOGLE_MAPS_API_KEY;
      if (apiKey) {
        try {
          const coords = await geocodeAddress(address, apiKey);
          if (coords) { lat = coords.lat; lng = coords.lng; }
        } catch { /* geocode failure is non-fatal */ }
      }
    }

    if ("address" in body) {
      await db
        .prepare(
          `UPDATE customers SET name = ?, phone = ?, email = ?, notes = ?, address = ?, lat = ?, lng = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`
        )
        .bind(name ?? null, phone ?? null, email ?? null, notes ?? null, address ?? null, lat, lng, now, customerId, tenantId)
        .run();
    } else {
      await db
        .prepare(
          `UPDATE customers SET name = ?, phone = ?, email = ?, notes = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`
        )
        .bind(name ?? null, phone ?? null, email ?? null, notes ?? null, now, customerId, tenantId)
        .run();
    }

    return c.json({ ok: true, tenantId, customerId, address: address ?? null, lat, lng });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

// ── PUT /admin/customers/:id/reset-dormant — 休眠通知リセット ─────────────
app.put("/admin/customers/:id/reset-dormant", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const role = await requireRole(c, "admin"); if (role) return role;
  const tenantId = getTenantId(c, null);
  const customerId = c.req.param("id");
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const existing: any = await db
      .prepare("SELECT id FROM customers WHERE id = ? AND tenant_id = ? LIMIT 1")
      .bind(customerId, tenantId)
      .first();
    if (!existing) return c.json({ ok: false, error: "not_found" }, 404);

    await db
      .prepare("UPDATE customers SET dormant_notified_at = NULL WHERE id = ? AND tenant_id = ?")
      .bind(customerId, tenantId)
      .run();

    return c.json({ ok: true, tenantId, customerId });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

// ── GET /admin/customers/:id/recommended-duration — 推奨施術時間 ─────────
app.get("/admin/customers/:id/recommended-duration", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const customerId = c.req.param("id");
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    // Get past actual_duration_minutes (latest 3)
    const pastRows = await db.prepare(
      `SELECT actual_duration_minutes, is_first_visit, is_puppy
       FROM reservations
       WHERE tenant_id = ? AND customer_id = ? AND actual_duration_minutes IS NOT NULL AND status != 'cancelled'
       ORDER BY slot_start DESC LIMIT 3`
    ).bind(tenantId, customerId).all();

    const records = (pastRows.results ?? []) as any[];
    const pastRecords = records.map((r: any) => r.actual_duration_minutes as number);

    // Latest flags
    const latestRow: any = await db.prepare(
      `SELECT is_first_visit, is_puppy FROM reservations
       WHERE tenant_id = ? AND customer_id = ? AND status != 'cancelled'
       ORDER BY slot_start DESC LIMIT 1`
    ).bind(tenantId, customerId).first();

    const isFirstVisit = latestRow?.is_first_visit === 1;
    const isPuppy = latestRow?.is_puppy === 1;
    const bufferSuggested = (isFirstVisit || isPuppy) ? 30 : 0;

    if (pastRecords.length > 0) {
      const avg = Math.round(pastRecords.reduce((a: number, b: number) => a + b, 0) / pastRecords.length);
      return c.json({ ok: true, recommendedMinutes: avg, basedOn: 'actual_history', bufferSuggested, pastRecords });
    }

    // Fallback: breed_size_pricing duration
    const karte: any = await db.prepare(
      "SELECT pet_name FROM customer_kartes WHERE tenant_id = ? AND customer_id = ? LIMIT 1"
    ).bind(tenantId, customerId).first().catch(() => null);

    // Try to get breed/size from latest reservation meta
    const latestMeta: any = await db.prepare(
      `SELECT meta FROM reservations WHERE tenant_id = ? AND customer_id = ? AND status != 'cancelled' ORDER BY slot_start DESC LIMIT 1`
    ).bind(tenantId, customerId).first().catch(() => null);

    let breedDuration: number | null = null;
    if (latestMeta?.meta) {
      try {
        const m = JSON.parse(latestMeta.meta);
        const breed = m?.surveyAnswers?.pet_breed || m?.petProfile?.breed;
        const size = m?.surveyAnswers?.pet_size || m?.petProfile?.size;
        const menuId = m?.menuId;
        if (breed && size && menuId) {
          const bsp: any = await db.prepare(
            "SELECT duration_minutes FROM breed_size_pricing WHERE tenant_id = ? AND menu_id = ? AND breed = ? AND size = ? LIMIT 1"
          ).bind(tenantId, menuId, breed, size).first().catch(() => null);
          if (bsp?.duration_minutes) breedDuration = bsp.duration_minutes;
        }
      } catch { /* ignore */ }
    }

    if (breedDuration) {
      return c.json({ ok: true, recommendedMinutes: breedDuration, basedOn: 'breed_size_matrix', bufferSuggested, pastRecords: [] });
    }

    return c.json({ ok: true, recommendedMinutes: 60, basedOn: 'default', bufferSuggested, pastRecords: [] });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

// ── PUT /admin/reservations/:id/complete — 予約完了＋実績時間記録 ─────────
app.put("/admin/reservations/:id/complete", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const role = await requireRole(c, "admin"); if (role) return role;
  const tenantId = getTenantId(c, null);
  const reservationId = c.req.param("id");
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const body = await c.req.json().catch(() => ({} as any));
    const { actualDurationMinutes } = body;

    const existing: any = await db
      .prepare("SELECT id, status FROM reservations WHERE id = ? AND tenant_id = ? LIMIT 1")
      .bind(reservationId, tenantId)
      .first();
    if (!existing) return c.json({ ok: false, error: "not_found" }, 404);

    const sets = ["status = 'completed'"];
    const vals: unknown[] = [];
    if (actualDurationMinutes != null && typeof actualDurationMinutes === "number") {
      sets.push("actual_duration_minutes = ?");
      vals.push(actualDurationMinutes);
    }
    vals.push(reservationId, tenantId);

    await db.prepare(
      `UPDATE reservations SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`
    ).bind(...vals).run();

    return c.json({ ok: true, tenantId, reservationId, status: "completed", actualDurationMinutes: actualDurationMinutes ?? null });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

// ── GET /admin/dashboard — ダッシュボード集計 ──────────────────────────────
app.get("/admin/dashboard", async (c: any) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c);
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    // JST dates for period boundaries
    const nowMs = Date.now();
    const jstOff = 9 * 60 * 60 * 1000;
    const nowJST = new Date(nowMs + jstOff);
    const todayStr = nowJST.toISOString().slice(0, 10);
    const year = nowJST.getFullYear();
    const month = nowJST.getMonth(); // 0-indexed
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const prevMonthDate = new Date(year, month - 1, 1);
    const prevMonthStart = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
    const prevMonthEnd = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    // Week boundaries (Mon-Sun)
    const dayOfWeek = nowJST.getDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mondayJST = new Date(nowJST);
    mondayJST.setDate(nowJST.getDate() + mondayOffset);
    const weekStart = mondayJST.toISOString().slice(0, 10);
    const sundayJST = new Date(mondayJST);
    sundayJST.setDate(mondayJST.getDate() + 6);
    // 30 days ago for top menus
    const thirtyDaysAgo = new Date(nowMs - 30 * 24 * 60 * 60 * 1000 + jstOff).toISOString().slice(0, 10);

    const todayLike = `${todayStr}T%`;
    const nextMonthStartStr = `${month + 2 > 12 ? year + 1 : year}-${String((month + 2 > 12 ? 1 : month + 2)).padStart(2, '0')}-01`;

    // Run all queries in parallel
    const [
      todayQ, weekQ, monthQ, prevMonthQ,
      monthCancelQ, recentQ, topMenuQ,
      totalCustQ, newCustQ, repeatCustQ,
    ] = await Promise.all([
      // Today count + revenue
      db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(json_extract(meta, '$.pricing.totalPrice')), 0) as rev
        FROM reservations WHERE tenant_id = ? AND slot_start LIKE ? AND ${SQL_ACTIVE_FILTER}`)
        .bind(tenantId, todayLike).first(),
      // Week count + revenue
      db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(json_extract(meta, '$.pricing.totalPrice')), 0) as rev
        FROM reservations WHERE tenant_id = ? AND slot_start >= ? AND slot_start < ? AND ${SQL_ACTIVE_FILTER}`)
        .bind(tenantId, `${weekStart}T00:00:00`, `${new Date(sundayJST.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}T00:00:00`).first(),
      // Month count + revenue
      db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(json_extract(meta, '$.pricing.totalPrice')), 0) as rev
        FROM reservations WHERE tenant_id = ? AND slot_start >= ? AND slot_start < ? AND ${SQL_ACTIVE_FILTER}`)
        .bind(tenantId, `${monthStart}T00:00:00`, `${nextMonthStartStr}T00:00:00`).first(),
      // Prev month count + revenue (for comparison)
      db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(json_extract(meta, '$.pricing.totalPrice')), 0) as rev
        FROM reservations WHERE tenant_id = ? AND slot_start >= ? AND slot_start < ? AND ${SQL_ACTIVE_FILTER}`)
        .bind(tenantId, `${prevMonthStart}T00:00:00`, `${prevMonthEnd}T00:00:00`).first(),
      // Month cancel count
      db.prepare(`SELECT COUNT(*) as cnt FROM reservations WHERE tenant_id = ? AND slot_start >= ? AND slot_start < ? AND status = ?`)
        .bind(tenantId, `${monthStart}T00:00:00`, `${nextMonthStartStr}T00:00:00`, CANCELLED_STATUS).first(),
      // Recent 5 reservations
      db.prepare(`SELECT id, slot_start, start_at, customer_name, staff_id, status, duration_minutes, meta
        FROM reservations WHERE tenant_id = ? AND ${SQL_ACTIVE_FILTER}
        ORDER BY slot_start DESC LIMIT 5`)
        .bind(tenantId).all(),
      // Top menus (last 30 days)
      db.prepare(`SELECT json_extract(meta, '$.menuName') as menu_name, COUNT(*) as cnt
        FROM reservations WHERE tenant_id = ? AND slot_start >= ? AND ${SQL_ACTIVE_FILTER}
        AND json_extract(meta, '$.menuName') IS NOT NULL
        GROUP BY menu_name ORDER BY cnt DESC LIMIT 3`)
        .bind(tenantId, `${thirtyDaysAgo}T00:00:00`).all(),
      // Total unique customers
      db.prepare(`SELECT COUNT(DISTINCT json_extract(meta, '$.customerKey')) as cnt
        FROM reservations WHERE tenant_id = ? AND ${SQL_ACTIVE_FILTER}
        AND json_extract(meta, '$.customerKey') IS NOT NULL`)
        .bind(tenantId).first(),
      // New customers this month (first reservation in this month)
      db.prepare(`SELECT COUNT(DISTINCT json_extract(meta, '$.customerKey')) as cnt
        FROM reservations WHERE tenant_id = ? AND slot_start >= ? AND slot_start < ? AND ${SQL_ACTIVE_FILTER}
        AND json_extract(meta, '$.customerKey') IS NOT NULL
        AND json_extract(meta, '$.customerKey') NOT IN (
          SELECT json_extract(meta, '$.customerKey') FROM reservations
          WHERE tenant_id = ? AND slot_start < ? AND ${SQL_ACTIVE_FILTER}
          AND json_extract(meta, '$.customerKey') IS NOT NULL
        )`)
        .bind(tenantId, `${monthStart}T00:00:00`, `${nextMonthStartStr}T00:00:00`, tenantId, `${monthStart}T00:00:00`).first(),
      // Repeat customers (2+ reservations)
      db.prepare(`SELECT COUNT(*) as cnt FROM (
          SELECT json_extract(meta, '$.customerKey') as ck, COUNT(*) as visits
          FROM reservations WHERE tenant_id = ? AND ${SQL_ACTIVE_FILTER}
          AND json_extract(meta, '$.customerKey') IS NOT NULL
          GROUP BY ck HAVING visits >= 2
        )`)
        .bind(tenantId).first(),
    ]);

    // Parse recent reservations
    const recentRows: any[] = recentQ.results || [];
    const recentBookings = recentRows.map((r: any) => {
      const slotStr = String(r.slot_start || r.start_at || "");
      const dtMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(slotStr);
      let meta: any = {};
      try { meta = r.meta ? JSON.parse(r.meta) : {}; } catch {}
      return {
        id: r.id,
        date: dtMatch?.[1] || "",
        time: dtMatch?.[2] || "",
        customerName: r.customer_name || "",
        menuName: meta.menuName || "",
        staffId: r.staff_id || "",
        durationMin: r.duration_minutes || 60,
      };
    });

    // Top menus
    const topMenuRows: any[] = topMenuQ.results || [];
    const topMenus = topMenuRows.map((r: any) => ({
      name: r.menu_name || "不明",
      count: r.cnt || 0,
    }));

    // KPI calculations
    const monthCount = monthQ?.cnt || 0;
    const monthRevenue = monthQ?.rev || 0;
    const monthCancelCount = monthCancelQ?.cnt || 0;
    const monthTotal = monthCount + monthCancelCount;
    const monthCancelRate = monthTotal > 0 ? Math.round((monthCancelCount / monthTotal) * 100) : 0;

    const totalCustomers = totalCustQ?.cnt || 0;
    const newCustomersThisMonth = newCustQ?.cnt || 0;
    const repeatCustomers = repeatCustQ?.cnt || 0;
    const repeatRate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;

    const prevMonthCount = prevMonthQ?.cnt || 0;
    const prevMonthRevenue = prevMonthQ?.rev || 0;

    const countVsLastMonth = prevMonthCount > 0 ? Math.round(((monthCount - prevMonthCount) / prevMonthCount) * 100) : null;
    const revenueVsLastMonth = prevMonthRevenue > 0 ? Math.round(((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100) : null;

    return c.json({
      ok: true, tenantId,
      today: { count: todayQ?.cnt || 0, revenue: todayQ?.rev || 0 },
      week: { count: weekQ?.cnt || 0, revenue: weekQ?.rev || 0 },
      month: { count: monthCount, revenue: monthRevenue, cancelRate: monthCancelRate },
      prevMonth: { count: prevMonthCount, revenue: prevMonthRevenue },
      comparison: { countVsLastMonth, revenueVsLastMonth },
      customers: { total: totalCustomers, newThisMonth: newCustomersThisMonth, repeatRate },
      recentBookings,
      topMenus,
    });
  } catch (e: any) {
    console.error("[ADMIN_DASHBOARD]", String(e?.message ?? e));
    return c.json({ ok: false, error: "db_error", detail: String(e?.message ?? e) }, 500);
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
});

// ── Breed × Size Pricing ─────────────────────────────────────────────────────

/** GET /admin/breeds-master — preset breed list */
app.get("/admin/breeds-master", async (c) => {
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);
  try {
    const result = await db
      .prepare("SELECT id, name, default_size, category, sort_order FROM breeds_master ORDER BY sort_order ASC")
      .all();
    return c.json({ ok: true, breeds: result.results ?? [] });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

/** GET /admin/breed-pricing?tenantId=&menuId= — list breed×size pricing rules */
app.get("/admin/breed-pricing", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const menuId = c.req.query("menuId") || null;
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    let sql = "SELECT id, menu_id, breed, size, price, duration_minutes, notes, created_at, updated_at FROM breed_size_pricing WHERE tenant_id = ?";
    const binds: any[] = [tenantId];
    if (menuId) {
      sql += " AND menu_id = ?";
      binds.push(menuId);
    }
    sql += " ORDER BY breed ASC, size ASC";

    const result = await db.prepare(sql).bind(...binds).all();
    const rules = (result.results || []).map((r: any) => ({
      id: r.id,
      menuId: r.menu_id,
      breed: r.breed,
      size: r.size,
      price: r.price,
      durationMinutes: r.duration_minutes,
      notes: r.notes ?? null,
    }));
    return c.json({ ok: true, tenantId, rules });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

/** POST /admin/breed-pricing — create or upsert breed×size pricing rule */
app.post("/admin/breed-pricing", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const role = await requireRole(c, "admin"); if (role) return role;
  const tenantId = getTenantId(c, null);
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const body = await c.req.json();
    const { menuId, breed, size, price, durationMinutes, notes } = body;
    if (!menuId || !breed || !size || price == null || durationMinutes == null) {
      return c.json({ ok: false, error: "missing_fields" }, 400);
    }
    const id = `bp_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO breed_size_pricing (id, tenant_id, menu_id, breed, size, price, duration_minutes, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (tenant_id, menu_id, breed, size) DO UPDATE SET
           price = excluded.price,
           duration_minutes = excluded.duration_minutes,
           notes = excluded.notes,
           updated_at = excluded.updated_at`
      )
      .bind(id, tenantId, menuId, breed, size, price, durationMinutes, notes ?? null, now, now)
      .run();

    return c.json({ ok: true, tenantId, id });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

/** POST /admin/breed-pricing/bulk — bulk upsert breed×size pricing rules */
app.post("/admin/breed-pricing/bulk", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const role = await requireRole(c, "admin"); if (role) return role;
  const tenantId = getTenantId(c, null);
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const body = await c.req.json();
    const { menuId, rules } = body;
    if (!menuId || !Array.isArray(rules)) {
      return c.json({ ok: false, error: "missing_fields" }, 400);
    }

    const stmts: any[] = [];
    const now = new Date().toISOString();
    for (const rule of rules) {
      const { breed, size, price, durationMinutes, notes } = rule;
      if (!breed || !size || price == null || durationMinutes == null) continue;
      const id = `bp_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      stmts.push(
        db.prepare(
          `INSERT INTO breed_size_pricing (id, tenant_id, menu_id, breed, size, price, duration_minutes, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (tenant_id, menu_id, breed, size) DO UPDATE SET
             price = excluded.price,
             duration_minutes = excluded.duration_minutes,
             notes = excluded.notes,
             updated_at = excluded.updated_at`
        ).bind(id, tenantId, menuId, breed, size, price, durationMinutes, notes ?? null, now, now)
      );
    }

    if (stmts.length > 0) {
      await db.batch(stmts);
    }

    return c.json({ ok: true, tenantId, menuId, count: stmts.length });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

/** PUT /admin/breed-pricing/:id — update a single pricing rule */
app.put("/admin/breed-pricing/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const role = await requireRole(c, "admin"); if (role) return role;
  const tenantId = getTenantId(c, null);
  const ruleId = c.req.param("id");
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const body = await c.req.json();
    const { price, durationMinutes, notes } = body;

    const existing: any = await db
      .prepare("SELECT id FROM breed_size_pricing WHERE id = ? AND tenant_id = ? LIMIT 1")
      .bind(ruleId, tenantId)
      .first();
    if (!existing) return c.json({ ok: false, error: "not_found" }, 404);

    const now = new Date().toISOString();
    await db
      .prepare("UPDATE breed_size_pricing SET price = ?, duration_minutes = ?, notes = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(price, durationMinutes, notes ?? null, now, ruleId, tenantId)
      .run();

    return c.json({ ok: true, tenantId, id: ruleId });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

/** DELETE /admin/breed-pricing/:id — delete a single pricing rule */
app.delete("/admin/breed-pricing/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const role = await requireRole(c, "admin"); if (role) return role;
  const tenantId = getTenantId(c, null);
  const ruleId = c.req.param("id");
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    await db
      .prepare("DELETE FROM breed_size_pricing WHERE id = ? AND tenant_id = ?")
      .bind(ruleId, tenantId)
      .run();
    return c.json({ ok: true, tenantId, id: ruleId });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

/** GET /admin/breed-pricing/lookup?tenantId=&menuId=&breed=&size= — lookup price for reservation */
app.get("/admin/breed-pricing/lookup", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const menuId = c.req.query("menuId");
  const breed = c.req.query("breed");
  const size = c.req.query("size");
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  if (!menuId || !breed || !size) {
    return c.json({ ok: true, found: false, reason: "missing_params" });
  }

  try {
    // Exact match first
    let row: any = await db
      .prepare("SELECT price, duration_minutes, notes FROM breed_size_pricing WHERE tenant_id = ? AND menu_id = ? AND breed = ? AND size = ? LIMIT 1")
      .bind(tenantId, menuId, breed, size)
      .first();

    if (row) {
      return c.json({ ok: true, found: true, price: row.price, durationMinutes: row.duration_minutes, notes: row.notes });
    }

    // No match — return not found so frontend falls back to menu default
    return c.json({ ok: true, found: false });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

// ── AI Estimate (Pet Grooming) ────────────────────────────────────────────────

/** POST /admin/ai-estimate — AI-powered grooming estimate */
app.post("/admin/ai-estimate", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const db = (c.env as any).DB;
  const kv = (c.env as any).SAAS_FACTORY;
  const openaiApiKey: string | undefined = (c.env as any).OPENAI_API_KEY;

  try {
    const body = await c.req.json();
    const { petId, breed, size, weightKg, ageYears, sex, menuIds, notes } = body;

    if (!Array.isArray(menuIds) || menuIds.length === 0 || !breed || !size) {
      return c.json({ ok: false, error: "missing_fields", hint: "breed, size, menuIds required" }, 400);
    }

    // 1. Fetch breed_size_pricing for each menu
    const pricingData: { menuId: string; menuName: string; price: number; duration: number; source: string }[] = [];

    // Get menu list from KV
    const menuKey = `admin:menu:list:${tenantId}`;
    const menuRaw = await kv?.get(menuKey);
    const allMenus: any[] = menuRaw ? JSON.parse(menuRaw) : [];

    for (const menuId of menuIds) {
      const menu = allMenus.find((m: any) => m.id === menuId);
      if (!menu) continue;

      // Try breed_size_pricing lookup
      let found = false;
      if (db) {
        try {
          const row: any = await db
            .prepare("SELECT price, duration_minutes, notes FROM breed_size_pricing WHERE tenant_id = ? AND menu_id = ? AND breed = ? AND size = ? LIMIT 1")
            .bind(tenantId, menuId, breed, size)
            .first();
          if (row) {
            pricingData.push({ menuId, menuName: menu.name, price: row.price, duration: row.duration_minutes, source: "breed_pricing" });
            found = true;
          }
        } catch { /* fallback to menu default */ }
      }
      if (!found) {
        pricingData.push({ menuId, menuName: menu.name, price: menu.price ?? 0, duration: menu.durationMin ?? 60, source: "menu_default" });
      }
    }

    const basePrice = pricingData.reduce((sum, p) => sum + p.price, 0);
    const baseDuration = pricingData.reduce((sum, p) => sum + p.duration, 0);

    // 2. Fetch pet grooming history if petId provided
    let groomingHistory: any[] = [];
    if (petId && kv) {
      try {
        const petsRaw = await kv.get(`pet:profiles:${tenantId}`);
        const pets: any[] = petsRaw ? JSON.parse(petsRaw) : [];
        const pet = pets.find((p: any) => p.id === petId);
        if (pet?.groomingHistory) {
          groomingHistory = pet.groomingHistory.slice(0, 5); // Last 5 records
        }
      } catch { /* ignore */ }
    }

    // 3. If no OpenAI key, return base pricing as-is (fallback)
    if (!openaiApiKey) {
      return c.json({
        ok: true,
        estimatedPrice: basePrice,
        estimatedDurationMinutes: baseDuration,
        breakdown: pricingData.map(p => ({
          item: `${p.menuName}（${breed}・${size}）`,
          price: p.price,
          duration: p.duration,
        })),
        aiReasoning: "AI見積もりは現在利用できません。料金表の値を表示しています。",
        confidence: "low",
      });
    }

    // 4. Call GPT-4o with timeout
    const pricingContext = pricingData.map(p =>
      `- ${p.menuName}: ¥${p.price.toLocaleString()} / ${p.duration}分 (${p.source === "breed_pricing" ? "犬種別料金" : "メニューデフォルト"})`
    ).join("\n");

    const historyContext = groomingHistory.length > 0
      ? groomingHistory.map(g =>
          `- ${g.date}: ${g.course}${g.cutStyle ? ` (${g.cutStyle})` : ""}${g.notes ? ` メモ: ${g.notes}` : ""}${g.weight ? ` 体重: ${g.weight}kg` : ""}`
        ).join("\n")
      : "なし";

    const systemPrompt = `あなたはペットサロンの料金見積もりアシスタントです。
オーナーが設定した料金表をもとに、ペットの特徴を考慮した見積もりを出してください。
最終判断はオーナーが行うので、あくまで参考値です。

以下のJSON形式で返してください:
{
  "estimated_price": 数値（円）,
  "estimated_duration_minutes": 数値（分）,
  "breakdown": [{ "item": "項目名", "price": 数値, "duration": 数値 }],
  "ai_reasoning": "判断理由（1-2文）",
  "confidence": "high" | "medium" | "low"
}

ルール:
- 料金表に該当がある場合はその値をベースにする
- オーナー補足メモの内容（毛玉多め、攻撃的等）があれば追加料金・時間を考慮する
- 追加料金は1項目500〜2000円、追加時間は10〜30分を目安とする
- 過去の施術履歴があれば参考にする
- 料金表にない場合はconfidenceを"low"にする`;

    const userPrompt = `【ペット情報】
犬種: ${breed}
サイズ: ${size}
${weightKg ? `体重: ${weightKg}kg` : ""}
${ageYears ? `年齢: ${ageYears}歳` : ""}
${sex ? `性別: ${sex === "male" ? "オス" : sex === "female" ? "メス" : sex}` : ""}

【料金表データ】
${pricingContext}

【過去の施術履歴】
${historyContext}

${notes ? `【オーナー補足メモ】\n${notes}` : ""}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 500,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!aiResp.ok) throw new Error(`OpenAI ${aiResp.status}`);

      const aiJson = await aiResp.json() as any;
      const content = aiJson?.choices?.[0]?.message?.content;
      if (!content) throw new Error("empty_ai_response");

      const parsed = JSON.parse(content);
      return c.json({
        ok: true,
        estimatedPrice: parsed.estimated_price ?? basePrice,
        estimatedDurationMinutes: parsed.estimated_duration_minutes ?? baseDuration,
        breakdown: parsed.breakdown ?? pricingData.map(p => ({ item: p.menuName, price: p.price, duration: p.duration })),
        aiReasoning: parsed.ai_reasoning ?? "",
        confidence: parsed.confidence ?? "medium",
      });
    } catch (aiErr: any) {
      clearTimeout(timeout);
      // Fallback: return base pricing
      return c.json({
        ok: true,
        estimatedPrice: basePrice,
        estimatedDurationMinutes: baseDuration,
        breakdown: pricingData.map(p => ({
          item: `${p.menuName}（${breed}・${size}）`,
          price: p.price,
          duration: p.duration,
        })),
        aiReasoning: aiErr?.name === "AbortError"
          ? "AI応答がタイムアウトしました。料金表の値を表示しています。"
          : "AI見積もりの生成に失敗しました。料金表の値を表示しています。",
        confidence: "low",
      });
    }
  } catch (e: any) {
    return c.json({ ok: false, error: "estimate_error", message: String(e?.message ?? e) }, 500);
  }
});

// ── Estimates CRUD ────────────────────────────────────────────────────────────

/** GET /admin/estimates?tenantId=&status= — list estimates */
app.get("/admin/estimates", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const status = c.req.query("status") || null;
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    let sql = `SELECT e.id, e.reservation_id, e.customer_id, e.pet_id,
                      e.estimated_price, e.estimated_duration_minutes,
                      e.breakdown, e.ai_reasoning, e.final_price, e.status,
                      e.created_at, e.updated_at,
                      r.customer_name, r.slot_start, r.meta AS reservation_meta
               FROM estimates e
               LEFT JOIN reservations r ON r.id = e.reservation_id AND r.tenant_id = e.tenant_id
               WHERE e.tenant_id = ?`;
    const binds: any[] = [tenantId];
    if (status) {
      sql += " AND e.status = ?";
      binds.push(status);
    }
    sql += " ORDER BY CASE e.status WHEN 'pending' THEN 0 WHEN 'revised' THEN 1 ELSE 2 END, e.created_at DESC LIMIT 100";

    const result = await db.prepare(sql).bind(...binds).all();
    const estimates = (result.results || []).map((r: any) => {
      let breakdown: any[] = [];
      try { breakdown = JSON.parse(r.breakdown || "[]"); } catch {}
      let reservationMeta: any = null;
      try { reservationMeta = JSON.parse(r.reservation_meta || "null"); } catch {}
      return {
        id: r.id,
        reservationId: r.reservation_id,
        customerId: r.customer_id,
        petId: r.pet_id,
        estimatedPrice: r.estimated_price,
        estimatedDurationMinutes: r.estimated_duration_minutes,
        breakdown,
        aiReasoning: r.ai_reasoning,
        finalPrice: r.final_price,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        customerName: r.customer_name ?? null,
        slotStart: r.slot_start ?? null,
        petName: reservationMeta?.petName ?? null,
      };
    });
    return c.json({ ok: true, tenantId, estimates });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

/** GET /admin/estimates/:id — single estimate detail */
app.get("/admin/estimates/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c, null);
  const estimateId = c.req.param("id");
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const row: any = await db
      .prepare(`SELECT id, reservation_id, customer_id, pet_id, estimated_price, estimated_duration_minutes,
                       breakdown, ai_reasoning, final_price, status, created_at, updated_at
                FROM estimates WHERE id = ? AND tenant_id = ? LIMIT 1`)
      .bind(estimateId, tenantId)
      .first();
    if (!row) return c.json({ ok: false, error: "not_found" }, 404);

    let breakdown: any[] = [];
    try { breakdown = JSON.parse(row.breakdown || "[]"); } catch {}
    return c.json({
      ok: true,
      tenantId,
      estimate: {
        id: row.id, reservationId: row.reservation_id, customerId: row.customer_id, petId: row.pet_id,
        estimatedPrice: row.estimated_price, estimatedDurationMinutes: row.estimated_duration_minutes,
        breakdown, aiReasoning: row.ai_reasoning, finalPrice: row.final_price,
        status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
      },
    });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

/** PUT /admin/estimates/:id — update estimate (approve/revise) */
app.put("/admin/estimates/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const role = await requireRole(c, "admin"); if (role) return role;
  const tenantId = getTenantId(c, null);
  const estimateId = c.req.param("id");
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const body = await c.req.json();
    const { finalPrice, status } = body;

    const existing: any = await db
      .prepare("SELECT id FROM estimates WHERE id = ? AND tenant_id = ? LIMIT 1")
      .bind(estimateId, tenantId)
      .first();
    if (!existing) return c.json({ ok: false, error: "not_found" }, 404);

    const now = new Date().toISOString();
    await db
      .prepare("UPDATE estimates SET final_price = ?, status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(finalPrice ?? null, status ?? "pending", now, estimateId, tenantId)
      .run();

    return c.json({ ok: true, tenantId, id: estimateId });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", message: String(e?.message ?? e) }, 500);
  }
});

} // end registerAdminDataRoutes
