// Outreach OS — Auto Outreach Scheduler (Phase 11 + Phase 16)
// ============================================================
// Scheduled automation: creates batch jobs on schedule and runs them.
// Phase 16: auto_send/hybrid modes + area auto-selection.
// Default: review_only (no auto-send of new drafts)

import type { D1Database } from "@cloudflare/workers-types";
import type {
  OutreachSchedule,
  OutreachScheduleRun,
  ScheduleCreateInput,
  ScheduleAreaMode,
  OutreachSettings,
} from "./types";
import { DEFAULT_OUTREACH_SETTINGS } from "./types";
import { createBatchJob, runBatchJob } from "./batches";
import {
  SafeModeSender,
  resolveProvider,
  checkRateLimit,
  incrementRateLimit,
  isUnsubscribed,
  isDuplicateSend,
  markSent,
  trackSendAttempt,
  MAX_SEND_RETRIES,
} from "./send-provider";

type UidFn = () => string;
type NowFn = () => string;

/** Hard cap for schedules per tenant */
const MAX_SCHEDULES_PER_TENANT = 10;

/** Allowed schedule modes */
const VALID_MODES = ["review_only", "approved_send_existing_only", "hybrid", "auto_send"];
const VALID_AREA_MODES: ScheduleAreaMode[] = ["manual", "auto", "rotation"];

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

  const mode = VALID_MODES.includes(input.mode ?? "") ? input.mode! : "review_only";
  const areaMode = VALID_AREA_MODES.includes(input.area_mode as any) ? input.area_mode! : "manual";

  const schedule: OutreachSchedule = {
    id,
    tenant_id: tenantId,
    name: input.name || `${input.niche} 自動営業`,
    niche: input.niche,
    areas_json: JSON.stringify(input.areas),
    source_type: input.source_type ?? "map",
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
    mode: mode as any,
    area_mode: areaMode,
    daily_send_limit: Math.max(0, Math.min(input.daily_send_limit ?? 0, 200)),
    min_score_for_auto_send: Math.max(0, Math.min(input.min_score_for_auto_send ?? 40, 100)),
    rotation_index: 0,
    rotation_cursor_updated_at: null,
    last_executed_area: null,
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
        mode, area_mode, daily_send_limit, min_score_for_auto_send,
        rotation_index, rotation_cursor_updated_at, last_executed_area,
        last_run_at, next_run_at, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29)`
    )
    .bind(
      id, tenantId, schedule.name, schedule.niche, schedule.areas_json, schedule.source_type,
      schedule.enabled, schedule.frequency, schedule.run_hour, schedule.run_minute,
      schedule.max_target_count, schedule.max_per_area, schedule.quality_threshold,
      schedule.auto_accept_enabled, schedule.auto_import_enabled, schedule.auto_analyze_enabled,
      schedule.auto_score_enabled, schedule.auto_draft_enabled,
      schedule.mode, schedule.area_mode, schedule.daily_send_limit, schedule.min_score_for_auto_send,
      0, null, null,
      null, nextRun, ts, ts
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
  if (updates.mode !== undefined && VALID_MODES.includes(updates.mode)) {
    apply("mode", updates.mode);
  }
  if (updates.area_mode !== undefined && VALID_AREA_MODES.includes(updates.area_mode as any)) {
    apply("area_mode", updates.area_mode);
  }
  if (updates.daily_send_limit !== undefined) {
    apply("daily_send_limit", Math.max(0, Math.min(updates.daily_send_limit, 200)));
  }
  if (updates.min_score_for_auto_send !== undefined) {
    apply("min_score_for_auto_send", Math.max(0, Math.min(updates.min_score_for_auto_send, 100)));
  }
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
  env: { GOOGLE_MAPS_API_KEY?: string; OPENAI_API_KEY?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string }
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
  env: { GOOGLE_MAPS_API_KEY?: string; OPENAI_API_KEY?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string }
): Promise<{ processed: number; errors: number }> {
  const nowIso = now();
  const nowJst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const currentHour = nowJst.getHours();
  const currentMinute = nowJst.getMinutes();
  const currentDay = nowJst.getDay(); // 0=Sun, 1=Mon, ...

  // Only process at exact 5-min cron boundaries matching run_hour/run_minute
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
    // Phase 18: Check tenant-level autoLeadSupplyEnabled flag
    try {
      const tenantSettingsRaw = await kv.get(`outreach:settings:${schedule.tenant_id}`);
      if (tenantSettingsRaw) {
        const tenantSettings = JSON.parse(tenantSettingsRaw);
        if (tenantSettings.autoLeadSupplyEnabled === false) continue;
      }
    } catch { /* default: allow if setting absent */ }

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

// ── Area Auto-Selection ─────────────────────────────────────────────────

interface AreaSelectionResult {
  areas: string[];
  chosenArea: string;
  reason: string;
}

async function selectAreaAutomatically(
  db: D1Database,
  tenantId: string,
  schedule: OutreachSchedule
): Promise<AreaSelectionResult> {
  const configuredAreas: string[] = JSON.parse(schedule.areas_json);
  if (configuredAreas.length === 0) {
    return { areas: [], chosenArea: "", reason: "エリア未設定" };
  }
  if (configuredAreas.length === 1) {
    return { areas: configuredAreas, chosenArea: configuredAreas[0], reason: "エリア1件のみ" };
  }

  // Gather per-area stats from existing leads
  const areaStats: Array<{
    area: string;
    leadCount: number;
    replyCount: number;
    meetingCount: number;
    replyRate: number;
    recentRunCount: number;
  }> = [];

  for (const area of configuredAreas) {
    const stats = await db
      .prepare(
        `SELECT
           COUNT(*) as lead_count,
           SUM(CASE WHEN pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as reply_count,
           SUM(CASE WHEN pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meeting_count
         FROM sales_leads
         WHERE tenant_id = ?1 AND area = ?2`
      )
      .bind(tenantId, area)
      .first<{ lead_count: number; reply_count: number; meeting_count: number }>();

    // Check how many times this area was used in recent runs
    const recentRuns = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM outreach_schedule_runs
         WHERE tenant_id = ?1 AND schedule_id = ?2 AND chosen_area = ?3
         AND created_at > datetime('now', '-14 days')`
      )
      .bind(tenantId, schedule.id, area)
      .first<{ cnt: number }>();

    const leadCount = stats?.lead_count ?? 0;
    const replyCount = stats?.reply_count ?? 0;
    const meetingCount = stats?.meeting_count ?? 0;

    areaStats.push({
      area,
      leadCount,
      replyCount,
      meetingCount,
      replyRate: leadCount > 0 ? replyCount / leadCount : 0,
      recentRunCount: recentRuns?.cnt ?? 0,
    });
  }

  // Scoring: prefer high reply rate, avoid recently-used areas, explore low-coverage areas
  const scored = areaStats.map((s) => {
    let score = 0;

    // Reply rate bonus (0-40 points)
    score += s.replyRate * 40;

    // Meeting rate bonus (0-30 points)
    const meetingRate = s.leadCount > 0 ? s.meetingCount / s.leadCount : 0;
    score += meetingRate * 30;

    // Exploration bonus: less leads = more to discover (0-20 points)
    const explorationScore = Math.max(0, 20 - s.leadCount * 0.5);
    score += explorationScore;

    // Freshness penalty: recently used areas get deprioritized (-5 per recent run)
    score -= s.recentRunCount * 5;

    return { ...s, score };
  });

  // Sort by score DESC
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  const reasons: string[] = [];
  if (best.replyRate > 0) reasons.push(`返信率${(best.replyRate * 100).toFixed(0)}%`);
  if (best.leadCount === 0) reasons.push("未開拓エリア");
  if (best.recentRunCount === 0) reasons.push("最近未使用");
  if (best.meetingCount > 0) reasons.push(`商談${best.meetingCount}件`);
  if (reasons.length === 0) reasons.push("スコア最高");

  const reason = `自動選定: ${best.area} (${reasons.join(", ")})`;

  return {
    areas: [best.area],
    chosenArea: best.area,
    reason,
  };
}

