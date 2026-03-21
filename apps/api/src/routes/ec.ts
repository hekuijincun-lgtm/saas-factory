/**
 * EC Core routes — /admin/ec/*, /store/:tenantId/*
 *
 * Product management, orders, cart, checkout, shipping rules.
 * Used by coreType='ec' verticals (shop, food, handmade, etc.)
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

export function registerEcRoutes(app: Hono<{ Bindings: Record<string, unknown> }>) {

// ═══════════════════════════════════════════════════════════════════
// Product Management (Admin)
// ═══════════════════════════════════════════════════════════════════

app.get("/admin/ec/products", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const statusFilter = c.req.query("status");
  const categoryId = c.req.query("category_id");

  let sql = "SELECT p.*, pc.name AS category_name FROM products p LEFT JOIN product_categories pc ON p.category_id = pc.id WHERE p.tenant_id = ?";
  const binds: unknown[] = [tenantId];
  if (statusFilter && statusFilter !== "all") { sql += " AND p.status = ?"; binds.push(statusFilter); }
  if (categoryId) { sql += " AND p.category_id = ?"; binds.push(categoryId); }
  sql += " ORDER BY p.created_at DESC";

  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json({ ok: true, products: results ?? [] });
});

app.post("/admin/ec/products", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();

  if (!body.name || body.price == null) return c.json({ ok: false, error: "name and price are required" }, 400);

  const id = uid("prod");
  await db.prepare(
    `INSERT INTO products (id, tenant_id, category_id, name, description, price, compare_price, sku, stock, is_unlimited_stock, status, images, attributes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, tenantId, body.category_id ?? null, body.name, body.description ?? null,
    body.price, body.compare_price ?? null, body.sku ?? null,
    body.stock ?? 0, body.is_unlimited_stock ? 1 : 0,
    body.status ?? "active",
    JSON.stringify(body.images ?? []), JSON.stringify(body.attributes ?? {}), nowISO()
  ).run();

  return c.json({ ok: true, product: { id } }, 201);
});

app.get("/admin/ec/products/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const productId = c.req.param("id");

  const product = await db.prepare(
    "SELECT p.*, pc.name AS category_name FROM products p LEFT JOIN product_categories pc ON p.category_id = pc.id WHERE p.id = ? AND p.tenant_id = ?"
  ).bind(productId, tenantId).first();
  if (!product) return c.json({ ok: false, error: "product_not_found" }, 404);

  return c.json({ ok: true, product });
});

app.put("/admin/ec/products/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const productId = c.req.param("id");
  const body = await c.req.json();

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const key of ["category_id", "name", "description", "price", "compare_price", "sku", "stock", "is_unlimited_stock", "status"] as const) {
    if (body[key] !== undefined) { sets.push(`${key} = ?`); vals.push(body[key]); }
  }
  if (body.images !== undefined) { sets.push("images = ?"); vals.push(JSON.stringify(body.images)); }
  if (body.attributes !== undefined) { sets.push("attributes = ?"); vals.push(JSON.stringify(body.attributes)); }
  if (sets.length === 0) return c.json({ ok: false, error: "no fields to update" }, 400);

  vals.push(productId, tenantId);
  await db.prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete("/admin/ec/products/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  await db.prepare("DELETE FROM products WHERE id = ? AND tenant_id = ?").bind(c.req.param("id"), tenantId).run();
  return c.json({ ok: true });
});

// Image upload
app.post("/admin/ec/products/:id/images", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const r2 = c.env.MENU_IMAGES as R2Bucket;
  const productId = c.req.param("id");

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return c.json({ ok: false, error: "file is required" }, 400);
  if (file.size > 5 * 1024 * 1024) return c.json({ ok: false, error: "file too large (max 5MB)" }, 400);

  const ext = file.name.split(".").pop() || "jpg";
  const key = `ec/${tenantId}/${productId}/${Date.now()}.${ext}`;
  await r2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

  // Append to product images array
  const product = await db.prepare("SELECT images FROM products WHERE id = ? AND tenant_id = ?").bind(productId, tenantId).first() as any;
  if (!product) return c.json({ ok: false, error: "product_not_found" }, 404);

  const images: string[] = JSON.parse(product.images || "[]");
  const imageUrl = `/media/ec/${key.replace(`ec/`, "")}`;
  images.push(imageUrl);
  await db.prepare("UPDATE products SET images = ? WHERE id = ? AND tenant_id = ?").bind(JSON.stringify(images), productId, tenantId).run();

  return c.json({ ok: true, imageUrl, images });
});

// Serve EC images from R2
app.get("/media/ec/*", async (c) => {
  const r2 = c.env.MENU_IMAGES as R2Bucket;
  const path = c.req.path.replace("/media/ec/", "");
  const obj = await r2.get(`ec/${path}`);
  if (!obj) return c.json({ ok: false, error: "not_found" }, 404);
  return new Response(obj.body as ReadableStream, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
});

// ═══════════════════════════════════════════════════════════════════
// Category Management
// ═══════════════════════════════════════════════════════════════════

app.get("/admin/ec/categories", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const { results } = await db.prepare("SELECT * FROM product_categories WHERE tenant_id = ? ORDER BY sort_order, name").bind(tenantId).all();
  return c.json({ ok: true, categories: results ?? [] });
});

app.post("/admin/ec/categories", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();
  if (!body.name) return c.json({ ok: false, error: "name is required" }, 400);
  const id = uid("cat");
  await db.prepare("INSERT INTO product_categories (id, tenant_id, name, sort_order) VALUES (?, ?, ?, ?)").bind(id, tenantId, body.name, body.sort_order ?? 0).run();
  return c.json({ ok: true, category: { id, name: body.name } }, 201);
});

app.put("/admin/ec/categories/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();
  const sets: string[] = []; const vals: unknown[] = [];
  if (body.name !== undefined) { sets.push("name = ?"); vals.push(body.name); }
  if (body.sort_order !== undefined) { sets.push("sort_order = ?"); vals.push(body.sort_order); }
  if (sets.length === 0) return c.json({ ok: false, error: "no fields" }, 400);
  vals.push(c.req.param("id"), tenantId);
  await db.prepare(`UPDATE product_categories SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete("/admin/ec/categories/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  await db.prepare("DELETE FROM product_categories WHERE id = ? AND tenant_id = ?").bind(c.req.param("id"), tenantId).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// Order Management (Admin)
// ═══════════════════════════════════════════════════════════════════

app.get("/admin/ec/orders", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const statusFilter = c.req.query("status");

  let sql = "SELECT * FROM orders WHERE tenant_id = ?";
  const binds: unknown[] = [tenantId];
  if (statusFilter && statusFilter !== "all") { sql += " AND status = ?"; binds.push(statusFilter); }
  sql += " ORDER BY created_at DESC LIMIT 200";

  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json({ ok: true, orders: results ?? [] });
});

app.get("/admin/ec/orders/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const orderId = c.req.param("id");

  const order = await db.prepare("SELECT * FROM orders WHERE id = ? AND tenant_id = ?").bind(orderId, tenantId).first();
  if (!order) return c.json({ ok: false, error: "order_not_found" }, 404);

  const { results: items } = await db.prepare("SELECT * FROM order_items WHERE order_id = ?").bind(orderId).all();
  return c.json({ ok: true, order, items: items ?? [] });
});

app.put("/admin/ec/orders/:id/status", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();
  if (!body.status) return c.json({ ok: false, error: "status is required" }, 400);

  await db.prepare("UPDATE orders SET status = ? WHERE id = ? AND tenant_id = ?").bind(body.status, c.req.param("id"), tenantId).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// Shipping Rules
// ═══════════════════════════════════════════════════════════════════

app.get("/admin/ec/shipping", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const { results } = await db.prepare("SELECT * FROM shipping_rules WHERE tenant_id = ? ORDER BY is_default DESC, name").bind(tenantId).all();
  return c.json({ ok: true, rules: results ?? [] });
});

app.post("/admin/ec/shipping", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();
  if (!body.name || body.fee == null) return c.json({ ok: false, error: "name and fee are required" }, 400);
  const id = uid("ship");
  await db.prepare("INSERT INTO shipping_rules (id, tenant_id, name, fee, free_threshold, is_default) VALUES (?, ?, ?, ?, ?, ?)").bind(id, tenantId, body.name, body.fee, body.free_threshold ?? null, body.is_default ? 1 : 0).run();
  return c.json({ ok: true, rule: { id } }, 201);
});

app.put("/admin/ec/shipping/:id", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const body = await c.req.json();
  const sets: string[] = []; const vals: unknown[] = [];
  for (const k of ["name", "fee", "free_threshold", "is_default"] as const) {
    if (body[k] !== undefined) { sets.push(`${k} = ?`); vals.push(body[k]); }
  }
  if (sets.length === 0) return c.json({ ok: false, error: "no fields" }, 400);
  vals.push(c.req.param("id"), tenantId);
  await db.prepare(`UPDATE shipping_rules SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// Dashboard Stats
// ═══════════════════════════════════════════════════════════════════

app.get("/admin/ec/stats", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, "admin"); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = c.env.DB as D1Database;
  const ms = monthStart();

  const [totalProducts, monthOrders, monthRevenue, pendingShip, outOfStock] = await Promise.all([
    db.prepare("SELECT COUNT(*) as c FROM products WHERE tenant_id = ? AND status = 'active'").bind(tenantId).first(),
    db.prepare("SELECT COUNT(*) as c FROM orders WHERE tenant_id = ? AND created_at >= ?").bind(tenantId, ms).first(),
    db.prepare("SELECT COALESCE(SUM(total), 0) as s FROM orders WHERE tenant_id = ? AND created_at >= ? AND status IN ('paid','shipped','delivered')").bind(tenantId, ms).first(),
    db.prepare("SELECT COUNT(*) as c FROM orders WHERE tenant_id = ? AND status = 'paid'").bind(tenantId).first(),
    db.prepare("SELECT COUNT(*) as c FROM products WHERE tenant_id = ? AND status = 'active' AND is_unlimited_stock = 0 AND stock <= 0").bind(tenantId).first(),
  ]);

  return c.json({
    ok: true,
    stats: {
      totalProducts: (totalProducts as any)?.c ?? 0,
      monthOrders: (monthOrders as any)?.c ?? 0,
      monthRevenue: (monthRevenue as any)?.s ?? 0,
      pendingShipments: (pendingShip as any)?.c ?? 0,
      outOfStock: (outOfStock as any)?.c ?? 0,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════
// Storefront (Public)
// ═══════════════════════════════════════════════════════════════════

app.get("/store/:tenantId/products", async (c) => {
  const tenantId = c.req.param("tenantId");
  const db = c.env.DB as D1Database;
  const categoryId = c.req.query("category_id");

  let sql = "SELECT id, name, description, price, compare_price, images, category_id FROM products WHERE tenant_id = ? AND status = 'active'";
  const binds: unknown[] = [tenantId];
  if (categoryId) { sql += " AND category_id = ?"; binds.push(categoryId); }
  sql += " ORDER BY created_at DESC";

  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json({ ok: true, products: results ?? [] });
});

app.get("/store/:tenantId/products/:id", async (c) => {
  const tenantId = c.req.param("tenantId");
  const db = c.env.DB as D1Database;
  const product = await db.prepare(
    "SELECT id, name, description, price, compare_price, images, attributes, category_id, stock, is_unlimited_stock FROM products WHERE id = ? AND tenant_id = ? AND status = 'active'"
  ).bind(c.req.param("id"), tenantId).first();
  if (!product) return c.json({ ok: false, error: "not_found" }, 404);
  return c.json({ ok: true, product });
});

app.post("/store/:tenantId/cart", async (c) => {
  const tenantId = c.req.param("tenantId");
  const db = c.env.DB as D1Database;
  const body = await c.req.json();
  if (!body.session_id || !body.product_id) return c.json({ ok: false, error: "session_id and product_id are required" }, 400);

  // Check product exists and in stock
  const product = await db.prepare("SELECT id, stock, is_unlimited_stock FROM products WHERE id = ? AND tenant_id = ? AND status = 'active'").bind(body.product_id, tenantId).first() as any;
  if (!product) return c.json({ ok: false, error: "product_not_found" }, 404);
  if (!product.is_unlimited_stock && product.stock <= 0) return c.json({ ok: false, error: "out_of_stock" }, 400);

  // Upsert cart item
  const existing = await db.prepare("SELECT id, quantity FROM cart_items WHERE tenant_id = ? AND session_id = ? AND product_id = ?").bind(tenantId, body.session_id, body.product_id).first() as any;
  if (existing) {
    await db.prepare("UPDATE cart_items SET quantity = ? WHERE id = ?").bind((existing.quantity || 0) + (body.quantity || 1), existing.id).run();
  } else {
    await db.prepare("INSERT INTO cart_items (id, tenant_id, session_id, product_id, quantity, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(uid("ci"), tenantId, body.session_id, body.product_id, body.quantity || 1, nowISO()).run();
  }
  return c.json({ ok: true });
});

app.get("/store/:tenantId/cart", async (c) => {
  const tenantId = c.req.param("tenantId");
  const db = c.env.DB as D1Database;
  const sessionId = c.req.query("session_id") || "";

  const { results } = await db.prepare(
    `SELECT ci.id, ci.product_id, ci.quantity, p.name, p.price, p.images
     FROM cart_items ci LEFT JOIN products p ON ci.product_id = p.id
     WHERE ci.tenant_id = ? AND ci.session_id = ?`
  ).bind(tenantId, sessionId).all();
  return c.json({ ok: true, items: results ?? [] });
});

app.delete("/store/:tenantId/cart/:itemId", async (c) => {
  const tenantId = c.req.param("tenantId");
  const db = c.env.DB as D1Database;
  await db.prepare("DELETE FROM cart_items WHERE id = ? AND tenant_id = ?").bind(c.req.param("itemId"), tenantId).run();
  return c.json({ ok: true });
});

app.post("/store/:tenantId/checkout", async (c) => {
  const tenantId = c.req.param("tenantId");
  const db = c.env.DB as D1Database;
  const body = await c.req.json();
  if (!body.session_id) return c.json({ ok: false, error: "session_id is required" }, 400);

  // Get cart items
  const { results: cartItems } = await db.prepare(
    "SELECT ci.*, p.name AS product_name, p.price AS product_price, p.stock, p.is_unlimited_stock FROM cart_items ci LEFT JOIN products p ON ci.product_id = p.id WHERE ci.tenant_id = ? AND ci.session_id = ?"
  ).bind(tenantId, body.session_id).all() as { results: any[] };

  if (!cartItems || cartItems.length === 0) return c.json({ ok: false, error: "cart_empty" }, 400);

  // Calculate total
  let subtotal = 0;
  for (const item of cartItems) {
    subtotal += (item.product_price || 0) * (item.quantity || 1);
  }

  // Get shipping fee
  const shippingRule = await db.prepare("SELECT fee, free_threshold FROM shipping_rules WHERE tenant_id = ? AND is_default = 1").bind(tenantId).first() as any;
  let shippingFee = shippingRule?.fee ?? 0;
  if (shippingRule?.free_threshold && subtotal >= shippingRule.free_threshold) shippingFee = 0;
  const total = subtotal + shippingFee;

  // Create order
  const orderId = uid("ord");
  await db.prepare(
    `INSERT INTO orders (id, tenant_id, customer_id, status, total, shipping_fee, shipping_name, shipping_address, shipping_phone, note, created_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`
  ).bind(orderId, tenantId, body.customer_id ?? null, total, shippingFee, body.shipping_name ?? null, body.shipping_address ?? null, body.shipping_phone ?? null, body.note ?? null, nowISO()).run();

  // Create order items + decrement stock
  for (const item of cartItems) {
    await db.prepare(
      "INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(uid("oi"), orderId, item.product_id, item.product_name, item.product_price, item.quantity).run();

    if (!item.is_unlimited_stock) {
      await db.prepare("UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ? AND tenant_id = ?").bind(item.quantity, item.product_id, tenantId).run();
    }
  }

  // Clear cart
  await db.prepare("DELETE FROM cart_items WHERE tenant_id = ? AND session_id = ?").bind(tenantId, body.session_id).run();

  return c.json({ ok: true, order: { id: orderId, total, shipping_fee: shippingFee } }, 201);
});

app.get("/store/:tenantId/orders/:id", async (c) => {
  const tenantId = c.req.param("tenantId");
  const db = c.env.DB as D1Database;
  const orderId = c.req.param("id");
  const order = await db.prepare("SELECT id, status, total, shipping_fee, created_at FROM orders WHERE id = ? AND tenant_id = ?").bind(orderId, tenantId).first();
  if (!order) return c.json({ ok: false, error: "not_found" }, 404);
  const { results: items } = await db.prepare("SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?").bind(orderId).all();
  return c.json({ ok: true, order, items: items ?? [] });
});

} // end registerEcRoutes
