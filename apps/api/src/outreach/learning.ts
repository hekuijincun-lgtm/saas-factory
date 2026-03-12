// Outreach OS — Winning Pattern Learning (service layer)
// ============================================================
// Aggregates reply/meeting rates by source, hypothesis, tone, CTA
// and persists as learning patterns for AI generator context.

import type { D1Database } from "@cloudflare/workers-types";

/** Row shape for outreach_learning_patterns */
export interface LearningPattern {
  id: string;
  tenant_id: string;
  pattern_type: string;
  pattern_key: string;
  label: string;
  niche: string | null;
  sample_size: number;
  reply_rate: number;
  meeting_rate: number;
  win_score: number;
  created_at: string;
  updated_at: string;
}

/** Compact context passed to AI generator */
export interface LearningContext {
  topTone: { key: string; replyRate: number; sampleSize: number } | null;
  topHypothesis: { key: string; label: string; replyRate: number; sampleSize: number } | null;
  topCta: { key: string; replyRate: number; sampleSize: number } | null;
  topSource: { key: string; meetingRate: number; sampleSize: number } | null;
  patterns: LearningPattern[];
}

type UidFn = () => string;
type NowFn = () => string;

/**
 * Refresh all learning patterns for a tenant.
 * Scans existing analytics data and upserts patterns.
 * Safe: no side effects beyond D1 writes.
 */
