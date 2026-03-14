// Outreach OS — Auto Prospect Batch Service (Phase 10)
// ============================================================
// Orchestrates: search → quality score → auto-accept → import → analyze → score → campaign draft
// Default: review_only (no auto-send)
// approved_send: only sends already-approved items through existing safety guards

import type { D1Database } from "@cloudflare/workers-types";
import type {
  OutreachBatchJob,
  OutreachBatchJobItem,
  BatchJobCreateInput,
  BatchJobResult,
  OutreachSourceCandidate,
  OutreachLead,
  OutreachLeadFeatureRow,
  OutreachSettings,
} from "./types";
import { DEFAULT_OUTREACH_SETTINGS } from "./types";
import { resolveSourceProvider } from "./source-providers/provider-factory";
import type { CandidateResult } from "./source-providers/types";
import { computeCandidateQualityScore } from "./source-quality";
import { DefaultWebsiteAnalyzer } from "./analyzer";
import { generatePainHypotheses } from "./pain-hypothesis";
import { computeLeadScoreV2, computeLeadScore } from "./scoring";
import { generateCampaignDraft } from "./campaign-generator";

type UidFn = () => string;
type NowFn = () => string;

/** Hard cap for target_count to prevent abuse */
const MAX_TARGET_COUNT = 100;
/** Hard cap for max_per_area */
const MAX_PER_AREA_CAP = 30;

/**
 * Fisher-Yates shuffle (in-place).
 */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Create batch job record ─────────────────────────────────────────────

export async function createBatchJob(
  db: D1Database,
  tenantId: string,
  input: BatchJobCreateInput,
  uid: UidFn,
  now: NowFn
): Promise<OutreachBatchJob> {
  const id = uid();
  const ts = now();

  const targetCount = Math.min(Math.max(input.target_count ?? 20, 1), MAX_TARGET_COUNT);
  const maxPerArea = Math.min(Math.max(input.max_per_area ?? 8, 1), MAX_PER_AREA_CAP);
  const qualityThreshold = Math.max(0, Math.min(input.quality_threshold ?? 0.4, 1.0));

  const job: OutreachBatchJob = {
    id,
    tenant_id: tenantId,
    niche: input.niche,
    areas_json: JSON.stringify(input.areas),
    randomize_areas: input.randomize_areas !== false ? 1 : 0,
    target_count: targetCount,
    max_per_area: maxPerArea,
    quality_threshold: qualityThreshold,
    mode: input.mode === "approved_send" ? "approved_send" : "review_only",
    status: "pending",
    source_type: input.source_type ?? "directory",
    created_count: 0,
    imported_count: 0,
    draft_count: 0,
    queued_send_count: 0,
    error_count: 0,
    result_summary_json: null,
    error_message: null,
    created_at: ts,
    updated_at: ts,
  };

  await db
    .prepare(
      `INSERT INTO outreach_batch_jobs
       (id, tenant_id, niche, areas_json, randomize_areas, target_count, max_per_area,
        quality_threshold, mode, status, source_type,
        created_count, imported_count, draft_count, queued_send_count, error_count,
        result_summary_json, error_message, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)`
    )
    .bind(
      id, tenantId, job.niche, job.areas_json, job.randomize_areas,
      job.target_count, job.max_per_area, job.quality_threshold,
      job.mode, job.status, job.source_type,
      0, 0, 0, 0, 0, null, null, ts, ts
    )
    .run();

  return job;
}

// ── Run batch job (main orchestration) ──────────────────────────────────

