// Outreach OS — Auto Sales Copilot (Phase 12)
// ============================================================
// Rule-based recommendation engine: schedule health, review priority,
// source/niche/area suggestions, close-rate weighted learning.
// All recommendations are suggestions only — no auto-send.

import type { D1Database } from "@cloudflare/workers-types";
import type {
  OutreachSchedule,
  OutreachScheduleRun,
  PipelineStage,
} from "./types";

type UidFn = () => string;
type NowFn = () => string;

// ── Types ────────────────────────────────────────────────────────────────

export type RecommendationType =
  | "run_schedule_now"
  | "pause_schedule"
  | "raise_quality_threshold"
  | "lower_quality_threshold"
  | "expand_area"
  | "stop_area"
  | "try_new_niche"
  | "prioritize_review_queue"
  | "retry_high_quality_source"
  | "recommend_campaign";

export type RecommendationPriority = "high" | "medium" | "low";
export type RecommendationStatus = "open" | "accepted" | "dismissed" | "completed";

export interface CopilotRecommendation {
  id: string;
  tenant_id: string;
  recommendation_type: RecommendationType;
  title: string;
  summary: string;
  priority: RecommendationPriority;
  status: RecommendationStatus;
  payload_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleHealthScore {
  schedule_id: string;
  schedule_name: string;
  niche: string;
  health_score: number; // 0-100
  metrics: {
    run_count_7d: number;
    candidate_count_7d: number;
    imported_count_7d: number;
    drafted_count_7d: number;
    error_rate_7d: number;
    stale_days: number;
    reply_rate_30d: number;
    meeting_rate_30d: number;
    won_rate_30d: number;
    avg_quality_score_30d: number;
  };
}

export interface CopilotInsight {
  type: string;
  title: string;
  summary: string;
  metric_value: number | null;
  comparison: string | null;
}

export interface CopilotOverview {
  recommendations: CopilotRecommendation[];
  schedule_health: ScheduleHealthScore[];
  insights: CopilotInsight[];
  high_priority_review_count: number;
}

// ── Close-rate weighted composite score ──────────────────────────────────

/** Unified composite: reply 0.25 + meeting 0.35 + won 0.40 */
const W_REPLY = 0.25;
const W_MEETING = 0.35;
const W_WON = 0.40;

function compositeScore(replyRate: number, meetingRate: number, wonRate: number): number {
  return replyRate * W_REPLY + meetingRate * W_MEETING + wonRate * W_WON;
}

// ── Schedule Health Scoring ──────────────────────────────────────────────

export async function computeScheduleHealth(
  db: D1Database,
  tenantId: string
): Promise<ScheduleHealthScore[]> {
  const schedules = await db
    .prepare("SELECT * FROM outreach_schedules WHERE tenant_id = ?1")
    .bind(tenantId)
    .all<OutreachSchedule>();

  const results: ScheduleHealthScore[] = [];
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();

  for (const schedule of schedules.results ?? []) {
    // 7-day run stats
    const runs7d = await db
      .prepare(
        `SELECT COUNT(*) as run_count,
                COALESCE(SUM(searched_count), 0) as searched,
                COALESCE(SUM(imported_count), 0) as imported,
                COALESCE(SUM(drafted_count), 0) as drafted,
                COALESCE(SUM(error_count), 0) as errors
         FROM outreach_schedule_runs
         WHERE schedule_id = ?1 AND tenant_id = ?2 AND created_at >= ?3`
      )
      .bind(schedule.id, tenantId, d7)
      .first<{ run_count: number; searched: number; imported: number; drafted: number; errors: number }>();

    const runCount7d = runs7d?.run_count ?? 0;
    const searched7d = runs7d?.searched ?? 0;
    const imported7d = runs7d?.imported ?? 0;
    const drafted7d = runs7d?.drafted ?? 0;
    const errors7d = runs7d?.errors ?? 0;
    const errorRate7d = runCount7d > 0 ? errors7d / (searched7d || 1) : 0;

    // Stale days
    const staleDays = schedule.last_run_at
      ? Math.floor((now.getTime() - new Date(schedule.last_run_at).getTime()) / 86400000)
      : 999;

    // 30-day lead outcome stats (join schedule runs → batch jobs → leads)
    const areas: string[] = JSON.parse(schedule.areas_json || "[]");
    const leadStats30d = await db
      .prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied,
                SUM(CASE WHEN pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings,
                SUM(CASE WHEN pipeline_stage = 'customer' THEN 1 ELSE 0 END) as won,
                AVG(score) as avg_score
         FROM sales_leads
         WHERE tenant_id = ?1 AND category = ?2 AND imported_at >= ?3
           AND status != 'unsubscribed'`
      )
      .bind(tenantId, schedule.niche, d30)
      .first<{ total: number; replied: number; meetings: number; won: number; avg_score: number | null }>();

    const total30d = leadStats30d?.total ?? 0;
    const replyRate30d = total30d > 0 ? (leadStats30d?.replied ?? 0) / total30d : 0;
    const meetingRate30d = total30d > 0 ? (leadStats30d?.meetings ?? 0) / total30d : 0;
    const wonRate30d = total30d > 0 ? (leadStats30d?.won ?? 0) / total30d : 0;
    const avgQuality30d = leadStats30d?.avg_score ?? 0;

    // Compute health score 0-100
    let health = 50; // baseline

    // Activity bonus (+20 max)
    if (runCount7d >= 5) health += 20;
    else if (runCount7d >= 3) health += 15;
    else if (runCount7d >= 1) health += 10;
    else health -= 10;

    // Import productivity (+15 max)
    if (imported7d >= 10) health += 15;
    else if (imported7d >= 5) health += 10;
    else if (imported7d >= 1) health += 5;
    else if (runCount7d > 0) health -= 5;

    // Outcome bonus (+20 max, close-rate weighted)
    const comp = compositeScore(replyRate30d, meetingRate30d, wonRate30d);
    if (comp >= 0.15) health += 20;
    else if (comp >= 0.08) health += 15;
    else if (comp >= 0.03) health += 10;
    else if (total30d >= 5) health -= 5;

    // Error penalty (-15 max)
    if (errorRate7d >= 0.5) health -= 15;
    else if (errorRate7d >= 0.2) health -= 10;
    else if (errorRate7d >= 0.1) health -= 5;

    // Stale penalty (-15 max)
    if (staleDays >= 14) health -= 15;
    else if (staleDays >= 7) health -= 10;
    else if (staleDays >= 3 && schedule.enabled) health -= 5;

    health = Math.max(0, Math.min(100, health));

    results.push({
      schedule_id: schedule.id,
      schedule_name: schedule.name,
      niche: schedule.niche,
      health_score: health,
      metrics: {
        run_count_7d: runCount7d,
        candidate_count_7d: searched7d,
        imported_count_7d: imported7d,
        drafted_count_7d: drafted7d,
        error_rate_7d: Math.round(errorRate7d * 100) / 100,
        stale_days: staleDays,
        reply_rate_30d: Math.round(replyRate30d * 1000) / 1000,
        meeting_rate_30d: Math.round(meetingRate30d * 1000) / 1000,
        won_rate_30d: Math.round(wonRate30d * 1000) / 1000,
        avg_quality_score_30d: Math.round((avgQuality30d ?? 0) * 100) / 100,
      },
    });
  }

  return results;
}

// ── Review Priority Scoring ──────────────────────────────────────────────

export async function computeReviewPriorities(
  db: D1Database,
  tenantId: string
): Promise<number> {
  // Get pending review messages with lead data
  const messages = await db
    .prepare(
      `SELECT m.id as msg_id, m.lead_id,
              l.score, l.pipeline_stage, l.category, l.area, l.source_type, l.rating, l.review_count
       FROM lead_message_drafts m
       JOIN sales_leads l ON m.lead_id = l.id AND l.tenant_id = ?1
       WHERE m.tenant_id = ?1 AND m.status = 'pending_review'`
    )
    .bind(tenantId)
    .all<{
      msg_id: string; lead_id: string; score: number | null;
      pipeline_stage: PipelineStage; category: string | null; area: string | null;
      source_type: string | null; rating: number | null; review_count: number;
    }>();

  if (!messages.results?.length) return 0;

  // Get source performance data for weighting
  const sourcePerf = await db
    .prepare(
      `SELECT source_type, category,
              COUNT(*) as total,
              SUM(CASE WHEN pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied,
              SUM(CASE WHEN pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings,
              SUM(CASE WHEN pipeline_stage = 'customer' THEN 1 ELSE 0 END) as won
       FROM sales_leads WHERE tenant_id = ?1 AND source_type IS NOT NULL
       GROUP BY source_type, category`
    )
    .bind(tenantId)
    .all<{ source_type: string; category: string; total: number; replied: number; meetings: number; won: number }>();

  const perfMap = new Map<string, number>();
  for (const row of sourcePerf.results ?? []) {
    if (row.total >= 3) {
      const comp = compositeScore(row.replied / row.total, row.meetings / row.total, row.won / row.total);
      perfMap.set(`${row.source_type}|${row.category}`, comp);
    }
  }

  let highPriorityCount = 0;
  const updates: Array<{ id: string; score: number }> = [];

  for (const msg of messages.results) {
    let priority = 0;

    // Lead score component (0-30)
    const leadScore = msg.score ?? 0;
    priority += Math.min(30, leadScore * 30 / 100);

    // Source performance component (0-30, close-rate weighted)
    const perfKey = `${msg.source_type}|${msg.category}`;
    const sourceComp = perfMap.get(perfKey) ?? 0;
    priority += Math.min(30, sourceComp * 200); // 0.15 comp → 30 points

    // Rating/review signal (0-15)
    if (msg.rating && msg.rating >= 4.0) priority += 10;
    else if (msg.rating && msg.rating >= 3.0) priority += 5;
    if (msg.review_count >= 20) priority += 5;

    // Recency bonus (0-10): new leads get a boost
    if (msg.pipeline_stage === "new" || msg.pipeline_stage === "approved") priority += 10;

    // Quality baseline (0-15)
    const qualityV2 = await db
      .prepare(
        "SELECT quality_score_v2 FROM outreach_source_candidates WHERE tenant_id = ?1 AND store_name = (SELECT store_name FROM sales_leads WHERE id = ?2 AND tenant_id = ?1) LIMIT 1"
      )
      .bind(tenantId, msg.lead_id)
      .first<{ quality_score_v2: number | null }>();
    if (qualityV2?.quality_score_v2) {
      priority += Math.min(15, qualityV2.quality_score_v2 * 15);
    }

    priority = Math.round(Math.max(0, Math.min(100, priority)) * 10) / 10;
    updates.push({ id: msg.msg_id, score: priority });
    if (priority >= 60) highPriorityCount++;
  }

  // Batch update review_priority_score
  for (const u of updates) {
    await db
      .prepare("UPDATE lead_message_drafts SET review_priority_score = ?1 WHERE id = ?2 AND tenant_id = ?3")
      .bind(u.score, u.id, tenantId)
      .run();
  }

  return highPriorityCount;
}

// ── Recommendation Generation ────────────────────────────────────────────

export async function generateRecommendations(
  db: D1Database,
  tenantId: string,
  uid: UidFn,
  now: NowFn
): Promise<CopilotRecommendation[]> {
  const ts = now();
  const recommendations: Array<Omit<CopilotRecommendation, "id" | "created_at" | "updated_at">> = [];

  // Clear old open recommendations (replace with fresh ones)
  await db
    .prepare("DELETE FROM outreach_copilot_recommendations WHERE tenant_id = ?1 AND status = 'open'")
    .bind(tenantId)
    .run();

  // ── Schedule-based recommendations ──

  const scheduleHealth = await computeScheduleHealth(db, tenantId);

  for (const sh of scheduleHealth) {
    const m = sh.metrics;

    // Stale schedule → run now
    if (sh.health_score >= 40 && m.stale_days >= 3 && m.stale_days < 14) {
      recommendations.push({
        tenant_id: tenantId,
        recommendation_type: "run_schedule_now",
        title: `${sh.schedule_name} を即時実行`,
        summary: `${m.stale_days}日間実行なし。直近30日の成約率 ${(m.won_rate_30d * 100).toFixed(1)}% — 今すぐ実行して候補を補充しましょう。`,
        priority: m.won_rate_30d > 0.05 ? "high" : "medium",
        status: "open",
        payload_json: JSON.stringify({ schedule_id: sh.schedule_id, stale_days: m.stale_days, won_rate_30d: m.won_rate_30d }),
      });
    }

    // Very unhealthy → pause
    if (sh.health_score < 30) {
      recommendations.push({
        tenant_id: tenantId,
        recommendation_type: "pause_schedule",
        title: `${sh.schedule_name} の一時停止を推奨`,
        summary: `健全性スコア ${sh.health_score}/100。エラー率 ${(m.error_rate_7d * 100).toFixed(0)}%、直近7日のインポート ${m.imported_count_7d}件。効率が低いため一時停止を検討してください。`,
        priority: "high",
        status: "open",
        payload_json: JSON.stringify({ schedule_id: sh.schedule_id, health_score: sh.health_score, error_rate_7d: m.error_rate_7d }),
      });
    }

    // High error rate → pause
    if (m.error_rate_7d >= 0.3 && m.run_count_7d >= 2) {
      recommendations.push({
        tenant_id: tenantId,
        recommendation_type: "pause_schedule",
        title: `${sh.schedule_name} のエラー率が高い`,
        summary: `直近7日でエラー率 ${(m.error_rate_7d * 100).toFixed(0)}%。API設定やソース先を確認してください。`,
        priority: "high",
        status: "open",
        payload_json: JSON.stringify({ schedule_id: sh.schedule_id, error_rate_7d: m.error_rate_7d }),
      });
    }

    // Low quality → raise threshold
    if (m.avg_quality_score_30d > 0 && m.avg_quality_score_30d < 30 && m.imported_count_7d >= 5) {
      recommendations.push({
        tenant_id: tenantId,
        recommendation_type: "raise_quality_threshold",
        title: `${sh.schedule_name} の品質閾値を上げる`,
        summary: `平均品質スコア ${m.avg_quality_score_30d.toFixed(0)}点。閾値を上げることで高品質候補のみを取り込めます。`,
        priority: "medium",
        status: "open",
        payload_json: JSON.stringify({ schedule_id: sh.schedule_id, avg_quality: m.avg_quality_score_30d }),
      });
    }

    // High won rate → lower threshold to get more candidates
    if (m.won_rate_30d >= 0.1 && m.imported_count_7d < 5) {
      recommendations.push({
        tenant_id: tenantId,
        recommendation_type: "lower_quality_threshold",
        title: `${sh.schedule_name} の品質閾値を下げて候補を増やす`,
        summary: `成約率 ${(m.won_rate_30d * 100).toFixed(1)}% と好調ですが、インポートが ${m.imported_count_7d}件と少なめ。閾値を下げて候補を増やしましょう。`,
        priority: "medium",
        status: "open",
        payload_json: JSON.stringify({ schedule_id: sh.schedule_id, won_rate_30d: m.won_rate_30d, imported_7d: m.imported_count_7d }),
      });
    }
  }

  // ── Source / Niche / Area recommendations ──

  const sourcePerf = await db
    .prepare(
      `SELECT source_type, category as niche, area,
              COUNT(*) as total,
              SUM(CASE WHEN pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied,
              SUM(CASE WHEN pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings,
              SUM(CASE WHEN pipeline_stage = 'customer' THEN 1 ELSE 0 END) as won
       FROM sales_leads
       WHERE tenant_id = ?1 AND source_type IS NOT NULL AND category IS NOT NULL
       GROUP BY source_type, category, area
       HAVING total >= 3
       ORDER BY total DESC
       LIMIT 50`
    )
    .bind(tenantId)
    .all<{ source_type: string; niche: string; area: string | null; total: number; replied: number; meetings: number; won: number }>();

  let bestComposite = 0;
  let bestEntry: typeof sourcePerf.results extends (infer T)[] | undefined ? T | null : null = null;
  let worstEntry: typeof bestEntry = null;
  let worstComposite = Infinity;

  for (const row of sourcePerf.results ?? []) {
    const comp = compositeScore(row.replied / row.total, row.meetings / row.total, row.won / row.total);
    if (comp > bestComposite) {
      bestComposite = comp;
      bestEntry = row;
    }
    if (comp < worstComposite && row.total >= 5) {
      worstComposite = comp;
      worstEntry = row;
    }
  }

  if (bestEntry && bestComposite > 0.05) {
    const areaLabel = bestEntry.area ? ` × ${bestEntry.area}` : "";
    recommendations.push({
      tenant_id: tenantId,
      recommendation_type: "recommend_campaign",
      title: `${bestEntry.niche}${areaLabel} が最も成果が高い`,
      summary: `${bestEntry.source_type} 経由 ${bestEntry.niche}${areaLabel}: 成約 ${bestEntry.won}件 / ${bestEntry.total}件 (composite ${(bestComposite * 100).toFixed(1)}%)。このセグメントにキャンペーンを集中しましょう。`,
      priority: "high",
      status: "open",
      payload_json: JSON.stringify({ source_type: bestEntry.source_type, niche: bestEntry.niche, area: bestEntry.area, composite: bestComposite }),
    });
  }

  if (worstEntry && worstComposite < 0.02 && worstEntry !== bestEntry) {
    const areaLabel = worstEntry.area ? ` × ${worstEntry.area}` : "";
    recommendations.push({
      tenant_id: tenantId,
      recommendation_type: "stop_area",
      title: `${worstEntry.niche}${areaLabel} の優先度を下げる`,
      summary: `${worstEntry.total}件中 成約 ${worstEntry.won}件 (composite ${(worstComposite * 100).toFixed(1)}%)。このセグメントのリソースを高成果エリアに振り替えましょう。`,
      priority: "medium",
      status: "open",
      payload_json: JSON.stringify({ source_type: worstEntry.source_type, niche: worstEntry.niche, area: worstEntry.area, composite: worstComposite }),
    });
  }

  // ── Review queue recommendation ──

  const pendingReviewCount = await db
    .prepare("SELECT COUNT(*) as cnt FROM lead_message_drafts WHERE tenant_id = ?1 AND status = 'pending_review'")
    .bind(tenantId)
    .first<{ cnt: number }>();

  if ((pendingReviewCount?.cnt ?? 0) >= 5) {
    const highCount = await computeReviewPriorities(db, tenantId);
    if (highCount > 0) {
      recommendations.push({
        tenant_id: tenantId,
        recommendation_type: "prioritize_review_queue",
        title: `レビューキューに高優先候補 ${highCount}件`,
        summary: `${pendingReviewCount?.cnt ?? 0}件の未レビュードラフトのうち ${highCount}件が高優先度。成約率の高いソースからの候補を先に確認しましょう。`,
        priority: highCount >= 5 ? "high" : "medium",
        status: "open",
        payload_json: JSON.stringify({ total_pending: pendingReviewCount?.cnt, high_priority: highCount }),
      });
    }
  }

  // ── Persist recommendations ──

  const saved: CopilotRecommendation[] = [];
  for (const rec of recommendations) {
    const id = uid();
    await db
      .prepare(
        `INSERT INTO outreach_copilot_recommendations
         (id, tenant_id, recommendation_type, title, summary, priority, status, payload_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
      )
      .bind(id, tenantId, rec.recommendation_type, rec.title, rec.summary, rec.priority, rec.status, rec.payload_json ?? null, ts, ts)
      .run();
    saved.push({ ...rec, id, created_at: ts, updated_at: ts } as CopilotRecommendation);
  }

  return saved;
}

// ── Copilot Insights for Analytics ───────────────────────────────────────

export async function getCopilotInsights(
  db: D1Database,
  tenantId: string
): Promise<CopilotInsight[]> {
  const insights: CopilotInsight[] = [];
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString();

  // Best performing source
  const bestSource = await db
    .prepare(
      `SELECT source_type, category as niche, area,
              COUNT(*) as total,
              SUM(CASE WHEN pipeline_stage = 'customer' THEN 1 ELSE 0 END) as won
       FROM sales_leads
       WHERE tenant_id = ?1 AND source_type IS NOT NULL AND imported_at >= ?2
       GROUP BY source_type, category, area
       HAVING total >= 3
       ORDER BY (CAST(won AS REAL) / total) DESC
       LIMIT 1`
    )
    .bind(tenantId, d30)
    .first<{ source_type: string; niche: string; area: string | null; total: number; won: number }>();

  if (bestSource) {
    const wonRate = bestSource.won / bestSource.total;
    insights.push({
      type: "best_source",
      title: "最も成約率が高いソース",
      summary: `${bestSource.source_type} × ${bestSource.niche}${bestSource.area ? ` × ${bestSource.area}` : ""}: 成約率 ${(wonRate * 100).toFixed(1)}% (${bestSource.won}/${bestSource.total}件)`,
      metric_value: wonRate,
      comparison: null,
    });
  }

  // Underused high-quality source
  const underused = await db
    .prepare(
      `SELECT source_type, category as niche, area,
              AVG(quality_score) as avg_q,
              COUNT(*) as candidate_count,
              SUM(CASE WHEN import_status = 'imported' THEN 1 ELSE 0 END) as imported
       FROM outreach_source_candidates
       WHERE tenant_id = ?1 AND created_at >= ?2 AND quality_score IS NOT NULL
       GROUP BY source_type, category, area
       HAVING avg_q >= 0.6 AND candidate_count >= 5 AND imported < candidate_count * 0.3
       ORDER BY avg_q DESC
       LIMIT 1`
    )
    .bind(tenantId, d30)
    .first<{ source_type: string; niche: string; area: string | null; avg_q: number; candidate_count: number; imported: number }>();

  if (underused) {
    insights.push({
      type: "underused_source",
      title: "高品質だが活用不足のソース",
      summary: `${underused.source_type} × ${underused.niche}${underused.area ? ` × ${underused.area}` : ""}: 平均品質 ${(underused.avg_q * 100).toFixed(0)}点、${underused.candidate_count}件中 ${underused.imported}件のみインポート済み`,
      metric_value: underused.avg_q,
      comparison: `${underused.candidate_count - underused.imported}件が未インポート`,
    });
  }

  // Schedule needing attention
  const scheduleHealth = await computeScheduleHealth(db, tenantId);
  const unhealthy = scheduleHealth.filter(s => s.health_score < 40);
  const healthy = scheduleHealth.filter(s => s.health_score >= 70);

  if (unhealthy.length > 0) {
    insights.push({
      type: "unhealthy_schedules",
      title: "注意が必要なスケジュール",
      summary: `${unhealthy.length}件のスケジュールが低健全性 (${unhealthy.map(s => `${s.schedule_name}: ${s.health_score}点`).join(", ")})`,
      metric_value: unhealthy.length,
      comparison: `全${scheduleHealth.length}件中`,
    });
  }

  if (healthy.length > 0) {
    const best = healthy.sort((a, b) => b.health_score - a.health_score)[0];
    insights.push({
      type: "top_schedule",
      title: "最も健全なスケジュール",
      summary: `${best.schedule_name}: 健全性 ${best.health_score}点、成約率 ${(best.metrics.won_rate_30d * 100).toFixed(1)}%`,
      metric_value: best.health_score,
      comparison: null,
    });
  }

  // High priority review items
  const highPri = await db
    .prepare(
      "SELECT COUNT(*) as cnt FROM lead_message_drafts WHERE tenant_id = ?1 AND status = 'pending_review' AND review_priority_score >= 60"
    )
    .bind(tenantId)
    .first<{ cnt: number }>();

  if ((highPri?.cnt ?? 0) > 0) {
    insights.push({
      type: "high_priority_reviews",
      title: "高優先レビュー候補",
      summary: `${highPri?.cnt}件の高優先ドラフトがレビュー待ちです`,
      metric_value: highPri?.cnt ?? 0,
      comparison: null,
    });
  }

  // Overall conversion funnel insight
  const funnel = await db
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN pipeline_stage = 'contacted' THEN 1 ELSE 0 END) as contacted,
              SUM(CASE WHEN pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied,
              SUM(CASE WHEN pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings,
              SUM(CASE WHEN pipeline_stage = 'customer' THEN 1 ELSE 0 END) as won
       FROM sales_leads WHERE tenant_id = ?1 AND imported_at >= ?2`
    )
    .bind(tenantId, d30)
    .first<{ total: number; contacted: number; replied: number; meetings: number; won: number }>();

  if (funnel && funnel.total >= 5) {
    const convRate = funnel.won / funnel.total;
    insights.push({
      type: "conversion_funnel",
      title: "30日間コンバージョン",
      summary: `${funnel.total}件 → 返信 ${funnel.replied}件 → 商談 ${funnel.meetings}件 → 成約 ${funnel.won}件 (成約率 ${(convRate * 100).toFixed(1)}%)`,
      metric_value: convRate,
      comparison: null,
    });
  }

  return insights;
}

// ── Dashboard Overview ───────────────────────────────────────────────────

export async function getCopilotOverview(
  db: D1Database,
  tenantId: string
): Promise<CopilotOverview> {
  // Get top 3 open recommendations
  const recs = await db
    .prepare(
      `SELECT * FROM outreach_copilot_recommendations
       WHERE tenant_id = ?1 AND status = 'open'
       ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC
       LIMIT 3`
    )
    .bind(tenantId)
    .all<CopilotRecommendation>();

  const scheduleHealth = await computeScheduleHealth(db, tenantId);
  const insights = await getCopilotInsights(db, tenantId);

  const highPriCount = await db
    .prepare(
      "SELECT COUNT(*) as cnt FROM lead_message_drafts WHERE tenant_id = ?1 AND status = 'pending_review' AND review_priority_score >= 60"
    )
    .bind(tenantId)
    .first<{ cnt: number }>();

  return {
    recommendations: recs.results ?? [],
    schedule_health: scheduleHealth,
    insights,
    high_priority_review_count: highPriCount?.cnt ?? 0,
  };
}

// ── Accept / Dismiss ─────────────────────────────────────────────────────

export async function acceptRecommendation(
  db: D1Database,
  tenantId: string,
  recId: string,
  now: NowFn
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE outreach_copilot_recommendations SET status = 'accepted', updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3 AND status = 'open'")
    .bind(now(), recId, tenantId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function dismissRecommendation(
  db: D1Database,
  tenantId: string,
  recId: string,
  now: NowFn
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE outreach_copilot_recommendations SET status = 'dismissed', updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3 AND status = 'open'")
    .bind(now(), recId, tenantId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}
