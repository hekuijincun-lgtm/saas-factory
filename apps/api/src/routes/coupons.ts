import { getTenantId, checkTenantMismatch, requireRole } from '../helpers';

export function registerCouponRoutes(app: any) {

// ── GET /admin/coupons ─────────────────────────────────────────────────────
app.get("/admin/coupons", async (c: any) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const tenantId = getTenantId(c);
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const result = await db.prepare(
      `SELECT * FROM coupons WHERE tenant_id = ? ORDER BY created_at DESC`
    ).bind(tenantId).all();

    const coupons = (result.results || []).map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      title: r.title,
      description: r.description,
      discountType: r.discount_type,
      discountValue: r.discount_value,
      targetMenuId: r.target_menu_id,
      validFrom: r.valid_from,
      validUntil: r.valid_until,
      maxUses: r.max_uses,
      usedCount: r.used_count,
      triggerType: r.trigger_type,
      isActive: !!r.is_active,
      createdAt: r.created_at,
    }));

    return c.json({ ok: true, coupons });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── POST /admin/coupons ────────────────────────────────────────────────────
app.post("/admin/coupons", async (c: any) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const body = await c.req.json();
    // 短い読みやすいコード（6文字大文字英数字）
    const id = body.code?.trim() || Math.random().toString(36).slice(2, 8).toUpperCase();
    const {
      title, description, discountType, discountValue,
      targetMenuId, validFrom, validUntil, maxUses,
      triggerType, isActive,
    } = body;

    if (!title || !discountType || !validFrom || !validUntil) {
      return c.json({ ok: false, error: "missing_fields" }, 400);
    }

    await db.prepare(
      `INSERT INTO coupons (id, tenant_id, title, description, discount_type, discount_value,
        target_menu_id, valid_from, valid_until, max_uses, trigger_type, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, tenantId, title, description || null, discountType, discountValue || 0,
      targetMenuId || null, validFrom, validUntil, maxUses || null,
      triggerType || 'manual', isActive !== false ? 1 : 0,
    ).run();

    return c.json({ ok: true, id, tenantId });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── PUT /admin/coupons/:couponId ───────────────────────────────────────────
app.put("/admin/coupons/:couponId", async (c: any) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const couponId = c.req.param("couponId");
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const body = await c.req.json();
    const {
      title, description, discountType, discountValue,
      targetMenuId, validFrom, validUntil, maxUses,
      triggerType, isActive,
    } = body;

    const result = await db.prepare(
      `UPDATE coupons SET title = ?, description = ?, discount_type = ?, discount_value = ?,
        target_menu_id = ?, valid_from = ?, valid_until = ?, max_uses = ?,
        trigger_type = ?, is_active = ?
       WHERE id = ? AND tenant_id = ?`
    ).bind(
      title, description || null, discountType, discountValue || 0,
      targetMenuId || null, validFrom, validUntil, maxUses || null,
      triggerType || 'manual', isActive !== false ? 1 : 0,
      couponId, tenantId,
    ).run();

    return c.json({ ok: true, couponId, updated: (result.meta?.changes ?? 0) > 0 });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── DELETE /admin/coupons/:couponId ────────────────────────────────────────
app.delete("/admin/coupons/:couponId", async (c: any) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const couponId = c.req.param("couponId");
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    await db.prepare(`DELETE FROM coupons WHERE id = ? AND tenant_id = ?`)
      .bind(couponId, tenantId).run();
    return c.json({ ok: true, couponId, deleted: true });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── GET /coupons (public) ──────────────────────────────────────────────────
// 顧客がLINEから自分のクーポン一覧を取得
app.get("/coupons", async (c: any) => {
  const tenantId = c.req.query("tenantId") || "default";
  const lineUserId = c.req.query("lineUserId") || "";
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10); // JST
    const result = await db.prepare(
      `SELECT c.* FROM coupons c
       WHERE c.tenant_id = ? AND c.is_active = 1
         AND c.valid_from <= ? AND c.valid_until >= ?
         AND (c.max_uses IS NULL OR c.used_count < c.max_uses)
       ORDER BY c.valid_until ASC`
    ).bind(tenantId, now, now).all();

    // Filter out already-used coupons for this user
    let usedIds = new Set<string>();
    if (lineUserId) {
      const usedResult = await db.prepare(
        `SELECT coupon_id FROM coupon_uses WHERE tenant_id = ? AND line_user_id = ?`
      ).bind(tenantId, lineUserId).all();
      usedIds = new Set((usedResult.results || []).map((r: any) => r.coupon_id));
    }

    const coupons = (result.results || [])
      .filter((r: any) => !usedIds.has(r.id))
      .map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        discountType: r.discount_type,
        discountValue: r.discount_value,
        validFrom: r.valid_from,
        validUntil: r.valid_until,
      }));

    return c.json({ ok: true, coupons });
  } catch (e: any) {
    return c.json({ ok: false, error: "db_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── POST /coupons/:couponId/use ────────────────────────────────────────────
app.post("/coupons/:couponId/use", async (c: any) => {
  const couponId = c.req.param("couponId");
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);

  try {
    const body = await c.req.json();
    const { tenantId, lineUserId, reservationId } = body;
    if (!tenantId || !lineUserId) return c.json({ ok: false, error: "missing_fields" }, 400);

    // Check coupon exists and is valid
    const coupon = await db.prepare(
      `SELECT * FROM coupons WHERE id = ? AND tenant_id = ? AND is_active = 1`
    ).bind(couponId, tenantId).first();
    if (!coupon) return c.json({ ok: false, error: "coupon_not_found" }, 404);

    const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10); // JST
    if (coupon.valid_from > now || coupon.valid_until < now) {
      return c.json({ ok: false, error: "coupon_expired" }, 400);
    }
    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
      return c.json({ ok: false, error: "coupon_max_uses_reached" }, 400);
    }

    // Check if already used
    const existing = await db.prepare(
      `SELECT id FROM coupon_uses WHERE coupon_id = ? AND line_user_id = ?`
    ).bind(couponId, lineUserId).first();
    if (existing) return c.json({ ok: false, error: "already_used" }, 409);

    const useId = `use_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await db.batch([
      db.prepare(`INSERT INTO coupon_uses (id, coupon_id, tenant_id, line_user_id, reservation_id) VALUES (?, ?, ?, ?, ?)`)
        .bind(useId, couponId, tenantId, lineUserId, reservationId || null),
      db.prepare(`UPDATE coupons SET used_count = used_count + 1 WHERE id = ?`)
        .bind(couponId),
    ]);

    return c.json({ ok: true, useId, couponId });
  } catch (e: any) {
    if (String(e?.message).includes("UNIQUE")) {
      return c.json({ ok: false, error: "already_used" }, 409);
    }
    return c.json({ ok: false, error: "db_error", detail: String(e?.message ?? e) }, 500);
  }
});

