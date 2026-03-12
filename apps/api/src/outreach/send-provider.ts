// Outreach OS — Send Provider Abstraction
// ============================================================
// Provider interface for sending outreach messages.
// Phase 1: SafeModeSender (logs only, no real send).
// Future: EmailSender, LineSender, InstagramDmSender.

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

// ── Provider factory ──────────────────────────────────────────────────────

/**
 * Resolve send provider based on mode.
 * 'real' still returns SafeModeSender (placeholder until real providers).
 */
export function resolveProvider(sendMode: "safe" | "real"): SendProvider {
  if (sendMode === "real") {
    console.warn("[resolveProvider] Real mode requested — still using SafeModeSender (no real provider configured)");
    return new SafeModeSender();
  }
  return new SafeModeSender();
}

// ── Rate limiter ───────────────────────────────────────────────────────────

export interface RateLimitConfig {
  dailyCap: number;
  perTenantPerHour: number;
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  dailyCap: 50,
  perTenantPerHour: 10,
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
