// Outreach OS — Candidate Quality Learning (Phase 8.3)
// ============================================================
// Learn quality lift from actual lead outcomes.
// Feature-based quality adjustment: base_score + lift = v2_score.

import type { D1Database } from "@cloudflare/workers-types";
import type { OutreachSourceCandidate } from "./types";
import { computeCandidateQualityScore } from "./source-quality";

// ── Types ────────────────────────────────────────────────────────────────

export interface QualityPattern {
  id: string;
  tenant_id: string;
  source_type: string | null;
  source_key: string | null;
  niche: string | null;
  area: string | null;
  feature_key: string;
  feature_value: string;
  sample_size: number;
  reply_rate: number;
  meeting_rate: number;
  won_rate: number;
  quality_lift: number;
  created_at: string;
  updated_at: string;
}

export interface LearnedQualityScore {
  base: number;
  lift: number;
  final: number;
  level: "high" | "medium" | "low";
  patterns_applied: number;
}

export interface LearnedInsight {
  feature_key: string;
  feature_value: string;
  quality_lift: number;
  sample_size: number;
  reply_rate: number;
  meeting_rate: number;
}

export interface LearnedInsightsResult {
  positive_signals: LearnedInsight[];
  negative_signals: LearnedInsight[];
  avg_base_score: number;
  avg_lift: number;
  avg_final_score: number;
  total_sample_size: number;
}

// ── Feature Extraction ──────────────────────────────────────────────────

const FEATURE_KEYS = [
  "has_website",
  "has_contact",
  "has_email",
  "has_phone",
  "has_rating",
  "has_reviews",
  "category_present",
  "area_present",
  "domain_present",
] as const;

/**
 * Extract boolean features from a candidate for pattern matching.
 */
export function extractCandidateFeatures(
  candidate: Pick<OutreachSourceCandidate,
    "website_url" | "email" | "phone" | "category" | "area" | "rating" | "review_count" | "normalized_domain">
): Array<{ key: string; value: string }> {
  return [
    { key: "has_website", value: candidate.website_url ? "true" : "false" },
    { key: "has_contact", value: (candidate.email || candidate.phone) ? "true" : "false" },
    { key: "has_email", value: candidate.email ? "true" : "false" },
    { key: "has_phone", value: candidate.phone ? "true" : "false" },
    { key: "has_rating", value: (candidate.rating != null && candidate.rating >= 3.0) ? "true" : "false" },
    { key: "has_reviews", value: (candidate.review_count != null && candidate.review_count >= 5) ? "true" : "false" },
    { key: "category_present", value: candidate.category ? "true" : "false" },
    { key: "area_present", value: candidate.area ? "true" : "false" },
    { key: "domain_present", value: candidate.normalized_domain ? "true" : "false" },
  ];
}

// ── Lift Computation ────────────────────────────────────────────────────

const MIN_SAMPLE_SIZE = 3;
const LIFT_DAMPENING_THRESHOLD = 10;

/**
 * Compute quality_lift from reply/meeting/won rates.
 * Composite: reply_rate * 0.3 + meeting_rate * 0.4 + won_rate * 0.3
 * Centered around 0 (baseline = average composite across all features).
 */
function computeLift(replyRate: number, meetingRate: number, wonRate: number, sampleSize: number): number {
  const composite = replyRate * 0.3 + meetingRate * 0.4 + wonRate * 0.3;
  // Scale to a small lift range (-0.2 to +0.2)
  const rawLift = (composite - 0.5) * 0.4;
  // Dampen if sample is small
  const dampening = sampleSize >= LIFT_DAMPENING_THRESHOLD ? 1.0 : sampleSize / LIFT_DAMPENING_THRESHOLD;
  return Math.round(rawLift * dampening * 100) / 100;
}

// ── Learning: Aggregate from Imported Leads ─────────────────────────────

/**
 * Refresh quality patterns from actual lead outcomes.
 * Groups imported candidates by features, looks up lead outcomes.
 */
