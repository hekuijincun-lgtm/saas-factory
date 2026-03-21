/**
 * Project Management routes — /admin/project/*
 *
 * Manages projects, phases, tasks, estimates, invoices, partners, and site photos.
 * Used by coreType='project' verticals (construction, renovation, handyman, etc.)
 */
import type { Hono } from "hono";
import { getTenantId, checkTenantMismatch, requireRole } from "../helpers";

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function nowISO(): string { return new Date().toISOString(); }
function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function registerProjectRoutes(app: Hono<{ Bindings: Record<string, unknown> }>) {

// ═══════════════════════════════════════════════════════════════════
// Project Management (Admin)
// ═══════════════════════════════════════════════════════════════════

app.get("/admin/project/projects", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const statusFilter = c.req.query("status");

  let sql = "SELECT * FROM projects WHERE tenant_id = ?";
  const binds: unknown[] = [tenantId];
  if (statusFilter && statusFilter !== "all") { sql += " AND status = ?"; binds.push(statusFilter); }
  sql += " ORDER BY created_at DESC";

  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json({ ok: true, projects: results ?? [] });
});

app.post("/admin/project/projects", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();

  if (!body.name) return c.json({ ok: false, error: "name is required" }, 400);

  const id = uid("proj");
  await db.prepare(
    `INSERT INTO projects (id, tenant_id, name, note, status, customer_name, customer_phone, customer_email, customer_address, start_date, end_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, tenantId, body.name, body.note ?? null,
    body.status ?? "draft",
    body.customer_name ?? null, body.customer_phone ?? null, body.customer_email ?? null,
    body.customer_address ?? null, body.start_date ?? null, body.end_date ?? null,
    nowISO()
  ).run();

  return c.json({ ok: true, project: { id } }, 201);
});

app.get("/admin/project/projects/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const projectId = c.req.param("id");

  const project = await db.prepare(
    "SELECT * FROM projects WHERE id = ? AND tenant_id = ?"
  ).bind(projectId, tenantId).first();
  if (!project) return c.json({ ok: false, error: "project_not_found" }, 404);

  const { results: phases } = await db.prepare(
    "SELECT * FROM project_phases WHERE project_id = ? AND tenant_id = ? ORDER BY sort_order"
  ).bind(projectId, tenantId).all();

  const { results: tasks } = await db.prepare(
    "SELECT * FROM project_tasks WHERE project_id = ? AND tenant_id = ? ORDER BY sort_order"
  ).bind(projectId, tenantId).all();

  return c.json({ ok: true, project, phases: phases ?? [], tasks: tasks ?? [] });
});

app.put("/admin/project/projects/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const projectId = c.req.param("id");
  const body = await c.req.json();

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const key of ["name", "note", "status", "customer_name", "customer_phone", "customer_email", "customer_address", "start_date", "end_date"] as const) {
    if (body[key] !== undefined) { sets.push(`${key} = ?`); vals.push(body[key]); }
  }
  if (sets.length === 0) return c.json({ ok: false, error: "no fields to update" }, 400);

  vals.push(projectId, tenantId);
  await db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete("/admin/project/projects/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const projectId = c.req.param("id");

  // Delete related data
  await db.prepare("DELETE FROM project_tasks WHERE project_id = ? AND tenant_id = ?").bind(projectId, tenantId).run();
  await db.prepare("DELETE FROM project_phases WHERE project_id = ? AND tenant_id = ?").bind(projectId, tenantId).run();
  await db.prepare("DELETE FROM project_photos WHERE project_id = ? AND tenant_id = ?").bind(projectId, tenantId).run();
  await db.prepare("DELETE FROM projects WHERE id = ? AND tenant_id = ?").bind(projectId, tenantId).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// Phase Management
// ═══════════════════════════════════════════════════════════════════

app.post("/admin/project/projects/:id/phases", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const projectId = c.req.param("id");
  const body = await c.req.json();

  if (!body.name) return c.json({ ok: false, error: "name is required" }, 400);

  // Verify project exists
  const project = await db.prepare("SELECT id FROM projects WHERE id = ? AND tenant_id = ?").bind(projectId, tenantId).first();
  if (!project) return c.json({ ok: false, error: "project_not_found" }, 404);

  const id = uid("phase");
  await db.prepare(
    `INSERT INTO project_phases (id, tenant_id, project_id, name, status, sort_order, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, projectId, body.name, body.status ?? "pending", body.sort_order ?? 0, body.start_date ?? null, body.end_date ?? null).run();

  return c.json({ ok: true, phase: { id } }, 201);
});