export async function runBatchJob(
  db: D1Database,
  kv: KVNamespace,
  tenantId: string,
  jobId: string,
  uid: UidFn,
  now: NowFn,
  env: { GOOGLE_MAPS_API_KEY?: string; OPENAI_API_KEY?: string }
): Promise<BatchJobResult> {
  // 1. Load job
  const job = await db
    .prepare("SELECT * FROM outreach_batch_jobs WHERE id = ?1 AND tenant_id = ?2")
    .bind(jobId, tenantId)
    .first<OutreachBatchJob>();
  if (!job) throw new Error("Batch job not found");
  if (job.status !== "pending") throw new Error(`Batch job status is ${job.status}, expected pending`);

  // Mark running
  await db
    .prepare("UPDATE outreach_batch_jobs SET status = 'running', updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3")
    .bind(now(), jobId, tenantId)
    .run();

  const areas: string[] = JSON.parse(job.areas_json);
  const orderedAreas = job.randomize_areas ? shuffleArray(areas) : areas;
  const items: OutreachBatchJobItem[] = [];
  let totalAccepted = 0;
  let totalImported = 0;
  let totalDrafted = 0;
  let totalErrors = 0;
  let totalSearched = 0;
  let totalSkippedDedup = 0;
  let totalSkippedQuality = 0;
  let totalSkippedNoContact = 0;
  const createdLeadIds: string[] = [];

  // Load settings
  const settings = await getOutreachSettings(kv, tenantId);

  // 2. Fetch existing leads for dedup
  const existingLeads = await db
    .prepare("SELECT id, store_name, normalized_domain, contact_email, area FROM sales_leads WHERE tenant_id = ?1")
    .bind(tenantId)
    .all<{ id: string; store_name: string; normalized_domain: string | null; contact_email: string | null; area: string | null }>();
  const existingList = existingLeads.results ?? [];

  const byDomain = new Map<string, { id: string; store_name: string }>();
  const byEmail = new Map<string, { id: string; store_name: string }>();
  const byNameArea = new Map<string, { id: string; store_name: string }>();
  for (const lead of existingList) {
    if (lead.normalized_domain) byDomain.set(lead.normalized_domain, lead);
    if (lead.contact_email) byEmail.set(lead.contact_email.toLowerCase(), lead);
    const key = `${lead.store_name?.toLowerCase()}|${lead.area?.toLowerCase() ?? ""}`;
    byNameArea.set(key, lead);
  }

  // Also track candidates within this batch to avoid intra-batch duplicates
  const batchDomains = new Set<string>();

  try {
    // 3. Search each area, collect candidates up to target_count
    for (const area of orderedAreas) {
      if (totalAccepted >= job.target_count) break;

      let searchCandidates: CandidateResult[] = [];
      try {
        const provider = resolveSourceProvider(job.source_type, {
          GOOGLE_MAPS_API_KEY: env.GOOGLE_MAPS_API_KEY,
        });
        const maxForThisArea = Math.min(
          job.max_per_area,
          job.target_count - totalAccepted + 5 // overfetch slightly to account for dedup/quality filtering
        );
        const result = await provider.searchCandidates({
          query: job.niche,
          location: area,
          niche: job.niche,
          maxResults: Math.min(maxForThisArea, 50),
        });
        searchCandidates = result.candidates;
      } catch (err: any) {
        totalErrors++;
        continue;
      }

      // Create source run for this area
      const runId = uid();
      const ts = now();
      await db
        .prepare(
          `INSERT INTO outreach_source_runs
           (id, tenant_id, source_type, query, location, niche, status, result_count, imported_count, created_at, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,'completed',?7,0,?8,?9)`
        )
        .bind(runId, tenantId, job.source_type, job.niche, area, job.niche, searchCandidates.length, ts, ts)
        .run();

      let areaAccepted = 0;

      for (const c of searchCandidates) {
        if (totalAccepted >= job.target_count) break;
        if (areaAccepted >= job.max_per_area) break;

        totalSearched++;

        // Validate
        if (!c.storeName?.trim()) continue;

        // Dedup
        const domain = normalizeDomain(c.websiteUrl);
        let importStatus = "new";
        let dedupReason: string | null = null;
        let dedupLeadId: string | null = null;

        if (domain && byDomain.has(domain)) {
          importStatus = "duplicate";
          dedupReason = `ドメイン一致: ${domain}`;
          dedupLeadId = byDomain.get(domain)!.id;
        } else if (domain && batchDomains.has(domain)) {
          importStatus = "duplicate";
          dedupReason = "バッチ内重複";
        } else if (c.email) {
          const emailMatch = byEmail.get(c.email.toLowerCase());
          if (emailMatch) {
            importStatus = "duplicate";
            dedupReason = `メール一致: ${c.email}`;
            dedupLeadId = emailMatch.id;
          }
        }
        if (!dedupLeadId && c.storeName && c.area) {
          const key = `${c.storeName.toLowerCase()}|${c.area.toLowerCase()}`;
          if (byNameArea.has(key)) {
            importStatus = "duplicate";
            dedupReason = "店名+エリア一致";
            dedupLeadId = byNameArea.get(key)!.id;
          }
        }

        if (importStatus === "duplicate") { totalSkippedDedup++; continue; }

        // Quality score
        const qualityScore = computeCandidateQualityScore({
          website_url: c.websiteUrl ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
          import_status: importStatus as any,
          category: c.category ?? null,
          area: c.area ?? null,
          rating: c.rating ?? null,
          review_count: c.reviewCount ?? 0,
        });

        // Auto-accept gate
        if (qualityScore < job.quality_threshold) { totalSkippedQuality++; continue; }

        // Has contact channel
        if (!c.websiteUrl && !c.email && !c.phone) { totalSkippedNoContact++; continue; }

        // Save candidate
        const candId = uid();
        const sourceKey = [job.source_type, job.niche, area].filter(Boolean).join(":").toLowerCase();

        await db
          .prepare(
            `INSERT INTO outreach_source_candidates
             (id, tenant_id, run_id, source_type, external_id, store_name, category, area, address,
              website_url, phone, email, rating, review_count, source_url, normalized_domain,
              import_status, dedup_reason, dedup_lead_id, raw_payload_json, quality_score,
              acceptance_status, accepted_at, source_key, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26)`
          )
          .bind(
            candId, tenantId, runId, job.source_type,
            c.externalId ?? null, c.storeName, c.category ?? null, c.area ?? area, c.address ?? null,
            c.websiteUrl ?? null, c.phone ?? null, c.email ?? null,
            c.rating ?? null, c.reviewCount ?? 0,
            c.sourceUrl ?? null, domain,
            "new", null, null,
            c.rawPayload ? JSON.stringify(c.rawPayload) : null,
            qualityScore,
            "accepted", ts, sourceKey, ts, ts
          )
          .run();

        // Track for intra-batch dedup
        if (domain) batchDomains.add(domain);
        if (c.storeName && c.area) {
          const key = `${c.storeName.toLowerCase()}|${(c.area ?? area).toLowerCase()}`;
          byNameArea.set(key, { id: candId, store_name: c.storeName });
        }

        // Import as lead (handle UNIQUE constraint on normalized_domain)
        const leadId = uid();
        let leadInserted = false;
        try {
          await db
            .prepare(
              `INSERT INTO sales_leads
               (id, tenant_id, store_name, industry, website_url, contact_email, category, area,
                rating, review_count, has_booking_link, status, pipeline_stage,
                domain, normalized_domain, import_source, source_type, source_run_id, source_ref, imported_at,
                created_at, updated_at)
               VALUES (?1,?2,?3,'shared',?4,?5,?6,?7,?8,?9,0,'new','new',?10,?11,?12,?13,?14,?15,?16,?17,?18)`
            )
            .bind(
              leadId, tenantId, c.storeName,
              c.websiteUrl ?? null, c.email ?? null,
              job.niche ?? c.category ?? null, c.area ?? area,
              c.rating ?? null, c.reviewCount ?? 0,
              domain, domain,
              job.source_type, job.source_type, runId, c.externalId ?? candId,
              ts, ts, ts
            )
            .run();
          leadInserted = true;
        } catch (insertErr: any) {
          const msg = String(insertErr?.message ?? "");
          if (msg.includes("UNIQUE") || msg.includes("constraint")) {
            console.warn(`[BATCH_IMPORT] duplicate domain skipped: tenant=${tenantId} domain=${domain} cand=${candId}`);
            await db.prepare(
              "UPDATE outreach_source_candidates SET import_status = 'duplicate', dedup_reason = 'domain_unique', updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
            ).bind(ts, candId, tenantId).run();
            totalAccepted++;
            areaAccepted++;
            continue;
          }
          console.error(`[BATCH_IMPORT] insert failed: tenant=${tenantId} cand=${candId} err=${msg}`);
          continue;
        }

        // Mark candidate as imported
        await db
          .prepare("UPDATE outreach_source_candidates SET import_status = 'imported', updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3")
          .bind(ts, candId, tenantId)
          .run();

        // Record batch item
        const itemId = uid();
        await db
          .prepare(
            `INSERT INTO outreach_batch_job_items
             (id, tenant_id, batch_job_id, source_candidate_id, lead_id, status, created_at)
             VALUES (?1,?2,?3,?4,?5,'imported',?6)`
          )
          .bind(itemId, tenantId, jobId, candId, leadId, ts)
          .run();
        items.push({
          id: itemId,
          tenant_id: tenantId,
          batch_job_id: jobId,
          source_candidate_id: candId,
          lead_id: leadId,
          review_item_id: null,
          status: "imported",
          error_message: null,
          created_at: ts,
        });

        createdLeadIds.push(leadId);
        totalAccepted++;
        totalImported++;
        areaAccepted++;

        // Update dedup maps for subsequent iterations
        if (domain) byDomain.set(domain, { id: leadId, store_name: c.storeName });
        if (c.email) byEmail.set(c.email.toLowerCase(), { id: leadId, store_name: c.storeName });
      }

      // Update run imported_count
      await db
        .prepare("UPDATE outreach_source_runs SET imported_count = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4")
        .bind(areaAccepted, now(), runId, tenantId)
        .run();
    }

    // 4. Auto-analyze + auto-score imported leads
    for (const item of items) {
      if (!item.lead_id) continue;
      try {
        const lead = await db
          .prepare("SELECT * FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
          .bind(item.lead_id, tenantId)
          .first<OutreachLead>();
        if (!lead) continue;

        if (lead.website_url) {
          const analyzer = new DefaultWebsiteAnalyzer();
          const features = await analyzer.analyze({
            websiteUrl: lead.website_url,
            instagramUrl: lead.instagram_url,
            lineUrl: lead.line_url,
          });
          const hypotheses = generatePainHypotheses(features);

          // Save features
          const featureId = uid();
          const fts = now();
          await db.prepare("DELETE FROM outreach_lead_features WHERE tenant_id = ?1 AND lead_id = ?2")
            .bind(tenantId, item.lead_id).run();
          await db
            .prepare(
              `INSERT INTO outreach_lead_features
               (id, tenant_id, lead_id, has_website, has_instagram, has_line_link, has_booking_link,
                contact_email_found, phone_found, menu_count_guess, price_info_found,
                booking_cta_count, booking_cta_depth_guess, title_found, meta_description_found,
                raw_signals_json, analyzed_at, created_at, updated_at)
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)`
            )
            .bind(
              featureId, tenantId, item.lead_id,
              features.hasWebsite ? 1 : 0, features.hasInstagram ? 1 : 0,
              features.hasLineLink ? 1 : 0, features.hasBookingLink ? 1 : 0,
              features.contactEmailFound ? 1 : 0, features.phoneFound ? 1 : 0,
              features.menuCountGuess, features.priceInfoFound ? 1 : 0,
              features.bookingCtaCount, features.bookingCtaDepthGuess,
              features.titleFound ? 1 : 0, features.metaDescriptionFound ? 1 : 0,
              JSON.stringify(features.rawSignals), fts, fts, fts
            )
            .run();

          // Save hypotheses
          await db.prepare("DELETE FROM outreach_pain_hypotheses WHERE tenant_id = ?1 AND lead_id = ?2")
            .bind(tenantId, item.lead_id).run();
          for (const h of hypotheses) {
            await db
              .prepare(
                `INSERT INTO outreach_pain_hypotheses (id, tenant_id, lead_id, code, label, severity, reason, created_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`
              )
              .bind(uid(), tenantId, item.lead_id, h.code, h.label, h.severity, h.reason, fts)
              .run();
          }

          // V2 score
          const featureRow = await db
            .prepare("SELECT * FROM outreach_lead_features WHERE tenant_id = ?1 AND lead_id = ?2")
            .bind(tenantId, item.lead_id)
            .first<OutreachLeadFeatureRow>();
          if (featureRow) {
            const scoreResult = computeLeadScoreV2(lead, featureRow, hypotheses as any);
            await db
              .prepare("UPDATE sales_leads SET score = ?1, features_json = ?2, pain_points = ?3, updated_at = ?4 WHERE id = ?5 AND tenant_id = ?6")
              .bind(
                scoreResult.score,
                JSON.stringify(scoreResult.components),
                hypotheses.map((h: any) => h.label).join(", "),
                now(), item.lead_id, tenantId
              )
              .run();
          }
        } else {
          // V1 score only
          const scoreResult = computeLeadScore(lead);
          await db
            .prepare("UPDATE sales_leads SET score = ?1, features_json = ?2, updated_at = ?3 WHERE id = ?4 AND tenant_id = ?5")
            .bind(scoreResult.score, JSON.stringify(scoreResult.components), now(), item.lead_id, tenantId)
            .run();
        }

        // Update item status
        await db
          .prepare("UPDATE outreach_batch_job_items SET status = 'scored' WHERE id = ?1 AND tenant_id = ?2")
          .bind(item.id, tenantId)
          .run();
        item.status = "scored";
      } catch (err: any) {
        totalErrors++;
        await db
          .prepare("UPDATE outreach_batch_job_items SET status = 'error', error_message = ?1 WHERE id = ?2 AND tenant_id = ?3")
          .bind(err.message ?? "analyze/score failed", item.id, tenantId)
          .run();
        item.status = "error";
        item.error_message = err.message ?? "analyze/score failed";
      }
    }

    // 5. Generate campaign draft if we have imported leads
    //    Also run if existing matching leads are available (draft counts all matching, not just new)
    let draftDiagnostics: Record<string, number> | null = null;
    if (totalImported > 0 || totalSearched > 0) {
      try {
        const draftResult = await generateCampaignDraft(db, tenantId, {
          niche: job.niche,
          auto_variants: true,
        }, uid, now);
        totalDrafted = draftResult.matchingLeads;
        draftDiagnostics = draftResult.diagnostics ?? null;

        // Update items with draft status
        for (const item of items) {
          if (item.status === "scored" || item.status === "imported") {
            await db
              .prepare("UPDATE outreach_batch_job_items SET status = 'drafted' WHERE id = ?1 AND tenant_id = ?2")
              .bind(item.id, tenantId)
              .run();
            item.status = "drafted";
          }
        }
      } catch (err: any) {
        totalErrors++;
        console.error(`[BATCH_DRAFT] error: tenant=${tenantId} job=${jobId} err=${(err as Error).message}`);
      }
    }

    // 6. Finalize job
    const summary = {
      searched: totalSearched,
      accepted: totalAccepted,
      imported: totalImported,
      drafted: totalDrafted,
      errors: totalErrors,
      skippedDedup: totalSkippedDedup,
      skippedQuality: totalSkippedQuality,
      skippedNoContact: totalSkippedNoContact,
      draftDiagnostics,
    };

    console.log(`[BATCH] tenant=${tenantId} job=${jobId} searched=${totalSearched} imported=${totalImported} drafted=${totalDrafted} skippedDedup=${totalSkippedDedup} skippedQuality=${totalSkippedQuality} skippedNoContact=${totalSkippedNoContact} errors=${totalErrors}`);

    await db
      .prepare(
        `UPDATE outreach_batch_jobs SET
           status = 'completed',
           created_count = ?1,
           imported_count = ?2,
           draft_count = ?3,
           error_count = ?4,
           result_summary_json = ?5,
           updated_at = ?6
         WHERE id = ?7 AND tenant_id = ?8`
      )
      .bind(
        totalSearched, totalImported, totalDrafted, totalErrors,
        JSON.stringify(summary), now(), jobId, tenantId
      )
      .run();

    const finalJob = await db
      .prepare("SELECT * FROM outreach_batch_jobs WHERE id = ?1 AND tenant_id = ?2")
      .bind(jobId, tenantId)
      .first<OutreachBatchJob>();

    return {
      job: finalJob ?? { ...job, status: "completed" as const },
      items,
      summary,
    };
  } catch (err: any) {
    // Mark failed
    await db
      .prepare("UPDATE outreach_batch_jobs SET status = 'failed', error_message = ?1, error_count = ?2, updated_at = ?3 WHERE id = ?4 AND tenant_id = ?5")
      .bind(err.message ?? "unknown error", totalErrors, now(), jobId, tenantId)
      .run();

    throw err;
  }
}

// ── Helper ──────────────────────────────────────────────────────────────

function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function getOutreachSettings(kv: KVNamespace, tenantId: string): Promise<OutreachSettings> {
  const raw = await kv.get(`outreach:settings:${tenantId}`);
  if (!raw) return { ...DEFAULT_OUTREACH_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_OUTREACH_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_OUTREACH_SETTINGS };
  }
}
