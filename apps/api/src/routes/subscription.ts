/**
 * Subscription Core routes — /admin/subscription/*, /subscription/qr/:token
 *
 * Manages subscription plans, members, check-ins, and QR codes.
 * Used by coreType='subscription' verticals (gym, school, etc.)
 */
import type { Hono } from "hono";
import { getTenantId, checkTenantMismatch, requireRole } from "../helpers";

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function registerSubscriptionRoutes(app: Hono<{ Bindings: Record<string, unknown> }>) {

// ═══════════════════════════════════════════════════════════════════
// Plan Management
// ═══════════════════════════════════════════════════════════════════

app.get("/admin/subscription/plans", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;

  const { results } = await db.prepare(
    "SELECT * FROM subscription_plans WHERE tenant_id = ? ORDER BY created_at DESC"
  ).bind(tenantId).all();

  return c.json({ ok: true, plans: results ?? [] });
});

app.post("/admin/subscription/plans", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();

  if (!body.name || !body.plan_type || body.price == null) {
    return c.json({ ok: false, error: "name, plan_type, and price are required" }, 400);
  }

  const id = uid("plan");
  await db.prepare(
    `INSERT INTO subscription_plans (id, tenant_id, name, plan_type, price, count, description, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).bind(id, tenantId, body.name, body.plan_type, body.price, body.count ?? null, body.description ?? null, nowISO()).run();

  return c.json({ ok: true, plan: { id, ...body, is_active: 1 } }, 201);
});

app.put("/admin/subscription/plans/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const planId = c.req.param("id");
  const body = await c.req.json();

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const key of ["name", "plan_type", "price", "count", "description", "is_active"] as const) {
    if (body[key] !== undefined) { sets.push(`${key} = ?`); vals.push(body[key]); }
  }
  if (sets.length === 0) return c.json({ ok: false, error: "no fields to update" }, 400);

  vals.push(planId, tenantId);
  await db.prepare(`UPDATE subscription_plans SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();

  return c.json({ ok: true });
});

app.delete("/admin/subscription/plans/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const planId = c.req.param("id");

  await db.prepare("DELETE FROM subscription_plans WHERE id = ? AND tenant_id = ?").bind(planId, tenantId).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// Member Management
// ═══════════════════════════════════════════════════════════════════

app.get("/admin/subscription/members", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const status = c.req.query("status");

  let sql = "SELECT m.*, sp.name AS plan_name, sp.plan_type, sp.price AS plan_price FROM members m LEFT JOIN subscription_plans sp ON m.plan_id = sp.id WHERE m.tenant_id = ?";
  const binds: unknown[] = [tenantId];
  if (status && status !== "all") {
    sql += " AND m.status = ?";
    binds.push(status);
  }
  sql += " ORDER BY m.created_at DESC";

  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json({ ok: true, members: results ?? [] });
});

app.post("/admin/subscription/members", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();

  if (!body.customer_id || !body.plan_id) {
    return c.json({ ok: false, error: "customer_id and plan_id are required" }, 400);
  }

  // Get plan to set remaining_count for count-based plans
  const plan = await db.prepare("SELECT * FROM subscription_plans WHERE id = ? AND tenant_id = ?").bind(body.plan_id, tenantId).first();
  if (!plan) return c.json({ ok: false, error: "plan_not_found" }, 404);

  const id = uid("mem");
  const now = nowISO();
  const remainingCount = (plan as any).plan_type === "count" ? ((plan as any).count ?? 0) : null;

  await db.prepare(
    `INSERT INTO members (id, tenant_id, customer_id, plan_id, status, start_date, remaining_count, created_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`
  ).bind(id, tenantId, body.customer_id, body.plan_id, body.start_date ?? todayStr(), remainingCount, now).run();

  return c.json({ ok: true, member: { id, status: "active", remaining_count: remainingCount } }, 201);
});

app.get("/admin/subscription/members/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const memberId = c.req.param("id");

  const member = await db.prepare(
    "SELECT m.*, sp.name AS plan_name, sp.plan_type, sp.price AS plan_price FROM members m LEFT JOIN subscription_plans sp ON m.plan_id = sp.id WHERE m.id = ? AND m.tenant_id = ?"
  ).bind(memberId, tenantId).first();

  if (!member) return c.json({ ok: false, error: "member_not_found" }, 404);
  return c.json({ ok: true, member });
});

app.put("/admin/subscription/members/:id/pause", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const memberId = c.req.param("id");

  await db.prepare(
    "UPDATE members SET status = 'paused', paused_at = ? WHERE id = ? AND tenant_id = ? AND status = 'active'"
  ).bind(nowISO(), memberId, tenantId).run();

  return c.json({ ok: true });
});

app.put("/admin/subscription/members/:id/resume", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const memberId = c.req.param("id");

  await db.prepare(
    "UPDATE members SET status = 'active', paused_at = NULL WHERE id = ? AND tenant_id = ? AND status = 'paused'"
  ).bind(memberId, tenantId).run();

  return c.json({ ok: true });
});

app.put("/admin/subscription/members/:id/cancel", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const memberId = c.req.param("id");

  await db.prepare(
    "UPDATE members SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND tenant_id = ?"
  ).bind(nowISO(), memberId, tenantId).run();

  return c.json({ ok: true });
});

app.get("/admin/subscription/members/:id/checkins", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const memberId = c.req.param("id");

  const { results } = await db.prepare(
    "SELECT * FROM member_checkins WHERE member_id = ? AND tenant_id = ? ORDER BY checked_in_at DESC LIMIT 100"
  ).bind(memberId, tenantId).all();

  return c.json({ ok: true, checkins: results ?? [] });
});

