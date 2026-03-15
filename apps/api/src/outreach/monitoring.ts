// Outreach OS — Monitoring & Guard Rails (Phase 18)
// ============================================================

import type { OutreachSettings } from "./types";
import { DEFAULT_OUTREACH_SETTINGS } from "./types";

// ── Health Check ─────────────────────────────────────────────────────────

export interface HealthResult {
  status: "healthy" | "degraded" | "unhealthy";
  tenantId: string;
  timestamp: string;
  metrics: HealthMetrics;
  flags: UnhealthyFlag[];
}

export interface HealthMetrics {
  last_auto_campaign_run_at: string | null;
  last_followup_run_at: string | null;
  last_close_engine_run_at: string | null;
  sent_last_24h: number;
  failed_last_24h: number;
  bounce_like_failures_last_24h: number;
  reply_count_last_24h: number;
  unsubscribe_count_last_24h: number;
  auto_campaign_enabled: boolean;
  auto_campaign_paused: boolean;
  pending_followups: number;
  stale_followups: number;
}

export interface UnhealthyFlag {
  code: string;
  severity: "warning" | "critical";
  message: string;
}

export async function getHealth(
  db: D1Database,
  kv: KVNamespace,
  tenantId: string
): Promise<HealthResult> {
  const now = new Date();
  const h24ago = new Date(now.getTime() - 24 * 3600_000).toISOString();

  // Load settings
  const settingsRaw = await kv.get(`outreach:settings:${tenantId}`);
  const settings: OutreachSettings = settingsRaw
    ? { ...DEFAULT_OUTREACH_SETTINGS, ...JSON.parse(settingsRaw) }
    : { ...DEFAULT_OUTREACH_SETTINGS };

  // Parallel queries
  const [
    sentStats,
    replyStats,
    lastCampaignRun,
    lastFollowupRun,
    lastCloseRun,
    pendingFollowups,
    staleFollowups,
  ] = await Promise.all([
    db.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status = 'failed' AND json_extract(metadata_json, '$.error') LIKE '%bounce%' THEN 1 ELSE 0 END) as bounced
       FROM outreach_delivery_events
       WHERE tenant_id = ?1 AND created_at >= ?2`
    ).bind(tenantId, h24ago).first<{ total: number; failed: number; bounced: number }>(),
    db.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN intent = 'unsubscribe' THEN 1 ELSE 0 END) as unsubs
       FROM outreach_replies
       WHERE tenant_id = ?1 AND created_at >= ?2`
    ).bind(tenantId, h24ago).first<{ total: number; unsubs: number }>(),
    db.prepare(
      `SELECT MAX(created_at) as ts FROM outreach_health_snapshots
       WHERE tenant_id = ?1 AND cron_block = 'AUTO_CAMPAIGN'`
    ).bind(tenantId).first<{ ts: string | null }>(),
    db.prepare(
      `SELECT MAX(created_at) as ts FROM outreach_health_snapshots
       WHERE tenant_id = ?1 AND cron_block = 'FOLLOWUP'`
    ).bind(tenantId).first<{ ts: string | null }>(),
    db.prepare(
      `SELECT MAX(created_at) as ts FROM outreach_health_snapshots
       WHERE tenant_id = ?1 AND cron_block = 'CLOSE_ENGINE'`
    ).bind(tenantId).first<{ ts: string | null }>(),
    db.prepare(
      `SELECT COUNT(*) as cnt FROM outreach_followups
       WHERE tenant_id = ?1 AND status = 'scheduled' AND scheduled_at <= ?2`
    ).bind(tenantId, now.toISOString()).first<{ cnt: number }>(),
    db.prepare(
      `SELECT COUNT(*) as cnt FROM outreach_followups
       WHERE tenant_id = ?1 AND status = 'scheduled' AND processing_at IS NOT NULL
         AND processing_at < ?2`
    ).bind(tenantId, new Date(now.getTime() - 10 * 60_000).toISOString()).first<{ cnt: number }>(),
  ]);

  const metrics: HealthMetrics = {
    last_auto_campaign_run_at: lastCampaignRun?.ts || null,
    last_followup_run_at: lastFollowupRun?.ts || null,
    last_close_engine_run_at: lastCloseRun?.ts || null,
    sent_last_24h: sentStats?.total ?? 0,
    failed_last_24h: sentStats?.failed ?? 0,
    bounce_like_failures_last_24h: sentStats?.bounced ?? 0,
    reply_count_last_24h: replyStats?.total ?? 0,
    unsubscribe_count_last_24h: replyStats?.unsubs ?? 0,
    auto_campaign_enabled: settings.autoCampaignEnabled,
    auto_campaign_paused: settings.autoCampaignPaused,
    pending_followups: pendingFollowups?.cnt ?? 0,
    stale_followups: staleFollowups?.cnt ?? 0,
  };

  // Evaluate flags
  const flags = evaluateFlags(metrics, settings);
  const status = flags.some(f => f.severity === "critical")
    ? "unhealthy"
    : flags.some(f => f.severity === "warning")
      ? "degraded"
      : "healthy";

  return {
    status,
    tenantId,
    timestamp: now.toISOString(),
    metrics,
    flags,
  };
}

