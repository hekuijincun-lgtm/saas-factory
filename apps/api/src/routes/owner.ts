/**
 * Owner routes — cross-tenant management dashboard
 *
 * Auth: ADMIN_TOKEN (X-Admin-Token header) + userId in OWNER_USER_IDS env.
 * Both conditions must pass; fail-closed on misconfiguration.
 *
 * Future: rate limiting (KV-based, per-userId), audit log to D1
 */
import type { Hono } from "hono";
import { mergeSettings, DEFAULT_ADMIN_SETTINGS } from "../settings";

// ── Principal helpers ───────────────────────────────────────────────────────
// OWNER_USER_IDS stores comma-separated principal strings.
// Each principal has a prefix indicating identity type:
//   email:kazuki@example.com
//   line:U1234567890abcdef
// For backward compat, bare strings (no colon) are treated as-is.

export function parsePrincipalList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isPrincipalAllowed(userId: string, allowedList: string[]): boolean {
  if (!userId) return false;
  return allowedList.includes(userId);
}

// ── Active reservation filter (duplicated from index.ts to avoid circular dep) ──
const SQL_ACTIVE_FILTER = "status != 'cancelled'" as const;

// ── Register routes ─────────────────────────────────────────────────────────

export function registerOwnerRoutes(app: Hono<{ Bindings: Record<string, unknown> }>) {
  // ── Owner auth middleware ──────────────────────────────────────────────
  // Two-layer check: ADMIN_TOKEN + OWNER_USER_IDS
  // Pages middleware already verified session; Workers re-verifies to prevent
  // direct API access bypass.
  app.use("/owner/*", async (c, next) => {
    const env = c.env as any;
    const expected: string | undefined = env?.ADMIN_TOKEN;
    if (!expected) {
      console.error("[owner-auth] ADMIN_TOKEN not set — blocking /owner/*");
      return c.json({ ok: false, error: "Service unavailable" }, 503);
    }
    const provided = c.req.header("X-Admin-Token");
    if (!provided || provided !== expected) {
      return c.json({ ok: false, error: "Unauthorized" }, 401);
    }

    const ownerIds = parsePrincipalList(env?.OWNER_USER_IDS ?? "");
    const userId = c.req.header("x-session-user-id") ?? "";
    if (!isPrincipalAllowed(userId, ownerIds)) {
      console.warn(`[owner-auth] denied userId=${userId.slice(0, 20)}...`);
      return c.json({ ok: false, error: "Forbidden" }, 403);
    }
    // TODO: rate limit — KV key `owner:rl:{userId}`, 120 req/10min
    return next();
  });

  // ── GET /owner/overview — cross-tenant KPI ─────────────────────────────
  app.get("/owner/overview", async (c) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY;
    const db = env.DB;
    if (!kv) return c.json({ ok: false, error: "Internal error" }, 500);

    try {
      const settingsKeys = await kv.list({ prefix: "settings:" });
      const tenantCount = settingsKeys.keys?.length ?? 0;

      let lineConnected = 0;
      for (const key of settingsKeys.keys ?? []) {
        try {
          const raw = await kv.get(key.name, "json");
          const settings = raw ? mergeSettings(raw) : DEFAULT_ADMIN_SETTINGS;
          if (settings.integrations?.line?.channelAccessToken) lineConnected++;
        } catch {}
      }

      let reservationsToday = 0;
      if (db) {
        const now = new Date();
        const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        const row = await db
          .prepare(
            `SELECT COUNT(*) as cnt FROM reservations WHERE date(start_at) = ? AND ${SQL_ACTIVE_FILTER}`
          )
          .bind(jstDate)
          .first<{ cnt: number }>();
        reservationsToday = row?.cnt ?? 0;
      }

      const ticketKeys = await kv.list({ prefix: "support:ticket:" });
      let pendingTickets = 0;
      for (const key of ticketKeys.keys ?? []) {
        try {
          const ticket = (await kv.get(key.name, "json")) as any;
          if (
            ticket &&
            (ticket.status === "new" || ticket.status === "reviewing")
          )
            pendingTickets++;
        } catch {}
      }

      return c.json({
        ok: true,
        tenantCount,
        reservationsToday,
        lineConnected,
        pendingTickets,
      });
    } catch (e: any) {
      console.error("[owner/overview]", String(e?.message ?? e));
      return c.json({ ok: false, error: "Internal error" }, 500);
    }
  });

  // ── GET /owner/tenants — tenant list ───────────────────────────────────
  app.get("/owner/tenants", async (c) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY;
    const db = env.DB;
    if (!kv) return c.json({ ok: false, error: "Internal error" }, 500);

    try {
      const settingsKeys = await kv.list({ prefix: "settings:" });
      const now = new Date();
      const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      const resCounts: Record<string, number> = {};
      if (db) {
        const rows = await db
          .prepare(
            `SELECT tenant_id, COUNT(*) as cnt FROM reservations WHERE date(start_at) = ? AND ${SQL_ACTIVE_FILTER} GROUP BY tenant_id`
          )
          .bind(jstDate)
          .all();
        for (const r of rows.results ?? []) {
          resCounts[(r as any).tenant_id] = (r as any).cnt;
        }
      }

      const tenants: any[] = [];
      for (const key of settingsKeys.keys ?? []) {
        const tenantId = key.name.replace("settings:", "");
        try {
          const raw = await kv.get(key.name, "json");
          const settings = raw ? mergeSettings(raw) : DEFAULT_ADMIN_SETTINGS;
          tenants.push({
            tenantId,
            storeName: settings.storeName || tenantId,
            lineConnected: !!settings.integrations?.line?.channelAccessToken,
            reservationsToday: resCounts[tenantId] ?? 0,
            subscriptionStatus: settings.subscription?.status ?? "unknown",
          });
        } catch {
          tenants.push({
            tenantId,
            storeName: tenantId,
            lineConnected: false,
            reservationsToday: 0,
            subscriptionStatus: "unknown",
          });
        }
      }

      return c.json({ ok: true, tenants });
    } catch (e: any) {
      console.error("[owner/tenants]", String(e?.message ?? e));
      return c.json({ ok: false, error: "Internal error" }, 500);
    }
  });

  // ── GET /owner/tickets — ticket list ───────────────────────────────────
  app.get("/owner/tickets", async (c) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "Internal error" }, 500);

    const statusFilter = c.req.query("status") || "";

    try {
      const ticketKeys = await kv.list({ prefix: "support:ticket:" });
      const tickets: any[] = [];
      const storeNames: Record<string, string> = {};

      for (const key of ticketKeys.keys ?? []) {
        try {
          const ticket = (await kv.get(key.name, "json")) as any;
          if (!ticket) continue;
          if (statusFilter && ticket.status !== statusFilter) continue;

          const tid = ticket.tenantId || "default";
          if (!storeNames[tid]) {
            try {
              const raw = (await kv.get(`settings:${tid}`, "json")) as any;
              storeNames[tid] = raw?.storeName || tid;
            } catch {
              storeNames[tid] = tid;
            }
          }

          tickets.push({
            id: ticket.id || key.name.split(":").pop(),
            tenantId: tid,
            storeName: storeNames[tid],
            category: ticket.category || "other",
            subject: ticket.subject || "",
            message: ticket.message || "",
            status: ticket.status || "new",
            createdAt: ticket.createdAt || "",
            updatedAt: ticket.updatedAt || "",
          });
        } catch {}
      }

      // Stable sort: newest first, then by id for determinism
      tickets.sort((a: any, b: any) => {
        const cmp = (b.createdAt || "").localeCompare(a.createdAt || "");
        return cmp !== 0 ? cmp : (b.id || "").localeCompare(a.id || "");
      });

      return c.json({ ok: true, tickets });
    } catch (e: any) {
      console.error("[owner/tickets]", String(e?.message ?? e));
      return c.json({ ok: false, error: "Internal error" }, 500);
    }
  });

  // ── PUT /owner/tickets/:tenantId/:ticketId — update ticket status ──────
  // NOTE: Uses PUT instead of PATCH because the catch-all proxy rewrites
  // PATCH → PUT. Workers must accept PUT to match what arrives.
  app.put("/owner/tickets/:tenantId/:ticketId", async (c) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "Internal error" }, 500);

    const tenantId = c.req.param("tenantId");
    const ticketId = c.req.param("ticketId");
    const body = await c.req.json<{ status?: string }>().catch(() => ({}));
    const newStatus = body.status;

    const validStatuses = ["new", "reviewing", "planned", "closed"];
    if (!newStatus || !validStatuses.includes(newStatus)) {
      return c.json(
        {
          ok: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        },
        400
      );
    }

    const kvKey = `support:ticket:${tenantId}:${ticketId}`;
    try {
      const existing = (await kv.get(kvKey, "json")) as any;
      if (!existing) {
        return c.json({ ok: false, error: "Ticket not found" }, 404);
      }

      const userId = c.req.header("x-session-user-id") ?? "unknown";
      const updated = {
        ...existing,
        status: newStatus,
        updatedAt: new Date().toISOString(),
        updatedBy: userId,
      };
      await kv.put(kvKey, JSON.stringify(updated));

      console.log(
        `[owner/tickets] status=${newStatus} by=${userId.slice(0, 20)} ticket=${tenantId}:${ticketId}`
      );
      return c.json({ ok: true, ticket: updated });
    } catch (e: any) {
      console.error("[owner/tickets PATCH]", String(e?.message ?? e));
      return c.json({ ok: false, error: "Internal error" }, 500);
    }
  });
}
