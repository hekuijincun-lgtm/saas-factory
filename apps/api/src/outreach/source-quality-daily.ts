// Outreach OS — Source Quality Daily Aggregation (Phase 8.2)
// ============================================================
// Daily snapshot of source quality metrics per tenant.
// Designed for trend analytics and cron-based refresh.

import type { D1Database } from "@cloudflare/workers-types";

// ── Types ────────────────────────────────────────────────────────────────

export interface SourceQualityDailyRow {
  id: string;
  tenant_id: string;
  day: string;
  source_type: string;
  source_key: string;
  niche: string | null;
  area: string | null;
  candidate_count: number;
  accepted_count: number;
  rejected_count: number;
  imported_count: number;
  avg_quality_score: number;
  leads_imported: number;
  reply_count: number;
  meeting_count: number;
  won_count: number;
  quality_score: number;
  reply_rate: number;
  meeting_rate: number;
  won_rate: number;
  created_at: string;
}

export interface SourceTrendPoint {
  day: string;
  candidate_count: number;
  accepted_count: number;
  imported_count: number;
  avg_quality_score: number;
  reply_rate: number;
  meeting_rate: number;
  won_rate: number;
}

export interface SourceTrendBreakdown {
  source_type: string;
  source_key: string;
  niche: string | null;
  area: string | null;
  total_candidates: number;
  total_accepted: number;
  total_imported: number;
  avg_quality: number;
  avg_reply_rate: number;
  avg_meeting_rate: number;
  avg_won_rate: number;
  sample_size: number;
}

// ── Daily Aggregation ────────────────────────────────────────────────────

/**
 * Aggregate source quality metrics for a given day.
 * Groups by source_type, niche (category), area.
 * Upserts into outreach_source_quality_daily (same day + key = update).
 */
export async function aggregateSourceQualityDaily(
  db: D1Database,
  uid: () => string,
  now: () => string,
  tenantId?: string,
  day?: string
): Promise<{ tenantsProcessed: number; rowsUpserted: number }> {
  const targetDay = day ?? new Date().toISOString().slice(0, 10);
  let tenantsProcessed = 0;
  let rowsUpserted = 0;

  // Get distinct tenants
  let tenantRows: Array<{ tenant_id: string }>;
  if (tenantId) {
    tenantRows = [{ tenant_id: tenantId }];
  } else {
    const result = await db
      .prepare("SELECT DISTINCT tenant_id FROM outreach_source_candidates LIMIT 100")
      .all<{ tenant_id: string }>();
    tenantRows = result.results ?? [];
  }

  for (const { tenant_id: tid } of tenantRows) {
    // Candidate-side metrics
    const candidateStats = await db
      .prepare(`
        SELECT
          source_type,
          COALESCE(source_key, source_type) as source_key,
          category as niche,
          area,
          COUNT(*) as candidate_count,
          SUM(CASE WHEN acceptance_status = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
          SUM(CASE WHEN acceptance_status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
          SUM(CASE WHEN import_status = 'imported' THEN 1 ELSE 0 END) as imported_count,
          ROUND(COALESCE(AVG(quality_score), 0), 4) as avg_quality_score
        FROM outreach_source_candidates
        WHERE tenant_id = ?1
        GROUP BY source_type, COALESCE(source_key, source_type), category, area
      `)
      .bind(tid)
      .all<{
        source_type: string;
        source_key: string;
        niche: string | null;
        area: string | null;
        candidate_count: number;
        accepted_count: number;
        rejected_count: number;
        imported_count: number;
        avg_quality_score: number;
      }>();

    // Lead-side metrics (pipeline stage progression)
    const leadStats = await db
      .prepare(`
        SELECT
          COALESCE(source_type, import_source, 'manual') as source_type,
          category as niche,
          area,
          COUNT(*) as leads_imported,
          SUM(CASE WHEN pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as reply_count,
          SUM(CASE WHEN pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meeting_count,
          SUM(CASE WHEN pipeline_stage = 'customer' THEN 1 ELSE 0 END) as won_count,
          ROUND(COALESCE(AVG(score), 0) / 100.0, 4) as quality_score
        FROM sales_leads
        WHERE tenant_id = ?1
        GROUP BY COALESCE(source_type, import_source, 'manual'), category, area
      `)
      .bind(tid)
      .all<{
        source_type: string;
        niche: string | null;
        area: string | null;
        leads_imported: number;
        reply_count: number;
        meeting_count: number;
        won_count: number;
        quality_score: number;
      }>();

    // Build lead lookup map
    const leadMap = new Map<string, typeof leadStats.results[0]>();
    for (const ls of leadStats.results ?? []) {
      const key = `${ls.source_type}|${ls.niche ?? ""}|${ls.area ?? ""}`;
      leadMap.set(key, ls);
    }

    // Upsert daily rows
    for (const cs of candidateStats.results ?? []) {
      const lookupKey = `${cs.source_type}|${cs.niche ?? ""}|${cs.area ?? ""}`;
      const ls = leadMap.get(lookupKey);

      const leadsImported = ls?.leads_imported ?? 0;
      const replyCount = ls?.reply_count ?? 0;
      const meetingCount = ls?.meeting_count ?? 0;
      const wonCount = ls?.won_count ?? 0;
      const qualityScore = ls?.quality_score ?? 0;
      const replyRate = leadsImported > 0 ? Math.round((replyCount / leadsImported) * 10000) / 10000 : 0;
      const meetingRate = leadsImported > 0 ? Math.round((meetingCount / leadsImported) * 10000) / 10000 : 0;
      const wonRate = leadsImported > 0 ? Math.round((wonCount / leadsImported) * 10000) / 10000 : 0;

      // Check existing row for same day + key
      const existing = await db
        .prepare(`
          SELECT id FROM outreach_source_quality_daily
          WHERE tenant_id = ?1 AND day = ?2 AND source_type = ?3
            AND source_key = ?4 AND COALESCE(niche, '') = ?5 AND COALESCE(area, '') = ?6
          LIMIT 1
        `)
        .bind(tid, targetDay, cs.source_type, cs.source_key, cs.niche ?? "", cs.area ?? "")
        .first<{ id: string }>();

      if (existing) {
        await db
          .prepare(`
            UPDATE outreach_source_quality_daily SET
              candidate_count = ?1, accepted_count = ?2, rejected_count = ?3,
              imported_count = ?4, avg_quality_score = ?5,
              leads_imported = ?6, reply_count = ?7, meeting_count = ?8, won_count = ?9,
              quality_score = ?10, reply_rate = ?11, meeting_rate = ?12, won_rate = ?13
            WHERE id = ?14
          `)
          .bind(
            cs.candidate_count, cs.accepted_count, cs.rejected_count,
            cs.imported_count, cs.avg_quality_score,
            leadsImported, replyCount, meetingCount, wonCount,
            qualityScore, replyRate, meetingRate, wonRate,
            existing.id
          )
          .run();
      } else {
        await db
          .prepare(`
            INSERT INTO outreach_source_quality_daily
              (id, tenant_id, day, source_type, source_key, niche, area,
               candidate_count, accepted_count, rejected_count, imported_count, avg_quality_score,
               leads_imported, reply_count, meeting_count, won_count, quality_score,
               reply_rate, meeting_rate, won_rate, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
          `)
          .bind(
            uid(), tid, targetDay, cs.source_type, cs.source_key, cs.niche, cs.area,
            cs.candidate_count, cs.accepted_count, cs.rejected_count,
            cs.imported_count, cs.avg_quality_score,
            leadsImported, replyCount, meetingCount, wonCount,
            qualityScore, replyRate, meetingRate, wonRate,
            now()
          )
          .run();
      }
      rowsUpserted++;
    }
    tenantsProcessed++;
  }

  return { tenantsProcessed, rowsUpserted };
}

