// Outreach OS — Source Quality Service (Phase 8.1)
// ============================================================
// Rule-based quality scoring for source candidates.
// Aggregation of source-level performance metrics.
// Designed for future Phase 8.2 (auto-prospecting) extension.

import type { D1Database } from "@cloudflare/workers-types";
import type { OutreachSourceCandidate } from "./types";

// ── Quality Score Calculation ────────────────────────────────────────────

/**
 * Rule-based quality score (0.0 – 1.0) for a source candidate.
 * Uses available fields — graceful when data is sparse.
 *
 * Components (each 0.0 or 0.2, max 1.0):
 *  +0.2  website_url present
 *  +0.2  contact info (email OR phone)
 *  +0.2  not a duplicate (import_status != 'duplicate')
 *  +0.2  data completeness (category + area both present)
 *  +0.2  rating signal (rating >= 3.0 OR review_count >= 5)
 */
export function computeCandidateQualityScore(
  candidate: Pick<
    OutreachSourceCandidate,
    "website_url" | "email" | "phone" | "import_status" | "category" | "area" | "rating" | "review_count"
  >
): number {
  let score = 0;

  // 1. Has website
  if (candidate.website_url) score += 0.2;

  // 2. Has contact method
  if (candidate.email || candidate.phone) score += 0.2;

  // 3. Not duplicate
  if (candidate.import_status !== "duplicate") score += 0.2;

  // 4. Data completeness (category + area)
  if (candidate.category && candidate.area) score += 0.2;

  // 5. Rating/review signal
  if (
    (candidate.rating != null && candidate.rating >= 3.0) ||
    (candidate.review_count != null && candidate.review_count >= 5)
  ) {
    score += 0.2;
  }

  return Math.round(score * 100) / 100; // 2 decimal precision
}

/**
 * Batch-compute quality scores for an array of candidates.
 */
export function computeBatchQualityScores(
  candidates: OutreachSourceCandidate[]
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const c of candidates) {
    scores.set(c.id, computeCandidateQualityScore(c));
  }
  return scores;
}

// ── Quality Score Persistence ────────────────────────────────────────────

/**
 * Update quality_score for candidates that don't have one yet.
 * Called after search results are saved, or on-demand.
 */
export async function backfillCandidateQualityScores(
  db: D1Database,
  tenantId: string,
  runId?: string
): Promise<number> {
  let query = `SELECT * FROM outreach_source_candidates
    WHERE tenant_id = ?1 AND quality_score IS NULL`;
  const binds: any[] = [tenantId];

  if (runId) {
    query += " AND run_id = ?2";
    binds.push(runId);
  }
  query += " LIMIT 500";

  const rows = await db.prepare(query).bind(...binds).all<OutreachSourceCandidate>();
  let updated = 0;

  for (const c of rows.results ?? []) {
    const score = computeCandidateQualityScore(c);
    await db
      .prepare("UPDATE outreach_source_candidates SET quality_score = ?1 WHERE id = ?2")
      .bind(score, c.id)
      .run();
    updated++;
  }

  return updated;
}

// ── Accept / Reject ──────────────────────────────────────────────────────

export async function acceptCandidate(
  db: D1Database,
  candidateId: string,
  tenantId: string,
  now: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE outreach_source_candidates
       SET acceptance_status = 'accepted', accepted_at = ?1, rejected_at = NULL, rejection_reason = NULL, updated_at = ?1
       WHERE id = ?2 AND tenant_id = ?3`
    )
    .bind(now, candidateId, tenantId)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

export async function rejectCandidate(
  db: D1Database,
  candidateId: string,
  tenantId: string,
  reason: string | null,
  now: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE outreach_source_candidates
       SET acceptance_status = 'rejected', rejected_at = ?1, rejection_reason = ?2, accepted_at = NULL, updated_at = ?1
       WHERE id = ?3 AND tenant_id = ?4`
    )
    .bind(now, reason, candidateId, tenantId)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

// ── Source Quality Aggregation ───────────────────────────────────────────

export interface SourceQualityRow {
  source_type: string;
  source_key: string;
  niche: string | null;
  area: string | null;
  leads_imported: number;
  reply_count: number;
  meeting_count: number;
  won_count: number;
  quality_score: number;
}

/**
 * Aggregate source quality metrics from existing data.
 *
 * Data sources:
 * - leads_imported: COUNT of imported candidates per source_type
 * - reply_count: COUNT of leads in replied/meeting/customer stage (from sales_leads.source_type)
 * - meeting_count: COUNT of leads in meeting/customer stage
 * - won_count: COUNT of leads in customer stage
 * - quality_score: AVG(quality_score) of candidates with non-null scores
 *
 * Limitations (Phase 8.1):
 * - source_key is currently source_type (no per-provider granularity yet)
 * - reply/meeting/won counts come from sales_leads pipeline_stage, not outreach_events
 * - Only captures leads that were imported, not all candidates
 */
export async function aggregateSourceQuality(
  db: D1Database,
  tenantId: string,
  filters?: { niche?: string; area?: string; sourceType?: string }
): Promise<SourceQualityRow[]> {
  // Simplified query: only uses sales_leads (all imported data is here)
  // Quality score comes from AVG of lead scores (0-100 normalized to 0-1)
  let query = `
    SELECT
      COALESCE(source_type, import_source, 'manual') as source_type,
      COALESCE(source_type, import_source, 'manual') as source_key,
      category as niche,
      area,
      COUNT(*) as leads_imported,
      SUM(CASE WHEN pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as reply_count,
      SUM(CASE WHEN pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meeting_count,
      SUM(CASE WHEN pipeline_stage = 'customer' THEN 1 ELSE 0 END) as won_count,
      ROUND(COALESCE(AVG(score), 0) / 100.0, 2) as quality_score
    FROM sales_leads
    WHERE tenant_id = ?1
  `;
  const binds: any[] = [tenantId];
  let idx = 2;

  if (filters?.niche) {
    query += ` AND category = ?${idx}`;
    binds.push(filters.niche);
    idx++;
  }
  if (filters?.area) {
    query += ` AND area = ?${idx}`;
    binds.push(filters.area);
    idx++;
  }
  if (filters?.sourceType) {
    query += ` AND COALESCE(source_type, import_source, 'manual') = ?${idx}`;
    binds.push(filters.sourceType);
    idx++;
  }

  query += `
    GROUP BY COALESCE(source_type, import_source, 'manual'), category, area
    HAVING leads_imported > 0
    ORDER BY leads_imported DESC
    LIMIT 50
  `;

  const rows = await db.prepare(query).bind(...binds).all<SourceQualityRow>();
  return rows.results ?? [];
}

/**
 * Get top performing sources by a composite metric.
 * Composite = (reply_count * 0.3 + meeting_count * 0.4 + won_count * 0.3) / leads_imported
 */
export async function getTopSources(
  db: D1Database,
  tenantId: string,
  limit: number = 10
): Promise<Array<SourceQualityRow & { composite_score: number }>> {
  const rows = await aggregateSourceQuality(db, tenantId);

  return rows
    .map((r) => ({
      ...r,
      composite_score:
        r.leads_imported > 0
          ? Math.round(
              ((r.reply_count * 0.3 + r.meeting_count * 0.4 + r.won_count * 0.3) /
                r.leads_imported) *
                100
            ) / 100
          : 0,
    }))
    .sort((a, b) => b.composite_score - a.composite_score)
    .slice(0, limit);
}