// ── Auto-Send Logic ─────────────────────────────────────────────────────

interface AutoSendResult {
  sentCount: number;
  skippedCount: number;
  reviewCount: number;
  skippedReasons: Record<string, number>;
}

async function executeAutoSend(
  db: D1Database,
  kv: KVNamespace,
  tenantId: string,
  schedule: OutreachSchedule,
  settings: OutreachSettings,
  uid: UidFn,
  now: NowFn
): Promise<AutoSendResult> {
  const result: AutoSendResult = { sentCount: 0, skippedCount: 0, reviewCount: 0, skippedReasons: {} };

  const isAutoSend = schedule.mode === "auto_send";
  const isHybrid = schedule.mode === "hybrid";
  if (!isAutoSend && !isHybrid) return result;

  const minScore = schedule.min_score_for_auto_send || 40;
  const dailyLimit = schedule.daily_send_limit || settings.dailyCap || 50;

  // Find drafted messages from leads imported by this schedule's niche
  const drafts = await db
    .prepare(
      `SELECT d.id, d.lead_id, d.subject, d.body, d.kind, d.campaign_id,
              l.score, l.contact_email, l.line_url, l.area, l.store_name,
              l.send_attempt_count, l.last_contacted_at
       FROM lead_message_drafts d
       JOIN sales_leads l ON d.lead_id = l.id AND d.tenant_id = l.tenant_id
       WHERE d.tenant_id = ?1
         AND d.status = 'pending_review'
         AND l.score >= ?2
       ORDER BY l.score DESC
       LIMIT ?3`
    )
    .bind(tenantId, minScore, dailyLimit)
    .all<{
      id: string; lead_id: string; subject: string | null; body: string;
      kind: string; campaign_id: string | null;
      score: number; contact_email: string | null; line_url: string | null;
      area: string | null; store_name: string;
      send_attempt_count: number; last_contacted_at: string | null;
    }>();

  const skipReason = (reason: string) => {
    result.skippedCount++;
    result.skippedReasons[reason] = (result.skippedReasons[reason] || 0) + 1;
  };

  for (const draft of (drafts.results ?? [])) {
    // ── Safety checks (fail-closed) ──

    // 1. Rate limit
    const rl = await checkRateLimit(kv, tenantId, { dailyCap: dailyLimit, perTenantPerHour: settings.hourlyCap });
    if (!rl.allowed) { skipReason("rate_limit"); continue; }

    // 2. Unsubscribe
    if (await isUnsubscribed(kv, tenantId, draft.lead_id)) { skipReason("unsubscribed"); continue; }

    // 3. Duplicate send
    if (await isDuplicateSend(kv, tenantId, draft.lead_id, draft.id)) { skipReason("duplicate"); continue; }

    // 4. Max retries
    if (draft.send_attempt_count >= MAX_SEND_RETRIES) { skipReason("max_retries"); continue; }

    // 5. Contact cooldown
    if (draft.last_contacted_at) {
      const cooldownMs = (settings.contactCooldownDays || 7) * 86400000;
      if (Date.now() - new Date(draft.last_contacted_at).getTime() < cooldownMs) {
        skipReason("cooldown"); continue;
      }
    }

    // 6. Resolve send channel
    const channel = (draft.kind as any) ?? "email";
    const to = draft.contact_email || draft.line_url || "";
    if (!to) { skipReason("no_contact"); continue; }

    // 7. LP URL fail-closed check
    const lpTokenPattern = /\{\{lp_url\}\}/;
    const usesLpToken = lpTokenPattern.test(draft.subject ?? "") || lpTokenPattern.test(draft.body);
    if (usesLpToken) {
      // Resolve LP URL
      let lpUrl = settings.defaultLpUrl || "";
      if (draft.campaign_id) {
        const camp = await db
          .prepare("SELECT landing_page_url FROM outreach_campaigns WHERE id = ?1 AND tenant_id = ?2")
          .bind(draft.campaign_id, tenantId)
          .first<{ landing_page_url: string | null }>();
        if (camp?.landing_page_url) lpUrl = camp.landing_page_url;
      }
      if (!lpUrl) { skipReason("lp_url_unresolved"); continue; }
    }

    // 8. Hybrid mode: low score → review instead of send
    if (isHybrid && (draft.score ?? 0) < minScore + 20) {
      // In hybrid, only truly high-scoring leads get auto-sent
      // Lower-scoring leads stay in review queue
      result.reviewCount++;
      continue;
    }

    // ── Execute send ──
    const ts = now();
    const sender = resolveProvider(settings.sendMode, env);

    // Token expansion
    let lpUrl = settings.defaultLpUrl || "";
    if (draft.campaign_id) {
      const camp = await db
        .prepare("SELECT landing_page_url FROM outreach_campaigns WHERE id = ?1 AND tenant_id = ?2")
        .bind(draft.campaign_id, tenantId)
        .first<{ landing_page_url: string | null }>();
      if (camp?.landing_page_url) lpUrl = camp.landing_page_url;
    }
    const expandTokens = (s: string) =>
      s.replace(/\{\{lp_url\}\}/g, lpUrl)
       .replace(/\{store_name\}/g, draft.store_name ?? "")
       .replace(/\{area\}/g, draft.area ?? "");

    try {
      const sendResult = await sender.send({
        leadId: draft.lead_id,
        tenantId,
        channel: channel as any,
        to,
        subject: expandTokens(draft.subject ?? ""),
        body: expandTokens(draft.body),
      });

      await trackSendAttempt(db, tenantId, draft.lead_id, sendResult.success ? undefined : sendResult.error);

      if (sendResult.success) {
        // Update message status
        await db.prepare("UPDATE lead_message_drafts SET status = 'sent' WHERE id = ?1 AND tenant_id = ?2")
          .bind(draft.id, tenantId).run();

        // Pipeline transition
        await db.prepare(
          `UPDATE sales_leads SET pipeline_stage = 'contacted', last_contacted_at = ?1, updated_at = ?2
           WHERE id = ?3 AND tenant_id = ?4 AND pipeline_stage IN ('new', 'approved')`
        ).bind(ts, ts, draft.lead_id, tenantId).run();

        // Rate limit + dedup
        await incrementRateLimit(kv, tenantId);
        await markSent(kv, tenantId, draft.lead_id, draft.id);

        // Delivery event
        const eventId = uid();
        await db.prepare(
          `INSERT INTO outreach_delivery_events (id, tenant_id, lead_id, message_id, channel, event_type, status, metadata_json, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 'sent', 'sent', ?6, ?7)`
        ).bind(
          eventId, tenantId, draft.lead_id, draft.id, channel,
          JSON.stringify({ provider: sendResult.provider, sendMode: settings.sendMode, source: "auto_scheduler" }),
          ts
        ).run();

        result.sentCount++;
      } else {
        skipReason("send_failed");
      }
    } catch (err: any) {
      await trackSendAttempt(db, tenantId, draft.lead_id, err.message);
      skipReason("send_error");
    }
  }

  return result;
}