// ── GET /public/coupons/validate — クーポンコード検証 ─────────────────────
app.get("/public/coupons/validate", async (c: any) => {
  const tenantId = c.req.query("tenantId") || "default";
  const code = (c.req.query("code") || "").trim();
  const menuId = c.req.query("menuId") || "";
  const db = (c.env as any).DB;
  if (!db) return c.json({ ok: false, valid: false, message: "DB_not_bound" }, 500);
  if (!code) return c.json({ ok: true, valid: false, message: "クーポンコードを入力してください" });

  try {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const coupon = await db.prepare(
      `SELECT * FROM coupons
       WHERE tenant_id = ? AND id = ? AND is_active = 1
       AND valid_from <= ? AND valid_until >= ?
       AND (max_uses IS NULL OR used_count < max_uses)`
    ).bind(tenantId, code, now, now).first();

    if (!coupon) {
      return c.json({ ok: true, valid: false, message: "クーポンが見つからないか期限切れです" });
    }
    if (coupon.target_menu_id && menuId && coupon.target_menu_id !== menuId) {
      return c.json({ ok: true, valid: false, message: "このメニューには使用できないクーポンです" });
    }

    return c.json({
      ok: true, valid: true,
      coupon: {
        id: coupon.id,
        title: coupon.title,
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        validUntil: coupon.valid_until,
      },
    });
  } catch (e: any) {
    return c.json({ ok: false, valid: false, message: "検証エラー", detail: String(e?.message ?? e) }, 500);
  }
});

} // end registerCouponRoutes

/** Build a LINE Flex Message bubble for a coupon */
export function buildCouponFlexMessage(coupon: {
  id: string; title: string; description?: string;
  discountType: string; discountValue: number;
  validFrom: string; validUntil: string;
}): any {
  const discountText = coupon.discountType === 'amount'
    ? `¥${coupon.discountValue.toLocaleString()} OFF`
    : coupon.discountType === 'percent'
    ? `${coupon.discountValue}% OFF`
    : '無料';

  return {
    type: "flex",
    altText: `クーポン: ${coupon.title}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#D4845A",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "🎫 クーポン", color: "#FFFFFF", weight: "bold", size: "sm" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "20px",
        contents: [
          { type: "text", text: coupon.title, weight: "bold", size: "lg", wrap: true },
          { type: "text", text: discountText, color: "#D4845A", size: "xxl", weight: "bold" },
          ...(coupon.description ? [{ type: "text", text: coupon.description, color: "#666666", size: "sm", wrap: true }] : []),
          { type: "text", text: `有効期限: ${coupon.validUntil}`, color: "#888888", size: "xs", margin: "md" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            action: {
              type: "postback",
              label: "クーポンを使って予約する",
              data: `action=use_coupon&couponId=${coupon.id}`,
              displayText: "クーポンを使って予約します",
            },
            style: "primary",
            color: "#D4845A",
            height: "sm",
          },
        ],
      },
    },
  };
}

/** Build a "no coupons" text message */
export function buildNoCouponsMessage(): any {
  return { type: "text", text: "現在ご利用可能なクーポンはありません。\n新しいクーポンが届くまでお待ちください🐾" };
}
