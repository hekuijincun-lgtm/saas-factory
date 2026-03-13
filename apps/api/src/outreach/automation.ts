// Outreach OS — Auto Outreach Scheduler (Phase 11)
// ============================================================
// Scheduled automation: creates batch jobs on schedule and runs them.
// Reuses existing runBatchJob() for the full pipeline.
// Default: review_only (no auto-send of new drafts)

import type { D1Database } from "@cloudflare/workers-types";
import type {
  OutreachSchedule,
  OutreachScheduleRun,
  ScheduleCreateInput,
} from "./types";
import { createBatchJob, runBatchJob } from "./batches";

type UidFn = () => string;
type NowFn = () => string;

/** Hard cap for schedules per tenant */
const MAX_SCHEDULES_PER_TENANT = 10;

// ── CRUD ────────────────────────────────────────────────────────────────

export async function createSchedule(
  db: D1Database,
  tenantId: string,
  input: ScheduleCreateInput,
  uid: UidFn,
  now: NowFn
): Promise<OutreachSchedule> {
  // Check cap
  const countRow = await db
    .prepare("SELECT COUNT(*) as cnt FROM outreach_schedules WHERE tenant_id = ?1")
    .bind(tenantId)
    .first<{ cnt: number }>();
  if ((countRow?.cnt ?? 0) >= MAX_SCHEDULES_PER_TENANT) {
    throw new Error(`スケジュール上限(${MAX_SCHEDULES_PER_TENANT}件)に達しています`);
  }

  const id = uid();
  const ts = now();
  const nextRun = computeNextRun(input.frequency ?? "daily", input.run_hour ?? 9, input.run_minute ?? 0);

  const schedule: OutreachSchedule = {
    id,
    tenant_id: tenantId,
    name: input.name || `${input.niche} 自動営業`,
    niche: input.niche,
    areas_json: JSON.stringify(input.areas),
    source_type: input.source_type ?? "directory",
    enabled: 0,
    frequency: input.frequency ?? "daily",
    run_hour: input.run_hour ?? 9,
    run_minute: input.run_minute ?? 0,
    max_target_count: Math.min(Math.max(input.max_target_count ?? 20, 1), 100),
    max_per_area: Math.min(Math.max(input.max_per_area ?? 8, 1), 30),
    quality_threshold: Math.max(0, Math.min(input.quality_threshold ?? 0.4, 1.0)),
    auto_accept_enabled: input.auto_accept_enabled !== false ? 1 : 0,
    auto_import_enabled: input.auto_import_enabled !== false ? 1 : 0,
    auto_analyze_enabled: input.auto_analyze_enabled !== false ? 1 : 0,
    auto_score_enabled: input.auto_score_enabled !== false ? 1 : 0,
    auto_draft_enabled: input.auto_draft_enabled !== false ? 1 : 0,
    mode: input.mode === "approved_send_existing_only" ? "approved_send_existing_only" : "review_only",
    last_run_at: null,
    next_run_at: nextRun,
    created_at: ts,
    updated_at: ts,
  };

  await db
    .prepare(
      `INSERT INTO outreach_schedules
       (id, tenant_id, name, niche, areas_json, source_type, enabled, frequency,
        run_hour, run_minute, max_target_count, max_per_area, quality_threshold,
        auto_accept_enabled, auto_import_enabled, auto_analyze_enabled, auto_score_enabled, auto_draft_enabled,
        mode, last_run_at, next_run_at, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)`
    )
    .bind(
      id, tenantId, schedule.name, schedule.niche, schedule.areas_json, schedule.source_type,
      schedule.enabled, schedule.frequency, schedule.run_hour, schedule.run_minute,
      schedule.max_target_count, schedule.max_per_area, schedule.quality_threshold,
      schedule.auto_accept_enabled, schedule.auto_import_enabled, schedule.auto_analyze_enabled,
      schedule.auto_score_enabled, schedule.auto_draft_enabled,
      schedule.mode, null, nextRun, ts, ts
    )
    .run();

  return schedule;
}