// ── Trend Queries ────────────────────────────────────────────────────────

/**
 * Get daily trend data for source quality.
 */
export async function getSourceQualityTrends(
  db: D1Database,
  tenantId: string,
  days: number = 30,
  filters?: { sourceType?: string; niche?: string; area?: string }
): Promise<SourceTrendPoint[]> {
  let query = `
    SELECT
      day,
      SUM(candidate_count) as candidate_count,
      SUM(accepted_count) as accepted_count,
      SUM(imported_count) as imported_count,
      ROUND(AVG(avg_quality_score), 4) as avg_quality_score,
      CASE WHEN SUM(leads_imported) > 0
        THEN ROUND(CAST(SUM(reply_count) AS REAL) / SUM(leads_imported), 4)
        ELSE 0 END as reply_rate,
      CASE WHEN SUM(leads_imported) > 0
        THEN ROUND(CAST(SUM(meeting_count) AS REAL) / SUM(leads_imported), 4)
        ELSE 0 END as meeting_rate,
      CASE WHEN SUM(leads_imported) > 0
        THEN ROUND(CAST(SUM(won_count) AS REAL) / SUM(leads_imported), 4)
        ELSE 0 END as won_rate
    FROM outreach_source_quality_daily
    WHERE tenant_id = ?1 AND day >= date('now', '-' || ?2 || ' days')
  `;
  const binds: any[] = [tenantId, days];
  let idx = 3;

  if (filters?.sourceType) {
    query += ` AND source_type = ?${idx}`;
    binds.push(filters.sourceType);
    idx++;
  }
  if (filters?.niche) {
    query += ` AND niche = ?${idx}`;
    binds.push(filters.niche);
    idx++;
  }
  if (filters?.area) {
    query += ` AND area = ?${idx}`;
    binds.push(filters.area);
    idx++;
  }

  query += ` GROUP BY day ORDER BY day ASC LIMIT 90`;

  const rows = await db.prepare(query).bind(...binds).all<SourceTrendPoint>();
  return rows.results ?? [];
}

/**
 * Get source breakdown summary.
 */
export async function getSourceQualityBreakdown(
  db: D1Database,
  tenantId: string,
  days: number = 30
): Promise<SourceTrendBreakdown[]> {
  const rows = await db
    .prepare(`
      SELECT
        source_type, source_key, niche, area,
        SUM(candidate_count) as total_candidates,
        SUM(accepted_count) as total_accepted,
        SUM(imported_count) as total_imported,
        ROUND(AVG(avg_quality_score), 4) as avg_quality,
        ROUND(AVG(reply_rate), 4) as avg_reply_rate,
        ROUND(AVG(meeting_rate), 4) as avg_meeting_rate,
        ROUND(AVG(won_rate), 4) as avg_won_rate,
        COUNT(*) as sample_size
      FROM outreach_source_quality_daily
      WHERE tenant_id = ?1 AND day >= date('now', '-' || ?2 || ' days')
      GROUP BY source_type, source_key, niche, area
      ORDER BY total_candidates DESC
      LIMIT 50
    `)
    .bind(tenantId, days)
    .all<SourceTrendBreakdown>();
  return rows.results ?? [];
}