export async function refreshQualityPatterns(
  db: D1Database,
  uid: () => string,
  now: () => string,
  tenantId: string
): Promise<{ updated: number; deleted: number }> {
  // Get all imported candidates with their lead outcomes
  const rows = await db
    .prepare(`
      SELECT
        c.id as cand_id, c.tenant_id, c.source_type, c.source_key,
        c.category as niche, c.area,
        c.website_url, c.email, c.phone, c.rating, c.review_count,
        c.normalized_domain, c.category,
        sl.pipeline_stage
      FROM outreach_source_candidates c
      JOIN sales_leads sl ON sl.source_ref = c.id AND sl.tenant_id = c.tenant_id
      WHERE c.tenant_id = ?1 AND c.import_status = 'imported'
      LIMIT 1000
    `)
    .bind(tenantId)
    .all<{
      cand_id: string; tenant_id: string; source_type: string; source_key: string | null;
      niche: string | null; area: string | null;
      website_url: string | null; email: string | null; phone: string | null;
      rating: number | null; review_count: number | null; normalized_domain: string | null;
      category: string | null; pipeline_stage: string;
    }>();

  if (!rows.results?.length) return { updated: 0, deleted: 0 };

  // Aggregate by feature
  const featureStats = new Map<string, {
    count: number; replied: number; meetings: number; won: number;
  }>();

  for (const row of rows.results) {
    const features = extractCandidateFeatures({
      website_url: row.website_url,
      email: row.email,
      phone: row.phone,
      category: row.category,
      area: row.area,
      rating: row.rating,
      review_count: row.review_count ?? 0,
      normalized_domain: row.normalized_domain,
    });

    const isReplied = ["replied", "meeting", "customer"].includes(row.pipeline_stage);
    const isMeeting = ["meeting", "customer"].includes(row.pipeline_stage);
    const isWon = row.pipeline_stage === "customer";

    for (const f of features) {
      const key = `${f.key}|${f.value}`;
      const stats = featureStats.get(key) ?? { count: 0, replied: 0, meetings: 0, won: 0 };
      stats.count++;
      if (isReplied) stats.replied++;
      if (isMeeting) stats.meetings++;
      if (isWon) stats.won++;
      featureStats.set(key, stats);
    }
  }

  // Delete old patterns for tenant
  await db
    .prepare("DELETE FROM outreach_candidate_quality_patterns WHERE tenant_id = ?1")
    .bind(tenantId)
    .run();
  let deleted = 1; // count the DELETE as 1 operation

  // Insert new patterns
  let updated = 0;
  for (const [key, stats] of featureStats) {
    if (stats.count < MIN_SAMPLE_SIZE) continue;

    const [featureKey, featureValue] = key.split("|");
    const replyRate = Math.round((stats.replied / stats.count) * 10000) / 10000;
    const meetingRate = Math.round((stats.meetings / stats.count) * 10000) / 10000;
    const wonRate = Math.round((stats.won / stats.count) * 10000) / 10000;
    const lift = computeLift(replyRate, meetingRate, wonRate, stats.count);

    const ts = now();
    await db
      .prepare(`
        INSERT INTO outreach_candidate_quality_patterns
          (id, tenant_id, source_type, source_key, niche, area,
           feature_key, feature_value, sample_size, reply_rate, meeting_rate, won_rate,
           quality_lift, created_at, updated_at)
        VALUES (?1, ?2, NULL, NULL, NULL, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
      `)
      .bind(
        uid(), tenantId, featureKey, featureValue, stats.count,
        replyRate, meetingRate, wonRate, lift, ts, ts
      )
      .run();
    updated++;
  }

  return { updated, deleted };
}

// ── V2 Quality Score ────────────────────────────────────────────────────

/**
 * Compute learned quality score for a candidate.
 * V2 = clamp(base + avg_lift, 0, 1)
 */
export async function computeLearnedQualityScore(
  db: D1Database,
  tenantId: string,
  candidate: Pick<OutreachSourceCandidate,
    "website_url" | "email" | "phone" | "import_status" | "category" | "area" | "rating" | "review_count" | "normalized_domain">
): Promise<LearnedQualityScore> {
  const base = computeCandidateQualityScore(candidate);

  // Load learned patterns for this tenant
  const patterns = await db
    .prepare("SELECT * FROM outreach_candidate_quality_patterns WHERE tenant_id = ?1")
    .bind(tenantId)
    .all<QualityPattern>();

  const patternMap = new Map<string, QualityPattern>();
  for (const p of patterns.results ?? []) {
    patternMap.set(`${p.feature_key}|${p.feature_value}`, p);
  }

  // Match candidate features to patterns
  const features = extractCandidateFeatures(candidate);
  let totalLift = 0;
  let patternsApplied = 0;

  for (const f of features) {
    const pattern = patternMap.get(`${f.key}|${f.value}`);
    if (pattern && pattern.sample_size >= MIN_SAMPLE_SIZE) {
      totalLift += pattern.quality_lift;
      patternsApplied++;
    }
  }

  // Average the lift across applied patterns
  const avgLift = patternsApplied > 0
    ? Math.round((totalLift / patternsApplied) * 100) / 100
    : 0;

  const final = Math.max(0, Math.min(1, Math.round((base + avgLift) * 100) / 100));
  const level: LearnedQualityScore["level"] =
    final >= 0.8 ? "high" : final >= 0.4 ? "medium" : "low";

  return { base, lift: avgLift, final, level, patterns_applied: patternsApplied };
}

