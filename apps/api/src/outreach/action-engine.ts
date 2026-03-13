// Outreach OS — Auto Action Engine (Phase 13)
// ============================================================
// Executes copilot recommendations safely.
// Default: manual execution only. Auto-safe with tenant opt-in.
// NEVER auto-sends new drafts. Only approved items with all guards.

import type { D1Database } from "@cloudflare/workers-types";
import type { CopilotRecommendation } from "./copilot";
import { computeReviewPriorities } from "./copilot";
import { updateSchedule, runScheduleNow } from "./automation";
import {
  checkRateLimit,
  incrementRateLimit,
  isUnsubscribed,
  isDuplicateSend,
  markSent,
  trackSendAttempt,
  SafeModeSender,
  resolveProvider,
  MAX_SEND_RETRIES,
} from "./send-provider";

type UidFn = () => string;
type NowFn = () => string;

// ── Types ────────────────────────────────────────────────────────────────

export type ActionType =
  | "run_schedule_now"
  | "pause_schedule"
  | "enable_schedule"
  | "raise_quality_threshold"
  | "lower_quality_threshold"
  | "increase_max_per_area"
  | "decrease_max_per_area"
  | "stop_area"
  | "prioritize_review_queue"
  | "send_existing_approved_only";

export type ExecutionStatus = "pending" | "eligible" | "executed" | "failed" | "skipped" | "blocked";
export type ExecutionMode = "manual_only" | "auto_safe" | "auto_if_enabled";
export type ExecutedBy = "user" | "auto_engine" | "cron";

export interface ActionLog {
  id: string;
  tenant_id: string;
  recommendation_id: string | null;
  action_type: string;
  action_payload_json: string | null;
  execution_mode: string;
  execution_status: string;
  executed_by: string;
  result_json: string | null;
  error_message: string | null;
  created_at: string;
}

export interface AutoActionSettings {
  auto_action_enabled: boolean;
  auto_execute_safe_recommendations: boolean;
  auto_execute_schedule_runs: boolean;
  auto_execute_threshold_adjustments: boolean;
  auto_execute_send_existing_approved_only: boolean;
  auto_action_max_executions_per_day: number;
}

export const DEFAULT_AUTO_ACTION_SETTINGS: AutoActionSettings = {
  auto_action_enabled: false,
  auto_execute_safe_recommendations: false,
  auto_execute_schedule_runs: false,
  auto_execute_threshold_adjustments: false,
  auto_execute_send_existing_approved_only: false,
  auto_action_max_executions_per_day: 10,
};

// ── Safe Action Policy ───────────────────────────────────────────────────

const SAFE_AUTO_ACTIONS: Set<string> = new Set([
  "run_schedule_now",
  "pause_schedule",
  "enable_schedule",
  "raise_quality_threshold",
  "lower_quality_threshold",
  "increase_max_per_area",
  "decrease_max_per_area",
  "stop_area",
  "prioritize_review_queue",
]);

/** Threshold adjustment limits (per execution) */
const THRESHOLD_STEP = 0.05; // max 5% change per action
const MAX_PER_AREA_STEP = 2; // max ±2 per action

function isAutoSafe(actionType: string): boolean {
  return SAFE_AUTO_ACTIONS.has(actionType);
}

// ── Execution ────────────────────────────────────────────────────────────