// ═══════════════════════════════════════════════════════════════════
// Check-in
// ═══════════════════════════════════════════════════════════════════

app.post("/admin/subscription/checkin", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();

  if (!body.member_id) return c.json({ ok: false, error: "member_id is required" }, 400);

  // Verify member is active
  const member = await db.prepare(
    "SELECT * FROM members WHERE id = ? AND tenant_id = ?"
  ).bind(body.member_id, tenantId).first() as any;

  if (!member) return c.json({ ok: false, error: "member_not_found" }, 404);
  if (member.status !== "active") return c.json({ ok: false, error: "member_not_active" }, 400);

  // For count-based plans, check and decrement remaining
  if (member.remaining_count !== null) {
    if (member.remaining_count <= 0) return c.json({ ok: false, error: "no_remaining_count" }, 400);
    await db.prepare(
      "UPDATE members SET remaining_count = remaining_count - 1 WHERE id = ? AND tenant_id = ?"
    ).bind(body.member_id, tenantId).run();
  }

  const id = uid("ci");
  await db.prepare(
    "INSERT INTO member_checkins (id, tenant_id, member_id, checked_in_at, staff_id, note) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, tenantId, body.member_id, nowISO(), body.staff_id ?? null, body.note ?? null).run();

  return c.json({ ok: true, checkin: { id }, remaining_count: member.remaining_count !== null ? member.remaining_count - 1 : null });
});

app.get("/admin/subscription/checkins", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const date = c.req.query("date") ?? todayStr();

  const { results } = await db.prepare(
    `SELECT ci.*, m.customer_id, sp.name AS plan_name
     FROM member_checkins ci
     LEFT JOIN members m ON ci.member_id = m.id
     LEFT JOIN subscription_plans sp ON m.plan_id = sp.id
     WHERE ci.tenant_id = ? AND ci.checked_in_at LIKE ?
     ORDER BY ci.checked_in_at DESC`
  ).bind(tenantId, `${date}%`).all();

  return c.json({ ok: true, checkins: results ?? [] });
});

// ═══════════════════════════════════════════════════════════════════
// QR Code
// ═══════════════════════════════════════════════════════════════════

app.post("/admin/subscription/members/:id/qr", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const memberId = c.req.param("id");

  // Verify member exists
  const member = await db.prepare("SELECT id FROM members WHERE id = ? AND tenant_id = ?").bind(memberId, tenantId).first();
  if (!member) return c.json({ ok: false, error: "member_not_found" }, 404);

  const token = crypto.randomUUID();
  const id = uid("qr");
  await db.prepare(
    "INSERT INTO member_qr_codes (id, tenant_id, member_id, token, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, tenantId, memberId, token, nowISO()).run();

  return c.json({ ok: true, qr: { id, token } });
});

// Public endpoint — no auth required
app.get("/subscription/qr/:token", async (c) => {
  const token = c.req.param("token");
  const db = c.env.DB as D1Database;

  const qr = await db.prepare(
    "SELECT qr.*, m.status, m.remaining_count, m.plan_id, sp.name AS plan_name, sp.plan_type FROM member_qr_codes qr LEFT JOIN members m ON qr.member_id = m.id LEFT JOIN subscription_plans sp ON m.plan_id = sp.id WHERE qr.token = ?"
  ).bind(token).first() as any;

  if (!qr) return c.json({ ok: false, error: "invalid_token" }, 404);

  return c.json({
    ok: true,
    member_id: qr.member_id,
    status: qr.status,
    plan_name: qr.plan_name,
    plan_type: qr.plan_type,
    remaining_count: qr.remaining_count,
  });
});

// ═══════════════════════════════════════════════════════════════════
// Dashboard Stats
// ═══════════════════════════════════════════════════════════════════

app.get("/admin/subscription/stats", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const ms = monthStart();

  const [total, active, paused, monthCheckins, monthNew, monthCancelled] = await Promise.all([
    db.prepare("SELECT COUNT(*) as c FROM members WHERE tenant_id = ?").bind(tenantId).first(),
    db.prepare("SELECT COUNT(*) as c FROM members WHERE tenant_id = ? AND status = 'active'").bind(tenantId).first(),
    db.prepare("SELECT COUNT(*) as c FROM members WHERE tenant_id = ? AND status = 'paused'").bind(tenantId).first(),
    db.prepare("SELECT COUNT(*) as c FROM member_checkins WHERE tenant_id = ? AND checked_in_at >= ?").bind(tenantId, ms).first(),
    db.prepare("SELECT COUNT(*) as c FROM members WHERE tenant_id = ? AND created_at >= ?").bind(tenantId, ms).first(),
    db.prepare("SELECT COUNT(*) as c FROM members WHERE tenant_id = ? AND cancelled_at >= ?").bind(tenantId, ms).first(),
  ]);

  const totalCount = (total as any)?.c ?? 0;
  const cancelledCount = (monthCancelled as any)?.c ?? 0;
  const churnRate = totalCount > 0 ? Math.round((cancelledCount / totalCount) * 1000) / 10 : 0;

  return c.json({
    ok: true,
    stats: {
      totalMembers: totalCount,
      activeMembers: (active as any)?.c ?? 0,
      pausedMembers: (paused as any)?.c ?? 0,
      monthCheckins: (monthCheckins as any)?.c ?? 0,
      monthNewMembers: (monthNew as any)?.c ?? 0,
      monthCancelled: cancelledCount,
      churnRate,
    },
  });
});

} // end registerSubscriptionRoutes
