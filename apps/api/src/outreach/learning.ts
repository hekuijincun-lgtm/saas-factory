// Outreach OS — Winning Pattern Learning (service layer)
// ============================================================
// Aggregates reply/meeting rates by source, hypothesis, tone, CTA
// and persists as learning patterns for AI generator context.
// Phase 7: auto-refresh via cron + niche template generation.

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
    closeRate: number;
  }> = [];

  // 1. By source_type (Phase 15: include close/won rate)
  const sourceRows = await db
    .prepare(
      `SELECT COALESCE(source_type, import_source, 'manual') as src,
         COUNT(*) as total,
         SUM(CASE WHEN pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied,
         SUM(CASE WHEN pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings,
         SUM(CASE WHEN pipeline_stage = 'customer' THEN 1 ELSE 0 END) as closed
       FROM sales_leads WHERE tenant_id = ?1 AND pipeline_stage NOT IN ('new')
       GROUP BY src HAVING total >= 2`
    )
    .bind(tenantId)
    .all<{ src: string; total: number; replied: number; meetings: number; closed: number }>();

  for (const r of sourceRows.results ?? []) {
    patterns.push({
      type: "source",
      key: r.src,
      label: r.src,
      niche: null,
      sampleSize: r.total,
      replyRate: r.total > 0 ? Math.round((r.replied / r.total) * 100) : 0,
      meetingRate: r.total > 0 ? Math.round((r.meetings / r.total) * 100) : 0,
      closeRate: r.total > 0 ? Math.round((r.closed / r.total) * 100) : 0,
    });
  }

  // 2. By hypothesis code (Phase 15: include close rate)
  const hypoRows = await db
    .prepare(
      `SELECT h.code, h.label,
         COUNT(DISTINCT h.lead_id) as total,
         SUM(CASE WHEN l.pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied,
         SUM(CASE WHEN l.pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings,
         SUM(CASE WHEN l.pipeline_stage = 'customer' THEN 1 ELSE 0 END) as closed
       FROM outreach_pain_hypotheses h
       JOIN sales_leads l ON h.lead_id = l.id AND h.tenant_id = l.tenant_id
       WHERE h.tenant_id = ?1 AND l.pipeline_stage NOT IN ('new')
       GROUP BY h.code, h.label HAVING total >= 2`
    )
    .bind(tenantId)
    .all<{ code: string; label: string; total: number; replied: number; meetings: number; closed: number }>();

  for (const r of hypoRows.results ?? []) {
    patterns.push({
      type: "hypothesis",
      key: r.code,
      label: r.label,
      niche: null,
      sampleSize: r.total,
      replyRate: r.total > 0 ? Math.round((r.replied / r.total) * 100) : 0,
      meetingRate: r.total > 0 ? Math.round((r.meetings / r.total) * 100) : 0,
      closeRate: r.total > 0 ? Math.round((r.closed / r.total) * 100) : 0,
    });
  }

  // 3. By message tone (Phase 15: include close rate)
  const toneRows = await db
    .prepare(
      `SELECT m.tone,
         COUNT(DISTINCT m.lead_id) as total,
         SUM(CASE WHEN l.pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied,
         SUM(CASE WHEN l.pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings,
         SUM(CASE WHEN l.pipeline_stage = 'customer' THEN 1 ELSE 0 END) as closed
       FROM lead_message_drafts m
       JOIN sales_leads l ON m.lead_id = l.id AND m.tenant_id = l.tenant_id
       WHERE m.tenant_id = ?1 AND m.status = 'sent' AND m.tone IS NOT NULL
       GROUP BY m.tone HAVING total >= 2`
    )
    .bind(tenantId)
    .all<{ tone: string; total: number; replied: number; meetings: number; closed: number }>();

  for (const r of toneRows.results ?? []) {
    patterns.push({
      type: "tone",
      key: r.tone,
      label: r.tone,
      niche: null,
      sampleSize: r.total,
      replyRate: r.total > 0 ? Math.round((r.replied / r.total) * 100) : 0,
      meetingRate: r.total > 0 ? Math.round((r.meetings / r.total) * 100) : 0,
      closeRate: r.total > 0 ? Math.round((r.closed / r.total) * 100) : 0,
    });
  }

  // 4. By campaign variant (as CTA proxy) (Phase 15: include close rate)
  const variantRows = await db
    .prepare(
      `SELECT m.variant_key as vkey,
         COUNT(DISTINCT m.lead_id) as total,
         SUM(CASE WHEN l.pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied,
         SUM(CASE WHEN l.pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings,
         SUM(CASE WHEN l.pipeline_stage = 'customer' THEN 1 ELSE 0 END) as closed
       FROM lead_message_drafts m
       JOIN sales_leads l ON m.lead_id = l.id AND m.tenant_id = l.tenant_id
       WHERE m.tenant_id = ?1 AND m.status = 'sent' AND m.variant_key IS NOT NULL
       GROUP BY m.variant_key HAVING total >= 2`
    )
    .bind(tenantId)
    .all<{ vkey: string; total: number; replied: number; meetings: number; closed: number }>();

  for (const r of variantRows.results ?? []) {
    patterns.push({
      type: "variant",
      key: r.vkey,
      label: r.vkey,
      niche: null,
      sampleSize: r.total,
      replyRate: r.total > 0 ? Math.round((r.replied / r.total) * 100) : 0,
      meetingRate: r.total > 0 ? Math.round((r.meetings / r.total) * 100) : 0,
      closeRate: r.total > 0 ? Math.round((r.closed / r.total) * 100) : 0,
    });
  }

  // 5. Phase 7: By niche (category-level aggregation) (Phase 15: include close rate)
  const nicheRows = await db
    .prepare(
      `SELECT l.category as niche, m.tone,
         COUNT(DISTINCT m.lead_id) as total,
         SUM(CASE WHEN l.pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied,
         SUM(CASE WHEN l.pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings,
         SUM(CASE WHEN l.pipeline_stage = 'customer' THEN 1 ELSE 0 END) as closed
       FROM lead_message_drafts m
       JOIN sales_leads l ON m.lead_id = l.id AND m.tenant_id = l.tenant_id
       WHERE m.tenant_id = ?1 AND m.status = 'sent' AND l.category IS NOT NULL AND m.tone IS NOT NULL
       GROUP BY l.category, m.tone HAVING total >= 2`
    )
    .bind(tenantId)
    .all<{ niche: string; tone: string; total: number; replied: number; meetings: number; closed: number }>();

  for (const r of nicheRows.results ?? []) {
    patterns.push({
      type: "tone",
      key: r.tone,
      label: `${r.niche} × ${r.tone}`,
      niche: r.niche,
      sampleSize: r.total,
      replyRate: r.total > 0 ? Math.round((r.replied / r.total) * 100) : 0,
      meetingRate: r.total > 0 ? Math.round((r.meetings / r.total) * 100) : 0,
      closeRate: r.total > 0 ? Math.round((r.closed / r.total) * 100) : 0,
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
    // Phase 15: close-rate weighted scoring (reply 0.3, meeting 0.3, close 0.4)
    const winScore = Math.round(p.replyRate * 0.3 + p.meetingRate * 0.3 + p.closeRate * 0.4);
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
 * Phase 7: optionally filtered by niche.
 */
export async function getLearningContext(
  db: D1Database,
  tenantId: string,
  niche?: string | null
): Promise<LearningContext> {
  // Fetch patterns: prefer niche-specific, fall back to global
  const rows = await db
    .prepare(
      `SELECT * FROM outreach_learning_patterns
       WHERE tenant_id = ?1
       ORDER BY win_score DESC`
    )
    .bind(tenantId)
    .all<LearningPattern>();

  const allPatterns = rows.results ?? [];

  // Phase 7: If niche specified, prefer niche-specific patterns but fall back to global
  const nichePatterns = niche
    ? allPatterns.filter((p) => p.niche === niche)
    : [];
  const globalPatterns = allPatterns.filter((p) => !p.niche);

  // Use niche patterns where available, otherwise global
  const effectivePatterns = nichePatterns.length >= 2 ? nichePatterns : globalPatterns;

  const byType = (type: string) =>
    effectivePatterns.filter((p) => p.pattern_type === type).sort((a, b) => b.win_score - a.win_score);

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
    patterns: allPatterns,
  };
}

/**
 * Phase 7: Auto-generate niche templates based on winning patterns.
 * Creates/updates templates for niches that have sufficient data (sample_size >= 5).
 */
export async function generateNicheTemplates(
  db: D1Database,
  tenantId: string,
  uid: UidFn,
  now: NowFn
): Promise<number> {
  const ts = now();

  // Find distinct niches from patterns with enough data
  const nicheData = await db
    .prepare(
      `SELECT niche, pattern_type, pattern_key, label, reply_rate, meeting_rate, win_score, sample_size
       FROM outreach_learning_patterns
       WHERE tenant_id = ?1 AND niche IS NOT NULL AND sample_size >= 5
       ORDER BY niche, win_score DESC`
    )
    .bind(tenantId)
    .all<LearningPattern>();

  const byNiche = new Map<string, LearningPattern[]>();
  for (const p of nicheData.results ?? []) {
    const list = byNiche.get(p.niche!) ?? [];
    list.push(p);
    byNiche.set(p.niche!, list);
  }

  let generated = 0;
  for (const [niche, patterns] of byNiche) {
    const bestTone = patterns.find((p) => p.pattern_type === "tone");
    if (!bestTone) continue;

    const bestHypothesis = patterns.find((p) => p.pattern_type === "hypothesis");
    const avgWinScore = Math.round(
      patterns.reduce((sum, p) => sum + p.win_score, 0) / patterns.length
    );
    const totalSamples = patterns.reduce((sum, p) => sum + p.sample_size, 0);

    // Upsert: delete old auto-generated template for this niche, insert new
    await db
      .prepare(
        "DELETE FROM outreach_niche_templates WHERE tenant_id = ?1 AND niche = ?2 AND is_auto_generated = 1"
      )
      .bind(tenantId, niche)
      .run();

    const hypothesisCodes = patterns
      .filter((p) => p.pattern_type === "hypothesis")
      .map((p) => p.pattern_key)
      .join(",");

    await db
      .prepare(
        `INSERT INTO outreach_niche_templates
         (id, tenant_id, niche, name, tone, subject_template, opener_template, body_template, cta_template,
          hypothesis_codes, win_score, sample_size, is_auto_generated, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 1, ?13, ?14)`
      )
      .bind(
        uid(),
        tenantId,
        niche,
        `${niche}向け最適テンプレート（自動生成）`,
        bestTone.pattern_key,
        `{store_name}様 — ${niche}の集客改善のご提案`,
        bestTone.pattern_key === "formal"
          ? "{store_name}様\n\n突然のご連絡失礼いたします。"
          : "{store_name}様\n\nはじめまして！",
        bestHypothesis
          ? `{area}エリアで${niche}を運営されている{store_name}様に、特に「${bestHypothesis.label}」についてお力になれると考えご連絡しました。`
          : `{area}エリアで${niche}を運営されている{store_name}様に、集客改善のご提案でご連絡しました。`,
        "無料相談のご案内",
        hypothesisCodes || null,
        avgWinScore,
        totalSamples,
        ts,
        ts
      )
      .run();

    generated++;
  }

  return generated;
}

/**
 * Phase 7: Auto-refresh all tenants' learning patterns via cron.
 * Called from scheduled() handler.
 * Condition: only runs once per 24h per tenant.
 */
export async function autoRefreshAllTenants(
  db: D1Database,
  uid: UidFn,
  now: NowFn
): Promise<{ tenantsProcessed: number; totalUpdated: number; totalTemplates: number }> {
  const ts = now();
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Find distinct tenants with outreach data
  const tenants = await db
    .prepare(
      `SELECT DISTINCT tenant_id FROM sales_leads
       WHERE pipeline_stage NOT IN ('new')
       LIMIT 100`
    )
    .all<{ tenant_id: string }>();

  let tenantsProcessed = 0;
  let totalUpdated = 0;
  let totalTemplates = 0;

  for (const { tenant_id: tenantId } of tenants.results ?? []) {
    // Check if already refreshed within 24h
    const lastRefresh = await db
      .prepare(
        `SELECT created_at FROM outreach_learning_refresh_log
         WHERE tenant_id = ?1 AND created_at > ?2
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(tenantId, cutoff24h)
      .first<{ created_at: string }>();

    if (lastRefresh) continue; // Already refreshed recently

    try {
      const result = await refreshLearningPatterns(db, tenantId, uid, now);
      const templatesGenerated = await generateNicheTemplates(db, tenantId, uid, now);

      // Log the refresh
      await db
        .prepare(
          `INSERT INTO outreach_learning_refresh_log
           (id, tenant_id, patterns_updated, patterns_deleted, templates_generated, triggered_by, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 'cron', ?6)`
        )
        .bind(uid(), tenantId, result.updated, result.deleted, templatesGenerated, ts)
        .run();

      tenantsProcessed++;
      totalUpdated += result.updated;
      totalTemplates += templatesGenerated;
    } catch (err: any) {
      console.error(`[LEARNING_AUTO_REFRESH] Error for tenant ${tenantId}:`, err?.message);
    }
  }

  return { tenantsProcessed, totalUpdated, totalTemplates };
}