// ── Core Execution ──────────────────────────────────────────────────────

async function executeScheduleRun(
  db: D1Database,
  kv: KVNamespace,
  tenantId: string,
  schedule: OutreachSchedule,
  uid: UidFn,
  now: NowFn,
  env: { GOOGLE_MAPS_API_KEY?: string; OPENAI_API_KEY?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string }
): Promise<OutreachScheduleRun> {
  const runId = uid();
  const ts = now();

  // Create run record
  await db
    .prepare(
      `INSERT INTO outreach_schedule_runs
       (id, tenant_id, schedule_id, status, send_mode, area_mode, started_at, created_at)
       VALUES (?1, ?2, ?3, 'running', ?4, ?5, ?6, ?7)`
    )
    .bind(runId, tenantId, schedule.id, schedule.mode, schedule.area_mode ?? "manual", ts, ts)
    .run();

  try {
    // ── Area selection ──
    let areas: string[] = JSON.parse(schedule.areas_json);
    let chosenArea: string | null = null;
    let selectionReason: string | null = null;
    let advanceRotation = false;

    const areaMode = schedule.area_mode ?? "manual";

    if (areaMode === "rotation") {
      // Phase 19: Deterministic area rotation
      if (areas.length === 0) {
        chosenArea = "";
        selectionReason = "エリア未設定";
      } else {
        const idx = (schedule.rotation_index ?? 0) % areas.length;
        const selectedArea = areas[idx];
        chosenArea = selectedArea;
        areas = [selectedArea]; // Pass only this area to batch job
        selectionReason = `ローテーション: ${selectedArea} (${idx + 1}/${areas.length})`;
        advanceRotation = true;
      }
    } else if (areaMode === "auto") {
      const selection = await selectAreaAutomatically(db, tenantId, schedule);
      areas = selection.areas;
      chosenArea = selection.chosenArea;
      selectionReason = selection.reason;
    } else {
      chosenArea = areas.join(", ");
      selectionReason = "手動指定";
    }

    // ── Create and run batch job ──
    const batchMode = schedule.mode === "approved_send_existing_only" ? "approved_send" : "review_only";
    const batchJob = await createBatchJob(db, tenantId, {
      niche: schedule.niche,
      areas,
      randomize_areas: true,
      target_count: schedule.max_target_count,
      max_per_area: schedule.max_per_area,
      quality_threshold: schedule.quality_threshold,
      mode: batchMode,
      source_type: schedule.source_type,
    }, uid, now);

    const batchResult = await runBatchJob(db, kv, tenantId, batchJob.id, uid, now, env);

    const diag = (batchResult.summary as any).draftDiagnostics;
    console.log(`[SCHEDULER] tenant=${tenantId} schedule=${schedule.id} run=${runId} area=${chosenArea} searched=${batchResult.summary.searched} imported=${batchResult.summary.imported} drafted=${batchResult.summary.drafted} skippedDedup=${(batchResult.summary as any).skippedDedup ?? 0} errors=${batchResult.summary.errors}${diag ? ` draftDiag=${JSON.stringify(diag)}` : ""}`);

    // ── Auto-send phase (hybrid / auto_send only) ──
    let sendResult: AutoSendResult = { sentCount: 0, skippedCount: 0, reviewCount: 0, skippedReasons: {} };

    if (schedule.mode === "hybrid" || schedule.mode === "auto_send") {
      // Load tenant outreach settings
      const settingsRaw = await kv.get(`outreach:settings:${tenantId}`);
      const settings: OutreachSettings = settingsRaw
        ? { ...DEFAULT_OUTREACH_SETTINGS, ...JSON.parse(settingsRaw) }
        : { ...DEFAULT_OUTREACH_SETTINGS };

      sendResult = await executeAutoSend(db, kv, tenantId, schedule, settings, uid, now);
    }

    // ── Update run record ──
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
           sent_count = ?6,
           skipped_count = ?7,
           review_count = ?8,
           chosen_area = ?9,
           selection_reason = ?10,
           summary_json = ?11,
           finished_at = ?12
         WHERE id = ?13 AND tenant_id = ?14`
      )
      .bind(
        summary.searched, summary.accepted, summary.imported,
        summary.drafted, summary.errors,
        sendResult.sentCount, sendResult.skippedCount, sendResult.reviewCount,
        chosenArea, selectionReason,
        JSON.stringify({
          ...summary,
          batchJobId: batchJob.id,
          sendStats: sendResult,
        }),
        finishedAt, runId, tenantId
      )
      .run();

    // Phase 19: Advance rotation index on success (optimistic lock via rotation_index match)
    if (advanceRotation && areas.length > 0) {
      const configuredAreas: string[] = JSON.parse(schedule.areas_json);
      const currentIdx = schedule.rotation_index ?? 0;
      const nextIdx = (currentIdx + 1) % configuredAreas.length;
      await db
        .prepare(
          `UPDATE outreach_schedules SET rotation_index = ?1, rotation_cursor_updated_at = ?2, last_executed_area = ?3, updated_at = ?4
           WHERE id = ?5 AND tenant_id = ?6 AND rotation_index = ?7`
        )
        .bind(nextIdx, finishedAt, chosenArea, finishedAt, schedule.id, tenantId, currentIdx)
        .run();
    }

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

// ── Phase 17: Auto Campaign Runner ──────────────────────────────────────
// Picks up new leads with score >= threshold, generates AI draft, sends automatically.

export interface AutoCampaignResult {
  processed: number;
  drafted: number;
  sent: number;
  skipped: number;
  errors: number;
}

/**
 * Run auto-campaign: find unsent new leads → generate AI message → send.
 * Called from cron every 5 minutes when autoCampaignEnabled=true.
 */
export async function runAutoCampaign(
  db: D1Database,
  kv: KVNamespace,
  tenantId: string,
  uid: UidFn,
  now: NowFn,
  env: { OPENAI_API_KEY?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string }
): Promise<AutoCampaignResult> {
  const result: AutoCampaignResult = { processed: 0, drafted: 0, sent: 0, skipped: 0, errors: 0 };

  // Load settings
  const settingsRaw = await kv.get(`outreach:settings:${tenantId}`);
  const settings: OutreachSettings = settingsRaw
    ? { ...DEFAULT_OUTREACH_SETTINGS, ...JSON.parse(settingsRaw) }
    : { ...DEFAULT_OUTREACH_SETTINGS };

  if (!settings.autoCampaignEnabled) return result;
  if (settings.autoCampaignPaused) {
    console.log(`[auto-campaign] Paused for tenant=${tenantId}: ${settings.pauseReason || "no reason"}`);
    return result;
  }

  const minScore = settings.autoCampaignMinScore ?? 60;

  // 1. Find new leads that haven't been contacted yet
  const leads = await db
    .prepare(
      `SELECT l.id, l.store_name, l.contact_email, l.industry, l.website_url,
              l.area, l.region, l.score, l.notes, l.instagram_url, l.line_url,
              l.has_booking_link, l.review_count, l.category
       FROM sales_leads l
       LEFT JOIN lead_message_drafts d ON d.lead_id = l.id AND d.tenant_id = l.tenant_id
       WHERE l.tenant_id = ?1
         AND l.pipeline_stage = 'new'
         AND l.contact_email IS NOT NULL
         AND l.contact_email != ''
         AND l.score >= ?2
         AND d.id IS NULL
       ORDER BY l.score DESC
       LIMIT 10`
    )
    .bind(tenantId, minScore)
    .all<{
      id: string; store_name: string; contact_email: string; industry: string | null;
      website_url: string | null; area: string | null; region: string | null;
      score: number; notes: string | null; instagram_url: string | null; line_url: string | null;
      has_booking_link: number | null; review_count: number | null; category: string | null;
    }>();

  if (!leads.results?.length) return result;

  // Load learning context for better AI messages
  let learningCtx: any = null;
  try {
    const { getLearningContext } = await import("./learning");
    learningCtx = await getLearningContext(db, tenantId);
  } catch { /* learning optional */ }

  const { generateOutreachMessage } = await import("./ai-generator");
  const sender = resolveProvider(settings.sendMode, {
    RESEND_API_KEY: env.RESEND_API_KEY,
    EMAIL_FROM: env.EMAIL_FROM,
  });

  for (const lead of leads.results) {
    result.processed++;

    // Rate limit check
    const rl = await checkRateLimit(kv, tenantId, {
      dailyCap: settings.dailyCap,
      perTenantPerHour: settings.hourlyCap,
    });
    if (!rl.allowed) { result.skipped++; break; } // Stop processing when rate limited

    // Unsubscribe check
    if (await isUnsubscribed(kv, tenantId, lead.id)) { result.skipped++; continue; }

    // Dedup: KV lock to prevent concurrent cron processing same lead
    const dedupKey = `outreach:campaign-lock:${tenantId}:${lead.id}`;
    const existing = await kv.get(dedupKey);
    if (existing) { result.skipped++; continue; }
    await kv.put(dedupKey, "1", { expirationTtl: 300 }); // 5min TTL

    const ts = now();

    try {
      // 2. Generate AI message
      const generated = await generateOutreachMessage(
        {
          id: lead.id,
          tenant_id: tenantId,
          store_name: lead.store_name,
          contact_email: lead.contact_email,
          industry: lead.industry || "",
          website_url: lead.website_url || "",
          area: lead.area || "",
          region: lead.region || "",
          score: lead.score,
          notes: lead.notes || "",
          instagram_url: lead.instagram_url || "",
          line_url: lead.line_url || "",
        } as any,
        { channel: "email", tone: "friendly" },
        { openaiApiKey: env.OPENAI_API_KEY },
        null, null, learningCtx
      );

      // Save draft as 'pending' first (update to 'sent' after successful send)
      const draftId = uid();
      await db
        .prepare(
          `INSERT INTO lead_message_drafts
           (id, lead_id, tenant_id, kind, subject, body, status, tone, created_at)
           VALUES (?1, ?2, ?3, 'email', ?4, ?5, 'pending', 'friendly', ?6)`
        )
        .bind(draftId, lead.id, tenantId, generated.subject, generated.body, ts)
        .run();
      result.drafted++;

      // 3. Send immediately
      const sendResult = await sender.send({
        leadId: lead.id,
        tenantId,
        channel: "email",
        to: lead.contact_email,
        subject: generated.subject,
        body: generated.body,
      });

      if (sendResult.success) {
        // Mark draft as 'sent' after successful send
        await db
          .prepare("UPDATE lead_message_drafts SET status = 'sent' WHERE id = ?1 AND tenant_id = ?2")
          .bind(draftId, tenantId)
          .run();

        // 4. Record delivery event
        await db
          .prepare(
            `INSERT INTO outreach_delivery_events
             (id, tenant_id, lead_id, message_id, channel, event_type, status, metadata_json, created_at)
             VALUES (?1, ?2, ?3, ?4, 'email', 'sent', 'sent', ?5, ?6)`
          )
          .bind(
            uid(), tenantId, lead.id, draftId,
            JSON.stringify({ provider: sendResult.provider, sendMode: settings.sendMode, source: "auto_campaign", messageId: sendResult.messageId }),
            ts
          )
          .run();

        // 5. Update pipeline stage
        await db
          .prepare(
            `UPDATE sales_leads SET pipeline_stage = 'contacted', last_contacted_at = ?1, updated_at = ?2
             WHERE id = ?3 AND tenant_id = ?4`
          )
          .bind(ts, ts, lead.id, tenantId)
          .run();

        await incrementRateLimit(kv, tenantId);
        await markSent(kv, tenantId, lead.id, draftId);

        // Schedule followups
        if (settings.followupDay3Enabled) {
          await db.prepare(
            `INSERT INTO outreach_followups (id, tenant_id, lead_id, step, scheduled_at, status, created_at)
             VALUES (?1, ?2, ?3, 'first_followup', ?4, 'scheduled', ?5)`
          ).bind(uid(), tenantId, lead.id, new Date(Date.now() + 3 * 86400000).toISOString(), ts).run();
        }
        if (settings.followupDay7Enabled) {
          await db.prepare(
            `INSERT INTO outreach_followups (id, tenant_id, lead_id, step, scheduled_at, status, created_at)
             VALUES (?1, ?2, ?3, 'second_followup', ?4, 'scheduled', ?5)`
          ).bind(uid(), tenantId, lead.id, new Date(Date.now() + 7 * 86400000).toISOString(), ts).run();
        }
        if (settings.followupDay14Enabled) {
          await db.prepare(
            `INSERT INTO outreach_followups (id, tenant_id, lead_id, step, scheduled_at, status, created_at)
             VALUES (?1, ?2, ?3, 'breakup', ?4, 'scheduled', ?5)`
          ).bind(uid(), tenantId, lead.id, new Date(Date.now() + 14 * 86400000).toISOString(), ts).run();
        }

        result.sent++;
      } else {
        // Mark draft as 'failed' so it can be retried
        await db
          .prepare("UPDATE lead_message_drafts SET status = 'failed' WHERE id = ?1 AND tenant_id = ?2")
          .bind(draftId, tenantId)
          .run();
        await trackSendAttempt(db, tenantId, lead.id, sendResult.error);
        result.skipped++;
      }
    } catch (err: any) {
      console.error(`[auto-campaign] Error processing lead ${lead.id}:`, err.message);
      result.errors++;
    }
  }

  return result;
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