export async function refreshLearningPatterns(
  db: D1Database,
  tenantId: string,
  uid: UidFn,
  now: NowFn
): Promise<{ updated: number; deleted: number }> {
  const ts = now();
  const patterns: Array<{
    type: string;
    key: string;
    label: string;
    niche: string | null;
    sampleSize: number;
    replyRate: number;
    meetingRate: number;
  }> = [];

  // 1. By source_type
  const sourceRows = await db
    .prepare(
      `SELECT COALESCE(source_type, import_source, 'manual') as src,
         COUNT(*) as total,
         SUM(CASE WHEN pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied,
         SUM(CASE WHEN pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings
       FROM sales_leads WHERE tenant_id = ?1 AND pipeline_stage NOT IN ('new')
       GROUP BY src HAVING total >= 2`
    )
    .bind(tenantId)
    .all<{ src: string; total: number; replied: number; meetings: number }>();

  for (const r of sourceRows.results ?? []) {
    patterns.push({
      type: "source",
      key: r.src,
      label: r.src,
      niche: null,
      sampleSize: r.total,
      replyRate: r.total > 0 ? Math.round((r.replied / r.total) * 100) : 0,
      meetingRate: r.total > 0 ? Math.round((r.meetings / r.total) * 100) : 0,
    });
  }

  // 2. By hypothesis code
  const hypoRows = await db
    .prepare(
      `SELECT h.code, h.label,
         COUNT(DISTINCT h.lead_id) as total,
         SUM(CASE WHEN l.pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied,
         SUM(CASE WHEN l.pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings
       FROM outreach_pain_hypotheses h
       JOIN sales_leads l ON h.lead_id = l.id AND h.tenant_id = l.tenant_id
       WHERE h.tenant_id = ?1 AND l.pipeline_stage NOT IN ('new')
       GROUP BY h.code, h.label HAVING total >= 2`
    )
    .bind(tenantId)
    .all<{ code: string; label: string; total: number; replied: number; meetings: number }>();

  for (const r of hypoRows.results ?? []) {
    patterns.push({
      type: "hypothesis",
      key: r.code,
      label: r.label,
      niche: null,
      sampleSize: r.total,
      replyRate: r.total > 0 ? Math.round((r.replied / r.total) * 100) : 0,
      meetingRate: r.total > 0 ? Math.round((r.meetings / r.total) * 100) : 0,
    });
  }

  // 3. By message tone
  const toneRows = await db
    .prepare(
      `SELECT m.tone,
         COUNT(DISTINCT m.lead_id) as total,
         SUM(CASE WHEN l.pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied,
         SUM(CASE WHEN l.pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings
       FROM lead_message_drafts m
       JOIN sales_leads l ON m.lead_id = l.id AND m.tenant_id = l.tenant_id
       WHERE m.tenant_id = ?1 AND m.status = 'sent' AND m.tone IS NOT NULL
       GROUP BY m.tone HAVING total >= 2`
    )
    .bind(tenantId)
    .all<{ tone: string; total: number; replied: number; meetings: number }>();

  for (const r of toneRows.results ?? []) {
    patterns.push({
      type: "tone",
      key: r.tone,
      label: r.tone,
      niche: null,
      sampleSize: r.total,
      replyRate: r.total > 0 ? Math.round((r.replied / r.total) * 100) : 0,
      meetingRate: r.total > 0 ? Math.round((r.meetings / r.total) * 100) : 0,
    });
  }

  // 4. By campaign variant (as CTA proxy)
  const variantRows = await db
    .prepare(
      `SELECT m.variant_key as vkey,
         COUNT(DISTINCT m.lead_id) as total,
         SUM(CASE WHEN l.pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied,
         SUM(CASE WHEN l.pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings
       FROM lead_message_drafts m
       JOIN sales_leads l ON m.lead_id = l.id AND m.tenant_id = l.tenant_id
       WHERE m.tenant_id = ?1 AND m.status = 'sent' AND m.variant_key IS NOT NULL
       GROUP BY m.variant_key HAVING total >= 2`
    )
    .bind(tenantId)
    .all<{ vkey: string; total: number; replied: number; meetings: number }>();

  for (const r of variantRows.results ?? []) {
    patterns.push({
      type: "variant",
      key: r.vkey,
      label: r.vkey,
      niche: null,
      sampleSize: r.total,
      replyRate: r.total > 0 ? Math.round((r.replied / r.total) * 100) : 0,
      meetingRate: r.total > 0 ? Math.round((r.meetings / r.total) * 100) : 0,
    });
  }

  // Delete old patterns for this tenant
  const deleted = await db
    .prepare("DELETE FROM outreach_learning_patterns WHERE tenant_id = ?1")
    .bind(tenantId)
    .run();

  // Insert new patterns
  let updated = 0;
  for (const p of patterns) {
    const winScore = Math.round(p.replyRate * 0.6 + p.meetingRate * 0.4);
    await db
      .prepare(
        `INSERT INTO outreach_learning_patterns
         (id, tenant_id, pattern_type, pattern_key, label, niche, sample_size,
          reply_rate, meeting_rate, win_score, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
      )
      .bind(
        uid(), tenantId, p.type, p.key, p.label, p.niche,
        p.sampleSize, p.replyRate, p.meetingRate, winScore, ts, ts
      )
      .run();
    updated++;
  }

  return { updated, deleted: deleted.meta?.changes ?? 0 };
}

/**
 * Get learning context for AI generator.
 * Returns top patterns by win_score.
 */
export async function getLearningContext(
  db: D1Database,
  tenantId: string,
  niche?: string | null
): Promise<LearningContext> {
  // Fetch all patterns for tenant (with optional niche filter in future)
  const rows = await db
    .prepare(
      `SELECT * FROM outreach_learning_patterns
       WHERE tenant_id = ?1
       ORDER BY win_score DESC`
    )
    .bind(tenantId)
    .all<LearningPattern>();

  const patterns = rows.results ?? [];

  const byType = (type: string) =>
    patterns.filter((p) => p.pattern_type === type).sort((a, b) => b.win_score - a.win_score);

  const topToneP = byType("tone")[0];
  const topHypoP = byType("hypothesis")[0];
  const topVariantP = byType("variant")[0];
  const topSourceP = byType("source")[0];

  return {
    topTone: topToneP
      ? { key: topToneP.pattern_key, replyRate: topToneP.reply_rate, sampleSize: topToneP.sample_size }
      : null,
    topHypothesis: topHypoP
      ? { key: topHypoP.pattern_key, label: topHypoP.label, replyRate: topHypoP.reply_rate, sampleSize: topHypoP.sample_size }
      : null,
    topCta: topVariantP
      ? { key: topVariantP.pattern_key, replyRate: topVariantP.reply_rate, sampleSize: topVariantP.sample_size }
      : null,
    topSource: topSourceP
      ? { key: topSourceP.pattern_key, meetingRate: topSourceP.meeting_rate, sampleSize: topSourceP.sample_size }
      : null,
    patterns,
  };
}