export async function executeRecommendationAction(
  db: D1Database,
  kv: KVNamespace,
  tenantId: string,
  recommendationId: string,
  executedBy: ExecutedBy,
  uid: UidFn,
  now: NowFn,
  env: { GOOGLE_MAPS_API_KEY?: string; OPENAI_API_KEY?: string }
): Promise<{ ok: boolean; result?: any; error?: string }> {
  const rec = await db
    .prepare("SELECT * FROM outreach_copilot_recommendations WHERE id = ?1 AND tenant_id = ?2")
    .bind(recommendationId, tenantId)
    .first<CopilotRecommendation & {
      action_type: string | null;
      action_payload_json: string | null;
      auto_executable: number;
      execution_status: string;
      execution_mode: string;
    }>();

  if (!rec) return { ok: false, error: "Recommendation not found" };
  if (rec.execution_status === "executed") return { ok: false, error: "Already executed" };
  if (rec.status === "dismissed") return { ok: false, error: "Recommendation dismissed" };

  const actionType = rec.action_type || rec.recommendation_type;
  const payload = rec.action_payload_json
    ? JSON.parse(rec.action_payload_json)
    : rec.payload_json
    ? JSON.parse(rec.payload_json)
    : {};

  // Validate safety
  const validation = validateActionSafety(actionType, payload, executedBy);
  if (!validation.safe) {
    await logAction(db, tenantId, recommendationId, actionType, payload, executedBy === "user" ? "manual_only" : "auto_safe", "blocked", executedBy, null, validation.reason || "Safety check failed", uid, now);
    await db.prepare("UPDATE outreach_copilot_recommendations SET execution_status = 'blocked', execution_error = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4")
      .bind(validation.reason, now(), rec.id, tenantId).run();
    return { ok: false, error: validation.reason };
  }

  try {
    const result = await dispatchAction(db, kv, tenantId, actionType, payload, uid, now, env);

    // Update recommendation
    await db.prepare(
      `UPDATE outreach_copilot_recommendations SET
        execution_status = 'executed', executed_at = ?1, execution_result_json = ?2,
        status = 'completed', updated_at = ?3
       WHERE id = ?4 AND tenant_id = ?5`
    ).bind(now(), JSON.stringify(result), now(), rec.id, tenantId).run();

    await logAction(db, tenantId, recommendationId, actionType, payload, executedBy === "user" ? "manual_only" : "auto_safe", "executed", executedBy, result, null, uid, now);

    return { ok: true, result };
  } catch (err: any) {
    const errorMsg = err.message || "Execution failed";
    await db.prepare(
      "UPDATE outreach_copilot_recommendations SET execution_status = 'failed', execution_error = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4"
    ).bind(errorMsg, now(), rec.id, tenantId).run();

    await logAction(db, tenantId, recommendationId, actionType, payload, executedBy === "user" ? "manual_only" : "auto_safe", "failed", executedBy, null, errorMsg, uid, now);

    return { ok: false, error: errorMsg };
  }
}

// ── Action Dispatch ──────────────────────────────────────────────────────