app.put("/admin/project/phases/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const phaseId = c.req.param("id");
  const body = await c.req.json();

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const key of ["name", "status", "sort_order", "start_date", "end_date"] as const) {
    if (body[key] !== undefined) { sets.push(`${key} = ?`); vals.push(body[key]); }
  }
  if (sets.length === 0) return c.json({ ok: false, error: "no fields to update" }, 400);

  vals.push(phaseId, tenantId);
  await db.prepare(`UPDATE project_phases SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete("/admin/project/phases/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const phaseId = c.req.param("id");

  // Delete tasks belonging to this phase
  await db.prepare("DELETE FROM project_tasks WHERE phase_id = ? AND tenant_id = ?").bind(phaseId, tenantId).run();
  await db.prepare("DELETE FROM project_phases WHERE id = ? AND tenant_id = ?").bind(phaseId, tenantId).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// Task Management
// ═══════════════════════════════════════════════════════════════════

app.post("/admin/project/phases/:phaseId/tasks", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const phaseId = c.req.param("phaseId");
  const body = await c.req.json();

  if (!body.name) return c.json({ ok: false, error: "name is required" }, 400);

  // Look up the phase to get project_id
  const phase = await db.prepare("SELECT project_id FROM project_phases WHERE id = ? AND tenant_id = ?").bind(phaseId, tenantId).first() as any;
  if (!phase) return c.json({ ok: false, error: "phase_not_found" }, 404);

  const id = uid("task");
  await db.prepare(
    `INSERT INTO project_tasks (id, tenant_id, project_id, phase_id, name, assignee, due_date, is_done, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).bind(id, tenantId, phase.project_id, phaseId, body.name, body.assignee ?? null, body.due_date ?? null, body.sort_order ?? 0).run();

  return c.json({ ok: true, task: { id, project_id: phase.project_id } }, 201);
});

