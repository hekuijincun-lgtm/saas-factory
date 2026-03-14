// Outreach OS — Campaign Draft Generator (Phase 7)
// ============================================================
// Auto-generates campaign + variants using learning context + niche templates.

import type { D1Database } from "@cloudflare/workers-types";
import type { OutreachCampaign, OutreachCampaignVariant, CampaignDraftInput, CampaignDraftResult, OutreachNicheTemplate } from "./types";
import { getLearningContext } from "./learning";

type UidFn = () => string;
type NowFn = () => string;

/**
 * Generate a campaign draft with optimized variants based on learning data.
 */
export async function generateCampaignDraft(
  db: D1Database,
  tenantId: string,
  input: CampaignDraftInput,
  uid: UidFn,
  now: NowFn
): Promise<CampaignDraftResult> {
  const ts = now();
  const campaignId = uid();

  // 1. Get learning context for niche
  const learning = await getLearningContext(db, tenantId, input.niche);

  // 2. Check for niche template
  const nicheTemplate = await db
    .prepare(
      `SELECT * FROM outreach_niche_templates
       WHERE tenant_id = ?1 AND niche = ?2
       ORDER BY win_score DESC LIMIT 1`
    )
    .bind(tenantId, input.niche)
    .first<OutreachNicheTemplate>();

  // 3. Determine best tone from learning / template / input
  const bestTone = input.tone
    ?? (nicheTemplate?.tone as any)
    ?? learning.topTone?.key
    ?? "friendly";

  // 4. Create campaign
  const campaignName = input.area
    ? `${input.area}エリア ${input.niche}向け（自動生成）`
    : `${input.niche}向け（自動生成）`;

  await db
    .prepare(
      `INSERT INTO outreach_campaigns
       (id, tenant_id, name, niche, area, min_score, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', ?7, ?8)`
    )
    .bind(
      campaignId, tenantId, campaignName,
      input.niche, input.area ?? null, input.min_score ?? null,
      ts, ts
    )
    .run();

  const campaign: OutreachCampaign = {
    id: campaignId,
    tenant_id: tenantId,
    name: campaignName,
    niche: input.niche,
    area: input.area ?? null,
    min_score: input.min_score ?? null,
    status: "draft",
    created_at: ts,
    updated_at: ts,
  };

  // 5. Generate variants
  const variants: OutreachCampaignVariant[] = [];
  const autoVariants = input.auto_variants !== false;

  if (autoVariants) {
    // Variant A: best performing (from learning or template)
    const variantA = await createVariant(db, uid, ts, campaignId, tenantId, {
      key: "A",
      tone: bestTone,
      subject: nicheTemplate?.subject_template ?? null,
      opener: nicheTemplate?.opener_template ?? null,
      cta: nicheTemplate?.cta_template ?? null,
    });
    variants.push(variantA);

    // Variant B: alternative tone (if learning has data, pick 2nd best; otherwise use contrasting tone)
    const altTone = bestTone === "formal" ? "friendly" : bestTone === "casual" ? "formal" : "casual";
    const variantB = await createVariant(db, uid, ts, campaignId, tenantId, {
      key: "B",
      tone: altTone,
      subject: null,
      opener: null,
      cta: learning.topCta ? `${learning.topCta.key}への提案` : null,
    });
    variants.push(variantB);

    // Variant C (optional): if we have winning hypothesis, create hypothesis-focused variant
    if (learning.topHypothesis) {
      const variantC = await createVariant(db, uid, ts, campaignId, tenantId, {
        key: "C",
        tone: bestTone,
        subject: `{store_name}様 — ${learning.topHypothesis.label}について`,
        opener: null,
        cta: null,
      });
      variants.push(variantC);
    }
  }

  // 6. Count matching leads + diagnostics
  const totalRow = await db
    .prepare("SELECT COUNT(*) as cnt FROM sales_leads WHERE tenant_id = ?1")
    .bind(tenantId)
    .first<{ cnt: number }>();
  const totalLeads = totalRow?.cnt ?? 0;

  // Diagnostic: count leads excluded by each filter
  const diagBase = `FROM sales_leads WHERE tenant_id = ?1`;
  const skippedPipelineRow = await db
    .prepare(`SELECT COUNT(*) as cnt ${diagBase} AND pipeline_stage NOT IN ('new','approved')`)
    .bind(tenantId).first<{ cnt: number }>();
  const skippedUnsubRow = await db
    .prepare(`SELECT COUNT(*) as cnt ${diagBase} AND pipeline_stage IN ('new','approved') AND status = 'unsubscribed'`)
    .bind(tenantId).first<{ cnt: number }>();

  let skippedCategory = 0;
  if (input.niche) {
    const r = await db
      .prepare(`SELECT COUNT(*) as cnt ${diagBase} AND pipeline_stage IN ('new','approved') AND status != 'unsubscribed' AND (category IS NULL OR category != ?2)`)
      .bind(tenantId, input.niche).first<{ cnt: number }>();
    skippedCategory = r?.cnt ?? 0;
  }

  let skippedArea = 0;
  if (input.area) {
    const r = await db
      .prepare(`SELECT COUNT(*) as cnt ${diagBase} AND pipeline_stage IN ('new','approved') AND status != 'unsubscribed'${input.niche ? " AND category = ?2" : ""} AND (area IS NULL OR area != ?${input.niche ? 3 : 2})`)
      .bind(...(input.niche ? [tenantId, input.niche, input.area] : [tenantId, input.area])).first<{ cnt: number }>();
    skippedArea = r?.cnt ?? 0;
  }

  let skippedScore = 0;
  if (input.min_score != null) {
    const scoreBinds: any[] = [tenantId];
    let scoreQ = `SELECT COUNT(*) as cnt ${diagBase} AND pipeline_stage IN ('new','approved') AND status != 'unsubscribed'`;
    let si = 2;
    if (input.niche) { scoreQ += ` AND category = ?${si}`; scoreBinds.push(input.niche); si++; }
    if (input.area) { scoreQ += ` AND area = ?${si}`; scoreBinds.push(input.area); si++; }
    scoreQ += ` AND (score IS NULL OR score < ?${si})`;
    scoreBinds.push(input.min_score);
    const r = await db.prepare(scoreQ).bind(...scoreBinds).first<{ cnt: number }>();
    skippedScore = r?.cnt ?? 0;
  }

  // Final match count
  let matchQuery = `SELECT COUNT(*) as cnt FROM sales_leads
    WHERE tenant_id = ?1 AND pipeline_stage IN ('new','approved') AND status != 'unsubscribed'`;
  const binds: any[] = [tenantId];
  let bindIdx = 2;

  if (input.niche) {
    matchQuery += ` AND category = ?${bindIdx}`;
    binds.push(input.niche);
    bindIdx++;
  }
  if (input.area) {
    matchQuery += ` AND area = ?${bindIdx}`;
    binds.push(input.area);
    bindIdx++;
  }
  if (input.min_score != null) {
    matchQuery += ` AND score >= ?${bindIdx}`;
    binds.push(input.min_score);
    bindIdx++;
  }

  const matchResult = await db
    .prepare(matchQuery)
    .bind(...binds)
    .first<{ cnt: number }>();

  const matchedCount = matchResult?.cnt ?? 0;

  const diagnostics = {
    totalLeads,
    skippedCategoryMismatch: skippedCategory,
    skippedPipelineStage: skippedPipelineRow?.cnt ?? 0,
    skippedUnsubscribed: skippedUnsubRow?.cnt ?? 0,
    skippedLowScore: skippedScore,
    skippedAreaMismatch: skippedArea,
    matchedCount,
  };

  console.log(`[DRAFT] tenant=${tenantId} niche=${input.niche} area=${input.area ?? "all"} total=${totalLeads} matched=${matchedCount} skipCategory=${skippedCategory} skipPipeline=${diagnostics.skippedPipelineStage} skipUnsub=${diagnostics.skippedUnsubscribed} skipScore=${skippedScore} skipArea=${skippedArea}`);

  return {
    campaign,
    variants,
    matchingLeads: matchedCount,
    learningContext: {
      topTone: learning.topTone?.key ?? null,
      topHypothesis: learning.topHypothesis?.label ?? null,
      nicheTemplate: nicheTemplate?.name ?? null,
    },
    diagnostics,
  };
}

async function createVariant(
  db: D1Database,
  uid: UidFn,
  ts: string,
  campaignId: string,
  tenantId: string,
  opts: { key: string; tone: string; subject: string | null; opener: string | null; cta: string | null }
): Promise<OutreachCampaignVariant> {
  const id = uid();
  await db
    .prepare(
      `INSERT INTO outreach_campaign_variants
       (id, tenant_id, campaign_id, variant_key, subject_template, opener_template, cta_template, tone, is_active, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)`
    )
    .bind(id, tenantId, campaignId, opts.key, opts.subject, opts.opener, opts.cta, opts.tone, ts)
    .run();

  return {
    id,
    tenant_id: tenantId,
    campaign_id: campaignId,
    variant_key: opts.key,
    subject_template: opts.subject,
    opener_template: opts.opener,
    cta_template: opts.cta,
    tone: opts.tone,
    is_active: 1,
    created_at: ts,
  };
}