// ── Backfill V2 Scores ──────────────────────────────────────────────────

/**
 * Backfill quality_score_v2 for candidates that don't have one yet.
 */
export async function backfillQualityV2(
  db: D1Database,
  tenantId: string,
  runId?: string
): Promise<{ updated: number; skipped: number }> {
  let query = `SELECT * FROM outreach_source_candidates
    WHERE tenant_id = ?1 AND quality_score_v2 IS NULL`;
  const binds: any[] = [tenantId];

  if (runId) {
    query += " AND run_id = ?2";
    binds.push(runId);
  }
  query += " LIMIT 200";

  const rows = await db.prepare(query).bind(...binds).all<OutreachSourceCandidate>();
  let updated = 0;
  let skipped = 0;

  for (const c of rows.results ?? []) {
    try {
      const score = await computeLearnedQualityScore(db, tenantId, c);
      await db
        .prepare(`UPDATE outreach_source_candidates
          SET quality_score_base = ?1, quality_score_lift = ?2, quality_score_v2 = ?3, updated_at = ?4
          WHERE id = ?5 AND tenant_id = ?6`)
        .bind(score.base, score.lift, score.final, new Date().toISOString(), c.id, tenantId)
        .run();
      updated++;
    } catch {
      skipped++;
    }
  }

  return { updated, skipped };
}

// ── Learned Insights ────────────────────────────────────────────────────

/**
 * Get learned quality insights for analytics display.
 */
export async function getLearnedQualityInsights(
  db: D1Database,
  tenantId: string
): Promise<LearnedInsightsResult> {
  const patterns = await db
    .prepare(`SELECT * FROM outreach_candidate_quality_patterns
      WHERE tenant_id = ?1 ORDER BY quality_lift DESC`)
    .bind(tenantId)
    .all<QualityPattern>();

  const rows = patterns.results ?? [];

  const positive = rows
    .filter((r) => r.quality_lift > 0 && r.sample_size >= MIN_SAMPLE_SIZE)
    .slice(0, 10)
    .map((r) => ({
      feature_key: r.feature_key,
      feature_value: r.feature_value,
      quality_lift: r.quality_lift,
      sample_size: r.sample_size,
      reply_rate: r.reply_rate,
      meeting_rate: r.meeting_rate,
    }));

  const negative = rows
    .filter((r) => r.quality_lift < 0 && r.sample_size >= MIN_SAMPLE_SIZE)
    .sort((a, b) => a.quality_lift - b.quality_lift)
    .slice(0, 10)
    .map((r) => ({
      feature_key: r.feature_key,
      feature_value: r.feature_value,
      quality_lift: r.quality_lift,
      sample_size: r.sample_size,
      reply_rate: r.reply_rate,
      meeting_rate: r.meeting_rate,
    }));

  // Avg scores from candidates with v2
  const avgRow = await db
    .prepare(`
      SELECT
        AVG(quality_score_base) as avg_base,
        AVG(quality_score_lift) as avg_lift,
        AVG(quality_score_v2) as avg_final,
        COUNT(*) as total
      FROM outreach_source_candidates
      WHERE tenant_id = ?1 AND quality_score_v2 IS NOT NULL
    `)
    .bind(tenantId)
    .first<{ avg_base: number | null; avg_lift: number | null; avg_final: number | null; total: number }>();

  return {
    positive_signals: positive,
    negative_signals: negative,
    avg_base_score: Math.round((avgRow?.avg_base ?? 0) * 100) / 100,
    avg_lift: Math.round((avgRow?.avg_lift ?? 0) * 100) / 100,
    avg_final_score: Math.round((avgRow?.avg_final ?? 0) * 100) / 100,
    total_sample_size: avgRow?.total ?? 0,
  };
}