function evaluateFlags(m: HealthMetrics, s: OutreachSettings): UnhealthyFlag[] {
  const flags: UnhealthyFlag[] = [];

  // Critical: high failure rate
  if (m.failed_last_24h >= (s.autoPauseFailureThreshold || 10)) {
    flags.push({
      code: "HIGH_FAILURE_RATE",
      severity: "critical",
      message: `${m.failed_last_24h} failures in last 24h (threshold: ${s.autoPauseFailureThreshold || 10})`,
    });
  }

  // Critical: bounce spike
  if (m.bounce_like_failures_last_24h >= (s.autoPauseBounceThreshold || 5)) {
    flags.push({
      code: "BOUNCE_SPIKE",
      severity: "critical",
      message: `${m.bounce_like_failures_last_24h} bounce-like failures in last 24h`,
    });
  }

  // Warning: auto campaign enabled but zero sends
  if (m.auto_campaign_enabled && !m.auto_campaign_paused && m.sent_last_24h === 0) {
    flags.push({
      code: "ZERO_SENDS_WITH_CAMPAIGN_ON",
      severity: "warning",
      message: "autoCampaignEnabled=true but 0 sends in 24h",
    });
  }

  // Warning: stale followups
  if (m.stale_followups > 0) {
    flags.push({
      code: "STALE_FOLLOWUPS",
      severity: "warning",
      message: `${m.stale_followups} followups stuck in processing for >10min`,
    });
  }

  // Warning: high unsubscribe rate
  if (m.sent_last_24h >= 10) {
    const unsubRate = m.unsubscribe_count_last_24h / m.sent_last_24h;
    if (unsubRate > 0.1) {
      flags.push({
        code: "HIGH_UNSUBSCRIBE_RATE",
        severity: unsubRate > 0.2 ? "critical" : "warning",
        message: `Unsubscribe rate ${(unsubRate * 100).toFixed(1)}% (${m.unsubscribe_count_last_24h}/${m.sent_last_24h})`,
      });
    }
  }

  // Warning: pending followups piling up
  if (m.pending_followups > 50) {
    flags.push({
      code: "FOLLOWUP_BACKLOG",
      severity: "warning",
      message: `${m.pending_followups} pending followups overdue`,
    });
  }

  return flags;
}

// ── Monitoring Analytics (time series) ─────────────────────────────────

export interface MonitoringTimeSeries {
  period: string; // YYYY-MM-DD
  sent: number;
  failed: number;
  replies: number;
  unsubscribes: number;
  meetings: number;
  closes: number;
}

export async function getMonitoringTimeSeries(
  db: D1Database,
  tenantId: string,
  days: number = 14
): Promise<MonitoringTimeSeries[]> {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  const [sentData, replyData, pipelineData] = await Promise.all([
    db.prepare(
      `SELECT DATE(created_at) as d,
              COUNT(*) as total,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM outreach_delivery_events
       WHERE tenant_id = ?1 AND DATE(created_at) >= ?2
       GROUP BY DATE(created_at) ORDER BY d`
    ).bind(tenantId, cutoff).all<{ d: string; total: number; failed: number }>(),
    db.prepare(
      `SELECT DATE(created_at) as d,
              COUNT(*) as total,
              SUM(CASE WHEN intent = 'unsubscribe' THEN 1 ELSE 0 END) as unsubs
       FROM outreach_replies
       WHERE tenant_id = ?1 AND DATE(created_at) >= ?2
       GROUP BY DATE(created_at) ORDER BY d`
    ).bind(tenantId, cutoff).all<{ d: string; total: number; unsubs: number }>(),
    db.prepare(
      `SELECT DATE(updated_at) as d,
              SUM(CASE WHEN pipeline_stage = 'meeting' THEN 1 ELSE 0 END) as meetings,
              SUM(CASE WHEN pipeline_stage = 'customer' THEN 1 ELSE 0 END) as closes
       FROM sales_leads
       WHERE tenant_id = ?1 AND DATE(updated_at) >= ?2
         AND pipeline_stage IN ('meeting', 'customer')
       GROUP BY DATE(updated_at) ORDER BY d`
    ).bind(tenantId, cutoff).all<{ d: string; meetings: number; closes: number }>(),
  ]);

  // Merge into unified time series
  const byDate = new Map<string, MonitoringTimeSeries>();
  for (const row of sentData.results ?? []) {
    byDate.set(row.d, { period: row.d, sent: row.total, failed: row.failed, replies: 0, unsubscribes: 0, meetings: 0, closes: 0 });
  }
  for (const row of replyData.results ?? []) {
    const entry = byDate.get(row.d) || { period: row.d, sent: 0, failed: 0, replies: 0, unsubscribes: 0, meetings: 0, closes: 0 };
    entry.replies = row.total;
    entry.unsubscribes = row.unsubs;
    byDate.set(row.d, entry);
  }
  for (const row of pipelineData.results ?? []) {
    const entry = byDate.get(row.d) || { period: row.d, sent: 0, failed: 0, replies: 0, unsubscribes: 0, meetings: 0, closes: 0 };
    entry.meetings = row.meetings;
    entry.closes = row.closes;
    byDate.set(row.d, entry);
  }

  return Array.from(byDate.values()).sort((a, b) => a.period.localeCompare(b.period));
}