export async function updateSchedule(
  db: D1Database,
  tenantId: string,
  scheduleId: string,
  updates: Partial<ScheduleCreateInput> & { enabled?: boolean },
  now: NowFn
): Promise<OutreachSchedule | null> {
  const existing = await db
    .prepare("SELECT * FROM outreach_schedules WHERE id = ?1 AND tenant_id = ?2")
    .bind(scheduleId, tenantId)
    .first<OutreachSchedule>();
  if (!existing) return null;

  const ts = now();
  const sets: string[] = ["updated_at = ?1"];
  const binds: any[] = [ts];
  let idx = 2;

  const apply = (field: string, value: any) => {
    if (value !== undefined) {
      sets.push(`${field} = ?${idx}`);
      binds.push(value);
      idx++;
    }
  };

  apply("name", updates.name);
  apply("niche", updates.niche);
  if (updates.areas) { apply("areas_json", JSON.stringify(updates.areas)); }
  apply("source_type", updates.source_type);
  apply("frequency", updates.frequency);
  apply("run_hour", updates.run_hour);
  apply("run_minute", updates.run_minute);
  if (updates.max_target_count !== undefined) {
    apply("max_target_count", Math.min(Math.max(updates.max_target_count, 1), 100));
  }
  if (updates.max_per_area !== undefined) {
    apply("max_per_area", Math.min(Math.max(updates.max_per_area, 1), 30));
  }
  if (updates.quality_threshold !== undefined) {
    apply("quality_threshold", Math.max(0, Math.min(updates.quality_threshold, 1.0)));
  }
  if (updates.auto_accept_enabled !== undefined) apply("auto_accept_enabled", updates.auto_accept_enabled ? 1 : 0);
  if (updates.auto_import_enabled !== undefined) apply("auto_import_enabled", updates.auto_import_enabled ? 1 : 0);
  if (updates.auto_analyze_enabled !== undefined) apply("auto_analyze_enabled", updates.auto_analyze_enabled ? 1 : 0);
  if (updates.auto_score_enabled !== undefined) apply("auto_score_enabled", updates.auto_score_enabled ? 1 : 0);
  if (updates.auto_draft_enabled !== undefined) apply("auto_draft_enabled", updates.auto_draft_enabled ? 1 : 0);
  if (updates.mode !== undefined) apply("mode", updates.mode);
  if (updates.enabled !== undefined) apply("enabled", updates.enabled ? 1 : 0);

  // Recompute next_run if frequency/time changed
  const freq = updates.frequency ?? existing.frequency;
  const hour = updates.run_hour ?? existing.run_hour;
  const minute = updates.run_minute ?? existing.run_minute;
  const nextRun = computeNextRun(freq, hour, minute);
  apply("next_run_at", nextRun);

  binds.push(scheduleId, tenantId);
  await db
    .prepare(`UPDATE outreach_schedules SET ${sets.join(", ")} WHERE id = ?${idx} AND tenant_id = ?${idx + 1}`)
    .bind(...binds)
    .run();

  return db
    .prepare("SELECT * FROM outreach_schedules WHERE id = ?1 AND tenant_id = ?2")
    .bind(scheduleId, tenantId)
    .first<OutreachSchedule>();
}

// ── Run Now (manual trigger) ────────────────────────────────────────────

export async function runScheduleNow(
  db: D1Database,
  kv: KVNamespace,
  tenantId: string,
  scheduleId: string,
  uid: UidFn,
  now: NowFn,
  env: { GOOGLE_MAPS_API_KEY?: string; OPENAI_API_KEY?: string }
): Promise<OutreachScheduleRun> {
  const schedule = await db
    .prepare("SELECT * FROM outreach_schedules WHERE id = ?1 AND tenant_id = ?2")
    .bind(scheduleId, tenantId)
    .first<OutreachSchedule>();
  if (!schedule) throw new Error("Schedule not found");

  return executeScheduleRun(db, kv, tenantId, schedule, uid, now, env);
}

// ── Cron Execution ──────────────────────────────────────────────────────