app.put("/admin/project/tasks/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const taskId = c.req.param("id");
  const body = await c.req.json();

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const key of ["name", "assignee", "due_date", "is_done", "sort_order"] as const) {
    if (body[key] !== undefined) { sets.push(`${key} = ?`); vals.push(body[key]); }
  }
  if (sets.length === 0) return c.json({ ok: false, error: "no fields to update" }, 400);

  vals.push(taskId, tenantId);
  await db.prepare(`UPDATE project_tasks SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete("/admin/project/tasks/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  await db.prepare("DELETE FROM project_tasks WHERE id = ? AND tenant_id = ?").bind(c.req.param("id"), tenantId).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// Estimate Management
// ═══════════════════════════════════════════════════════════════════

app.get("/admin/project/estimates", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const projectId = c.req.query("project_id");

  let sql = "SELECT e.*, p.name AS project_name FROM estimates e LEFT JOIN projects p ON e.project_id = p.id WHERE e.tenant_id = ?";
  const binds: unknown[] = [tenantId];
  if (projectId) { sql += " AND e.project_id = ?"; binds.push(projectId); }
  sql += " ORDER BY e.created_at DESC";

  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json({ ok: true, estimates: results ?? [] });
});

app.post("/admin/project/estimates", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();

  if (!body.project_id || !body.title || !Array.isArray(body.items)) {
    return c.json({ ok: false, error: "project_id, title, and items[] are required" }, 400);
  }

  // Verify project exists
  const project = await db.prepare("SELECT id FROM projects WHERE id = ? AND tenant_id = ?").bind(body.project_id, tenantId).first();
  if (!project) return c.json({ ok: false, error: "project_not_found" }, 404);

  // Calculate totals
  let subtotal = 0;
  for (const item of body.items) {
    const qty = item.quantity ?? 1;
    const price = item.unit_price ?? 0;
    subtotal += qty * price;
  }
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;

  const id = uid("est");
  await db.prepare(
    `INSERT INTO estimates (id, tenant_id, project_id, title, status, subtotal, tax, total, note, created_at)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, body.project_id, body.title, subtotal, tax, total, body.note ?? null, nowISO()).run();

  // Insert estimate items
  for (const item of body.items) {
    const itemId = uid("ei");
    const qty = item.quantity ?? 1;
    const unitPrice = item.unit_price ?? 0;
    const amount = qty * unitPrice;
    await db.prepare(
      `INSERT INTO estimate_items (id, estimate_id, name, quantity, unit, unit_price, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(itemId, id, item.name ?? "", qty, item.unit ?? "式", unitPrice, amount).run();
  }

  return c.json({ ok: true, estimate: { id, subtotal, tax, total } }, 201);
});

app.get("/admin/project/estimates/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const estimateId = c.req.param("id");

  const estimate = await db.prepare(
    "SELECT e.*, p.name AS project_name FROM estimates e LEFT JOIN projects p ON e.project_id = p.id WHERE e.id = ? AND e.tenant_id = ?"
  ).bind(estimateId, tenantId).first();
  if (!estimate) return c.json({ ok: false, error: "estimate_not_found" }, 404);

  const { results: items } = await db.prepare(
    "SELECT * FROM estimate_items WHERE estimate_id = ?"
  ).bind(estimateId).all();

  return c.json({ ok: true, estimate, items: items ?? [] });
});

app.put("/admin/project/estimates/:id/status", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();

  if (!body.status) return c.json({ ok: false, error: "status is required" }, 400);
  const allowed = ["draft", "sent", "accepted", "rejected"];
  if (!allowed.includes(body.status)) return c.json({ ok: false, error: `status must be one of: ${allowed.join(", ")}` }, 400);

  await db.prepare("UPDATE estimates SET status = ? WHERE id = ? AND tenant_id = ?").bind(body.status, c.req.param("id"), tenantId).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// Invoice Management
// ═══════════════════════════════════════════════════════════════════

app.get("/admin/project/invoices", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const projectId = c.req.query("project_id");

  let sql = "SELECT i.*, p.name AS project_name FROM invoices i LEFT JOIN projects p ON i.project_id = p.id WHERE i.tenant_id = ?";
  const binds: unknown[] = [tenantId];
  if (projectId) { sql += " AND i.project_id = ?"; binds.push(projectId); }
  sql += " ORDER BY i.created_at DESC";

  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json({ ok: true, invoices: results ?? [] });
});

app.post("/admin/project/invoices", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();

  if (!body.project_id || !body.title || body.total == null || !body.due_date) {
    return c.json({ ok: false, error: "project_id, title, total, and due_date are required" }, 400);
  }

  // Verify project exists
  const project = await db.prepare("SELECT id FROM projects WHERE id = ? AND tenant_id = ?").bind(body.project_id, tenantId).first();
  if (!project) return c.json({ ok: false, error: "project_not_found" }, 404);

  const id = uid("inv");
  await db.prepare(
    `INSERT INTO invoices (id, tenant_id, project_id, estimate_id, title, total, status, due_date, paid_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'unpaid', ?, NULL, ?)`
  ).bind(id, tenantId, body.project_id, body.estimate_id ?? null, body.title, body.total, body.due_date, nowISO()).run();

  return c.json({ ok: true, invoice: { id } }, 201);
});

app.put("/admin/project/invoices/:id/status", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();

  if (!body.status) return c.json({ ok: false, error: "status is required" }, 400);
  const allowed = ["unpaid", "paid", "overdue"];
  if (!allowed.includes(body.status)) return c.json({ ok: false, error: `status must be one of: ${allowed.join(", ")}` }, 400);

  const paidAt = body.status === "paid" ? nowISO() : null;
  await db.prepare("UPDATE invoices SET status = ?, paid_at = COALESCE(?, paid_at) WHERE id = ? AND tenant_id = ?").bind(body.status, paidAt, c.req.param("id"), tenantId).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// Partner (協力業者) Management
// ═══════════════════════════════════════════════════════════════════

app.get("/admin/project/partners", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;

  const { results } = await db.prepare("SELECT * FROM project_partners WHERE tenant_id = ? ORDER BY created_at DESC").bind(tenantId).all();
  return c.json({ ok: true, partners: results ?? [] });
});

app.post("/admin/project/partners", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();

  if (!body.name) return c.json({ ok: false, error: "name is required" }, 400);

  const id = uid("partner");
  await db.prepare(
    `INSERT INTO project_partners (id, tenant_id, name, specialty, phone, email, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, body.name, body.specialty ?? null, body.phone ?? null, body.email ?? null, body.note ?? null, nowISO()).run();

  return c.json({ ok: true, partner: { id } }, 201);
});