// ── Emergency Pause/Resume ───────────────────────────────────────────────

export async function emergencyPause(
  kv: KVNamespace,
  tenantId: string,
  reason: string
): Promise<void> {
  const raw = await kv.get(`outreach:settings:${tenantId}`);
  const settings = raw ? { ...DEFAULT_OUTREACH_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_OUTREACH_SETTINGS };
  settings.autoCampaignPaused = true;
  settings.pauseReason = reason || "Emergency pause";
  await kv.put(`outreach:settings:${tenantId}`, JSON.stringify(settings));
}

export async function emergencyResume(
  kv: KVNamespace,
  tenantId: string
): Promise<void> {
  const raw = await kv.get(`outreach:settings:${tenantId}`);
  const settings = raw ? { ...DEFAULT_OUTREACH_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_OUTREACH_SETTINGS };
  settings.autoCampaignPaused = false;
  settings.pauseReason = "";
  await kv.put(`outreach:settings:${tenantId}`, JSON.stringify(settings));
}

// ── Health Snapshot Writer (called from cron) ────────────────────────────

export async function writeHealthSnapshot(
  db: D1Database,
  tenantId: string,
  cronBlock: string,
  sentCount: number,
  failedCount: number,
  uid: () => string,
  now: () => string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO outreach_health_snapshots
       (id, tenant_id, snapshot_type, cron_block, sent_count, failed_count, created_at)
       VALUES (?1, ?2, 'cron_run', ?3, ?4, ?5, ?6)`
    )
    .bind(uid(), tenantId, cronBlock, sentCount, failedCount, now())
    .run();
}

// ── Auto-Pause Check (called from cron, checks flags and pauses if needed) ──

export async function checkAndAutoPause(
  db: D1Database,
  kv: KVNamespace,
  tenantId: string
): Promise<boolean> {
  const raw = await kv.get(`outreach:settings:${tenantId}`);
  const settings: OutreachSettings = raw
    ? { ...DEFAULT_OUTREACH_SETTINGS, ...JSON.parse(raw) }
    : { ...DEFAULT_OUTREACH_SETTINGS };

  if (!settings.autoPauseEnabled || settings.autoCampaignPaused) return false;

  const h24ago = new Date(Date.now() - 24 * 3600_000).toISOString();
  const stats = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status = 'failed' AND json_extract(metadata_json, '$.error') LIKE '%bounce%' THEN 1 ELSE 0 END) as bounced
       FROM outreach_delivery_events
       WHERE tenant_id = ?1 AND created_at >= ?2`
    )
    .bind(tenantId, h24ago)
    .first<{ failed: number; bounced: number }>();

  const shouldPause =
    (stats?.failed ?? 0) >= settings.autoPauseFailureThreshold ||
    (stats?.bounced ?? 0) >= settings.autoPauseBounceThreshold;

  if (shouldPause) {
    const reason = `Auto-paused: ${stats?.failed ?? 0} failures, ${stats?.bounced ?? 0} bounces in 24h`;
    await emergencyPause(kv, tenantId, reason);
    console.log(`[OUTREACH_HEALTH_V1] Auto-paused tenant=${tenantId}: ${reason}`);
    return true;
  }

  return false;
}
