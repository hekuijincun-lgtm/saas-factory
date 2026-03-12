/**
 * Owner routes — cross-tenant management dashboard
 *
 * Auth: ADMIN_TOKEN (X-Admin-Token header) + owner membership (KV owner:members).
 * Both conditions must pass; fail-closed on misconfiguration.
 *
 * Owner list storage: KV key "owner:members" → { version: 1, owners: string[] }
 * Deprecated fallback: OWNER_USER_IDS env var (comma-separated).
 *
 * Bootstrap: when owner:members is empty AND the requesting userId matches
 * the hardcoded BOOTSTRAP_OWNER_ID, auto-seed the KV with that identity.
 *
 * Future: rate limiting (KV-based, per-userId), audit log to D1
 */
import type { Hono } from "hono";
import { mergeSettings, DEFAULT_ADMIN_SETTINGS } from "../settings";

// ── Bootstrap identity (only used when owner:members KV is empty) ──────────
const BOOTSTRAP_OWNER_ID = "email:mesomesobanana@outlook.jp";

// ── Owner members KV store ─────────────────────────────────────────────────
export interface OwnerMembersStore {
  version: 1;
  owners: string[];
}

// ── Principal helpers ───────────────────────────────────────────────────────
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

/**
 * Get owner list from KV (primary) with env fallback (deprecated).
 * Returns deduplicated owner identity list.
 */
export async function getOwnerIds(kv: KVNamespace | null, envFallback: string): Promise<string[]> {
  // Primary: KV owner:members
  if (kv) {
    try {
      const raw = await kv.get("owner:members", "json") as OwnerMembersStore | null;
      if (raw?.owners?.length) return raw.owners;
    } catch {}
  }
  // Deprecated fallback: OWNER_USER_IDS env var
  return parsePrincipalList(envFallback);
}

/**
 * Bootstrap: if owner:members KV is empty AND userId matches BOOTSTRAP_OWNER_ID,
 * seed the KV with that single owner. Returns true if bootstrap occurred.
 */
export async function bootstrapOwnerIfEmpty(kv: KVNamespace, userId: string): Promise<boolean> {
  if (userId !== BOOTSTRAP_OWNER_ID) return false;
  try {
    const raw = await kv.get("owner:members", "json") as OwnerMembersStore | null;
    if (raw?.owners?.length) return false; // already has owners — no bootstrap
    const store: OwnerMembersStore = { version: 1, owners: [userId] };
    await kv.put("owner:members", JSON.stringify(store));
    console.log(`[owner-bootstrap] seeded owner:members with ${userId}`);
    return true;
  } catch (e) {
    console.error("[owner-bootstrap] failed:", String(e));
    return false;
  }
}

// ── Active reservation filter (duplicated from index.ts to avoid circular dep) ──
const SQL_ACTIVE_FILTER = "status != 'cancelled'" as const;

// ── Register routes ─────────────────────────────────────────────────────────