app.put("/admin/project/partners/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const partnerId = c.req.param("id");
  const body = await c.req.json();

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const key of ["name", "specialty", "phone", "email", "note"] as const) {
    if (body[key] !== undefined) { sets.push(`${key} = ?`); vals.push(body[key]); }
  }
  if (sets.length === 0) return c.json({ ok: false, error: "no fields to update" }, 400);

  vals.push(partnerId, tenantId);
  await db.prepare(`UPDATE project_partners SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete("/admin/project/partners/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  await db.prepare("DELETE FROM project_partners WHERE id = ? AND tenant_id = ?").bind(c.req.param("id"), tenantId).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// Site Photos (R2)
// ═══════════════════════════════════════════════════════════════════

app.post("/admin/project/projects/:id/photos", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const r2 = c.env.MENU_IMAGES as R2Bucket;
  const projectId = c.req.param("id");

  // Verify project exists
  const project = await db.prepare("SELECT id FROM projects WHERE id = ? AND tenant_id = ?").bind(projectId, tenantId).first();
  if (!project) return c.json({ ok: false, error: "project_not_found" }, 404);

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return c.json({ ok: false, error: "file is required" }, 400);
  if (file.size > 5 * 1024 * 1024) return c.json({ ok: false, error: "file too large (max 5MB)" }, 400);

  const ext = file.name.split(".").pop() || "jpg";
  const key = `project/${tenantId}/${projectId}/${Date.now()}.${ext}`;
  await r2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

  const photoId = uid("photo");
  const imageKey = key;
  await db.prepare(
    `INSERT INTO project_photos (id, tenant_id, project_id, image_key, caption, taken_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(photoId, tenantId, projectId, imageKey, (formData.get("caption") as string) ?? null, (formData.get("taken_at") as string) ?? null, nowISO()).run();

  return c.json({ ok: true, photo: { id: photoId, imageUrl: `/media/project/${key.replace("project/", "")}` } }, 201);
});

app.get("/admin/project/projects/:id/photos", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const projectId = c.req.param("id");

  const { results } = await db.prepare(
    "SELECT * FROM project_photos WHERE project_id = ? AND tenant_id = ? ORDER BY created_at DESC"
  ).bind(projectId, tenantId).all();

  return c.json({ ok: true, photos: results ?? [] });
});

// Serve project photos from R2
app.get("/media/project/*", async (c) => {
  const r2 = c.env.MENU_IMAGES as R2Bucket;
  const path = c.req.path.replace("/media/project/", "");
  const obj = await r2.get(`project/${path}`);
  if (!obj) return c.json({ ok: false, error: "not_found" }, 404);
  return new Response(obj.body as ReadableStream, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
});

// ═══════════════════════════════════════════════════════════════════
// Dashboard Stats
// ═══════════════════════════════════════════════════════════════════

app.get("/admin/project/stats", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const ms = monthStart();

  const [totalProjects, activeProjects, monthEstimates, monthInvoicePaid, pendingTasks] = await Promise.all([
    db.prepare("SELECT COUNT(*) as c FROM projects WHERE tenant_id = ?").bind(tenantId).first(),
    db.prepare("SELECT COUNT(*) as c FROM projects WHERE tenant_id = ? AND status = 'in_progress'").bind(tenantId).first(),
    db.prepare("SELECT COUNT(*) as c FROM estimates WHERE tenant_id = ? AND created_at >= ?").bind(tenantId, ms).first(),
    db.prepare("SELECT COALESCE(SUM(total), 0) as s FROM invoices WHERE tenant_id = ? AND status = 'paid' AND paid_at >= ?").bind(tenantId, ms).first(),
    db.prepare("SELECT COUNT(*) as c FROM project_tasks WHERE tenant_id = ? AND is_done = 0").bind(tenantId).first(),
  ]);

  return c.json({
    ok: true,
    stats: {
      totalProjects: (totalProjects as any)?.c ?? 0,
      activeProjects: (activeProjects as any)?.c ?? 0,
      monthEstimates: (monthEstimates as any)?.c ?? 0,
      monthInvoicePaid: (monthInvoicePaid as any)?.s ?? 0,
      pendingTasks: (pendingTasks as any)?.c ?? 0,
    },
  });
});

} // end registerProjectRoutes
