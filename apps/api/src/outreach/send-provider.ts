// Outreach OS — Send Provider Abstraction
// ============================================================
// Provider interface for sending outreach messages.
// - SafeModeSender: logs only, no real send (safe mode).
// - RealModeSender: email via Resend API; other channels return explicit failure.

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: string;
}

export interface SendRequest {
  leadId: string;
  tenantId: string;
  channel: "email" | "line" | "instagram_dm";
  to: string;
  subject?: string;
  body: string;
}

/**
 * Abstract send provider interface.
 * Implementations must be stateless and tenant-isolated.
 */
export interface SendProvider {
  readonly name: string;
  send(req: SendRequest): Promise<SendResult>;
}

// ── Safe Mode Provider (Phase 1) ───────────────────────────────────────────

export class SafeModeSender implements SendProvider {
  readonly name = "safe_mode";

  async send(req: SendRequest): Promise<SendResult> {
    // Log the send attempt but don't actually send
    console.log("[SafeModeSender] Would send:", {
      to: req.to,
      channel: req.channel,
      subject: req.subject,
      bodyLength: req.body.length,
      leadId: req.leadId,
      tenantId: req.tenantId,
    });

    return {
      success: true,
      messageId: `safe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      provider: this.name,
    };
  }
}

// ── Real Mode Provider (email via Resend) ─────────────────────────────────

export interface RealModeEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

/**
 * Real mode sender.
 * - email: sends via Resend API (requires RESEND_API_KEY).
 * - line / instagram_dm: returns explicit failure (not yet implemented).
 */
export class RealModeSender implements SendProvider {
  readonly name = "real_mode";
  private resendApiKey: string;
  private emailFrom: string;

  constructor(env: RealModeEnv) {
    this.resendApiKey = env.RESEND_API_KEY ?? "";
    this.emailFrom = env.EMAIL_FROM ?? "Outreach <no-reply@saas-factory.app>";
  }

  async send(req: SendRequest): Promise<SendResult> {
    // Only email is supported in real mode for now
    if (req.channel !== "email") {
      console.warn(`[RealModeSender] Channel "${req.channel}" is not yet supported for real sending`);
      return {
        success: false,
        error: `real_send_not_supported: channel "${req.channel}" は未対応です。Safeモードにするか、emailチャネルを使用してください。`,
        provider: this.name,
      };
    }

    if (!this.resendApiKey) {
      console.error("[RealModeSender] RESEND_API_KEY is not configured");
      return {
        success: false,
        error: "RESEND_API_KEY が設定されていません。Workers の環境変数を確認してください。",
        provider: this.name,
      };
    }

    if (!req.to) {
      return {
        success: false,
        error: "送信先メールアドレスが指定されていません",
        provider: this.name,
      };
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.emailFrom,
          to: [req.to],
          subject: req.subject || "(件名なし)",
          html: req.body,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "(unreadable)");
        console.error(`[RealModeSender] Resend API error ${res.status}:`, errText);
        return {
          success: false,
          error: `Resend送信失敗 (HTTP ${res.status}): ${errText.slice(0, 200)}`,
          provider: this.name,
        };
      }

      const data = await res.json<{ id?: string }>();
      return {
        success: true,
        messageId: data.id || `resend_${Date.now()}`,
        provider: this.name,
      };
    } catch (err: any) {
      console.error("[RealModeSender] Unexpected error:", err);
      return {
        success: false,
        error: `送信中にエラーが発生しました: ${err.message || "unknown"}`,
        provider: this.name,
      };
    }
  }
}

// ── Provider factory ──────────────────────────────────────────────────────

/**
 * Resolve send provider based on mode.
 * - 'safe': always returns SafeModeSender (logs only).
 * - 'real': returns RealModeSender (email via Resend). Requires env with RESEND_API_KEY.
 *           Returns a FailingModeSender if RESEND_API_KEY is not set (explicit failure, not silent fallback).
 */
export function resolveProvider(sendMode: "safe" | "real", env?: RealModeEnv): SendProvider {
  if (sendMode === "real") {
    if (env?.RESEND_API_KEY) {
      return new RealModeSender(env);
    }
    console.error("[resolveProvider] Real mode requested but RESEND_API_KEY not available — returning explicit failure provider");
    return {
      name: "real_mode_unconfigured",
      async send(): Promise<SendResult> {
        return {
          success: false,
          error: "RESEND_API_KEY が未設定のため Real mode で送信できません。Workers の環境変数を確認してください。",
          provider: "real_mode_unconfigured",
        };
      },
    };
  }
  return new SafeModeSender();
}

// ── Rate limiter ───────────────────────────────────────────────────────────

export interface RateLimitConfig {
  dailyCap: number;
  perTenantPerHour: number;
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  dailyCap: 200,
  perTenantPerHour: 20,
};

/**
 * Check rate limits before sending.
 * Uses KV for tracking. Returns { allowed, reason? }.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  tenantId: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): Promise<{ allowed: boolean; reason?: string }> {
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const hourKey = now.toISOString().slice(0, 13);

  // Daily cap
  const dailyKey = `outreach:rl:daily:${tenantId}:${dateKey}`;
  const dailyCount = parseInt(await kv.get(dailyKey) || "0", 10);
  if (dailyCount >= config.dailyCap) {
    return { allowed: false, reason: `日次上限(${config.dailyCap}件)に達しています` };
  }

  // Per-tenant per-hour
  const hourlyKey = `outreach:rl:hourly:${tenantId}:${hourKey}`;
  const hourlyCount = parseInt(await kv.get(hourlyKey) || "0", 10);
  if (hourlyCount >= config.perTenantPerHour) {
    return { allowed: false, reason: `時間あたり上限(${config.perTenantPerHour}件)に達しています` };
  }

  return { allowed: true };
}

/**
 * Increment rate limit counters after successful send.
 */
export async function incrementRateLimit(
  kv: KVNamespace,
  tenantId: string
): Promise<void> {
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const hourKey = now.toISOString().slice(0, 13);

  const dailyKey = `outreach:rl:daily:${tenantId}:${dateKey}`;
  const hourlyKey = `outreach:rl:hourly:${tenantId}:${hourKey}`;

  const [dailyCount, hourlyCount] = await Promise.all([
    kv.get(dailyKey).then((v) => parseInt(v || "0", 10)),
    kv.get(hourlyKey).then((v) => parseInt(v || "0", 10)),
  ]);

  await Promise.all([
    kv.put(dailyKey, String(dailyCount + 1), { expirationTtl: 86400 * 2 }),
    kv.put(hourlyKey, String(hourlyCount + 1), { expirationTtl: 7200 }),
  ]);
}

/**
 * Check if a lead has unsubscribed.
 */
export async function isUnsubscribed(
  kv: KVNamespace,
  tenantId: string,
  leadId: string
): Promise<boolean> {
  const key = `outreach:unsub:${tenantId}:${leadId}`;
  return (await kv.get(key)) === "1";
}

/**
 * Check for duplicate send within a time window.
 */
export async function isDuplicateSend(
  kv: KVNamespace,
  tenantId: string,
  leadId: string,
  messageId: string
): Promise<boolean> {
  const key = `outreach:dedup:${tenantId}:${leadId}:${messageId}`;
  return (await kv.get(key)) != null;
}

/**
 * Mark a send as completed (for dedup).
 */
export async function markSent(
  kv: KVNamespace,
  tenantId: string,
  leadId: string,
  messageId: string
): Promise<void> {
  const key = `outreach:dedup:${tenantId}:${leadId}:${messageId}`;
  await kv.put(key, "1", { expirationTtl: 86400 * 30 }); // 30 day dedup window
}

/**
 * Phase 4.5: Track send attempts on a lead.
 * Increments send_attempt_count and stores last error (if any).
 */
export async function trackSendAttempt(
  db: D1Database,
  tenantId: string,
  leadId: string,
  error?: string
): Promise<void> {
  if (error) {
    await db
      .prepare(
        "UPDATE sales_leads SET send_attempt_count = send_attempt_count + 1, last_send_error = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4"
      )
      .bind(error, new Date().toISOString(), leadId, tenantId)
      .run();
  } else {
    await db
      .prepare(
        "UPDATE sales_leads SET send_attempt_count = send_attempt_count + 1, last_send_error = NULL, updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
      )
      .bind(new Date().toISOString(), leadId, tenantId)
      .run();
  }
}

/** Max send retries before giving up */
export const MAX_SEND_RETRIES = 3;