export async function processScheduledJobs(
  db: D1Database,
  kv: KVNamespace,
  uid: UidFn,
  now: NowFn,
  env: { GOOGLE_MAPS_API_KEY?: string; OPENAI_API_KEY?: string }
): Promise<{ processed: number; errors: number }> {
  const nowIso = now();
  const nowJst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const currentHour = nowJst.getHours();
  const currentMinute = nowJst.getMinutes();
  const currentDay = nowJst.getDay(); // 0=Sun, 1=Mon, ...

  // Only process at exact 5-min cron boundaries matching run_hour/run_minute
  // We check: run_hour == currentHour AND run_minute is within 5-min window of currentMinute
  const minuteFloor = Math.floor(currentMinute / 5) * 5;

  // Find enabled schedules that are due
  const schedules = await db
    .prepare(
      `SELECT * FROM outreach_schedules
       WHERE enabled = 1
         AND run_hour = ?1
         AND run_minute >= ?2 AND run_minute < ?3
       LIMIT 20`
    )
    .bind(currentHour, minuteFloor, minuteFloor + 5)
    .all<OutreachSchedule>();

  let processed = 0;
  let errors = 0;

  for (const schedule of (schedules.results ?? [])) {
    // Check frequency
    if (schedule.frequency === "weekdays" && (currentDay === 0 || currentDay === 6)) continue;
    if (schedule.frequency === "weekly" && currentDay !== 1) continue; // Monday only

    // Dedup: skip if already run today (JST date)
    const todayStr = nowJst.toLocaleDateString("sv-SE"); // YYYY-MM-DD
    if (schedule.last_run_at) {
      const lastRunJst = new Date(new Date(schedule.last_run_at).toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
      const lastRunDate = lastRunJst.toLocaleDateString("sv-SE");
      if (lastRunDate === todayStr) continue; // Already ran today
    }

    // Running lock: check if there's a running run for this schedule
    const runningRun = await db
      .prepare("SELECT id FROM outreach_schedule_runs WHERE schedule_id = ?1 AND tenant_id = ?2 AND status = 'running' LIMIT 1")
      .bind(schedule.id, schedule.tenant_id)
      .first();
    if (runningRun) continue;

    try {
      await executeScheduleRun(db, kv, schedule.tenant_id, schedule, uid, now, env);
      processed++;
    } catch (err: any) {
      errors++;
      console.error(`[OUTREACH_SCHEDULER] schedule=${schedule.id} error:`, err.message);
    }
  }

  return { processed, errors };
}

// ── Core Execution ──────────────────────────────────────────────────────

async function executeScheduleRun(
  db: D1Database,
  kv: KVNamespace,
  tenantId: string,
  schedule: OutreachSchedule,
  uid: UidFn,
  now: NowFn,
  env: { GOOGLE_MAPS_API_KEY?: string; OPENAI_API_KEY?: string }
): Promise<OutreachScheduleRun> {
  const runId = uid();
  const ts = now();

  // Create run record
  await db
    .prepare(
      `INSERT INTO outreach_schedule_runs
       (id, tenant_id, schedule_id, status, started_at, created_at)
       VALUES (?1, ?2, ?3, 'running', ?4, ?5)`
    )
    .bind(runId, tenantId, schedule.id, ts, ts)
    .run();

  try {
    // Create a batch job from the schedule config
    const areas: string[] = JSON.parse(schedule.areas_json);
    const batchJob = await createBatchJob(db, tenantId, {
      niche: schedule.niche,
      areas,
      randomize_areas: true,
      target_count: schedule.max_target_count,
      max_per_area: schedule.max_per_area,
      quality_threshold: schedule.quality_threshold,
      mode: schedule.mode === "approved_send_existing_only" ? "approved_send" : "review_only",
      source_type: schedule.source_type,
    }, uid, now);

    // Run the batch
    const batchResult = await runBatchJob(db, kv, tenantId, batchJob.id, uid, now, env);

    // Update run with results
    const summary = batchResult.summary;
    const finishedAt = now();
    await db
      .prepare(
        `UPDATE outreach_schedule_runs SET
           status = 'completed',
           searched_count = ?1,
           accepted_count = ?2,
           imported_count = ?3,
           drafted_count = ?4,
           error_count = ?5,
           summary_json = ?6,
           finished_at = ?7
         WHERE id = ?8 AND tenant_id = ?9`
      )
      .bind(
        summary.searched, summary.accepted, summary.imported,
        summary.drafted, summary.errors,
        JSON.stringify({ ...summary, batchJobId: batchJob.id }),
        finishedAt, runId, tenantId
      )
      .run();

    // Update schedule last_run_at + next_run_at
    const nextRun = computeNextRun(schedule.frequency, schedule.run_hour, schedule.run_minute);
    await db
      .prepare("UPDATE outreach_schedules SET last_run_at = ?1, next_run_at = ?2, updated_at = ?3 WHERE id = ?4 AND tenant_id = ?5")
      .bind(finishedAt, nextRun, finishedAt, schedule.id, tenantId)
      .run();

    return await db
      .prepare("SELECT * FROM outreach_schedule_runs WHERE id = ?1 AND tenant_id = ?2")
      .bind(runId, tenantId)
      .first<OutreachScheduleRun>() as OutreachScheduleRun;
  } catch (err: any) {
    // Mark run as failed
    await db
      .prepare("UPDATE outreach_schedule_runs SET status = 'failed', error_message = ?1, finished_at = ?2 WHERE id = ?3 AND tenant_id = ?4")
      .bind(err.message ?? "unknown error", now(), runId, tenantId)
      .run();

    // Still update last_run_at to prevent retry storm
    await db
      .prepare("UPDATE outreach_schedules SET last_run_at = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4")
      .bind(now(), now(), schedule.id, tenantId)
      .run();

    throw err;
  }
}

// ── Helper ──────────────────────────────────────────────────────────────

function computeNextRun(frequency: string, hour: number, minute: number): string {
  const nowJst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const next = new Date(nowJst);
  next.setHours(hour, minute, 0, 0);

  // If the time has passed today, move to next eligible day
  if (next <= nowJst) {
    next.setDate(next.getDate() + 1);
  }

  // Adjust for frequency
  if (frequency === "weekdays") {
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
  } else if (frequency === "weekly") {
    while (next.getDay() !== 1) { // Monday
      next.setDate(next.getDate() + 1);
    }
  }

  return next.toISOString();
}