export function registerOwnerRoutes(app: Hono<{ Bindings: Record<string, unknown> }>) {
  // ── Owner auth middleware ──────────────────────────────────────────────
  // Two-layer check: ADMIN_TOKEN + owner membership (KV owner:members).
  // Pages middleware already verified session; Workers re-verifies to prevent
  // direct API access bypass.
  // Deprecated fallback: OWNER_USER_IDS env var.
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

    const kv = env.SAAS_FACTORY as KVNamespace | null;
    const userId = c.req.header("x-session-user-id") ?? "";

    // Try bootstrap (only if KV empty + bootstrap identity)
    if (kv && userId) await bootstrapOwnerIfEmpty(kv, userId);

    // Check owner list (KV primary, env fallback deprecated)
    const ownerIds = await getOwnerIds(kv, env?.OWNER_USER_IDS ?? "");
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

  // ══════════════════════════════════════════════════════════════════════════
  // ─── Sales AI Config (per LINE account) ─────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  //
  // KV key: owner:sales-ai:{accountId}
  // Completely separated from tenant AI接客 (ai:settings:{tenantId}).
  //

  /** Default sales AI config — used when no config exists yet */
  const DEFAULT_SALES_AI_CONFIG = {
    enabled: false,
    welcomeMessage: "ご連絡ありがとうございます！\n気になる内容をそのまま送ってください。\n『料金』『機能』『デモ』『導入相談』\nと送っていただければ、すぐにご案内します😊",
    fallbackMessage: "ありがとうございます。\n担当者より改めてご連絡いたします。\n\nお急ぎの場合は「導入相談」とお送りください。",
    tone: "friendly" as string,
    goal: "demo" as string,
    cta: { label: "", url: "" },
    qualificationQuestions: [] as string[],
    handoffMessage: "担当者よりご連絡します。少々お待ちください。",
    intents: [
      {
        key: "pricing",
        label: "料金",
        keywords: ["料金", "価格", "値段", "プラン", "月額", "いくら", "費用", "コスト", "料金体系", "費用感", "お値段", "pricing", "price", "cost"],
        reply: "料金についてのご質問ありがとうございます！\n\nLumiBookの料金プランは以下の通りです：\n\n🔹 Starter — ¥3,980/月\n　個人サロン向け（スタッフ2名、メニュー10件）\n\n🔹 Pro — ¥9,800/月\n　成長中サロン向け（無制限、AI接客、リピート促進）\n\n🔹 Enterprise — 要相談\n　複数店舗・法人向け（専任サポート、カスタム機能）\n\n※ 初期費用0円、最低契約期間なし、いつでも解約OK\n\n詳しいご案内やお見積もりをご希望でしたら「相談」とお送りください😊",
        ctaLabel: "",
        ctaUrl: "",
      },
      {
        key: "features",
        label: "機能",
        keywords: ["機能", "できること", "特徴", "何ができる", "使い方", "feature", "features"],
        reply: "LumiBookの主な機能をご紹介します！\n\n📅 予約受付・管理\n　LINE経由の自動予約、空き枠リアルタイム表示\n\n💬 LINE自動応答\n　AI接客で24時間お客様対応\n\n📊 顧客管理・KPI\n　リピート率・来店間隔を自動計算\n\n🔔 リマインド通知\n　予約前日にLINE自動通知\n\n🎨 メニュー・スタッフ管理\n　画像付きメニュー、スタッフ別スケジュール\n\nデモをご覧になりたい場合は「デモ」とお送りください😊",
        ctaLabel: "",
        ctaUrl: "",
      },
      {
        key: "demo",
        label: "デモ",
        keywords: ["デモ", "demo", "お試し", "試し", "トライアル", "trial", "体験", "見てみたい"],
        reply: "デモのご希望ありがとうございます！\n\nLumiBookの操作感を実際にお試しいただけます。\n以下の方法でご案内可能です：\n\n1️⃣ オンラインデモ（画面共有、約15分）\n2️⃣ テスト環境のご案内（ご自身で操作可能）\n\nご都合の良い日時や、ご希望の方法があればこちらにお送りください。\n担当から折り返しご連絡いたします😊",
        ctaLabel: "",
        ctaUrl: "",
      },
      {
        key: "consultation",
        label: "導入相談",
        keywords: ["導入", "相談", "問い合わせ", "問合せ", "導入相談", "詳しく", "話したい", "聞きたい", "consultation", "inquiry"],
        reply: "導入相談のご連絡ありがとうございます！\n\n現在の課題やご状況をお聞かせいただければ、\n最適なプランや活用方法をご提案いたします。\n\n例えば：\n・現在の予約管理方法（電話？紙？他ツール？）\n・スタッフ人数、メニュー数\n・LINEの活用状況\n\n何でもお気軽にどうぞ！担当から詳しくご案内いたします😊",
        ctaLabel: "",
        ctaUrl: "",
      },
    ],
    version: 1,
    updatedAt: "",
  };

  // ── GET /owner/sales-ai/:accountId ────────────────────────────────────
  app.get("/owner/sales-ai/:accountId", async (c) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "Internal error" }, 500);

    const accountId = c.req.param("accountId");
    if (!accountId) return c.json({ ok: false, error: "missing accountId" }, 400);

    try {
      const raw = await kv.get(`owner:sales-ai:${accountId}`, "json");
      const config = raw
        ? { ...DEFAULT_SALES_AI_CONFIG, ...(raw as any) }
        : { ...DEFAULT_SALES_AI_CONFIG };
      return c.json({ ok: true, accountId, config });
    } catch (e: any) {
      console.error(`[owner/sales-ai GET] ${e?.message}`);
      return c.json({ ok: false, error: "Internal error" }, 500);
    }
  });

  // ── PUT /owner/sales-ai/:accountId ────────────────────────────────────
  app.put("/owner/sales-ai/:accountId", async (c) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "Internal error" }, 500);

    const accountId = c.req.param("accountId");
    if (!accountId) return c.json({ ok: false, error: "missing accountId" }, 400);

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return c.json({ ok: false, error: "invalid body" }, 400);
    }

    try {
      // Merge with existing config (don't clobber unset fields)
      const existing = (await kv.get(`owner:sales-ai:${accountId}`, "json")) as any;
      const merged = {
        ...DEFAULT_SALES_AI_CONFIG,
        ...(existing ?? {}),
        ...(body as any),
        updatedAt: new Date().toISOString(),
      };

      // Validate intents array
      if (merged.intents && Array.isArray(merged.intents)) {
        for (const intent of merged.intents) {
          if (!intent.key || !intent.label) {
            return c.json({ ok: false, error: "Each intent must have key and label" }, 400);
          }
          if (!Array.isArray(intent.keywords)) {
            return c.json({ ok: false, error: `Intent "${intent.key}" must have keywords array` }, 400);
          }
        }
      }

      await kv.put(`owner:sales-ai:${accountId}`, JSON.stringify(merged));
      console.log(`[owner/sales-ai PUT] saved accountId=${accountId}`);
      return c.json({ ok: true, accountId, config: merged });
    } catch (e: any) {
      console.error(`[owner/sales-ai PUT] ${e?.message}`);
      return c.json({ ok: false, error: "Internal error" }, 500);
    }
  });

  // ── POST /owner/sales-ai/:accountId/test ──────────────────────────────
  // Dry-run: resolves intent + returns what would be replied. No LINE API calls.
  app.post("/owner/sales-ai/:accountId/test", async (c) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "Internal error" }, 500);

    const accountId = c.req.param("accountId");
    if (!accountId) return c.json({ ok: false, error: "missing accountId" }, 400);

    const body = await c.req.json<{ message?: string }>().catch(() => ({}));
    const message = String(body?.message ?? "").trim();
    if (!message) return c.json({ ok: false, error: "message is required" }, 400);

    try {
      const raw = await kv.get(`owner:sales-ai:${accountId}`, "json");
      const config = raw
        ? { ...DEFAULT_SALES_AI_CONFIG, ...(raw as any) }
        : { ...DEFAULT_SALES_AI_CONFIG };

      if (!config.enabled) {
        return c.json({
          ok: true, accountId, message, enabled: false,
          matchedIntent: null,
          reply: "(AI営業が無効のため返信されません)",
          branch: "disabled",
        });
      }

      // Normalize input
      const normalized = message
        .normalize("NFKC")
        .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
        .toLowerCase();

      // Intent matching
      let matchedIntent: any = null;
      for (const intent of config.intents ?? []) {
        if (Array.isArray(intent.keywords) && intent.keywords.some((k: string) =>
          normalized.includes(k.toLowerCase())
        )) {
          matchedIntent = intent;
          break;
        }
      }

      let reply: string;
      let branch: string;
      if (matchedIntent) {
        reply = matchedIntent.reply || config.fallbackMessage;
        branch = `sales_${matchedIntent.key}`;
      } else {
        // First message or unrecognized → welcomeMessage
        reply = config.welcomeMessage || config.fallbackMessage;
        branch = "sales_welcome";
      }

      // Append CTA if configured (only when URL is non-empty)
      let ctaInfo: any = null;
      const intentCtaUrl = (matchedIntent?.ctaUrl ?? "").trim();
      const globalCtaUrl = (config.cta?.url ?? "").trim();
      if (intentCtaUrl) {
        ctaInfo = { label: matchedIntent.ctaLabel || matchedIntent.label || "詳しくはこちら", url: intentCtaUrl };
      } else if (globalCtaUrl) {
        ctaInfo = { label: (config.cta?.label ?? "").trim() || "詳しくはこちら", url: globalCtaUrl };
      }

      return c.json({
        ok: true, accountId, message, enabled: true,
        matchedIntent: matchedIntent ? { key: matchedIntent.key, label: matchedIntent.label } : null,
        reply,
        branch,
        cta: ctaInfo,
        tone: config.tone,
        goal: config.goal,
      });
    } catch (e: any) {
      console.error(`[owner/sales-ai test] ${e?.message}`);
      return c.json({ ok: false, error: "Internal error" }, 500);
    }
  });
}