async function dispatchAction(
  db: D1Database,
  kv: KVNamespace,
  tenantId: string,
  actionType: string,
  payload: any,
  uid: UidFn,
  now: NowFn,
  env: { GOOGLE_MAPS_API_KEY?: string; OPENAI_API_KEY?: string }
): Promise<any> {
  switch (actionType) {
    case "run_schedule_now": {
      const scheduleId = payload.schedule_id;
      if (!scheduleId) throw new Error("Missing schedule_id");
      const run = await runScheduleNow(db, kv, tenantId, scheduleId, uid, now, env);
      return { action: "run_schedule_now", schedule_id: scheduleId, run_id: run.id, status: run.status };
    }

    case "pause_schedule": {
      const scheduleId = payload.schedule_id;
      if (!scheduleId) throw new Error("Missing schedule_id");
      await updateSchedule(db, tenantId, scheduleId, { enabled: false }, now);
      return { action: "pause_schedule", schedule_id: scheduleId, enabled: false };
    }

    case "enable_schedule": {
      const scheduleId = payload.schedule_id;
      if (!scheduleId) throw new Error("Missing schedule_id");
      await updateSchedule(db, tenantId, scheduleId, { enabled: true }, now);
      return { action: "enable_schedule", schedule_id: scheduleId, enabled: true };
    }

    case "raise_quality_threshold": {
      const scheduleId = payload.schedule_id;
      if (!scheduleId) throw new Error("Missing schedule_id");
      const schedule = await db.prepare("SELECT quality_threshold FROM outreach_schedules WHERE id = ?1 AND tenant_id = ?2")
        .bind(scheduleId, tenantId).first<{ quality_threshold: number }>();
      if (!schedule) throw new Error("Schedule not found");
      const newThreshold = Math.min(1.0, schedule.quality_threshold + THRESHOLD_STEP);
      await updateSchedule(db, tenantId, scheduleId, { quality_threshold: newThreshold }, now);
      return { action: "raise_quality_threshold", schedule_id: scheduleId, old: schedule.quality_threshold, new: newThreshold };
    }

    case "lower_quality_threshold": {
      const scheduleId = payload.schedule_id;
      if (!scheduleId) throw new Error("Missing schedule_id");
      const schedule = await db.prepare("SELECT quality_threshold FROM outreach_schedules WHERE id = ?1 AND tenant_id = ?2")
        .bind(scheduleId, tenantId).first<{ quality_threshold: number }>();
      if (!schedule) throw new Error("Schedule not found");
      const newThreshold = Math.max(0.0, schedule.quality_threshold - THRESHOLD_STEP);
      await updateSchedule(db, tenantId, scheduleId, { quality_threshold: newThreshold }, now);
      return { action: "lower_quality_threshold", schedule_id: scheduleId, old: schedule.quality_threshold, new: newThreshold };
    }

    case "increase_max_per_area": {
      const scheduleId = payload.schedule_id;
      if (!scheduleId) throw new Error("Missing schedule_id");
      const schedule = await db.prepare("SELECT max_per_area FROM outreach_schedules WHERE id = ?1 AND tenant_id = ?2")
        .bind(scheduleId, tenantId).first<{ max_per_area: number }>();
      if (!schedule) throw new Error("Schedule not found");
      const newMax = Math.min(30, schedule.max_per_area + MAX_PER_AREA_STEP);
      await updateSchedule(db, tenantId, scheduleId, { max_per_area: newMax }, now);
      return { action: "increase_max_per_area", schedule_id: scheduleId, old: schedule.max_per_area, new: newMax };
    }

    case "decrease_max_per_area": {
      const scheduleId = payload.schedule_id;
      if (!scheduleId) throw new Error("Missing schedule_id");
      const schedule = await db.prepare("SELECT max_per_area FROM outreach_schedules WHERE id = ?1 AND tenant_id = ?2")
        .bind(scheduleId, tenantId).first<{ max_per_area: number }>();
      if (!schedule) throw new Error("Schedule not found");
      const newMax = Math.max(1, schedule.max_per_area - MAX_PER_AREA_STEP);
      await updateSchedule(db, tenantId, scheduleId, { max_per_area: newMax }, now);
      return { action: "decrease_max_per_area", schedule_id: scheduleId, old: schedule.max_per_area, new: newMax };
    }

    case "stop_area": {
      // Remove specific area from schedule's areas_json
      const scheduleId = payload.schedule_id;
      const stopArea = payload.area;
      if (!scheduleId) throw new Error("Missing schedule_id");
      const schedule = await db.prepare("SELECT areas_json FROM outreach_schedules WHERE id = ?1 AND tenant_id = ?2")
        .bind(scheduleId, tenantId).first<{ areas_json: string }>();
      if (!schedule) throw new Error("Schedule not found");
      const areas: string[] = JSON.parse(schedule.areas_json || "[]");
      const filtered = stopArea ? areas.filter(a => a !== stopArea) : areas;
      if (filtered.length === 0) throw new Error("Cannot remove all areas");
      await updateSchedule(db, tenantId, scheduleId, { areas: filtered }, now);
      return { action: "stop_area", schedule_id: scheduleId, removed_area: stopArea, remaining_areas: filtered };
    }

    case "prioritize_review_queue": {
      const highCount = await computeReviewPriorities(db, tenantId);
      return { action: "prioritize_review_queue", high_priority_count: highCount };
    }

    case "send_existing_approved_only": {
      return await executeSendExistingApproved(db, kv, tenantId, uid, now);
    }

    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}

// ── Send Existing Approved Only ──────────────────────────────────────────

const SEND_BATCH_LIMIT = 10;

async function executeSendExistingApproved(
  db: D1Database,
  kv: KVNamespace,
  tenantId: string,
  uid: UidFn,
  now: NowFn
): Promise<any> {
  // Get outreach settings
  const settingsJson = await kv.get(`outreach:settings:${tenantId}`);
  const settings = settingsJson ? JSON.parse(settingsJson) : { sendMode: "safe", dailyCap: 50, hourlyCap: 10 };

  // Get approved messages that haven't been sent
  const approved = await db.prepare(
    `SELECT m.id as msg_id, m.lead_id, m.subject, m.body, m.kind,
            l.contact_email, l.store_name, l.send_attempt_count
     FROM lead_message_drafts m
     JOIN sales_leads l ON m.lead_id = l.id AND l.tenant_id = ?1
     WHERE m.tenant_id = ?1 AND m.status = 'approved'
     ORDER BY m.created_at ASC
     LIMIT ?2`
  ).bind(tenantId, SEND_BATCH_LIMIT).all<{
    msg_id: string; lead_id: string; subject: string | null; body: string;
    kind: string; contact_email: string | null; store_name: string; send_attempt_count: number;
  }>();

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const results: Array<{ lead_id: string; status: string; reason?: string }> = [];

  for (const msg of approved.results ?? []) {
    // Guard 1: Rate limit
    const rateCheck = await checkRateLimit(kv, tenantId, { dailyCap: settings.dailyCap, perTenantPerHour: settings.hourlyCap });
    if (!rateCheck.allowed) {
      results.push({ lead_id: msg.lead_id, status: "skipped", reason: `Rate limit: ${rateCheck.reason}` });
      skipped++;
      continue;
    }

    // Guard 2: Unsubscribe
    const unsub = await isUnsubscribed(kv, tenantId, msg.lead_id);
    if (unsub) {
      results.push({ lead_id: msg.lead_id, status: "skipped", reason: "Unsubscribed" });
      skipped++;
      continue;
    }

    // Guard 3: Duplicate send
    const dup = await isDuplicateSend(kv, tenantId, msg.lead_id, msg.msg_id);
    if (dup) {
      results.push({ lead_id: msg.lead_id, status: "skipped", reason: "Duplicate send" });
      skipped++;
      continue;
    }

    // Guard 4: Retry guard
    if (msg.send_attempt_count >= MAX_SEND_RETRIES) {
      results.push({ lead_id: msg.lead_id, status: "skipped", reason: "Max retries exceeded" });
      skipped++;
      continue;
    }

    // Guard 5: Cooldown (check last_contacted_at)
    const lead = await db.prepare(
      "SELECT last_contacted_at FROM sales_leads WHERE id = ?1 AND tenant_id = ?2"
    ).bind(msg.lead_id, tenantId).first<{ last_contacted_at: string | null }>();
    if (lead?.last_contacted_at) {
      const cooldownDays = 7;
      const cooldownMs = cooldownDays * 86400000;
      if (Date.now() - new Date(lead.last_contacted_at).getTime() < cooldownMs) {
        results.push({ lead_id: msg.lead_id, status: "skipped", reason: "Cooldown period" });
        skipped++;
        continue;
      }
    }

    // All guards passed — send
    try {
      const provider = new SafeModeSender();
      const sendResult = await provider.send({
        leadId: msg.lead_id,
        tenantId,
        channel: "email",
        to: msg.contact_email || "",
        subject: msg.subject || undefined,
        body: msg.body,
      });

      if (sendResult.success) {
        await incrementRateLimit(kv, tenantId);
        await markSent(kv, tenantId, msg.lead_id, msg.msg_id);
        await trackSendAttempt(db, tenantId, msg.lead_id);

        // Update message status
        await db.prepare("UPDATE lead_message_drafts SET status = 'sent' WHERE id = ?1 AND tenant_id = ?2")
          .bind(msg.msg_id, tenantId).run();

        // Update lead
        await db.prepare("UPDATE sales_leads SET pipeline_stage = 'contacted', last_contacted_at = ?1 WHERE id = ?2 AND tenant_id = ?3")
          .bind(now(), msg.lead_id, tenantId).run();

        // Record delivery event
        await db.prepare(
          `INSERT INTO outreach_delivery_events (id, tenant_id, lead_id, message_id, channel, event_type, status, created_at)
           VALUES (?1, ?2, ?3, ?4, 'email', 'sent', 'sent', ?5)`
        ).bind(uid(), tenantId, msg.lead_id, msg.msg_id, now()).run();

        results.push({ lead_id: msg.lead_id, status: "sent" });
        sent++;
      } else {
        await trackSendAttempt(db, tenantId, msg.lead_id, sendResult.error);
        results.push({ lead_id: msg.lead_id, status: "failed", reason: sendResult.error });
        failed++;
      }
    } catch (err: any) {
      await trackSendAttempt(db, tenantId, msg.lead_id, err.message);
      results.push({ lead_id: msg.lead_id, status: "failed", reason: err.message });
      failed++;
    }
  }

  return { action: "send_existing_approved_only", sent, skipped, failed, total: (approved.results ?? []).length, results };
}

// ── Validation ───────────────────────────────────────────────────────────

function validateActionSafety(
  actionType: string,
  payload: any,
  executedBy: ExecutedBy
): { safe: boolean; reason?: string } {
  // Auto engine can only run safe actions
  if (executedBy !== "user" && !isAutoSafe(actionType) && actionType !== "send_existing_approved_only") {
    return { safe: false, reason: `Action ${actionType} is not auto-safe` };
  }

  // send_existing_approved_only requires explicit enabling
  if (actionType === "send_existing_approved_only" && executedBy !== "user") {
    // Will be checked against settings in cron
    return { safe: true };
  }

  return { safe: true };
}

// ── Audit Log ────────────────────────────────────────────────────────────

async function logAction(
  db: D1Database,
  tenantId: string,
  recommendationId: string | null,
  actionType: string,
  payload: any,
  executionMode: string,
  executionStatus: string,
  executedBy: string,
  result: any,
  errorMessage: string | null,
  uid: UidFn,
  now: NowFn
): Promise<void> {
  await db.prepare(
    `INSERT INTO outreach_action_logs
     (id, tenant_id, recommendation_id, action_type, action_payload_json, execution_mode, execution_status, executed_by, result_json, error_message, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
  ).bind(
    uid(), tenantId, recommendationId, actionType,
    payload ? JSON.stringify(payload) : null,
    executionMode, executionStatus, executedBy,
    result ? JSON.stringify(result) : null,
    errorMessage, now()
  ).run();
}

// ── Cron: Auto Execute Safe Actions ──────────────────────────────────────

export async function processAutoActions(
  db: D1Database,
  kv: KVNamespace,
  uid: UidFn,
  now: NowFn,
  env: { GOOGLE_MAPS_API_KEY?: string; OPENAI_API_KEY?: string }
): Promise<{ processed: number; skipped: number; errors: number }> {
  // Get all tenants with auto_action enabled
  const tenants = await db
    .prepare("SELECT DISTINCT tenant_id FROM outreach_schedules")
    .all<{ tenant_id: string }>();

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const { tenant_id: tenantId } of tenants.results ?? []) {
    // Load auto action settings
    const settingsJson = await kv.get(`outreach:settings:${tenantId}`);
    const allSettings = settingsJson ? JSON.parse(settingsJson) : {};
    const autoSettings: AutoActionSettings = {
      ...DEFAULT_AUTO_ACTION_SETTINGS,
      ...(allSettings.autoAction ?? {}),
    };

    if (!autoSettings.auto_action_enabled) continue;

    // Check daily execution cap
    const todayStr = new Date().toLocaleDateString("sv-SE");
    const todayCount = await db
      .prepare(
        "SELECT COUNT(*) as cnt FROM outreach_action_logs WHERE tenant_id = ?1 AND created_at >= ?2 AND executed_by = 'cron'"
      )
      .bind(tenantId, todayStr)
      .first<{ cnt: number }>();
    if ((todayCount?.cnt ?? 0) >= autoSettings.auto_action_max_executions_per_day) continue;

    // Get eligible recommendations
    const recs = await db
      .prepare(
        `SELECT * FROM outreach_copilot_recommendations
         WHERE tenant_id = ?1 AND status = 'open' AND auto_executable = 1
           AND execution_status IN ('pending', 'eligible')
         ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
         LIMIT 5`
      )
      .bind(tenantId)
      .all<CopilotRecommendation & { action_type: string; auto_executable: number; execution_status: string }>();

    for (const rec of recs.results ?? []) {
      const actionType = rec.action_type || rec.recommendation_type;

      // Check setting-level permissions
      if (!isActionPermitted(actionType, autoSettings)) {
        skipped++;
        continue;
      }

      try {
        const result = await executeRecommendationAction(db, kv, tenantId, rec.id, "cron", uid, now, env);
        if (result.ok) processed++;
        else errors++;
      } catch {
        errors++;
      }
    }
  }

  return { processed, skipped, errors };
}

function isActionPermitted(actionType: string, settings: AutoActionSettings): boolean {
  if (!settings.auto_execute_safe_recommendations) return false;

  switch (actionType) {
    case "run_schedule_now":
    case "pause_schedule":
    case "enable_schedule":
      return settings.auto_execute_schedule_runs;
    case "raise_quality_threshold":
    case "lower_quality_threshold":
    case "increase_max_per_area":
    case "decrease_max_per_area":
      return settings.auto_execute_threshold_adjustments;
    case "send_existing_approved_only":
      return settings.auto_execute_send_existing_approved_only;
    case "stop_area":
    case "prioritize_review_queue":
      return settings.auto_execute_safe_recommendations;
    default:
      return false;
  }
}

// ── Fetch Action Logs ────────────────────────────────────────────────────

export async function getActionLogs(
  db: D1Database,
  tenantId: string,
  limit: number = 50
): Promise<ActionLog[]> {
  const rows = await db
    .prepare("SELECT * FROM outreach_action_logs WHERE tenant_id = ?1 ORDER BY created_at DESC LIMIT ?2")
    .bind(tenantId, limit)
    .all<ActionLog>();
  return rows.results ?? [];
}

// ── Auto Action Settings ─────────────────────────────────────────────────

export async function getAutoActionSettings(
  kv: KVNamespace,
  tenantId: string
): Promise<AutoActionSettings> {
  const settingsJson = await kv.get(`outreach:settings:${tenantId}`);
  const allSettings = settingsJson ? JSON.parse(settingsJson) : {};
  return { ...DEFAULT_AUTO_ACTION_SETTINGS, ...(allSettings.autoAction ?? {}) };
}

export async function saveAutoActionSettings(
  kv: KVNamespace,
  tenantId: string,
  updates: Partial<AutoActionSettings>
): Promise<AutoActionSettings> {
  const settingsJson = await kv.get(`outreach:settings:${tenantId}`);
  const allSettings = settingsJson ? JSON.parse(settingsJson) : {};
  const current: AutoActionSettings = { ...DEFAULT_AUTO_ACTION_SETTINGS, ...(allSettings.autoAction ?? {}) };
  const merged = { ...current, ...updates };
  allSettings.autoAction = merged;
  await kv.put(`outreach:settings:${tenantId}`, JSON.stringify(allSettings));
  return merged;
}
