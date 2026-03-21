/**
 * SaaS Factory API — Entry Point
 *
 * Hono Workers app with route modules.
 * Route handlers are split into apps/api/src/routes/*.ts.
 * Shared helpers are in apps/api/src/helpers.ts.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";

// ── Route modules ────────────────────────────────────────────────────
import { registerOwnerRoutes, getOwnerIds, bootstrapOwnerIfEmpty, isPrincipalAllowed, normalizePrincipal } from "./routes/owner";
import { registerOwnerLeadRoutes } from "./routes/ownerLeads";
import { registerAdminCoreRoutes } from "./routes/admin-core";
import { registerAdminDataRoutes } from "./routes/admin-data";
import { registerAuthRoutes } from "./routes/auth";
import { registerBillingRoutes } from "./routes/billing";
import { registerBookingRoutes } from "./routes/booking";
import { registerLineRoutes } from "./routes/line";
import { registerAiRoutes } from "./routes/ai";
import { registerPetRoutes } from "./routes/pets";
import { registerWebhookRoutes } from "./routes/webhooks";
import { registerSpecialFeatureRoutes } from "./routes/special-features";
import { registerSubscriptionRoutes } from "./routes/subscription";
import { scheduled } from "./routes/scheduled";

// ── Durable Objects ──────────────────────────────────────────────────
import { SlotLock } from "./durable/SlotLock";
export { SlotLock };

// ── App setup ────────────────────────────────────────────────────────
type Env = Record<string, unknown>;
const app = new Hono<{ Bindings: Env }>();

// ── CORS middleware ──────────────────────────────────────────────────
app.use('/*', cors({
  origin: (origin, c) => {
    if (!origin) return null;
    const env = c.env as any;
    const staticOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
    if (staticOrigins.includes(origin)) return origin;
    const webBase: string | undefined = env?.ADMIN_WEB_BASE;
    if (webBase) {
      try { if (origin === new URL(webBase).origin) return origin; } catch { /* ignore */ }
    }
    const extraOrigins: string | undefined = env?.ADMIN_ALLOWED_ORIGINS;
    if (extraOrigins) {
      const list = extraOrigins.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (list.includes(origin)) return origin;
    }
    if (!origin.startsWith('https://')) return null;
    const suffix: string | undefined = env?.PAGES_DEV_ALLOWED_SUFFIX;
    if (suffix && origin.endsWith('.pages.dev')) {
      if (origin.endsWith(suffix)) return origin;
      return null;
    }
    if (env?.ALLOW_PAGES_DEV_WILDCARD === '1' && origin.endsWith('.pages.dev')) return origin;
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
  credentials: true,
}));

// ── Admin auth middleware (/admin/*) ─────────────────────────────────
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
  if (!provided || provided !== expected) return c.json({ ok: false, error: 'Unauthorized' }, 401);
  return next();
});

// ── Health check ─────────────────────────────────────────────────────
app.get("/__build", async (c) => {
  const env = c.env as any;
  const gitSha = env?.GIT_SHA || "dev";
  let migrationOk = false;
  let migrationDetail = "";
  try {
    const db = env?.DB;
    if (db) { await db.prepare("SELECT 1 FROM sales_leads LIMIT 0").run(); migrationOk = true; migrationDetail = "sales_leads OK"; }
    else { migrationDetail = "DB binding missing"; }
  } catch (e: any) { migrationDetail = String(e?.message ?? e).slice(0, 100); }
  const aiConfigured = !!env?.OPENAI_API_KEY;
  return c.json({ ok: true, stamp: "API_BUILD_V2", gitSha, deployedAt: new Date().toISOString(), migration: { ok: migrationOk, detail: migrationDetail }, ai: { configured: aiConfigured } });
});

// ── Owner check (outside /admin/* middleware) ────────────────────────
app.get("/auth/owner-check", async (c) => {
  const env = c.env as any;
  const expected: string | undefined = env?.ADMIN_TOKEN;
  if (!expected) return c.json({ ok: false, error: "Service unavailable" }, 503);
  const provided = c.req.header("X-Admin-Token");
  if (!provided || provided !== expected) return c.json({ ok: false, error: "Unauthorized" }, 401);
  const kv = env.SAAS_FACTORY as KVNamespace | null;
  const userId = c.req.header("x-session-user-id") ?? "";
  if (!userId) return c.json({ ok: true, isOwner: false });
  let bootstrapped = false;
  if (kv) bootstrapped = await bootstrapOwnerIfEmpty(kv, userId);
  const ownerIds = await getOwnerIds(kv, env?.OWNER_USER_IDS ?? "");
  const isOwner = isPrincipalAllowed(userId, ownerIds);
  console.log(`[owner-check] uid=${normalizePrincipal(userId).slice(0, 30)} isOwner=${isOwner} ownerCount=${ownerIds.length}`);
  return c.json({ ok: true, isOwner, ...(bootstrapped ? { bootstrapped: true } : {}) });
});

// ── Register all route modules ───────────────────────────────────────
registerOwnerRoutes(app);
registerOwnerLeadRoutes(app);
registerAdminCoreRoutes(app);
registerAdminDataRoutes(app);
registerBookingRoutes(app);
registerAuthRoutes(app);
registerBillingRoutes(app);
registerPetRoutes(app);
registerWebhookRoutes(app);
registerLineRoutes(app);
registerAiRoutes(app);
registerSpecialFeatureRoutes(app);
registerSubscriptionRoutes(app);

// ── Queue consumer (no-op) ───────────────────────────────────────────
async function queue(batch: MessageBatch<unknown>): Promise<void> {
  for (const msg of batch.messages) { msg.ack(); }
}

// ── Export ────────────────────────────────────────────────────────────
export default { fetch: app.fetch, queue, scheduled };
