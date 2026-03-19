// Outreach OS — Hono Routes
// ============================================================
// Mounted at /admin/outreach/* in main index.ts
// All routes receive tenantId via getTenantId() (defined in index.ts).

import { Hono } from "hono";
import { computeLeadScore, computeLeadScoreV2 } from "./scoring";
import { generateOutreachMessage } from "./ai-generator";
import { AICore } from "../ai";
import { DefaultWebsiteAnalyzer } from "./analyzer";
import { generatePainHypotheses } from "./pain-hypothesis";
import type { PainHypothesis } from "./pain-hypothesis";
import type { ExtractedFeatures } from "./analyzer";
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
import { classifyReply } from "./reply-classifier";
import { parseCsv, buildPreview, buildMergeSets, normalizeDomain as importNormalizeDomain } from "./importer";
import { resolveSourceProvider } from "./source-providers/provider-factory";
import { refreshLearningPatterns, getLearningContext, generateNicheTemplates } from "./learning";
import {
  computeCandidateQualityScore,
  backfillCandidateQualityScores,
  acceptCandidate,
  rejectCandidate,
  aggregateSourceQuality,
  getTopSources,
  batchAcceptCandidates,
  batchRejectCandidates,
  batchResetCandidates,
  getAcceptedImportableCount,
} from "./source-quality";
import {
  getSourceQualityTrends,
  getSourceQualityBreakdown,
} from "./source-quality-daily";
import {
  refreshQualityPatterns,
  computeLearnedQualityScore,
  backfillQualityV2,
  getLearnedQualityInsights,
} from "./candidate-quality-learning";
import type { LearningPattern } from "./learning";
import { generateCampaignDraft } from "./campaign-generator";
import { createBatchJob, runBatchJob } from "./batches";
import { createSchedule, updateSchedule, runScheduleNow, runAutoCampaign } from "./automation";
import {
  generateRecommendations,
  getCopilotOverview,
  getCopilotInsights,
  computeReviewPriorities,
  acceptRecommendation,
  dismissRecommendation,
} from "./copilot";
import {
  executeRecommendationAction,
  getActionLogs,
  getAutoActionSettings,
  saveAutoActionSettings,
  processAutoActions,
} from "./action-engine";
import {
  processReply,
  processUnhandledReplies,
  getAutoReplySettings,
  saveAutoReplySettings,
} from "./reply-dispatcher";
import { classifyReplyIntent } from "./reply-classifier";
import type { CopilotRecommendation } from "./copilot";
import type { CandidateResult } from "./source-providers/types";
import type { ExistingLead } from "./importer";
import type {
  PipelineStage,
  CreateLeadInput,
  UpdateLeadInput,
  GenerateMessageInput,
  OutreachLead,
  OutreachLeadFeatureRow,
  OutreachPainHypothesisRow,
  OutreachSettings,
  ReplyClassification,
  LearningInsight,
  LearningAnalytics,
  OutreachCampaign,
  OutreachCampaignVariant,
  CampaignStatus,
  ImportResult,
  OutreachSourceRun,
  OutreachSourceCandidate,
  SourceAnalytics,
  CampaignDraftInput,
  OutreachNicheTemplate,
  OutreachBatchJob,
  OutreachBatchJobItem,
  BatchJobCreateInput,
  OutreachSchedule,
  OutreachScheduleRun,
  ScheduleCreateInput,
} from "./types";
import { DEFAULT_OUTREACH_SETTINGS, REPLY_CLASSIFICATION_LABELS, CLASSIFY_CONFIDENCE_THRESHOLD, DEFAULT_AUTO_REPLY_SETTINGS } from "./types";
import type { OutreachReply, OutreachReplyLog, AutoReplySettings, ReplyIntent, ReplySource } from "./types";
import { logAudit } from "../lineConfig";

type Bindings = {
  DB: D1Database;
  SAAS_FACTORY: KVNamespace;
  OPENAI_API_KEY?: string;
  GOOGLE_MAPS_API_KEY?: string;
};

// Re-use getTenantId from parent — passed via factory function
type GetTenantId = (c: any, body?: any) => string;

export function createOutreachRoutes(getTenantId: GetTenantId) {
  const app = new Hono<{ Bindings: Bindings }>();

  // ── Helper ─────────────────────────────────────────────────────────────
  function uid(): string {
    return `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function now(): string {
    return new Date().toISOString();
  }

  /** Phase 4: Normalize a URL to its domain (lowercase, strip www) */
  function normalizeDomain(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      return u.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return null;
    }
  }

  /** Phase 4: Extract raw domain from URL */
  function extractDomain(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      return u.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  // ── GET /leads — List leads ────────────────────────────────────────────
  app.get("/leads", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const url = new URL(c.req.url);

    const status = url.searchParams.get("status");
    const pipelineStage = url.searchParams.get("pipeline_stage");
    const sortBy = url.searchParams.get("sort") ?? "score";
    const order = url.searchParams.get("order") === "asc" ? "ASC" : "DESC";
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

    let where = "tenant_id = ?1";
    const params: any[] = [tenantId];
    let paramIdx = 2;

    if (status) {
      where += ` AND status = ?${paramIdx}`;
      params.push(status);
      paramIdx++;
    }
    if (pipelineStage) {
      where += ` AND pipeline_stage = ?${paramIdx}`;
      params.push(pipelineStage);
      paramIdx++;
    }

    const validSorts = ["score", "created_at", "updated_at", "store_name", "rating", "review_count"];
    const sortCol = validSorts.includes(sortBy) ? sortBy : "score";

    const countResult = await db
      .prepare(`SELECT COUNT(*) as total FROM sales_leads WHERE ${where}`)
      .bind(...params)
      .first<{ total: number }>();

    const rows = await db
      .prepare(
        `SELECT * FROM sales_leads WHERE ${where} ORDER BY ${sortCol} ${order} NULLS LAST LIMIT ?${paramIdx} OFFSET ?${paramIdx + 1}`
      )
      .bind(...params, limit, offset)
      .all();

    return c.json({
      ok: true,
      tenantId,
      data: {
        leads: rows.results ?? [],
        total: countResult?.total ?? 0,
        limit,
        offset,
      },
    });
  });

  // ── POST /leads — Create lead ──────────────────────────────────────────
  app.post("/leads", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<CreateLeadInput>();

    if (!body.store_name?.trim()) {
      return c.json({ ok: false, error: "store_name is required" }, 400);
    }

    // Phase 4: Domain deduplication
    const domain = extractDomain(body.website_url);
    const normalizedDomain = normalizeDomain(body.website_url);

    if (normalizedDomain) {
      const existing = await db
        .prepare("SELECT id, store_name FROM sales_leads WHERE tenant_id = ?1 AND normalized_domain = ?2")
        .bind(tenantId, normalizedDomain)
        .first<{ id: string; store_name: string }>();

      if (existing) {
        return c.json({
          ok: false,
          error: `同一ドメインのリードが既に存在します: ${existing.store_name} (${normalizedDomain})`,
          existingLeadId: existing.id,
        }, 409);
      }
    }

    const id = uid();
    const ts = now();

    await db
      .prepare(
        `INSERT INTO sales_leads
         (id, tenant_id, store_name, industry, website_url, instagram_url, line_url,
          region, notes, status, contact_email, category, area, rating, review_count,
          has_booking_link, pipeline_stage, domain, normalized_domain, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'new', ?10, ?11, ?12, ?13, ?14, ?15, 'new', ?16, ?17, ?18, ?19)`
      )
      .bind(
        id,
        tenantId,
        body.store_name.trim(),
        body.industry ?? "shared",
        body.website_url ?? null,
        body.instagram_url ?? null,
        body.line_url ?? null,
        body.region ?? null,
        body.notes ?? null,
        body.contact_email ?? null,
        body.category ?? null,
        body.area ?? null,
        body.rating ?? null,
        body.review_count ?? 0,
        body.has_booking_link ? 1 : 0,
        domain,
        normalizedDomain,
        ts,
        ts
      )
      .run();

    const lead = await db
      .prepare("SELECT * FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(id, tenantId)
      .first();

    return c.json({ ok: true, tenantId, data: lead }, 201);
  });

  // ── PATCH /leads/:id — Update lead ─────────────────────────────────────
  app.patch("/leads/:id", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const leadId = c.req.param("id");
    const body = await c.req.json<UpdateLeadInput>();

    // Verify ownership
    const existing = await db
      .prepare("SELECT id FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(leadId, tenantId)
      .first();

    if (!existing) {
      return c.json({ ok: false, error: "Lead not found" }, 404);
    }

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    const fields: Array<[keyof UpdateLeadInput, string]> = [
      ["store_name", "store_name"],
      ["industry", "industry"],
      ["website_url", "website_url"],
      ["instagram_url", "instagram_url"],
      ["line_url", "line_url"],
      ["region", "region"],
      ["notes", "notes"],
      ["status", "status"],
      ["contact_email", "contact_email"],
      ["category", "category"],
      ["area", "area"],
      ["rating", "rating"],
      ["review_count", "review_count"],
      ["pipeline_stage", "pipeline_stage"],
      ["pain_points", "pain_points"],
      ["best_offer", "best_offer"],
      ["recommended_channel", "recommended_channel"],
      ["next_action", "next_action"],
      ["score", "score"],
    ];

    for (const [key, col] of fields) {
      if (body[key] !== undefined) {
        let val: any = body[key];
        if (key === "has_booking_link") val = val ? 1 : 0;
        sets.push(`${col} = ?${idx}`);
        vals.push(val);
        idx++;
      }
    }

    // has_booking_link special handling (boolean → int)
    if (body.has_booking_link !== undefined) {
      sets.push(`has_booking_link = ?${idx}`);
      vals.push(body.has_booking_link ? 1 : 0);
      idx++;
    }

    if (sets.length === 0) {
      return c.json({ ok: false, error: "No fields to update" }, 400);
    }

    sets.push(`updated_at = ?${idx}`);
    vals.push(now());
    idx++;

    vals.push(leadId);
    vals.push(tenantId);

    await db
      .prepare(
        `UPDATE sales_leads SET ${sets.join(", ")} WHERE id = ?${idx} AND tenant_id = ?${idx + 1}`
      )
      .bind(...vals)
      .run();

    const updated = await db
      .prepare("SELECT * FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(leadId, tenantId)
      .first();

    return c.json({ ok: true, tenantId, data: updated });
  });

  // ── POST /score/:id — Compute score (V1 fallback) ─────────────────────
  app.post("/score/:id", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const leadId = c.req.param("id");

    const lead = await db
      .prepare("SELECT * FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(leadId, tenantId)
      .first<OutreachLead>();

    if (!lead) {
      return c.json({ ok: false, error: "Lead not found" }, 404);
    }

    const result = computeLeadScore({
      reviewCount: lead.review_count ?? 0,
      rating: lead.rating,
      hasWebsite: !!lead.website_url,
      hasInstagram: !!lead.instagram_url,
      hasBookingLink: !!lead.has_booking_link,
      hasLineLink: !!lead.line_url,
      contactEmail: lead.contact_email,
      category: lead.category,
    });

    await db
      .prepare(
        "UPDATE sales_leads SET score = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4"
      )
      .bind(result.score, now(), leadId, tenantId)
      .run();

    return c.json({ ok: true, tenantId, data: { score: result.score, components: result.components } });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 2: Website Analyzer + Pain Hypotheses + V2 Scoring
  // ══════════════════════════════════════════════════════════════════════════

  // ── POST /analyze/:id — Full analysis pipeline ─────────────────────────
  app.post("/analyze/:id", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const leadId = c.req.param("id");

    // 1. Fetch lead with tenant guard
    const lead = await db
      .prepare("SELECT * FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(leadId, tenantId)
      .first<OutreachLead>();

    if (!lead) {
      return c.json({ ok: false, error: "Lead not found" }, 404);
    }

    if (!lead.website_url) {
      return c.json({ ok: false, error: "website_url が未設定です" }, 400);
    }

    // 2. Run website analyzer
    const analyzer = new DefaultWebsiteAnalyzer();
    let features: ExtractedFeatures;
    try {
      features = await analyzer.analyze({
        websiteUrl: lead.website_url,
        instagramUrl: lead.instagram_url,
        lineUrl: lead.line_url,
      });
    } catch (err: any) {
      return c.json({
        ok: false,
        error: `解析に失敗しました: ${err?.message ?? "unknown"}`,
      }, 500);
    }

    // 3. Generate pain hypotheses
    const hypotheses = generatePainHypotheses(features);

    // 4. Save features (upsert via delete + insert for D1 compatibility)
    const featureId = uid();
    const ts = now();

    await db
      .prepare("DELETE FROM outreach_lead_features WHERE tenant_id = ?1 AND lead_id = ?2")
      .bind(tenantId, leadId)
      .run();

    await db
      .prepare(
        `INSERT INTO outreach_lead_features
         (id, tenant_id, lead_id, has_website, has_instagram, has_line_link, has_booking_link,
          contact_email_found, phone_found, menu_count_guess, price_info_found,
          booking_cta_count, booking_cta_depth_guess, title_found, meta_description_found,
          raw_signals_json, analyzed_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`
      )
      .bind(
        featureId, tenantId, leadId,
        features.hasWebsite ? 1 : 0,
        features.hasInstagram ? 1 : 0,
        features.hasLineLink ? 1 : 0,
        features.hasBookingLink ? 1 : 0,
        features.contactEmailFound ? 1 : 0,
        features.phoneFound ? 1 : 0,
        features.menuCountGuess,
        features.priceInfoFound ? 1 : 0,
        features.bookingCtaCount,
        features.bookingCtaDepthGuess,
        features.titleFound ? 1 : 0,
        features.metaDescriptionFound ? 1 : 0,
        JSON.stringify(features.rawSignals),
        ts, ts, ts
      )
      .run();

    // 5. Save hypotheses (upsert: delete old + insert new)
    await db
      .prepare("DELETE FROM outreach_pain_hypotheses WHERE tenant_id = ?1 AND lead_id = ?2")
      .bind(tenantId, leadId)
      .run();

    for (const h of hypotheses) {
      await db
        .prepare(
          `INSERT INTO outreach_pain_hypotheses (id, tenant_id, lead_id, code, label, severity, reason, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
        )
        .bind(uid(), tenantId, leadId, h.code, h.label, h.severity, h.reason, ts)
        .run();
    }

    // 6. Compute V2 score
    const scoreResult = computeLeadScoreV2(
      {
        reviewCount: lead.review_count ?? 0,
        rating: lead.rating,
        hasWebsite: features.hasWebsite,
        hasInstagram: features.hasInstagram,
        hasBookingLink: features.hasBookingLink,
        hasLineLink: features.hasLineLink,
        contactEmail: lead.contact_email,
        category: lead.category,
      },
      features,
      hypotheses
    );

    // 6.5. Auto-enrich contact_email if empty and emails found by analyzer
    let enrichedEmail: string | null = null;
    if (!lead.contact_email && features.rawSignals.emails?.length > 0) {
      // Prefer domain-matching email over free email
      const siteDomain = (() => { try { return new URL(lead.website_url || "").hostname.replace(/^www\./, ""); } catch { return ""; } })();
      const FREE = ["gmail.com", "yahoo.co.jp", "yahoo.com", "hotmail.com", "outlook.com"];
      const domainMatch = features.rawSignals.emails.find((e: string) => {
        const d = e.split("@")[1]?.toLowerCase() || "";
        return siteDomain && (d === siteDomain || siteDomain.includes(d));
      });
      const nonFree = features.rawSignals.emails.find((e: string) => {
        const d = e.split("@")[1]?.toLowerCase() || "";
        return !FREE.includes(d);
      });
      enrichedEmail = domainMatch || nonFree || features.rawSignals.emails[0];
    }

    // 7. Update lead with score + features_json + pain_points + enriched email
    const painSummary = hypotheses.map((h) => h.label).join(", ");
    const emailUpdateClause = enrichedEmail ? ", contact_email = ?8" : "";
    const emailBinds = enrichedEmail ? [enrichedEmail] : [];
    await db
      .prepare(
        `UPDATE sales_leads
         SET score = ?1, features_json = ?2, pain_points = ?3,
             has_booking_link = ?4, updated_at = ?5${emailUpdateClause}
         WHERE id = ?6 AND tenant_id = ?7`
      )
      .bind(
        scoreResult.score,
        JSON.stringify(features),
        painSummary,
        features.hasBookingLink ? 1 : 0,
        ts,
        leadId,
        tenantId,
        ...emailBinds
      )
      .run();

    // 8. Fetch saved rows to return
    const savedFeatures = await db
      .prepare("SELECT * FROM outreach_lead_features WHERE tenant_id = ?1 AND lead_id = ?2")
      .bind(tenantId, leadId)
      .first<OutreachLeadFeatureRow>();

    const savedHypotheses = await db
      .prepare("SELECT * FROM outreach_pain_hypotheses WHERE tenant_id = ?1 AND lead_id = ?2 ORDER BY created_at")
      .bind(tenantId, leadId)
      .all<OutreachPainHypothesisRow>();

    return c.json({
      ok: true,
      tenantId,
      data: {
        features: savedFeatures,
        hypotheses: savedHypotheses?.results ?? [],
        score: { score: scoreResult.score, components: scoreResult.components },
      },
    });
  });

  // ── POST /rescore/:id — Re-score using saved features ──────────────────
  app.post("/rescore/:id", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const leadId = c.req.param("id");

    const lead = await db
      .prepare("SELECT * FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(leadId, tenantId)
      .first<OutreachLead>();

    if (!lead) {
      return c.json({ ok: false, error: "Lead not found" }, 404);
    }

    // Check for saved features
    const featureRow = await db
      .prepare("SELECT * FROM outreach_lead_features WHERE tenant_id = ?1 AND lead_id = ?2")
      .bind(tenantId, leadId)
      .first<OutreachLeadFeatureRow>();

    const hypothesisRows = await db
      .prepare("SELECT * FROM outreach_pain_hypotheses WHERE tenant_id = ?1 AND lead_id = ?2")
      .bind(tenantId, leadId)
      .all<OutreachPainHypothesisRow>();

    // Convert feature row to ExtractedFeatures if available
    let features: ExtractedFeatures | null = null;
    let hypotheses: PainHypothesis[] | null = null;

    if (featureRow) {
      features = {
        hasWebsite: !!featureRow.has_website,
        hasInstagram: !!featureRow.has_instagram,
        hasLineLink: !!featureRow.has_line_link,
        hasBookingLink: !!featureRow.has_booking_link,
        contactEmailFound: !!featureRow.contact_email_found,
        phoneFound: !!featureRow.phone_found,
        menuCountGuess: featureRow.menu_count_guess,
        priceInfoFound: !!featureRow.price_info_found,
        bookingCtaCount: featureRow.booking_cta_count,
        bookingCtaDepthGuess: featureRow.booking_cta_depth_guess,
        titleFound: !!featureRow.title_found,
        metaDescriptionFound: !!featureRow.meta_description_found,
        rawSignals: featureRow.raw_signals_json ? JSON.parse(featureRow.raw_signals_json) : {
          emails: [], phones: [], instagramLinks: [], lineLinks: [],
          bookingLinks: [], bookingKeywords: [], menuKeywords: [], priceKeywords: [],
          fetchStatus: null, responseTimeMs: 0, contentLengthBytes: 0,
        },
      };
    }

    if (hypothesisRows?.results?.length) {
      hypotheses = hypothesisRows.results.map((r) => ({
        code: r.code,
        label: r.label,
        severity: r.severity as any,
        reason: r.reason,
      }));
    }

    // Use V2 if features available, V1 otherwise
    const result = features
      ? computeLeadScoreV2(
          {
            reviewCount: lead.review_count ?? 0,
            rating: lead.rating,
            hasWebsite: features.hasWebsite,
            hasInstagram: features.hasInstagram,
            hasBookingLink: features.hasBookingLink,
            hasLineLink: features.hasLineLink,
            contactEmail: lead.contact_email,
            category: lead.category,
          },
          features,
          hypotheses
        )
      : computeLeadScore({
          reviewCount: lead.review_count ?? 0,
          rating: lead.rating,
          hasWebsite: !!lead.website_url,
          hasInstagram: !!lead.instagram_url,
          hasBookingLink: !!lead.has_booking_link,
          hasLineLink: !!lead.line_url,
          contactEmail: lead.contact_email,
          category: lead.category,
        });

    await db
      .prepare(
        "UPDATE sales_leads SET score = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4"
      )
      .bind(result.score, now(), leadId, tenantId)
      .run();

    return c.json({
      ok: true,
      tenantId,
      data: {
        score: result.score,
        components: result.components,
        hasFeatures: !!featureRow,
      },
    });
  });

  // ── POST /generate-message/:id — AI message generation ─────────────────
  app.post("/generate-message/:id", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const leadId = c.req.param("id");
    const input = await c.req.json<GenerateMessageInput>();

    const lead = await db
      .prepare("SELECT * FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(leadId, tenantId)
      .first<OutreachLead>();

    if (!lead) {
      return c.json({ ok: false, error: "Lead not found" }, 404);
    }

    // Phase 2: Load saved features + hypotheses for better generation
    let features: ExtractedFeatures | null = null;
    let hypotheses: PainHypothesis[] | null = null;

    const featureRow = await db
      .prepare("SELECT * FROM outreach_lead_features WHERE tenant_id = ?1 AND lead_id = ?2")
      .bind(tenantId, leadId)
      .first<OutreachLeadFeatureRow>();

    if (featureRow) {
      features = {
        hasWebsite: !!featureRow.has_website,
        hasInstagram: !!featureRow.has_instagram,
        hasLineLink: !!featureRow.has_line_link,
        hasBookingLink: !!featureRow.has_booking_link,
        contactEmailFound: !!featureRow.contact_email_found,
        phoneFound: !!featureRow.phone_found,
        menuCountGuess: featureRow.menu_count_guess,
        priceInfoFound: !!featureRow.price_info_found,
        bookingCtaCount: featureRow.booking_cta_count,
        bookingCtaDepthGuess: featureRow.booking_cta_depth_guess,
        titleFound: !!featureRow.title_found,
        metaDescriptionFound: !!featureRow.meta_description_found,
        rawSignals: featureRow.raw_signals_json ? JSON.parse(featureRow.raw_signals_json) : {
          emails: [], phones: [], instagramLinks: [], lineLinks: [],
          bookingLinks: [], bookingKeywords: [], menuKeywords: [], priceKeywords: [],
          fetchStatus: null, responseTimeMs: 0, contentLengthBytes: 0,
        },
      };
    }

    const hypothesisRows = await db
      .prepare("SELECT * FROM outreach_pain_hypotheses WHERE tenant_id = ?1 AND lead_id = ?2")
      .bind(tenantId, leadId)
      .all<OutreachPainHypothesisRow>();

    if (hypothesisRows?.results?.length) {
      hypotheses = hypothesisRows.results.map((r) => ({
        code: r.code,
        label: r.label,
        severity: r.severity as any,
        reason: r.reason,
      }));
    }

    // Phase 6: Load learning context for winning pattern injection
    const learningCtx = await getLearningContext(db, tenantId, lead.category);

    const generated = await generateOutreachMessage(lead, input, {
      openaiApiKey: c.env.OPENAI_API_KEY,
      aiCore: new AICore(c.env as any),
      tenantId,
    }, features, hypotheses, learningCtx);

    // Save as draft
    const messageId = uid();
    const fullBody = [generated.opener, "", generated.body, "", generated.cta].join("\n");

    await db
      .prepare(
        `INSERT INTO lead_message_drafts
         (id, lead_id, tenant_id, kind, subject, body, status, tone, pain_points_json, reasoning_summary, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending_review', ?7, ?8, ?9, ?10)`
      )
      .bind(
        messageId,
        leadId,
        tenantId,
        input.channel ?? "email",
        generated.subject,
        fullBody,
        generated.tone,
        JSON.stringify(generated.painPoints),
        generated.reasoningSummary,
        now()
      )
      .run();

    return c.json({
      ok: true,
      tenantId,
      data: {
        messageId,
        generated,
      },
    });
  });

  // ── GET /review — List messages pending review ─────────────────────────
  app.get("/review", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const url = new URL(c.req.url);
    const status = url.searchParams.get("status") ?? "pending_review";

    const rows = await db
      .prepare(
        `SELECT m.*, l.store_name, l.area, l.category, l.pipeline_stage, l.contact_email
         FROM lead_message_drafts m
         JOIN sales_leads l ON m.lead_id = l.id
         WHERE m.tenant_id = ?1 AND m.status = ?2
         ORDER BY m.created_at DESC
         LIMIT 100`
      )
      .bind(tenantId, status)
      .all();

    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // ── POST /review/:id/approve — Approve message ─────────────────────────
  app.post("/review/:id/approve", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const messageId = c.req.param("id");

    const msg = await db
      .prepare(
        "SELECT * FROM lead_message_drafts WHERE id = ?1 AND tenant_id = ?2"
      )
      .bind(messageId, tenantId)
      .first();

    if (!msg) {
      return c.json({ ok: false, error: "Message not found" }, 404);
    }

    await db
      .prepare(
        "UPDATE lead_message_drafts SET status = 'approved' WHERE id = ?1 AND tenant_id = ?2"
      )
      .bind(messageId, tenantId)
      .run();

    // Move lead to 'approved' pipeline stage
    await db
      .prepare(
        "UPDATE sales_leads SET pipeline_stage = 'approved', updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3 AND pipeline_stage = 'new'"
      )
      .bind(now(), (msg as any).lead_id, tenantId)
      .run();

    return c.json({ ok: true, tenantId, data: { messageId, status: "approved" } });
  });

  // ── POST /review/:id/reject — Reject message ──────────────────────────
  app.post("/review/:id/reject", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const messageId = c.req.param("id");

    const msg = await db
      .prepare(
        "SELECT id FROM lead_message_drafts WHERE id = ?1 AND tenant_id = ?2"
      )
      .bind(messageId, tenantId)
      .first();

    if (!msg) {
      return c.json({ ok: false, error: "Message not found" }, 404);
    }

    await db
      .prepare(
        "UPDATE lead_message_drafts SET status = 'rejected' WHERE id = ?1 AND tenant_id = ?2"
      )
      .bind(messageId, tenantId)
      .run();

    return c.json({ ok: true, tenantId, data: { messageId, status: "rejected" } });
  });

  // ── POST /campaigns/:id/send — Send message (configurable mode) ──────
  app.post("/campaigns/:id/send", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    const messageId = c.req.param("id");

    // 1. Read outreach settings
    const settings = await getOutreachSettings(kv, tenantId);

    // 2. Check approval requirement
    const allowedStatuses = settings.requireApproval
      ? "status = 'approved'"
      : "status IN ('approved', 'pending_review')";

    const msg = await db
      .prepare(
        `SELECT * FROM lead_message_drafts WHERE id = ?1 AND tenant_id = ?2 AND ${allowedStatuses}`
      )
      .bind(messageId, tenantId)
      .first<any>();

    if (!msg) {
      return c.json({ ok: false, error: settings.requireApproval ? "承認済みメッセージが見つかりません" : "送信可能なメッセージが見つかりません" }, 404);
    }

    const leadId = msg.lead_id;

    // 3. Safety checks (unsubscribe → contact cooldown → dedup → rate limit)
    const unsub = await isUnsubscribed(kv, tenantId, leadId);
    if (unsub) {
      return c.json({ ok: false, error: "リードは配信停止中です" }, 400);
    }

    // Phase 4: Contact cooldown guard
    const leadForCooldown = await db
      .prepare("SELECT last_contacted_at FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(leadId, tenantId)
      .first<{ last_contacted_at: string | null }>();

    if (leadForCooldown?.last_contacted_at) {
      const lastContact = new Date(leadForCooldown.last_contacted_at).getTime();
      const cooldownMs = (settings.contactCooldownDays ?? 7) * 86400 * 1000;
      if (Date.now() - lastContact < cooldownMs) {
        const daysAgo = Math.floor((Date.now() - lastContact) / (86400 * 1000));
        return c.json({ ok: false, error: `このリードには${daysAgo}日前に連絡済みです（クールダウン: ${settings.contactCooldownDays}日）` }, 400);
      }
    }

    const dup = await isDuplicateSend(kv, tenantId, leadId, messageId);
    if (dup) {
      return c.json({ ok: false, error: "このメッセージは既に送信済みです" }, 400);
    }

    const rl = await checkRateLimit(kv, tenantId, {
      dailyCap: settings.dailyCap,
      perTenantPerHour: settings.hourlyCap,
    });
    if (!rl.allowed) {
      return c.json({ ok: false, error: rl.reason }, 429);
    }

    // Phase 4.5: Check max send retries
    const leadAttempts = await db
      .prepare("SELECT send_attempt_count FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(leadId, tenantId)
      .first<{ send_attempt_count: number }>();

    if ((leadAttempts?.send_attempt_count ?? 0) >= MAX_SEND_RETRIES) {
      return c.json({ ok: false, error: `送信試行回数が上限(${MAX_SEND_RETRIES}回)に達しています` }, 400);
    }

    // 4. Resolve provider via settings
    const sender = resolveProvider(settings.sendMode, { RESEND_API_KEY: c.env.RESEND_API_KEY, EMAIL_FROM: c.env.EMAIL_FROM });
    const lead = await db
      .prepare("SELECT * FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(leadId, tenantId)
      .first<OutreachLead>();

    // 5. Resolve LP URL for token expansion
    const lpUrl = await (async () => {
      if (msg.campaign_id) {
        const camp = await db.prepare("SELECT landing_page_url FROM outreach_campaigns WHERE id = ?1 AND tenant_id = ?2")
          .bind(msg.campaign_id, tenantId).first<{ landing_page_url: string | null }>();
        if (camp?.landing_page_url) return camp.landing_page_url;
      }
      return settings.defaultLpUrl || "";
    })();

    // Fail-closed: block send if {{lp_url}} is used but no LP URL is resolved
    const lpTokenPattern = /\{\{lp_url\}\}/;
    const msgUsesLpToken = lpTokenPattern.test(msg.subject ?? "") || lpTokenPattern.test(msg.body ?? "");
    if (msgUsesLpToken && !lpUrl) {
      return c.json({ ok: false, error: "LP URL が未設定のため送信できません。キャンペーンまたは設定ページでLP URLを設定してください。" }, 400);
    }

    const expandTokens = (s: string) =>
      s.replace(/\{\{lp_url\}\}/g, lpUrl)
       .replace(/\{store_name\}/g, lead?.store_name ?? "")
       .replace(/\{area\}/g, lead?.area ?? "");

    const result = await sender.send({
      leadId,
      tenantId,
      channel: (msg.kind as any) ?? "email",
      to: lead?.contact_email ?? lead?.line_url ?? "",
      subject: expandTokens(msg.subject ?? ""),
      body: expandTokens(msg.body),
    });

    // 6. Record delivery event
    const eventId = uid();
    await db
      .prepare(
        `INSERT INTO outreach_delivery_events
         (id, tenant_id, lead_id, message_id, channel, event_type, status, metadata_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'sent', ?6, ?7, ?8)`
      )
      .bind(
        eventId, tenantId, leadId, messageId,
        msg.kind ?? "email",
        result.success ? "sent" : "failed",
        JSON.stringify({ provider: result.provider, messageId: result.messageId, sendMode: settings.sendMode, error: result.error }),
        now()
      )
      .run();

    // Phase 4.5: Track send attempt
    await trackSendAttempt(db, tenantId, leadId, result.error);

    // 7. Audit log
    await logAudit(db, tenantId, "system", "outreach.send", {
      messageId, leadId, eventId,
      provider: result.provider,
      sendMode: settings.sendMode,
      success: result.success,
    });

    if (result.success) {
      // Phase 4.5: Record normalized outreach event
      await db
        .prepare(
          `INSERT INTO outreach_events (id, tenant_id, lead_id, type, metadata, created_at)
           VALUES (?1, ?2, ?3, 'initial_send', ?4, ?5)`
        )
        .bind(uid(), tenantId, leadId, JSON.stringify({ messageId, provider: result.provider, sendMode: settings.sendMode }), now())
        .run();
      // Update message status
      await db
        .prepare(
          "UPDATE lead_message_drafts SET status = 'sent' WHERE id = ?1 AND tenant_id = ?2"
        )
        .bind(messageId, tenantId)
        .run();

      // 8. CRM stage transition + rate limit + dedup + contact timestamp
      const sendTs = now();
      await db
        .prepare(
          "UPDATE sales_leads SET pipeline_stage = 'contacted', last_contacted_at = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4 AND pipeline_stage IN ('new', 'approved')"
        )
        .bind(sendTs, sendTs, leadId, tenantId)
        .run();

      // Also update last_contacted_at for leads already in contacted+ stages
      await db
        .prepare(
          "UPDATE sales_leads SET last_contacted_at = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4 AND pipeline_stage NOT IN ('new', 'approved')"
        )
        .bind(sendTs, sendTs, leadId, tenantId)
        .run();

      await incrementRateLimit(kv, tenantId);
      await markSent(kv, tenantId, leadId, messageId);

      // Phase 4: Schedule followups
      if (settings.followupDay3Enabled) {
        const day3 = new Date(Date.now() + 3 * 86400 * 1000).toISOString();
        await db
          .prepare(
            `INSERT INTO outreach_followups (id, tenant_id, lead_id, step, scheduled_at, status, created_at)
             VALUES (?1, ?2, ?3, 'first_followup', ?4, 'scheduled', ?5)`
          )
          .bind(uid(), tenantId, leadId, day3, sendTs)
          .run();
      }
      if (settings.followupDay7Enabled) {
        const day7 = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
        await db
          .prepare(
            `INSERT INTO outreach_followups (id, tenant_id, lead_id, step, scheduled_at, status, created_at)
             VALUES (?1, ?2, ?3, 'second_followup', ?4, 'scheduled', ?5)`
          )
          .bind(uid(), tenantId, leadId, day7, sendTs)
          .run();
      }
      if (settings.followupDay14Enabled) {
        const day14 = new Date(Date.now() + 14 * 86400 * 1000).toISOString();
        await db
          .prepare(
            `INSERT INTO outreach_followups (id, tenant_id, lead_id, step, scheduled_at, status, created_at)
             VALUES (?1, ?2, ?3, 'breakup', ?4, 'scheduled', ?5)`
          )
          .bind(uid(), tenantId, leadId, day14, sendTs)
          .run();
      }
    }

    return c.json({
      ok: true,
      tenantId,
      data: {
        sent: result.success,
        provider: result.provider,
        sendMode: settings.sendMode,
        eventId,
        error: result.error,
      },
    });
  });

  // ── GET /analytics — Simple analytics ──────────────────────────────────
  app.get("/analytics", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;

    const [totalResult, stageResults, msgStats, scoreResult] = await Promise.all([
      db
        .prepare("SELECT COUNT(*) as total FROM sales_leads WHERE tenant_id = ?1")
        .bind(tenantId)
        .first<{ total: number }>(),
      db
        .prepare(
          "SELECT pipeline_stage, COUNT(*) as count FROM sales_leads WHERE tenant_id = ?1 GROUP BY pipeline_stage"
        )
        .bind(tenantId)
        .all<{ pipeline_stage: string; count: number }>(),
      db
        .prepare(
          `SELECT
             SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
             SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
             SUM(CASE WHEN status = 'sent' AND EXISTS (
               SELECT 1 FROM outreach_delivery_events e
               WHERE e.message_id = lead_message_drafts.id AND e.tenant_id = lead_message_drafts.tenant_id
                 AND json_extract(e.metadata_json, '$.sendMode') = 'real'
             ) THEN 1 ELSE 0 END) as real_sent
           FROM lead_message_drafts WHERE tenant_id = ?1`
        )
        .bind(tenantId)
        .first<{ sent: number; approved: number; real_sent: number }>(),
      db
        .prepare(
          "SELECT AVG(score) as avg_score FROM sales_leads WHERE tenant_id = ?1 AND score IS NOT NULL"
        )
        .bind(tenantId)
        .first<{ avg_score: number | null }>(),
    ]);

    const byStage: Record<string, number> = {};
    for (const row of stageResults.results ?? []) {
      byStage[row.pipeline_stage] = row.count;
    }

    return c.json({
      ok: true,
      tenantId,
      data: {
        totalLeads: totalResult?.total ?? 0,
        byPipelineStage: byStage,
        totalMessagesSent: msgStats?.real_sent ?? 0,
        totalMessagesSentAll: msgStats?.sent ?? 0,
        totalApproved: (msgStats?.approved ?? 0) + (msgStats?.sent ?? 0),
        totalReplied: byStage["replied"] ?? 0,
        totalMeetings: byStage["meeting"] ?? 0,
        avgScore: scoreResult?.avg_score != null ? Math.round(scoreResult.avg_score) : null,
      },
    });
  });

  // ── GET /analytics/full-auto — Full automation dashboard ────────────────
  app.get("/analytics/full-auto", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;

    const [
      totalLeads,
      pipelineStats,
      sendStats,
      replyStats,
      followupStats,
      unsubCount,
    ] = await Promise.all([
      db.prepare("SELECT COUNT(*) as cnt FROM sales_leads WHERE tenant_id = ?1").bind(tenantId).first<{ cnt: number }>(),
      db.prepare(
        `SELECT pipeline_stage, COUNT(*) as cnt FROM sales_leads WHERE tenant_id = ?1 GROUP BY pipeline_stage`
      ).bind(tenantId).all<{ pipeline_stage: string; cnt: number }>(),
      db.prepare(
        `SELECT
           COUNT(*) as total_sent,
           SUM(CASE WHEN status = 'sent' AND EXISTS (
             SELECT 1 FROM outreach_delivery_events e
             WHERE e.message_id = lead_message_drafts.id AND e.tenant_id = lead_message_drafts.tenant_id
               AND json_extract(e.metadata_json, '$.sendMode') = 'real'
           ) THEN 1 ELSE 0 END) as real_sent
         FROM lead_message_drafts WHERE tenant_id = ?1 AND status = 'sent'`
      ).bind(tenantId).first<{ total_sent: number; real_sent: number }>(),
      db.prepare(
        `SELECT
           COUNT(*) as total_replies,
           SUM(CASE WHEN intent IN ('interested', 'pricing', 'demo') THEN 1 ELSE 0 END) as positive_replies,
           SUM(CASE WHEN intent = 'not_interested' THEN 1 ELSE 0 END) as negative_replies,
           SUM(CASE WHEN intent = 'unsubscribe' THEN 1 ELSE 0 END) as unsubscribe_replies
         FROM outreach_replies WHERE tenant_id = ?1`
      ).bind(tenantId).first<{ total_replies: number; positive_replies: number; negative_replies: number; unsubscribe_replies: number }>(),
      db.prepare(
        `SELECT
           COUNT(*) as total_followups,
           SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_followups,
           SUM(CASE WHEN step = 'breakup' AND status = 'sent' THEN 1 ELSE 0 END) as breakup_sent
         FROM outreach_followups WHERE tenant_id = ?1`
      ).bind(tenantId).first<{ total_followups: number; sent_followups: number; breakup_sent: number }>(),
      db.prepare(
        `SELECT COUNT(*) as cnt FROM sales_leads l WHERE l.tenant_id = ?1
         AND EXISTS (SELECT 1 FROM outreach_replies r WHERE r.lead_id = l.id AND r.tenant_id = l.tenant_id AND r.intent = 'unsubscribe')`
      ).bind(tenantId).first<{ cnt: number }>(),
    ]);

    const stages: Record<string, number> = {};
    for (const row of pipelineStats.results ?? []) stages[row.pipeline_stage] = row.cnt;

    const totalSent = sendStats?.total_sent ?? 0;
    const realSent = sendStats?.real_sent ?? 0;
    const totalReplies = replyStats?.total_replies ?? 0;
    const positiveReplies = replyStats?.positive_replies ?? 0;
    const meetings = stages["meeting"] ?? 0;
    const customers = stages["customer"] ?? 0;

    // Use real_sent as denominator for rates (safe mode sends don't generate real replies)
    const rateDenom = realSent > 0 ? realSent : totalSent;

    return c.json({
      ok: true,
      tenantId,
      data: {
        messages_sent: totalSent,
        messages_sent_real: realSent,
        reply_rate: rateDenom > 0 ? Math.round((totalReplies / rateDenom) * 100 * 10) / 10 : 0,
        meeting_rate: rateDenom > 0 ? Math.round((meetings / rateDenom) * 100 * 10) / 10 : 0,
        close_rate: rateDenom > 0 ? Math.round((customers / rateDenom) * 100 * 10) / 10 : 0,
        positive_reply_rate: totalReplies > 0 ? Math.round((positiveReplies / totalReplies) * 100 * 10) / 10 : 0,
        pipeline: stages,
        followups: {
          total: followupStats?.total_followups ?? 0,
          sent: followupStats?.sent_followups ?? 0,
          breakup_sent: followupStats?.breakup_sent ?? 0,
        },
        suppressed: unsubCount?.cnt ?? 0,
        unsubscribe_replies: replyStats?.unsubscribe_replies ?? 0,
      },
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 18: Monitoring, Health, Emergency Pause, Close Analytics, Handoffs
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /health — System health check ────────────────────────────────────
  app.get("/health", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    const { getHealth } = await import("./monitoring");
    const result = await getHealth(db, kv, tenantId);
    return c.json({ ok: true, tenantId, data: result });
  });

  // ── GET /monitoring — Time series monitoring data ────────────────────────
  app.get("/monitoring", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const days = parseInt(c.req.query("days") || "14", 10);
    const { getMonitoringTimeSeries } = await import("./monitoring");
    const series = await getMonitoringTimeSeries(db, tenantId, Math.min(days, 90));
    return c.json({ ok: true, tenantId, data: series });
  });

  // ── POST /emergency-pause — Emergency stop ──────────────────────────────
  app.post("/emergency-pause", async (c) => {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const body = await c.req.json<{ reason?: string }>().catch(() => ({}));
    const { emergencyPause } = await import("./monitoring");
    await emergencyPause(kv, tenantId, (body as any).reason || "Manual emergency pause");
    await logAudit(c.env.DB, tenantId, "admin", "outreach.emergency_pause", { reason: (body as any).reason });
    return c.json({ ok: true, tenantId, paused: true });
  });

  // ── POST /emergency-resume — Resume from pause ──────────────────────────
  app.post("/emergency-resume", async (c) => {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const { emergencyResume } = await import("./monitoring");
    await emergencyResume(kv, tenantId);
    await logAudit(c.env.DB, tenantId, "admin", "outreach.emergency_resume", {});
    return c.json({ ok: true, tenantId, paused: false });
  });

  // ── GET /analytics/close — Close optimization analytics ─────────────────
  app.get("/analytics/close", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;

    const [closeLogs, variantPerf, bookingEvents] = await Promise.all([
      db.prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN execution_status = 'auto_sent' THEN 1 ELSE 0 END) as auto_sent,
           SUM(CASE WHEN handoff_required = 1 THEN 1 ELSE 0 END) as handoffs,
           SUM(CASE WHEN close_intent = 'pricing_request' THEN 1 ELSE 0 END) as pricing,
           SUM(CASE WHEN close_intent = 'demo_request' THEN 1 ELSE 0 END) as demo,
           SUM(CASE WHEN close_intent = 'schedule_request' THEN 1 ELSE 0 END) as schedule,
           SUM(CASE WHEN close_intent = 'signup_request' THEN 1 ELSE 0 END) as signup
         FROM outreach_close_logs WHERE tenant_id = ?1`
      ).bind(tenantId).first<any>(),
      db.prepare(
        `SELECT close_variant_key as variant, COUNT(*) as sent,
                SUM(CASE WHEN l.pipeline_stage = 'meeting' THEN 1 ELSE 0 END) as meetings,
                SUM(CASE WHEN l.pipeline_stage = 'customer' THEN 1 ELSE 0 END) as closes
         FROM outreach_close_logs cl
         JOIN sales_leads l ON cl.lead_id = l.id AND cl.tenant_id = l.tenant_id
         WHERE cl.tenant_id = ?1 AND cl.close_variant_key IS NOT NULL
         GROUP BY cl.close_variant_key`
      ).bind(tenantId).all<{ variant: string; sent: number; meetings: number; closes: number }>(),
      db.prepare(
        `SELECT event_type, COUNT(*) as cnt
         FROM outreach_booking_events
         WHERE tenant_id = ?1
         GROUP BY event_type`
      ).bind(tenantId).all<{ event_type: string; cnt: number }>(),
    ]);

    const bookingByType: Record<string, number> = {};
    for (const row of bookingEvents.results ?? []) {
      bookingByType[row.event_type] = row.cnt;
    }

    const totalMeetings = await db
      .prepare("SELECT COUNT(*) as cnt FROM sales_leads WHERE tenant_id = ?1 AND pipeline_stage IN ('meeting', 'customer')")
      .bind(tenantId)
      .first<{ cnt: number }>();

    return c.json({
      ok: true,
      tenantId,
      data: {
        close_messages_sent: closeLogs?.total ?? 0,
        auto_sent: closeLogs?.auto_sent ?? 0,
        handoffs_created: closeLogs?.handoffs ?? 0,
        by_intent: {
          pricing: closeLogs?.pricing ?? 0,
          demo: closeLogs?.demo ?? 0,
          schedule: closeLogs?.schedule ?? 0,
          signup: closeLogs?.signup ?? 0,
        },
        booking_links_sent: bookingByType["link_sent"] ?? 0,
        booking_clicked: bookingByType["clicked"] ?? 0,
        booking_booked: bookingByType["booked"] ?? 0,
        meetings_created: totalMeetings?.cnt ?? 0,
        close_rate: (closeLogs?.total ?? 0) > 0
          ? Math.round(((totalMeetings?.cnt ?? 0) / closeLogs.total) * 100 * 10) / 10
          : 0,
        variant_performance: (variantPerf.results ?? []).map(v => ({
          variant: v.variant,
          sent: v.sent,
          meetings: v.meetings,
          closes: v.closes,
          meeting_rate: v.sent > 0 ? Math.round((v.meetings / v.sent) * 100 * 10) / 10 : 0,
        })),
      },
    });
  });

  // ── GET /handoffs — Human handoff queue ─────────────────────────────────
  app.get("/handoffs", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const status = c.req.query("status") || "open";
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 100);

    const rows = await db
      .prepare(
        `SELECT h.*, l.store_name, l.contact_email, l.pipeline_stage, l.deal_temperature,
                r.reply_text, r.intent
         FROM outreach_handoffs h
         LEFT JOIN sales_leads l ON h.lead_id = l.id AND h.tenant_id = l.tenant_id
         LEFT JOIN outreach_replies r ON h.reply_id = r.id AND h.tenant_id = r.tenant_id
         WHERE h.tenant_id = ?1 AND h.status = ?2
         ORDER BY CASE h.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, h.created_at DESC
         LIMIT ?3`
      )
      .bind(tenantId, status, limit)
      .all();

    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // ── POST /handoffs — Create handoff ─────────────────────────────────────
  app.post("/handoffs", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<{
      lead_id: string; reply_id?: string; reason: string; priority?: string;
    }>();

    if (!body.lead_id || !body.reason) {
      return c.json({ ok: false, error: "lead_id and reason are required" }, 400);
    }

    const id = uid();
    await db
      .prepare(
        `INSERT INTO outreach_handoffs
         (id, tenant_id, lead_id, reply_id, reason, priority, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7)`
      )
      .bind(id, tenantId, body.lead_id, body.reply_id || null, body.reason, body.priority || "normal", now())
      .run();

    return c.json({ ok: true, tenantId, data: { id } });
  });

  // ── PATCH /handoffs/:id — Update handoff (assign/resolve/dismiss) ───────
  app.patch("/handoffs/:id", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const handoffId = c.req.param("id");
    const body = await c.req.json<{
      status?: string; assigned_to?: string; resolution_notes?: string;
    }>();

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (body.status) { sets.push(`status = ?${idx++}`); vals.push(body.status); }
    if (body.assigned_to !== undefined) { sets.push(`assigned_to = ?${idx++}`); vals.push(body.assigned_to); }
    if (body.resolution_notes !== undefined) { sets.push(`resolution_notes = ?${idx++}`); vals.push(body.resolution_notes); }
    if (body.status === "resolved" || body.status === "dismissed") {
      sets.push(`resolved_at = ?${idx++}`); vals.push(now());
    }

    if (sets.length === 0) return c.json({ ok: false, error: "No fields" }, 400);

    vals.push(handoffId, tenantId);
    await db
      .prepare(`UPDATE outreach_handoffs SET ${sets.join(", ")} WHERE id = ?${idx++} AND tenant_id = ?${idx}`)
      .bind(...vals)
      .run();

    return c.json({ ok: true, tenantId, updated: handoffId });
  });

  // ── POST /booking-events — Track booking conversion ─────────────────────
  app.post("/booking-events", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<{
      lead_id: string; event_type: string; close_log_id?: string;
      booking_url?: string; variant_key?: string;
    }>();

    if (!body.lead_id || !body.event_type) {
      return c.json({ ok: false, error: "lead_id and event_type required" }, 400);
    }

    const id = uid();
    await db
      .prepare(
        `INSERT INTO outreach_booking_events
         (id, tenant_id, lead_id, close_log_id, event_type, booking_url, variant_key, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
      .bind(id, tenantId, body.lead_id, body.close_log_id || null, body.event_type, body.booking_url || null, body.variant_key || null, now())
      .run();

    return c.json({ ok: true, tenantId, data: { id } });
  });

  // ── GET /close/variants — List close template variants ──────────────────
  app.get("/close/variants", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const closeType = c.req.query("close_type");

    let q = `SELECT * FROM outreach_close_variants WHERE tenant_id = ?1 AND is_active = 1`;
    const binds: any[] = [tenantId];
    if (closeType) { q += ` AND close_type = ?2`; binds.push(closeType); }
    q += ` ORDER BY close_type, variant_key`;

    const rows = await db.prepare(q).bind(...binds).all();
    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // ── POST /close/variants — Create close template variant ────────────────
  app.post("/close/variants", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<{
      close_type: string; variant_key: string; subject_template?: string; body_template: string;
    }>();

    if (!body.close_type || !body.variant_key || !body.body_template) {
      return c.json({ ok: false, error: "close_type, variant_key, body_template required" }, 400);
    }

    const id = uid();
    const ts = now();
    await db
      .prepare(
        `INSERT INTO outreach_close_variants
         (id, tenant_id, close_type, variant_key, subject_template, body_template, is_active, sent_count, meeting_count, close_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 0, 0, 0, ?7, ?8)`
      )
      .bind(id, tenantId, body.close_type, body.variant_key, body.subject_template || null, body.body_template, ts, ts)
      .run();

    return c.json({ ok: true, tenantId, data: { id } });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 3: Settings, Unsubscribes, Replies, Delivery Events, Send Stats
  // ══════════════════════════════════════════════════════════════════════════

  // ── Helper: read outreach settings from KV ──────────────────────────────
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

  // ── GET /settings — Read outreach settings ──────────────────────────────
  app.get("/settings", async (c) => {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const settings = await getOutreachSettings(kv, tenantId);
    return c.json({ ok: true, tenantId, data: settings });
  });

  // ── PUT /settings — Save outreach settings ──────────────────────────────
  app.put("/settings", async (c) => {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const db = c.env.DB;
    const body = await c.req.json<Partial<OutreachSettings>>();

    const prev = await getOutreachSettings(kv, tenantId);
    const next: OutreachSettings = {
      sendMode: body.sendMode === "real" ? "real" : (body.sendMode === "safe" ? "safe" : prev.sendMode),
      dailyCap: Math.min(Math.max(body.dailyCap ?? prev.dailyCap, 1), 500),
      hourlyCap: Math.min(Math.max(body.hourlyCap ?? prev.hourlyCap, 1), 100),
      requireApproval: body.requireApproval ?? prev.requireApproval,
      followupDay3Enabled: body.followupDay3Enabled ?? prev.followupDay3Enabled,
      followupDay7Enabled: body.followupDay7Enabled ?? prev.followupDay7Enabled,
      followupDay14Enabled: body.followupDay14Enabled ?? prev.followupDay14Enabled,
      autoCampaignEnabled: body.autoCampaignEnabled ?? prev.autoCampaignEnabled,
      autoCampaignMinScore: Math.min(Math.max(body.autoCampaignMinScore ?? prev.autoCampaignMinScore, 0), 100),
      contactCooldownDays: Math.min(Math.max(body.contactCooldownDays ?? prev.contactCooldownDays, 1), 90),
      autoAnalyzeOnImport: body.autoAnalyzeOnImport ?? prev.autoAnalyzeOnImport,
      autoScoreOnImport: body.autoScoreOnImport ?? prev.autoScoreOnImport,
      defaultLpUrl: (body.defaultLpUrl ?? prev.defaultLpUrl ?? "").slice(0, 2048),
      // Phase 18: Guard rails
      autoCampaignPaused: body.autoCampaignPaused ?? prev.autoCampaignPaused,
      pauseReason: body.pauseReason ?? prev.pauseReason ?? "",
      autoLeadSupplyEnabled: body.autoLeadSupplyEnabled ?? prev.autoLeadSupplyEnabled,
      autoCloseEnabled: body.autoCloseEnabled ?? prev.autoCloseEnabled,
      monitoringAlertsEnabled: body.monitoringAlertsEnabled ?? prev.monitoringAlertsEnabled,
      autoPauseEnabled: body.autoPauseEnabled ?? prev.autoPauseEnabled,
      autoPauseFailureThreshold: Math.min(Math.max(body.autoPauseFailureThreshold ?? prev.autoPauseFailureThreshold, 1), 100),
      autoPauseBounceThreshold: Math.min(Math.max(body.autoPauseBounceThreshold ?? prev.autoPauseBounceThreshold, 1), 100),
    };

    await kv.put(`outreach:settings:${tenantId}`, JSON.stringify(next));

    // Audit log on mode change
    if (prev.sendMode !== next.sendMode) {
      await logAudit(db, tenantId, "system", "outreach.settings.mode_change", {
        from: prev.sendMode,
        to: next.sendMode,
      });
    }

    return c.json({ ok: true, tenantId, data: next });
  });

  // ── GET /unsubscribes — List unsubscribed leads ─────────────────────────
  app.get("/unsubscribes", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;

    // Get all leads, check unsub status via KV
    const rows = await db
      .prepare("SELECT id, store_name, contact_email, area, category FROM sales_leads WHERE tenant_id = ?1 ORDER BY store_name")
      .bind(tenantId)
      .all<{ id: string; store_name: string; contact_email: string | null; area: string | null; category: string | null }>();

    const leads = rows.results ?? [];
    const unsubscribed: Array<{ id: string; store_name: string; contact_email: string | null; area: string | null; category: string | null }> = [];

    for (const lead of leads) {
      if (await isUnsubscribed(kv, tenantId, lead.id)) {
        unsubscribed.push(lead);
      }
    }

    return c.json({ ok: true, tenantId, data: unsubscribed });
  });

  // ── POST /unsubscribes/:leadId — Set unsub flag ─────────────────────────
  app.post("/unsubscribes/:leadId", async (c) => {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const db = c.env.DB;
    const leadId = c.req.param("leadId");

    await kv.put(`outreach:unsub:${tenantId}:${leadId}`, "1");
    await logAudit(db, tenantId, "system", "outreach.unsubscribe", { leadId });

    return c.json({ ok: true, tenantId, data: { leadId, unsubscribed: true } });
  });

  // ── DELETE /unsubscribes/:leadId — Remove unsub flag ────────────────────
  app.delete("/unsubscribes/:leadId", async (c) => {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const db = c.env.DB;
    const leadId = c.req.param("leadId");

    await kv.delete(`outreach:unsub:${tenantId}:${leadId}`);
    await logAudit(db, tenantId, "system", "outreach.resubscribe", { leadId });

    return c.json({ ok: true, tenantId, data: { leadId, unsubscribed: false } });
  });

  // ── POST /replies/:leadId — Record reply + classify + auto-transition ───
  app.post("/replies/:leadId", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const leadId = c.req.param("leadId");
    const body = await c.req.json<{ channel?: string; replyBody?: string }>();

    // Verify lead exists
    const lead = await db
      .prepare("SELECT id, pipeline_stage FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(leadId, tenantId)
      .first<{ id: string; pipeline_stage: PipelineStage }>();

    if (!lead) {
      return c.json({ ok: false, error: "Lead not found" }, 404);
    }

    const ts = now();

    // Phase 4: Classify reply
    let classification: ReplyClassification = "other";
    let classifyConfidence = 0;
    let classifyReason = "no_body";
    if (body.replyBody?.trim()) {
      const result = await classifyReply(body.replyBody, new AICore(c.env as any), tenantId);
      classification = result.classification;
      classifyConfidence = result.confidence;
      classifyReason = result.reason;
    }

    // Record delivery event (type=replied) with classification
    const eventId = uid();
    await db
      .prepare(
        `INSERT INTO outreach_delivery_events
         (id, tenant_id, lead_id, message_id, channel, event_type, status, metadata_json, created_at)
         VALUES (?1, ?2, ?3, NULL, ?4, 'replied', 'received', ?5, ?6)`
      )
      .bind(
        eventId, tenantId, leadId,
        body.channel ?? "email",
        JSON.stringify({
          replyBody: body.replyBody ?? "",
          classification,
          classifyConfidence,
          classifyReason,
        }),
        ts
      )
      .run();

    // Update last_replied_at
    await db
      .prepare("UPDATE sales_leads SET last_replied_at = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4")
      .bind(ts, ts, leadId, tenantId)
      .run();

    // Phase 4.5: Record normalized outreach events
    await db
      .prepare(
        `INSERT INTO outreach_events (id, tenant_id, lead_id, type, metadata, created_at)
         VALUES (?1, ?2, ?3, 'reply_received', ?4, ?5)`
      )
      .bind(uid(), tenantId, leadId, JSON.stringify({ channel: body.channel ?? "email", classification, classifyConfidence }), ts)
      .run();

    if (body.replyBody?.trim()) {
      await db
        .prepare(
          `INSERT INTO outreach_events (id, tenant_id, lead_id, type, metadata, created_at)
           VALUES (?1, ?2, ?3, 'reply_classified', ?4, ?5)`
        )
        .bind(uid(), tenantId, leadId, JSON.stringify({ classification, confidence: classifyConfidence, reason: classifyReason }), ts)
        .run();
    }

    // Phase 4.5: Classification-based CRM auto-transition (confidence-gated)
    const highConfidence = classifyConfidence >= CLASSIFY_CONFIDENCE_THRESHOLD;
    let newStage: PipelineStage | null = null;
    if (classification === "interested" && highConfidence) {
      newStage = "meeting";
    } else if (classification === "not_interested" && highConfidence) {
      newStage = "lost";
    } else if (classification === "later") {
      // Schedule a followup in 14 days
      const kv = c.env.SAAS_FACTORY;
      const settings = await getOutreachSettings(kv, tenantId);
      if (settings.followupDay7Enabled) {
        const laterDate = new Date(Date.now() + 14 * 86400 * 1000).toISOString();
        await db
          .prepare(
            `INSERT INTO outreach_followups (id, tenant_id, lead_id, step, scheduled_at, status, created_at)
             VALUES (?1, ?2, ?3, 'first_followup', ?4, 'scheduled', ?5)`
          )
          .bind(uid(), tenantId, leadId, laterDate, ts)
          .run();
      }
      newStage = "replied";
    } else {
      // Default: contacted → replied
      if (lead.pipeline_stage === "contacted") {
        newStage = "replied";
      }
    }

    if (newStage && newStage !== lead.pipeline_stage) {
      await db
        .prepare("UPDATE sales_leads SET pipeline_stage = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4")
        .bind(newStage, ts, leadId, tenantId)
        .run();

      // Phase 4.5: Record meeting_created event
      if (newStage === "meeting") {
        await db
          .prepare(
            `INSERT INTO outreach_events (id, tenant_id, lead_id, type, metadata, created_at)
             VALUES (?1, ?2, ?3, 'meeting_created', ?4, ?5)`
          )
          .bind(uid(), tenantId, leadId, JSON.stringify({ fromClassification: classification, confidence: classifyConfidence }), ts)
          .run();
      }

      // Cancel pending followups on terminal transitions
      if (newStage === "meeting" || newStage === "lost") {
        await db
          .prepare("UPDATE outreach_followups SET status = 'cancelled' WHERE tenant_id = ?1 AND lead_id = ?2 AND status = 'scheduled'")
          .bind(tenantId, leadId)
          .run();
      }
    }

    await logAudit(db, tenantId, "system", "outreach.reply_recorded", {
      leadId, channel: body.channel ?? "email", classification, classifyConfidence,
    });

    return c.json({
      ok: true, tenantId,
      data: {
        leadId, eventId, classification, classifyConfidence,
        classifyReason,
        highConfidence,
        autoTransitioned: newStage != null && newStage !== lead.pipeline_stage,
        newStage,
      },
    });
  });

  // ── GET /delivery-events — List delivery events ─────────────────────────
  app.get("/delivery-events", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const url = new URL(c.req.url);
    const leadId = url.searchParams.get("lead_id");
    const eventType = url.searchParams.get("event_type");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

    let where = "tenant_id = ?1";
    const params: any[] = [tenantId];
    let idx = 2;

    if (leadId) {
      where += ` AND lead_id = ?${idx}`;
      params.push(leadId);
      idx++;
    }
    if (eventType) {
      where += ` AND event_type = ?${idx}`;
      params.push(eventType);
      idx++;
    }

    const rows = await db
      .prepare(`SELECT * FROM outreach_delivery_events WHERE ${where} ORDER BY created_at DESC LIMIT ?${idx}`)
      .bind(...params, limit)
      .all();

    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // ── GET /send-stats — Current usage vs caps ─────────────────────────────
  app.get("/send-stats", async (c) => {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;

    const settings = await getOutreachSettings(kv, tenantId);
    const nowDate = new Date();
    const dateKey = nowDate.toISOString().slice(0, 10);
    const hourKey = nowDate.toISOString().slice(0, 13);

    const [dailyCount, hourlyCount] = await Promise.all([
      kv.get(`outreach:rl:daily:${tenantId}:${dateKey}`).then((v) => parseInt(v || "0", 10)),
      kv.get(`outreach:rl:hourly:${tenantId}:${hourKey}`).then((v) => parseInt(v || "0", 10)),
    ]);

    return c.json({
      ok: true,
      tenantId,
      data: {
        dailyUsed: dailyCount,
        dailyCap: settings.dailyCap,
        hourlyUsed: hourlyCount,
        hourlyCap: settings.hourlyCap,
        sendMode: settings.sendMode,
      },
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 4: Followup management, Learning Analytics
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /followups — List followups ──────────────────────────────────────
  app.get("/followups", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const url = new URL(c.req.url);
    const status = url.searchParams.get("status");
    const leadId = url.searchParams.get("lead_id");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

    let where = "f.tenant_id = ?1";
    const params: any[] = [tenantId];
    let idx = 2;

    if (status) {
      where += ` AND f.status = ?${idx}`;
      params.push(status);
      idx++;
    }
    if (leadId) {
      where += ` AND f.lead_id = ?${idx}`;
      params.push(leadId);
      idx++;
    }

    const rows = await db
      .prepare(
        `SELECT f.*, l.store_name FROM outreach_followups f
         JOIN sales_leads l ON f.lead_id = l.id
         WHERE ${where}
         ORDER BY f.scheduled_at ASC
         LIMIT ?${idx}`
      )
      .bind(...params, limit)
      .all();

    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // ── POST /followups/:id/cancel — Cancel a scheduled followup ────────────
  app.post("/followups/:id/cancel", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const followupId = c.req.param("id");

    await db
      .prepare("UPDATE outreach_followups SET status = 'cancelled' WHERE id = ?1 AND tenant_id = ?2 AND status = 'scheduled'")
      .bind(followupId, tenantId)
      .run();

    return c.json({ ok: true, tenantId, data: { followupId, status: "cancelled" } });
  });

  // ── GET /analytics/learning — Learning insights ─────────────────────────
  app.get("/analytics/learning", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;

    // 1. Reply rate by score bucket
    const scoreRows = await db
      .prepare(
        `SELECT
           CASE
             WHEN score >= 80 THEN '80-100'
             WHEN score >= 60 THEN '60-79'
             WHEN score >= 40 THEN '40-59'
             WHEN score >= 20 THEN '20-39'
             ELSE '0-19'
           END as score_bucket,
           COUNT(*) as total,
           SUM(CASE WHEN pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied
         FROM sales_leads
         WHERE tenant_id = ?1 AND score IS NOT NULL AND pipeline_stage NOT IN ('new')
         GROUP BY score_bucket
         ORDER BY score_bucket DESC`
      )
      .bind(tenantId)
      .all<{ score_bucket: string; total: number; replied: number }>();

    const replyRateByScore = (scoreRows.results ?? []).map((r) => ({
      scoreBucket: r.score_bucket,
      sent: r.total,
      replied: r.replied,
      rate: r.total > 0 ? Math.round((r.replied / r.total) * 100) : 0,
    }));

    // 2. Reply rate by pain hypothesis
    const hypoRows = await db
      .prepare(
        `SELECT h.code, h.label,
           COUNT(DISTINCT h.lead_id) as total_leads,
           SUM(CASE WHEN l.pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied_leads
         FROM outreach_pain_hypotheses h
         JOIN sales_leads l ON h.lead_id = l.id AND h.tenant_id = l.tenant_id
         WHERE h.tenant_id = ?1 AND l.pipeline_stage NOT IN ('new')
         GROUP BY h.code, h.label
         HAVING total_leads >= 2
         ORDER BY replied_leads DESC
         LIMIT 10`
      )
      .bind(tenantId)
      .all<{ code: string; label: string; total_leads: number; replied_leads: number }>();

    const replyRateByHypothesis: LearningInsight[] = (hypoRows.results ?? []).map((r) => ({
      key: r.code,
      label: r.label,
      totalSent: r.total_leads,
      totalReplied: r.replied_leads,
      replyRate: r.total_leads > 0 ? Math.round((r.replied_leads / r.total_leads) * 100) : 0,
      sampleSize: r.total_leads,
    }));

    // 3. Reply rate by message tone
    const toneRows = await db
      .prepare(
        `SELECT m.tone,
           COUNT(DISTINCT m.lead_id) as total_leads,
           SUM(CASE WHEN l.pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied_leads
         FROM lead_message_drafts m
         JOIN sales_leads l ON m.lead_id = l.id AND m.tenant_id = l.tenant_id
         WHERE m.tenant_id = ?1 AND m.status = 'sent' AND m.tone IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM outreach_delivery_events e
             WHERE e.message_id = m.id AND e.tenant_id = m.tenant_id
               AND json_extract(e.metadata_json, '$.sendMode') = 'real'
           )
         GROUP BY m.tone
         ORDER BY replied_leads DESC`
      )
      .bind(tenantId)
      .all<{ tone: string; total_leads: number; replied_leads: number }>();

    const replyRateByTone: LearningInsight[] = (toneRows.results ?? []).map((r) => ({
      key: r.tone,
      label: r.tone,
      totalSent: r.total_leads,
      totalReplied: r.replied_leads,
      replyRate: r.total_leads > 0 ? Math.round((r.replied_leads / r.total_leads) * 100) : 0,
      sampleSize: r.total_leads,
    }));

    const topHypothesis = replyRateByHypothesis.length > 0 ? replyRateByHypothesis[0] : null;
    const topTone = replyRateByTone.length > 0 ? replyRateByTone[0] : null;

    const analytics: LearningAnalytics = {
      replyRateByScore,
      replyRateByHypothesis,
      replyRateByTone,
      topHypothesis,
      topTone,
    };

    return c.json({ ok: true, tenantId, data: analytics });
  });

  // ── GET /leads/:id — Get single lead with messages + features + hypotheses
  app.get("/leads/:id", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const leadId = c.req.param("id");

    const lead = await db
      .prepare("SELECT * FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(leadId, tenantId)
      .first();

    if (!lead) {
      return c.json({ ok: false, error: "Lead not found" }, 404);
    }

    const [messages, events, featureRow, hypothesisRows] = await Promise.all([
      db
        .prepare(
          "SELECT * FROM lead_message_drafts WHERE lead_id = ?1 AND tenant_id = ?2 ORDER BY created_at DESC"
        )
        .bind(leadId, tenantId)
        .all(),
      db
        .prepare(
          "SELECT * FROM outreach_delivery_events WHERE lead_id = ?1 AND tenant_id = ?2 ORDER BY created_at DESC LIMIT 50"
        )
        .bind(leadId, tenantId)
        .all(),
      db
        .prepare("SELECT * FROM outreach_lead_features WHERE tenant_id = ?1 AND lead_id = ?2")
        .bind(tenantId, leadId)
        .first<OutreachLeadFeatureRow>(),
      db
        .prepare("SELECT * FROM outreach_pain_hypotheses WHERE tenant_id = ?1 AND lead_id = ?2 ORDER BY created_at")
        .bind(tenantId, leadId)
        .all<OutreachPainHypothesisRow>(),
    ]);

    return c.json({
      ok: true,
      tenantId,
      data: {
        lead,
        messages: messages.results ?? [],
        deliveryEvents: events.results ?? [],
        features: featureRow ?? null,
        hypotheses: hypothesisRows?.results ?? [],
      },
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 5: CSV Import, Campaigns, AB Test
  // ══════════════════════════════════════════════════════════════════════════

  // ── POST /import/preview — Parse CSV and detect duplicates ────────────────
  app.post("/import/preview", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<{ csvText: string }>();

    if (!body.csvText?.trim()) {
      return c.json({ ok: false, error: "CSVテキストが空です" }, 400);
    }

    const parsed = parseCsv(body.csvText);
    if (parsed.length === 0) {
      return c.json({ ok: false, error: "CSVに有効な行がありません" }, 400);
    }

    // Fetch existing leads for dedup
    const existingRows = await db
      .prepare("SELECT id, store_name, normalized_domain, contact_email, area FROM sales_leads WHERE tenant_id = ?1")
      .bind(tenantId)
      .all<ExistingLead>();

    const preview = buildPreview(parsed, existingRows.results ?? []);

    const summary = {
      total: preview.length,
      valid: preview.filter((r) => r.status === "valid").length,
      duplicate: preview.filter((r) => r.status === "duplicate").length,
      invalid: preview.filter((r) => r.status === "invalid").length,
    };

    return c.json({ ok: true, tenantId, data: { rows: preview, summary } });
  });

  // ── POST /import/execute — Execute import with per-row actions ────────────
  app.post("/import/execute", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<{
      csvText: string;
      actions: Record<number, "create" | "merge" | "skip">;
    }>();

    const parsed = parseCsv(body.csvText);
    const batchId = `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const ts = now();

    let created = 0, skipped = 0, merged = 0, invalid = 0;

    for (const row of parsed) {
      const action = body.actions[row.rowIndex] ?? "skip";
      if (action === "skip") { skipped++; continue; }

      // Re-validate
      const { validateRow } = await import("./importer");
      const errors = validateRow(row);
      if (errors.length > 0) { invalid++; continue; }

      if (action === "merge") {
        // Find existing lead by domain or email
        const domain = importNormalizeDomain(row.website_url);
        let existingId: string | null = null;

        if (domain) {
          const match = await db.prepare("SELECT id FROM sales_leads WHERE tenant_id = ?1 AND normalized_domain = ?2")
            .bind(tenantId, domain).first<{ id: string }>();
          if (match) existingId = match.id;
        }
        if (!existingId && row.email) {
          const match = await db.prepare("SELECT id FROM sales_leads WHERE tenant_id = ?1 AND contact_email = ?2")
            .bind(tenantId, row.email.toLowerCase()).first<{ id: string }>();
          if (match) existingId = match.id;
        }

        if (existingId) {
          const existing = await db.prepare("SELECT * FROM sales_leads WHERE id = ?1 AND tenant_id = ?2").bind(existingId, tenantId).first();
          if (existing) {
            const { sets, vals } = buildMergeSets(existing as any, row);
            if (sets.length > 0) {
              const idxBase = vals.length + 1;
              sets.push(`import_source = ?${idxBase}`);
              vals.push("csv");
              sets.push(`import_batch_id = ?${idxBase + 1}`);
              vals.push(batchId);
              sets.push(`updated_at = ?${idxBase + 2}`);
              vals.push(ts);
              vals.push(existingId);
              vals.push(tenantId);
              await db.prepare(
                `UPDATE sales_leads SET ${sets.join(", ")} WHERE id = ?${idxBase + 3} AND tenant_id = ?${idxBase + 4}`
              ).bind(...vals).run();
            }
            merged++;
            continue;
          }
        }
        // If no match found, fall through to create
      }

      // action === "create" or merge fallthrough
      const id = uid();
      const domain = importNormalizeDomain(row.website_url);
      await db.prepare(
        `INSERT INTO sales_leads
         (id, tenant_id, store_name, industry, website_url, contact_email, category, area,
          rating, review_count, has_booking_link, status, pipeline_stage,
          domain, normalized_domain, import_source, import_batch_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'shared', ?4, ?5, ?6, ?7, ?8, ?9, 0, 'new', 'new', ?10, ?11, 'csv', ?12, ?13, ?14)`
      ).bind(
        id, tenantId, row.store_name!.trim(),
        row.website_url ?? null, row.email ?? null,
        row.category ?? null, row.area ?? null,
        row.rating ?? null, row.review_count ?? 0,
        domain, domain,
        batchId, ts, ts
      ).run();
      created++;
    }

    await logAudit(db, tenantId, "system", "outreach.import", {
      batchId, created, skipped, merged, invalid, totalRows: parsed.length,
    });

    return c.json({
      ok: true, tenantId,
      data: { created, skipped, merged, invalid, batchId } as ImportResult,
    });
  });

  // ── Campaigns CRUD ──────────────────────────────────────────────────────────

  // GET /campaigns — List campaigns
  app.get("/campaigns", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const rows = await db
      .prepare("SELECT * FROM outreach_campaigns WHERE tenant_id = ?1 ORDER BY created_at DESC")
      .bind(tenantId)
      .all();
    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // POST /campaigns — Create campaign
  app.post("/campaigns-create", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<{
      name: string;
      niche?: string;
      area?: string;
      min_score?: number;
      landing_page_url?: string;
    }>();

    if (!body.name?.trim()) {
      return c.json({ ok: false, error: "name は必須です" }, 400);
    }

    const id = uid();
    const ts = now();
    await db.prepare(
      `INSERT INTO outreach_campaigns (id, tenant_id, name, niche, area, min_score, landing_page_url, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'draft', ?8, ?9)`
    ).bind(id, tenantId, body.name.trim(), body.niche ?? null, body.area ?? null, body.min_score ?? null, body.landing_page_url ?? null, ts, ts).run();

    const campaign = await db.prepare("SELECT * FROM outreach_campaigns WHERE id = ?1").bind(id).first();
    return c.json({ ok: true, tenantId, data: campaign }, 201);
  });

  // PATCH /campaigns/:id — Update campaign
  app.patch("/campaigns-manage/:id", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const campaignId = c.req.param("id");
    const body = await c.req.json<Partial<OutreachCampaign>>();

    const existing = await db
      .prepare("SELECT id FROM outreach_campaigns WHERE id = ?1 AND tenant_id = ?2")
      .bind(campaignId, tenantId)
      .first();

    if (!existing) return c.json({ ok: false, error: "Campaign not found" }, 404);

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    const fields: Array<[string, any]> = [
      ["name", body.name],
      ["niche", body.niche],
      ["area", body.area],
      ["min_score", body.min_score],
      ["landing_page_url", body.landing_page_url],
      ["status", body.status],
    ];

    for (const [col, val] of fields) {
      if (val !== undefined) {
        sets.push(`${col} = ?${idx}`);
        vals.push(val);
        idx++;
      }
    }

    if (sets.length === 0) return c.json({ ok: false, error: "No fields to update" }, 400);

    sets.push(`updated_at = ?${idx}`);
    vals.push(now());
    idx++;
    vals.push(campaignId);
    vals.push(tenantId);

    await db.prepare(
      `UPDATE outreach_campaigns SET ${sets.join(", ")} WHERE id = ?${idx} AND tenant_id = ?${idx + 1}`
    ).bind(...vals).run();

    const updated = await db.prepare("SELECT * FROM outreach_campaigns WHERE id = ?1").bind(campaignId).first();
    return c.json({ ok: true, tenantId, data: updated });
  });

  // ── Campaign Variants ─────────────────────────────────────────────────────

  // GET /campaigns/:id/variants
  app.get("/campaigns-manage/:id/variants", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const campaignId = c.req.param("id");

    const rows = await db
      .prepare("SELECT * FROM outreach_campaign_variants WHERE tenant_id = ?1 AND campaign_id = ?2 ORDER BY variant_key")
      .bind(tenantId, campaignId)
      .all();
    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // POST /campaigns/:id/variants
  app.post("/campaigns-manage/:id/variants", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const campaignId = c.req.param("id");
    const body = await c.req.json<{
      variant_key: string;
      subject_template?: string;
      opener_template?: string;
      cta_template?: string;
      tone?: string;
    }>();

    if (!body.variant_key?.trim()) {
      return c.json({ ok: false, error: "variant_key は必須です" }, 400);
    }

    // Verify campaign ownership
    const campaign = await db
      .prepare("SELECT id FROM outreach_campaigns WHERE id = ?1 AND tenant_id = ?2")
      .bind(campaignId, tenantId)
      .first();
    if (!campaign) return c.json({ ok: false, error: "Campaign not found" }, 404);

    const id = uid();
    await db.prepare(
      `INSERT INTO outreach_campaign_variants
       (id, tenant_id, campaign_id, variant_key, subject_template, opener_template, cta_template, tone, is_active, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)`
    ).bind(
      id, tenantId, campaignId, body.variant_key.trim(),
      body.subject_template ?? null, body.opener_template ?? null, body.cta_template ?? null,
      body.tone ?? "friendly", now()
    ).run();

    const variant = await db.prepare("SELECT * FROM outreach_campaign_variants WHERE id = ?1").bind(id).first();
    return c.json({ ok: true, tenantId, data: variant }, 201);
  });

  // ── Campaign Preview + Generate ───────────────────────────────────────────

  // GET /campaigns/:id/preview — Count matching leads
  app.get("/campaigns-manage/:id/preview", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    const campaignId = c.req.param("id");

    const campaign = await db
      .prepare("SELECT * FROM outreach_campaigns WHERE id = ?1 AND tenant_id = ?2")
      .bind(campaignId, tenantId)
      .first<OutreachCampaign>();

    if (!campaign) return c.json({ ok: false, error: "Campaign not found" }, 404);

    // Build filter
    let where = "tenant_id = ?1 AND pipeline_stage NOT IN ('lost', 'customer')";
    const params: any[] = [tenantId];
    let idx = 2;

    if (campaign.min_score != null) {
      where += ` AND score >= ?${idx}`;
      params.push(campaign.min_score);
      idx++;
    }
    if (campaign.area) {
      where += ` AND area = ?${idx}`;
      params.push(campaign.area);
      idx++;
    }
    if (campaign.niche) {
      where += ` AND (category = ?${idx} OR industry = ?${idx})`;
      params.push(campaign.niche);
      idx++;
    }

    // Exclude cooldown + max attempts
    const settings = await getOutreachSettings(kv, tenantId);
    where += ` AND (send_attempt_count < 3)`;
    where += ` AND (last_contacted_at IS NULL OR last_contacted_at < ?${idx})`;
    const cooldownDate = new Date(Date.now() - (settings.contactCooldownDays ?? 7) * 86400 * 1000).toISOString();
    params.push(cooldownDate);
    idx++;

    const countResult = await db
      .prepare(`SELECT COUNT(*) as total FROM sales_leads WHERE ${where}`)
      .bind(...params)
      .first<{ total: number }>();

    const leads = await db
      .prepare(`SELECT id, store_name, area, category, score, pipeline_stage FROM sales_leads WHERE ${where} ORDER BY score DESC NULLS LAST LIMIT 50`)
      .bind(...params)
      .all();

    // Get variants
    const variants = await db
      .prepare("SELECT * FROM outreach_campaign_variants WHERE tenant_id = ?1 AND campaign_id = ?2 AND is_active = 1")
      .bind(tenantId, campaignId)
      .all();

    // Check unsub count
    let unsubCount = 0;
    for (const lead of (leads.results ?? []) as any[]) {
      if (await isUnsubscribed(kv, tenantId, lead.id)) unsubCount++;
    }

    return c.json({
      ok: true, tenantId,
      data: {
        campaign,
        matchingLeads: (countResult?.total ?? 0) - unsubCount,
        unsubscribedExcluded: unsubCount,
        sampleLeads: leads.results ?? [],
        variants: variants.results ?? [],
      },
    });
  });

  // POST /campaigns/:id/generate-review-items — Generate messages for review
  app.post("/campaigns-manage/:id/generate-review-items", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    const campaignId = c.req.param("id");

    const campaign = await db
      .prepare("SELECT * FROM outreach_campaigns WHERE id = ?1 AND tenant_id = ?2")
      .bind(campaignId, tenantId)
      .first<OutreachCampaign>();

    if (!campaign) return c.json({ ok: false, error: "Campaign not found" }, 404);

    // Get active variants
    const variantRows = await db
      .prepare("SELECT * FROM outreach_campaign_variants WHERE tenant_id = ?1 AND campaign_id = ?2 AND is_active = 1 ORDER BY variant_key")
      .bind(tenantId, campaignId)
      .all<OutreachCampaignVariant>();

    const variants = variantRows.results ?? [];
    if (variants.length === 0) {
      return c.json({ ok: false, error: "アクティブなバリアントがありません" }, 400);
    }

    // Build filter (same as preview)
    const settings = await getOutreachSettings(kv, tenantId);
    let where = "tenant_id = ?1 AND pipeline_stage NOT IN ('lost', 'customer') AND send_attempt_count < 3";
    const params: any[] = [tenantId];
    let idx = 2;

    if (campaign.min_score != null) {
      where += ` AND score >= ?${idx}`;
      params.push(campaign.min_score);
      idx++;
    }
    if (campaign.area) {
      where += ` AND area = ?${idx}`;
      params.push(campaign.area);
      idx++;
    }
    if (campaign.niche) {
      where += ` AND (category = ?${idx} OR industry = ?${idx})`;
      params.push(campaign.niche);
      idx++;
    }

    const cooldownDate = new Date(Date.now() - (settings.contactCooldownDays ?? 7) * 86400 * 1000).toISOString();
    where += ` AND (last_contacted_at IS NULL OR last_contacted_at < ?${idx})`;
    params.push(cooldownDate);
    idx++;

    const leads = await db
      .prepare(`SELECT * FROM sales_leads WHERE ${where} ORDER BY score DESC NULLS LAST LIMIT 100`)
      .bind(...params)
      .all<OutreachLead>();

    const ts = now();
    let generated = 0;
    let skippedDup = 0;
    let skippedUnsub = 0;

    for (const lead of (leads.results ?? [])) {
      // Skip unsubscribed
      if (await isUnsubscribed(kv, tenantId, lead.id)) {
        skippedUnsub++;
        continue;
      }

      // Check for existing review item for this campaign+lead
      const existingDraft = await db
        .prepare("SELECT id FROM lead_message_drafts WHERE tenant_id = ?1 AND lead_id = ?2 AND campaign_id = ?3 AND status IN ('pending_review', 'approved')")
        .bind(tenantId, lead.id, campaignId)
        .first();

      if (existingDraft) {
        skippedDup++;
        continue;
      }

      // Assign variant (round-robin for even distribution)
      const variant = variants[generated % variants.length];

      // Generate message using AI generator with variant template overrides
      const { generateOutreachMessage } = await import("./ai-generator");

      // Load features + hypotheses if available
      const featureRow = await db
        .prepare("SELECT * FROM outreach_lead_features WHERE tenant_id = ?1 AND lead_id = ?2")
        .bind(tenantId, lead.id)
        .first<OutreachLeadFeatureRow>();

      const hypoRows = await db
        .prepare("SELECT * FROM outreach_pain_hypotheses WHERE tenant_id = ?1 AND lead_id = ?2")
        .bind(tenantId, lead.id)
        .all<OutreachPainHypothesisRow>();

      let features = null;
      if (featureRow) {
        features = {
          hasWebsite: !!featureRow.has_website,
          hasInstagram: !!featureRow.has_instagram,
          hasLineLink: !!featureRow.has_line_link,
          hasBookingLink: !!featureRow.has_booking_link,
          contactEmailFound: !!featureRow.contact_email_found,
          phoneFound: !!featureRow.phone_found,
          menuCountGuess: featureRow.menu_count_guess,
          priceInfoFound: !!featureRow.price_info_found,
          bookingCtaCount: featureRow.booking_cta_count,
          bookingCtaDepthGuess: featureRow.booking_cta_depth_guess,
          titleFound: !!featureRow.title_found,
          metaDescriptionFound: !!featureRow.meta_description_found,
          rawSignals: featureRow.raw_signals_json ? JSON.parse(featureRow.raw_signals_json) : {
            emails: [], phones: [], instagramLinks: [], lineLinks: [],
            bookingLinks: [], bookingKeywords: [], menuKeywords: [], priceKeywords: [],
            fetchStatus: null, responseTimeMs: 0, contentLengthBytes: 0,
          },
        };
      }

      const hypotheses = (hypoRows?.results ?? []).map((r) => ({
        code: r.code, label: r.label, severity: r.severity as any, reason: r.reason,
      }));

      const generated_msg = await generateOutreachMessage(
        lead,
        {
          tone: (variant.tone as any) ?? "friendly",
          cta: variant.cta_template ?? undefined,
          channel: "email",
        },
        { openaiApiKey: c.env.OPENAI_API_KEY, aiCore: new AICore(c.env as any), tenantId },
        features,
        hypotheses.length > 0 ? hypotheses : null
      );

      // Apply variant template overrides
      const lpUrl = campaign.landing_page_url || settings.defaultLpUrl || "";
      const replaceTokens = (s: string) =>
        s.replace(/\{store_name\}/g, lead.store_name)
         .replace(/\{area\}/g, lead.area ?? "")
         .replace(/\{\{lp_url\}\}/g, lpUrl);

      const subject = variant.subject_template
        ? replaceTokens(variant.subject_template)
        : replaceTokens(generated_msg.subject);

      const opener = variant.opener_template
        ? replaceTokens(variant.opener_template)
        : replaceTokens(generated_msg.opener);

      const fullBody = replaceTokens([opener, "", generated_msg.body, "", generated_msg.cta].join("\n"));

      // Save as review item
      const msgId = uid();
      await db.prepare(
        `INSERT INTO lead_message_drafts
         (id, lead_id, tenant_id, kind, subject, body, status, tone, pain_points_json, reasoning_summary, campaign_id, variant_key, created_at)
         VALUES (?1, ?2, ?3, 'email', ?4, ?5, 'pending_review', ?6, ?7, ?8, ?9, ?10, ?11)`
      ).bind(
        msgId, lead.id, tenantId,
        subject, fullBody,
        variant.tone ?? "friendly",
        JSON.stringify(generated_msg.painPoints),
        generated_msg.reasoningSummary,
        campaignId, variant.variant_key,
        ts
      ).run();

      generated++;
    }

    // Update campaign status to running if it was ready
    if (campaign.status === "ready" || campaign.status === "draft") {
      await db.prepare(
        "UPDATE outreach_campaigns SET status = 'running', updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
      ).bind(ts, campaignId, tenantId).run();
    }

    await logAudit(db, tenantId, "system", "outreach.campaign.generate", {
      campaignId, generated, skippedDup, skippedUnsub,
    });

    return c.json({
      ok: true, tenantId,
      data: { generated, skippedDup, skippedUnsub },
    });
  });

  // ── Campaign/Variant Analytics ────────────────────────────────────────────

  // GET /analytics/campaigns — Variant performance
  app.get("/analytics/campaigns", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;

    // Reply rate by variant
    const variantRows = await db
      .prepare(
        `SELECT m.campaign_id, m.variant_key,
           c.name as campaign_name,
           COUNT(*) as total_sent,
           SUM(CASE WHEN l.pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as replied,
           SUM(CASE WHEN l.pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings
         FROM lead_message_drafts m
         JOIN sales_leads l ON m.lead_id = l.id AND m.tenant_id = l.tenant_id
         LEFT JOIN outreach_campaigns c ON m.campaign_id = c.id
         WHERE m.tenant_id = ?1 AND m.status = 'sent' AND m.campaign_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM outreach_delivery_events e
             WHERE e.message_id = m.id AND e.tenant_id = m.tenant_id
               AND json_extract(e.metadata_json, '$.sendMode') = 'real'
           )
         GROUP BY m.campaign_id, m.variant_key
         ORDER BY replied DESC`
      )
      .bind(tenantId)
      .all<{
        campaign_id: string; variant_key: string; campaign_name: string;
        total_sent: number; replied: number; meetings: number;
      }>();

    // Import stats
    const importStats = await db
      .prepare(
        `SELECT
           COUNT(*) as total_imported,
           COUNT(DISTINCT import_batch_id) as batch_count
         FROM sales_leads
         WHERE tenant_id = ?1 AND import_source = 'csv'`
      )
      .bind(tenantId)
      .first<{ total_imported: number; batch_count: number }>();

    const variantPerformance = (variantRows.results ?? []).map((r) => ({
      campaignId: r.campaign_id,
      campaignName: r.campaign_name,
      variantKey: r.variant_key,
      totalSent: r.total_sent,
      replied: r.replied,
      meetings: r.meetings,
      replyRate: r.total_sent > 0 ? Math.round((r.replied / r.total_sent) * 100) : 0,
      meetingRate: r.total_sent > 0 ? Math.round((r.meetings / r.total_sent) * 100) : 0,
      sampleSize: r.total_sent,
    }));

    return c.json({
      ok: true, tenantId,
      data: {
        variantPerformance,
        importedLeadsCount: importStats?.total_imported ?? 0,
        importBatchCount: importStats?.batch_count ?? 0,
      },
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 6: Source Search / Preview / Import
  // ══════════════════════════════════════════════════════════════════════════

  // ── POST /sources/search — Execute search via provider ─────────────────
  app.post("/sources/search", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<{
      source_type: string;
      query?: string;
      location?: string;
      niche?: string;
      maxResults?: number;
    }>();

    const sourceType = body.source_type;
    if (!sourceType) {
      return c.json({ ok: false, error: "source_type は必須です" }, 400);
    }

    // 1. Create run record
    const runId = uid();
    const ts = now();
    await db.prepare(
      `INSERT INTO outreach_source_runs
       (id, tenant_id, source_type, query, location, niche, status, result_count, imported_count, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'running', 0, 0, ?7, ?8)`
    ).bind(runId, tenantId, sourceType, body.query ?? null, body.location ?? null, body.niche ?? null, ts, ts).run();

    // 2. Execute provider
    let candidates: CandidateResult[];
    try {
      const provider = resolveSourceProvider(sourceType, {
        GOOGLE_MAPS_API_KEY: c.env.GOOGLE_MAPS_API_KEY,
      });
      const result = await provider.searchCandidates({
        query: body.query ?? "",
        location: body.location,
        niche: body.niche,
        maxResults: Math.min(body.maxResults ?? 50, 100),
      });
      candidates = result.candidates;
    } catch (err: any) {
      await db.prepare(
        "UPDATE outreach_source_runs SET status = 'failed', error_message = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4"
      ).bind(err.message ?? "unknown error", now(), runId, tenantId).run();
      return c.json({ ok: false, error: err.message || "検索に失敗しました" }, 500);
    }

    // 3. Fetch existing leads for dedup
    const existingLeads = await db
      .prepare("SELECT id, store_name, normalized_domain, contact_email, area FROM sales_leads WHERE tenant_id = ?1")
      .bind(tenantId).all<{ id: string; store_name: string; normalized_domain: string | null; contact_email: string | null; area: string | null }>();
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

    // 4. Save candidates with dedup detection
    const savedCandidates: OutreachSourceCandidate[] = [];
    for (const c2 of candidates) {
      const candId = uid();
      const domain = normalizeDomain(c2.websiteUrl);

      // Dedup check
      let importStatus: string = "new";
      let dedupReason: string | null = null;
      let dedupLeadId: string | null = null;

      const domainMatch = domain ? byDomain.get(domain) : undefined;
      if (domainMatch) {
        importStatus = "duplicate";
        dedupReason = `ドメイン一致: ${domain}`;
        dedupLeadId = domainMatch.id;
      } else if (c2.email) {
        const emailMatch = byEmail.get(c2.email.toLowerCase());
        if (emailMatch) {
          importStatus = "duplicate";
          dedupReason = `メール一致: ${c2.email}`;
          dedupLeadId = emailMatch.id;
        }
      }
      if (!dedupLeadId && c2.storeName && c2.area) {
        const key = `${c2.storeName.toLowerCase()}|${c2.area.toLowerCase()}`;
        const nameMatch = byNameArea.get(key);
        if (nameMatch) {
          importStatus = "duplicate";
          dedupReason = `店名+エリア一致`;
          dedupLeadId = nameMatch.id;
        }
      }

      // Validate
      if (!c2.storeName?.trim()) {
        importStatus = "invalid";
        dedupReason = "store_name が空です";
      }

      // Phase 8.2: Generate source_key for granular tracking
      const sourceKey = [sourceType, body.query ?? "", body.location ?? ""].filter(Boolean).join(":").toLowerCase();

      // Phase 8.1: Compute quality score at candidate creation
      const qualityCandidate = {
        website_url: c2.websiteUrl ?? null,
        email: c2.email ?? null,
        phone: c2.phone ?? null,
        import_status: importStatus as any,
        category: c2.category ?? null,
        area: c2.area ?? null,
        rating: c2.rating ?? null,
        review_count: c2.reviewCount ?? 0,
      };
      const qualityScore = computeCandidateQualityScore(qualityCandidate);

      await db.prepare(
        `INSERT INTO outreach_source_candidates
         (id, tenant_id, run_id, source_type, external_id, store_name, category, area, address,
          website_url, phone, email, rating, review_count, source_url, normalized_domain,
          import_status, dedup_reason, dedup_lead_id, raw_payload_json, quality_score, source_key, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)`
      ).bind(
        candId, tenantId, runId, sourceType,
        c2.externalId ?? null, c2.storeName, c2.category ?? null, c2.area ?? null, c2.address ?? null,
        c2.websiteUrl ?? null, c2.phone ?? null, c2.email ?? null,
        c2.rating ?? null, c2.reviewCount ?? 0,
        c2.sourceUrl ?? null, domain,
        importStatus, dedupReason, dedupLeadId,
        c2.rawPayload ? JSON.stringify(c2.rawPayload) : null,
        qualityScore, sourceKey,
        ts, ts
      ).run();

      savedCandidates.push({
        id: candId, tenant_id: tenantId, run_id: runId, source_type: sourceType,
        external_id: c2.externalId ?? null, store_name: c2.storeName,
        category: c2.category ?? null, area: c2.area ?? null, address: c2.address ?? null,
        website_url: c2.websiteUrl ?? null, phone: c2.phone ?? null, email: c2.email ?? null,
        rating: c2.rating ?? null, review_count: c2.reviewCount ?? 0,
        source_url: c2.sourceUrl ?? null, normalized_domain: domain,
        import_status: importStatus as any, dedup_reason: dedupReason, dedup_lead_id: dedupLeadId,
        raw_payload_json: c2.rawPayload ? JSON.stringify(c2.rawPayload) : null,
        quality_score: qualityScore, acceptance_status: "pending" as const,
        rejection_reason: null, accepted_at: null, rejected_at: null,
        source_key: sourceKey,
        created_at: ts, updated_at: ts,
      });
    }

    // 5. Update run
    await db.prepare(
      "UPDATE outreach_source_runs SET status = 'completed', result_count = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4"
    ).bind(savedCandidates.length, now(), runId, tenantId).run();

    const summary = {
      total: savedCandidates.length,
      new: savedCandidates.filter((c2) => c2.import_status === "new").length,
      duplicate: savedCandidates.filter((c2) => c2.import_status === "duplicate").length,
      invalid: savedCandidates.filter((c2) => c2.import_status === "invalid").length,
    };

    const { isDemoSourceType } = await import("./source-providers/provider-factory");
    const isDemo = isDemoSourceType(sourceType);

    return c.json({ ok: true, tenantId, data: { runId, candidates: savedCandidates, summary, isDemo } });
  });

  // ── GET /sources/runs — List runs ──────────────────────────────────────
  app.get("/sources/runs", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const rows = await db
      .prepare("SELECT * FROM outreach_source_runs WHERE tenant_id = ?1 ORDER BY created_at DESC LIMIT 50")
      .bind(tenantId).all<OutreachSourceRun>();
    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // ── GET /sources/runs/:id — Run detail with candidates ─────────────────
  app.get("/sources/runs/:id", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const runId = c.req.param("id");

    const run = await db
      .prepare("SELECT * FROM outreach_source_runs WHERE id = ?1 AND tenant_id = ?2")
      .bind(runId, tenantId).first<OutreachSourceRun>();
    if (!run) return c.json({ ok: false, error: "Run not found" }, 404);

    const candidates = await db
      .prepare("SELECT * FROM outreach_source_candidates WHERE run_id = ?1 AND tenant_id = ?2 ORDER BY created_at")
      .bind(runId, tenantId).all<OutreachSourceCandidate>();

    return c.json({ ok: true, tenantId, data: { run, candidates: candidates.results ?? [] } });
  });

  // ── POST /sources/runs/:id/import — Import selected candidates as leads ─
  app.post("/sources/runs/:id/import", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    const runId = c.req.param("id");
    const body = await c.req.json<{ candidateIds: string[] }>();

    if (!body.candidateIds?.length) {
      return c.json({ ok: false, error: "candidateIds が空です" }, 400);
    }

    // Verify run exists
    const run = await db
      .prepare("SELECT * FROM outreach_source_runs WHERE id = ?1 AND tenant_id = ?2")
      .bind(runId, tenantId).first<OutreachSourceRun>();
    if (!run) return c.json({ ok: false, error: "Run not found" }, 404);

    // Load settings for auto-analyze/auto-score
    const settings = await getOutreachSettings(kv, tenantId);

    let created = 0, skipped = 0, invalid = 0;
    const createdLeadIds: string[] = [];

    for (const candId of body.candidateIds) {
      const cand = await db
        .prepare("SELECT * FROM outreach_source_candidates WHERE id = ?1 AND tenant_id = ?2 AND run_id = ?3")
        .bind(candId, tenantId, runId).first<OutreachSourceCandidate>();

      if (!cand) { skipped++; continue; }
      if (cand.import_status === "imported") { skipped++; continue; }
      if (cand.import_status === "invalid") { invalid++; continue; }
      if (cand.import_status === "duplicate") { skipped++; continue; }

      // Create lead (handle UNIQUE constraint on normalized_domain gracefully)
      const leadId = uid();
      const ts = now();
      try {
        await db.prepare(
          `INSERT INTO sales_leads
           (id, tenant_id, store_name, industry, website_url, contact_email, category, area,
            rating, review_count, has_booking_link, status, pipeline_stage,
            domain, normalized_domain, import_source, source_type, source_run_id, source_ref, imported_at,
            created_at, updated_at)
           VALUES (?1, ?2, ?3, 'shared', ?4, ?5, ?6, ?7, ?8, ?9, 0, 'new', 'new', ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`
        ).bind(
          leadId, tenantId, cand.store_name,
          cand.website_url, cand.email,
          run.niche ?? cand.category, cand.area,
          cand.rating ?? 0, cand.review_count ?? 0,
          cand.normalized_domain, cand.normalized_domain,
          cand.source_type, cand.source_type, runId, cand.external_id ?? cand.id,
          ts, ts, ts
        ).run();
      } catch (insertErr: any) {
        // UNIQUE constraint violation → skip duplicate (don't crash)
        const msg = String(insertErr?.message ?? "");
        if (msg.includes("UNIQUE") || msg.includes("constraint")) {
          console.warn(`[IMPORT] duplicate domain skipped: tenant=${tenantId} domain=${cand.normalized_domain} cand=${candId}`);
          await db.prepare(
            "UPDATE outreach_source_candidates SET import_status = 'duplicate', dedup_reason = 'domain_unique', updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
          ).bind(ts, candId, tenantId).run();
          skipped++;
          continue;
        }
        // Other DB error → log and skip (don't crash the whole batch)
        console.error(`[IMPORT] insert failed: tenant=${tenantId} run=${runId} cand=${candId} err=${msg}`);
        skipped++;
        continue;
      }

      // Mark candidate as imported
      await db.prepare(
        "UPDATE outreach_source_candidates SET import_status = 'imported', updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
      ).bind(ts, candId, tenantId).run();

      created++;
      createdLeadIds.push(leadId);
    }

    // Update run imported_count
    await db.prepare(
      "UPDATE outreach_source_runs SET imported_count = imported_count + ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4"
    ).bind(created, now(), runId, tenantId).run();

    // Auto-analyze / auto-score (fire and forget, failures don't block import)
    const autoErrors: Array<{ leadId: string; error: string }> = [];
    if (created > 0 && (settings.autoAnalyzeOnImport || settings.autoScoreOnImport)) {
      for (const leadId of createdLeadIds) {
        try {
          const lead = await db
            .prepare("SELECT * FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
            .bind(leadId, tenantId).first<OutreachLead>();
          if (!lead) continue;

          if (settings.autoAnalyzeOnImport && lead.website_url) {
            // Run analyzer
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
              .bind(tenantId, leadId).run();
            await db.prepare(
              `INSERT INTO outreach_lead_features
               (id, tenant_id, lead_id, has_website, has_instagram, has_line_link, has_booking_link,
                contact_email_found, phone_found, menu_count_guess, price_info_found,
                booking_cta_count, booking_cta_depth_guess, title_found, meta_description_found,
                raw_signals_json, analyzed_at, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`
            ).bind(
              featureId, tenantId, leadId,
              features.hasWebsite ? 1 : 0, features.hasInstagram ? 1 : 0,
              features.hasLineLink ? 1 : 0, features.hasBookingLink ? 1 : 0,
              features.contactEmailFound ? 1 : 0, features.phoneFound ? 1 : 0,
              features.menuCountGuess, features.priceInfoFound ? 1 : 0,
              features.bookingCtaCount, features.bookingCtaDepthGuess,
              features.titleFound ? 1 : 0, features.metaDescriptionFound ? 1 : 0,
              JSON.stringify(features.rawSignals), fts, fts, fts
            ).run();

            // Save hypotheses
            await db.prepare("DELETE FROM outreach_pain_hypotheses WHERE tenant_id = ?1 AND lead_id = ?2")
              .bind(tenantId, leadId).run();
            for (const h of hypotheses) {
              await db.prepare(
                `INSERT INTO outreach_pain_hypotheses (id, tenant_id, lead_id, code, label, severity, reason, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
              ).bind(uid(), tenantId, leadId, h.code, h.label, h.severity, h.reason, fts).run();
            }

            // Compute V2 score
            const featureRow = await db.prepare(
              "SELECT * FROM outreach_lead_features WHERE tenant_id = ?1 AND lead_id = ?2"
            ).bind(tenantId, leadId).first<OutreachLeadFeatureRow>();
            if (featureRow) {
              const scoreResult = computeLeadScoreV2(lead, featureRow, hypotheses as any);
              await db.prepare(
                "UPDATE sales_leads SET score = ?1, features_json = ?2, pain_points = ?3, updated_at = ?4 WHERE id = ?5 AND tenant_id = ?6"
              ).bind(
                scoreResult.score,
                JSON.stringify(scoreResult.components),
                hypotheses.map((h: any) => h.label).join(", "),
                now(), leadId, tenantId
              ).run();
            }
          } else if (settings.autoScoreOnImport) {
            // V1 score only
            const scoreResult = computeLeadScore(lead);
            await db.prepare(
              "UPDATE sales_leads SET score = ?1, features_json = ?2, updated_at = ?3 WHERE id = ?4 AND tenant_id = ?5"
            ).bind(scoreResult.score, JSON.stringify(scoreResult.components), now(), leadId, tenantId).run();
          }
        } catch (err: any) {
          autoErrors.push({ leadId, error: err.message ?? "auto-process failed" });
        }
      }
    }

    await logAudit(db, tenantId, "system", "outreach.source_import", {
      runId, created, skipped, invalid, autoErrors: autoErrors.length,
    });

    return c.json({
      ok: true, tenantId,
      data: { created, skipped, invalid, autoErrors },
    });
  });

  // ── Phase 8.1: Source Quality Layer ──────────────────────────────────────

  // POST /source-candidates/:id/accept
  app.post("/source-candidates/:id/accept", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const candidateId = c.req.param("id");
    const ok = await acceptCandidate(db, candidateId, tenantId, now());
    if (!ok) return c.json({ ok: false, error: "Candidate not found" }, 404);
    return c.json({ ok: true, tenantId });
  });

  // POST /source-candidates/:id/reject
  app.post("/source-candidates/:id/reject", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const candidateId = c.req.param("id");
    const body = await c.req.json<{ rejectionReason?: string }>().catch(() => ({}));
    const ok = await rejectCandidate(db, candidateId, tenantId, body.rejectionReason ?? null, now());
    if (!ok) return c.json({ ok: false, error: "Candidate not found" }, 404);
    return c.json({ ok: true, tenantId });
  });

  // GET /source-quality — Aggregated source quality metrics
  app.get("/source-quality", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const niche = c.req.query("niche") || undefined;
    const area = c.req.query("area") || undefined;
    const sourceType = c.req.query("sourceType") || undefined;

    const rows = await aggregateSourceQuality(db, tenantId, { niche, area, sourceType });

    // Summary
    const summary = {
      totalSources: rows.length,
      totalImported: rows.reduce((s, r) => s + r.leads_imported, 0),
      totalReplies: rows.reduce((s, r) => s + r.reply_count, 0),
      totalMeetings: rows.reduce((s, r) => s + r.meeting_count, 0),
      totalWon: rows.reduce((s, r) => s + r.won_count, 0),
      avgQuality: rows.length > 0
        ? Math.round((rows.reduce((s, r) => s + r.quality_score, 0) / rows.length) * 100) / 100
        : 0,
    };

    return c.json({ ok: true, tenantId, data: rows, summary });
  });

  // GET /source-quality/top — Top performing sources
  app.get("/source-quality/top", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const limit = parseInt(c.req.query("limit") ?? "10", 10);

    const rows = await getTopSources(db, tenantId, limit);
    return c.json({ ok: true, tenantId, data: rows });
  });

  // POST /source-candidates/backfill-quality — Backfill quality scores for existing candidates
  app.post("/source-candidates/backfill-quality", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<{ runId?: string }>().catch(() => ({}));
    const updated = await backfillCandidateQualityScores(db, tenantId, body.runId);
    return c.json({ ok: true, tenantId, data: { updated } });
  });

  // ── Phase 8.2: Batch Actions + Accepted-Only Import + Trends ─────────

  // POST /source-candidates/batch-accept
  app.post("/source-candidates/batch-accept", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<{ candidateIds: string[] }>();
    if (!body.candidateIds?.length) return c.json({ ok: false, error: "candidateIds required" }, 400);
    const result = await batchAcceptCandidates(db, tenantId, body.candidateIds, now());
    return c.json({ ok: true, tenantId, data: result });
  });

  // POST /source-candidates/batch-reject
  app.post("/source-candidates/batch-reject", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<{ candidateIds: string[]; reason?: string }>();
    if (!body.candidateIds?.length) return c.json({ ok: false, error: "candidateIds required" }, 400);
    const result = await batchRejectCandidates(db, tenantId, body.candidateIds, body.reason ?? null, now());
    return c.json({ ok: true, tenantId, data: result });
  });

  // POST /source-candidates/batch-reset
  app.post("/source-candidates/batch-reset", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<{ candidateIds: string[] }>();
    if (!body.candidateIds?.length) return c.json({ ok: false, error: "candidateIds required" }, 400);
    const result = await batchResetCandidates(db, tenantId, body.candidateIds, now());
    return c.json({ ok: true, tenantId, data: result });
  });

  // GET /sources/runs/:id/accepted-count — Count accepted importable candidates
  app.get("/sources/runs/:id/accepted-count", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const runId = c.req.param("id");
    const counts = await getAcceptedImportableCount(db, tenantId, runId);
    return c.json({ ok: true, tenantId, data: counts });
  });

  // POST /sources/runs/:id/import-accepted — Import only accepted candidates
  app.post("/sources/runs/:id/import-accepted", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    const runId = c.req.param("id");

    // Verify run exists
    const run = await db
      .prepare("SELECT * FROM outreach_source_runs WHERE id = ?1 AND tenant_id = ?2")
      .bind(runId, tenantId).first<OutreachSourceRun>();
    if (!run) return c.json({ ok: false, error: "Run not found" }, 404);

    // Get accepted + new candidates
    const candidates = await db
      .prepare(`SELECT * FROM outreach_source_candidates
        WHERE tenant_id = ?1 AND run_id = ?2 AND acceptance_status = 'accepted' AND import_status = 'new'`)
      .bind(tenantId, runId).all<OutreachSourceCandidate>();

    const cands = candidates.results ?? [];
    if (!cands.length) {
      return c.json({ ok: true, tenantId, data: { created: 0, skipped: 0, invalid: 0, accepted: 0, autoErrors: [] } });
    }

    const settings = await getOutreachSettings(kv, tenantId);
    let created = 0, skipped = 0, invalid = 0;
    const createdLeadIds: string[] = [];

    for (const cand of cands) {
      if (cand.import_status === "imported") { skipped++; continue; }
      if (cand.import_status === "invalid") { invalid++; continue; }
      if (cand.import_status === "duplicate") { skipped++; continue; }

      const leadId = uid();
      const ts = now();
      try {
        await db.prepare(
          `INSERT INTO sales_leads
           (id, tenant_id, store_name, industry, website_url, contact_email, category, area,
            rating, review_count, has_booking_link, status, pipeline_stage,
            domain, normalized_domain, import_source, source_type, source_run_id, source_ref, imported_at,
            created_at, updated_at)
           VALUES (?1, ?2, ?3, 'shared', ?4, ?5, ?6, ?7, ?8, ?9, 0, 'new', 'new', ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`
        ).bind(
          leadId, tenantId, cand.store_name,
          cand.website_url, cand.email,
          run.niche ?? cand.category, cand.area,
          cand.rating ?? 0, cand.review_count ?? 0,
          cand.normalized_domain, cand.normalized_domain,
          cand.source_type, cand.source_type, runId, cand.external_id ?? cand.id,
          ts, ts, ts
        ).run();
      } catch (insertErr: any) {
        const msg = String(insertErr?.message ?? "");
        if (msg.includes("UNIQUE") || msg.includes("constraint")) {
          console.warn(`[IMPORT_ACCEPTED] duplicate domain skipped: tenant=${tenantId} domain=${cand.normalized_domain} cand=${cand.id}`);
          await db.prepare(
            "UPDATE outreach_source_candidates SET import_status = 'duplicate', dedup_reason = 'domain_unique', updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
          ).bind(ts, cand.id, tenantId).run();
          skipped++;
          continue;
        }
        console.error(`[IMPORT_ACCEPTED] insert failed: tenant=${tenantId} run=${runId} cand=${cand.id} err=${msg}`);
        skipped++;
        continue;
      }

      await db.prepare(
        "UPDATE outreach_source_candidates SET import_status = 'imported', updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
      ).bind(ts, cand.id, tenantId).run();

      created++;
      createdLeadIds.push(leadId);
    }

    // Update run imported_count
    if (created > 0) {
      await db.prepare(
        "UPDATE outreach_source_runs SET imported_count = imported_count + ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4"
      ).bind(created, now(), runId, tenantId).run();
    }

    // Auto-analyze / auto-score + automation tracking on candidates
    const autoErrors: Array<{ leadId: string; error: string }> = [];
    if (created > 0 && (settings.autoAnalyzeOnImport || settings.autoScoreOnImport)) {
      for (let i = 0; i < createdLeadIds.length; i++) {
        const leadId = createdLeadIds[i];
        const candId = cands[i]?.id;
        try {
          const lead = await db
            .prepare("SELECT * FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
            .bind(leadId, tenantId).first<OutreachLead>();
          if (!lead) continue;

          // Track automation status on candidate
          if (candId) {
            await db.prepare(
              "UPDATE outreach_source_candidates SET automation_status = 'processing', automation_updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
            ).bind(now(), candId, tenantId).run();
          }

          if (settings.autoAnalyzeOnImport && lead.website_url) {
            // Update analyze_status
            if (candId) {
              await db.prepare(
                "UPDATE outreach_source_candidates SET analyze_status = 'running', automation_updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
              ).bind(now(), candId, tenantId).run();
            }

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
              .bind(tenantId, leadId).run();
            await db.prepare(
              `INSERT INTO outreach_lead_features
               (id, tenant_id, lead_id, has_website, has_instagram, has_line_link, has_booking_link,
                contact_email_found, phone_found, menu_count_guess, price_info_found,
                booking_cta_count, booking_cta_depth_guess, title_found, meta_description_found,
                raw_signals_json, analyzed_at, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`
            ).bind(
              featureId, tenantId, leadId,
              features.hasWebsite ? 1 : 0, features.hasInstagram ? 1 : 0,
              features.hasLineLink ? 1 : 0, features.hasBookingLink ? 1 : 0,
              features.contactEmailFound ? 1 : 0, features.phoneFound ? 1 : 0,
              features.menuCountGuess, features.priceInfoFound ? 1 : 0,
              features.bookingCtaCount, features.bookingCtaDepthGuess,
              features.titleFound ? 1 : 0, features.metaDescriptionFound ? 1 : 0,
              JSON.stringify(features.rawSignals), fts, fts, fts
            ).run();

            // Save hypotheses
            await db.prepare("DELETE FROM outreach_pain_hypotheses WHERE tenant_id = ?1 AND lead_id = ?2")
              .bind(tenantId, leadId).run();
            for (const h of hypotheses) {
              await db.prepare(
                `INSERT INTO outreach_pain_hypotheses (id, tenant_id, lead_id, code, label, severity, reason, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
              ).bind(uid(), tenantId, leadId, h.code, h.label, h.severity, h.reason, fts).run();
            }

            if (candId) {
              await db.prepare(
                "UPDATE outreach_source_candidates SET analyze_status = 'done', automation_updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
              ).bind(now(), candId, tenantId).run();
            }

            // Compute V2 score with features + hypotheses
            if (candId) {
              await db.prepare(
                "UPDATE outreach_source_candidates SET score_status = 'running', automation_updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
              ).bind(now(), candId, tenantId).run();
            }

            const featureRow = await db.prepare(
              "SELECT * FROM outreach_lead_features WHERE tenant_id = ?1 AND lead_id = ?2"
            ).bind(tenantId, leadId).first<OutreachLeadFeatureRow>();
            if (featureRow) {
              const scoreResult = computeLeadScoreV2(lead, featureRow, hypotheses as any);
              await db.prepare(
                "UPDATE sales_leads SET score = ?1, features_json = ?2, pain_points = ?3, updated_at = ?4 WHERE id = ?5 AND tenant_id = ?6"
              ).bind(
                scoreResult.score,
                JSON.stringify(scoreResult.components),
                hypotheses.map((h: any) => h.label).join(", "),
                now(), leadId, tenantId
              ).run();
            }

            if (candId) {
              await db.prepare(
                "UPDATE outreach_source_candidates SET score_status = 'done', automation_status = 'done', automation_updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
              ).bind(now(), candId, tenantId).run();
            }
          } else if (settings.autoScoreOnImport) {
            // V1 score only
            if (candId) {
              await db.prepare(
                "UPDATE outreach_source_candidates SET score_status = 'running', automation_updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
              ).bind(now(), candId, tenantId).run();
            }

            const scoreResult = computeLeadScore(lead);
            await db.prepare(
              "UPDATE sales_leads SET score = ?1, features_json = ?2, updated_at = ?3 WHERE id = ?4 AND tenant_id = ?5"
            ).bind(scoreResult.score, JSON.stringify(scoreResult.components), now(), leadId, tenantId).run();

            if (candId) {
              await db.prepare(
                "UPDATE outreach_source_candidates SET score_status = 'done', automation_status = 'done', automation_updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
              ).bind(now(), candId, tenantId).run();
            }
          } else {
            // No auto-process, mark done
            if (candId) {
              await db.prepare(
                "UPDATE outreach_source_candidates SET automation_status = 'done', automation_updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3"
              ).bind(now(), candId, tenantId).run();
            }
          }
        } catch (err: any) {
          autoErrors.push({ leadId, error: err.message ?? "auto-process failed" });
          if (candId) {
            try {
              await db.prepare(
                "UPDATE outreach_source_candidates SET automation_status = 'error', last_automation_error = ?1, automation_updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4"
              ).bind(err.message ?? "auto-process failed", now(), candId, tenantId).run();
            } catch { /* ignore tracking error */ }
          }
        }
      }
    }

    await logAudit(db, tenantId, "system", "outreach.source_import_accepted", {
      runId, created, skipped, invalid, accepted: cands.length, autoErrors: autoErrors.length,
    });

    return c.json({
      ok: true, tenantId,
      data: { created, skipped, invalid, accepted: cands.length, autoErrors },
    });
  });

  // GET /source-quality/trends — Daily trend data
  app.get("/source-quality/trends", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const days = parseInt(c.req.query("days") ?? "30", 10);
    const sourceType = c.req.query("sourceType") || undefined;
    const niche = c.req.query("niche") || undefined;
    const area = c.req.query("area") || undefined;

    const trends = await getSourceQualityTrends(db, tenantId, days, { sourceType, niche, area });
    return c.json({ ok: true, tenantId, data: trends });
  });

  // GET /source-quality/breakdown — Source breakdown summary
  app.get("/source-quality/breakdown", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const days = parseInt(c.req.query("days") ?? "30", 10);

    const breakdown = await getSourceQualityBreakdown(db, tenantId, days);
    return c.json({ ok: true, tenantId, data: breakdown });
  });

  // ── GET /analytics/sources — Source performance analytics ──────────────
  app.get("/analytics/sources", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;

    // Leads by source_type
    const bySource = await db.prepare(
      `SELECT COALESCE(source_type, import_source, 'manual') as source_type, COUNT(*) as count
       FROM sales_leads WHERE tenant_id = ?1
       GROUP BY COALESCE(source_type, import_source, 'manual')`
    ).bind(tenantId).all<{ source_type: string; count: number }>();

    // Runs by source
    const runsBySource = await db.prepare(
      `SELECT source_type, COUNT(*) as runs, SUM(result_count) as total_results, SUM(imported_count) as total_imported
       FROM outreach_source_runs WHERE tenant_id = ?1
       GROUP BY source_type`
    ).bind(tenantId).all<{ source_type: string; runs: number; total_results: number; total_imported: number }>();

    // Duplicate rate by source (from candidates)
    const dupRate = await db.prepare(
      `SELECT source_type, COUNT(*) as total,
         SUM(CASE WHEN import_status = 'duplicate' THEN 1 ELSE 0 END) as duplicates
       FROM outreach_source_candidates WHERE tenant_id = ?1
       GROUP BY source_type`
    ).bind(tenantId).all<{ source_type: string; total: number; duplicates: number }>();

    // Avg score by source
    const avgScore = await db.prepare(
      `SELECT COALESCE(source_type, import_source, 'manual') as source_type,
         ROUND(AVG(score), 1) as avg_score, COUNT(*) as sample_size
       FROM sales_leads WHERE tenant_id = ?1 AND score IS NOT NULL
       GROUP BY COALESCE(source_type, import_source, 'manual')`
    ).bind(tenantId).all<{ source_type: string; avg_score: number; sample_size: number }>();

    // Meeting rate by source
    const meetingRate = await db.prepare(
      `SELECT COALESCE(source_type, import_source, 'manual') as source_type,
         COUNT(*) as total,
         SUM(CASE WHEN pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as meetings
       FROM sales_leads WHERE tenant_id = ?1
       GROUP BY COALESCE(source_type, import_source, 'manual')`
    ).bind(tenantId).all<{ source_type: string; total: number; meetings: number }>();

    const data: SourceAnalytics = {
      leadsBySourceType: bySource.results ?? [],
      runsBySource: runsBySource.results ?? [],
      duplicateRateBySource: (dupRate.results ?? []).map((r) => ({
        ...r, rate: r.total > 0 ? Math.round((r.duplicates / r.total) * 100) : 0,
      })),
      avgScoreBySource: avgScore.results ?? [],
      meetingRateBySource: (meetingRate.results ?? []).map((r) => ({
        ...r, rate: r.total > 0 ? Math.round((r.meetings / r.total) * 100) : 0, sample_size: r.total,
      })),
    };

    return c.json({ ok: true, tenantId, data });
  });

  // ── GET /analytics/winning-patterns — Learning patterns ──────────────
  app.get("/analytics/winning-patterns", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const ctx = await getLearningContext(db, tenantId);
    return c.json({ ok: true, tenantId, data: ctx });
  });

  // ── POST /analytics/refresh-patterns — Recalculate learning patterns ──
  app.post("/analytics/refresh-patterns", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const result = await refreshLearningPatterns(db, tenantId, uid, now);
    const templatesGenerated = await generateNicheTemplates(db, tenantId, uid, now);
    await logAudit(db, tenantId, "system", "outreach.refresh_patterns", { ...result, templatesGenerated });
    return c.json({ ok: true, tenantId, data: { ...result, templatesGenerated } });
  });

  // ── Phase 7: Campaign Draft Generator ──────────────────────────────────

  // POST /campaigns/generate-draft — Auto-generate campaign with optimized variants
  app.post("/campaigns/generate-draft", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<CampaignDraftInput>();

    if (!body.niche) {
      return c.json({ ok: false, error: "niche is required" }, 400);
    }

    const result = await generateCampaignDraft(db, tenantId, body, uid, now);
    await logAudit(db, tenantId, "system", "outreach.campaign_draft_generated", {
      campaignId: result.campaign.id,
      variants: result.variants.length,
      matchingLeads: result.matchingLeads,
    });

    return c.json({ ok: true, tenantId, data: result });
  });

  // ── Phase 7: Niche Templates ───────────────────────────────────────────

  // GET /niche-templates — List niche templates
  app.get("/niche-templates", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const niche = c.req.query("niche");

    let query = "SELECT * FROM outreach_niche_templates WHERE tenant_id = ?1";
    const binds: any[] = [tenantId];

    if (niche) {
      query += " AND niche = ?2";
      binds.push(niche);
    }

    query += " ORDER BY win_score DESC LIMIT 50";

    const rows = await db.prepare(query).bind(...binds).all<OutreachNicheTemplate>();
    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // POST /niche-templates — Create/update a niche template manually
  app.post("/niche-templates", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<{
      niche: string;
      name: string;
      tone?: string;
      subject_template?: string;
      opener_template?: string;
      body_template?: string;
      cta_template?: string;
      hypothesis_codes?: string;
    }>();

    if (!body.niche || !body.name) {
      return c.json({ ok: false, error: "niche and name are required" }, 400);
    }

    const id = uid();
    const ts = now();
    await db
      .prepare(
        `INSERT INTO outreach_niche_templates
         (id, tenant_id, niche, name, tone, subject_template, opener_template, body_template, cta_template,
          hypothesis_codes, win_score, sample_size, is_auto_generated, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, 0, 0, ?11, ?12)`
      )
      .bind(
        id, tenantId, body.niche, body.name,
        body.tone ?? "friendly",
        body.subject_template ?? null,
        body.opener_template ?? null,
        body.body_template ?? null,
        body.cta_template ?? null,
        body.hypothesis_codes ?? null,
        ts, ts
      )
      .run();

    const created = await db
      .prepare("SELECT * FROM outreach_niche_templates WHERE id = ?1")
      .bind(id)
      .first<OutreachNicheTemplate>();

    return c.json({ ok: true, tenantId, data: created });
  });

  // GET /analytics/campaign-insights — Campaign performance comparison
  app.get("/analytics/campaign-insights", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;

    // Campaign-level aggregation with variant performance
    const insights = await db
      .prepare(
        `SELECT c.id as campaign_id, c.name as campaign_name, c.niche, c.area, c.status,
           COUNT(DISTINCT m.lead_id) as total_leads,
           SUM(CASE WHEN m.status = 'sent' THEN 1 ELSE 0 END) as total_sent,
           SUM(CASE WHEN l.pipeline_stage IN ('replied','meeting','customer') THEN 1 ELSE 0 END) as total_replied,
           SUM(CASE WHEN l.pipeline_stage IN ('meeting','customer') THEN 1 ELSE 0 END) as total_meetings,
           c.created_at
         FROM outreach_campaigns c
         LEFT JOIN lead_message_drafts m ON m.campaign_id = c.id AND m.tenant_id = c.tenant_id
         LEFT JOIN sales_leads l ON m.lead_id = l.id AND m.tenant_id = l.tenant_id
         WHERE c.tenant_id = ?1
         GROUP BY c.id
         ORDER BY c.created_at DESC
         LIMIT 20`
      )
      .bind(tenantId)
      .all<{
        campaign_id: string;
        campaign_name: string;
        niche: string | null;
        area: string | null;
        status: string;
        total_leads: number;
        total_sent: number;
        total_replied: number;
        total_meetings: number;
        created_at: string;
      }>();

    // Learning refresh history
    const refreshHistory = await db
      .prepare(
        `SELECT * FROM outreach_learning_refresh_log
         WHERE tenant_id = ?1
         ORDER BY created_at DESC LIMIT 10`
      )
      .bind(tenantId)
      .all();

    // Niche template stats
    const templateStats = await db
      .prepare(
        `SELECT niche, COUNT(*) as count, MAX(win_score) as best_score, SUM(sample_size) as total_samples
         FROM outreach_niche_templates
         WHERE tenant_id = ?1
         GROUP BY niche`
      )
      .bind(tenantId)
      .all<{ niche: string; count: number; best_score: number; total_samples: number }>();

    return c.json({
      ok: true,
      tenantId,
      data: {
        campaigns: (insights.results ?? []).map((r) => ({
          ...r,
          reply_rate: r.total_sent > 0 ? Math.round((r.total_replied / r.total_sent) * 100) : 0,
          meeting_rate: r.total_sent > 0 ? Math.round((r.total_meetings / r.total_sent) * 100) : 0,
        })),
        refreshHistory: refreshHistory.results ?? [],
        templateStats: templateStats.results ?? [],
      },
    });
  });

  // ── Phase 8.3: Candidate Quality Learning ──────────────────────────────

  // POST /quality-learning/refresh — Refresh quality patterns from lead outcomes
  app.post("/quality-learning/refresh", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const result = await refreshQualityPatterns(db, uid, now, tenantId);
    await logAudit(db, tenantId, "system", "outreach.quality_learning_refresh", result);
    return c.json({ ok: true, tenantId, data: result });
  });

  // POST /quality-learning/backfill-v2 — Backfill V2 quality scores
  app.post("/quality-learning/backfill-v2", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<{ runId?: string }>().catch(() => ({}));
    const result = await backfillQualityV2(db, tenantId, (body as any).runId);
    await logAudit(db, tenantId, "system", "outreach.quality_v2_backfill", result);
    return c.json({ ok: true, tenantId, data: result });
  });

  // GET /quality-learning/insights — Learned quality insights for analytics
  app.get("/quality-learning/insights", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const insights = await getLearnedQualityInsights(db, tenantId);
    return c.json({ ok: true, tenantId, data: insights });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 10: Auto Prospect Batch
  // ══════════════════════════════════════════════════════════════════════════

  // POST /batches — Create a new batch job
  app.post("/batches", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<BatchJobCreateInput>();

    if (!body.niche?.trim()) {
      return c.json({ ok: false, error: "niche は必須です" }, 400);
    }
    if (!body.areas?.length) {
      return c.json({ ok: false, error: "areas は1件以上必要です" }, 400);
    }

    const job = await createBatchJob(db, tenantId, body, uid, now);
    await logAudit(db, tenantId, "system", "outreach.batch_created", { jobId: job.id, niche: job.niche, areas: body.areas });
    return c.json({ ok: true, tenantId, data: job });
  });

  // GET /batches — List batch jobs
  app.get("/batches", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const rows = await db
      .prepare("SELECT * FROM outreach_batch_jobs WHERE tenant_id = ?1 ORDER BY created_at DESC LIMIT 50")
      .bind(tenantId)
      .all<OutreachBatchJob>();
    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // GET /batches/:id — Get batch job detail
  app.get("/batches/:id", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const jobId = c.req.param("id");

    const job = await db
      .prepare("SELECT * FROM outreach_batch_jobs WHERE id = ?1 AND tenant_id = ?2")
      .bind(jobId, tenantId)
      .first<OutreachBatchJob>();
    if (!job) return c.json({ ok: false, error: "Batch job not found" }, 404);

    const items = await db
      .prepare("SELECT * FROM outreach_batch_job_items WHERE batch_job_id = ?1 AND tenant_id = ?2 ORDER BY created_at")
      .bind(jobId, tenantId)
      .all<OutreachBatchJobItem>();

    return c.json({ ok: true, tenantId, data: { job, items: items.results ?? [] } });
  });

  // POST /batches/:id/run — Execute batch job
  app.post("/batches/:id/run", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    const jobId = c.req.param("id");

    try {
      const result = await runBatchJob(db, kv, tenantId, jobId, uid, now, {
        GOOGLE_MAPS_API_KEY: c.env.GOOGLE_MAPS_API_KEY,
        OPENAI_API_KEY: c.env.OPENAI_API_KEY,
      });

      await logAudit(db, tenantId, "system", "outreach.batch_completed", {
        jobId, summary: result.summary,
      });

      return c.json({ ok: true, tenantId, data: result });
    } catch (err: any) {
      await logAudit(db, tenantId, "system", "outreach.batch_failed", {
        jobId, error: err.message,
      });
      return c.json({ ok: false, error: err.message || "Batch execution failed" }, 500);
    }
  });

  // POST /batches/:id/cancel — Cancel a pending/running batch job
  app.post("/batches/:id/cancel", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const jobId = c.req.param("id");

    const job = await db
      .prepare("SELECT * FROM outreach_batch_jobs WHERE id = ?1 AND tenant_id = ?2")
      .bind(jobId, tenantId)
      .first<OutreachBatchJob>();
    if (!job) return c.json({ ok: false, error: "Batch job not found" }, 404);
    if (job.status !== "pending" && job.status !== "running") {
      return c.json({ ok: false, error: `Cannot cancel job with status ${job.status}` }, 400);
    }

    await db
      .prepare("UPDATE outreach_batch_jobs SET status = 'cancelled', updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3")
      .bind(now(), jobId, tenantId)
      .run();

    return c.json({ ok: true, tenantId });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 11: Auto Outreach Scheduler
  // ══════════════════════════════════════════════════════════════════════════

  // GET /automation — List schedules
  app.get("/automation", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const rows = await db
      .prepare("SELECT * FROM outreach_schedules WHERE tenant_id = ?1 ORDER BY created_at DESC LIMIT 50")
      .bind(tenantId)
      .all<OutreachSchedule>();
    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // POST /automation — Create schedule
  app.post("/automation", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const body = await c.req.json<ScheduleCreateInput>();

    if (!body.niche?.trim()) {
      return c.json({ ok: false, error: "niche は必須です" }, 400);
    }
    if (!body.areas?.length) {
      return c.json({ ok: false, error: "areas は1件以上必要です" }, 400);
    }

    try {
      const schedule = await createSchedule(db, tenantId, body, uid, now);
      await logAudit(db, tenantId, "system", "outreach.schedule_created", { scheduleId: schedule.id });
      return c.json({ ok: true, tenantId, data: schedule });
    } catch (err: any) {
      return c.json({ ok: false, error: err.message }, 400);
    }
  });

  // GET /automation/:id — Get schedule detail
  app.get("/automation/:id", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const id = c.req.param("id");

    const schedule = await db
      .prepare("SELECT * FROM outreach_schedules WHERE id = ?1 AND tenant_id = ?2")
      .bind(id, tenantId)
      .first<OutreachSchedule>();
    if (!schedule) return c.json({ ok: false, error: "Schedule not found" }, 404);

    return c.json({ ok: true, tenantId, data: schedule });
  });

  // PATCH/PUT /automation/:id — Update schedule
  const handleUpdateSchedule = async (c: any) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const id = c.req.param("id");
    const body = await c.req.json<Partial<ScheduleCreateInput> & { enabled?: boolean }>();

    const updated = await updateSchedule(db, tenantId, id, body, now);
    if (!updated) return c.json({ ok: false, error: "Schedule not found" }, 404);

    await logAudit(db, tenantId, "system", "outreach.schedule_updated", { scheduleId: id });
    return c.json({ ok: true, tenantId, data: updated });
  };
  app.patch("/automation/:id", handleUpdateSchedule);
  app.put("/automation/:id", handleUpdateSchedule);

  // POST /automation/:id/enable — Enable schedule
  app.post("/automation/:id/enable", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const id = c.req.param("id");
    const updated = await updateSchedule(db, tenantId, id, { enabled: true }, now);
    if (!updated) return c.json({ ok: false, error: "Schedule not found" }, 404);
    return c.json({ ok: true, tenantId, data: updated });
  });

  // POST /automation/:id/disable — Disable schedule
  app.post("/automation/:id/disable", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const id = c.req.param("id");
    const updated = await updateSchedule(db, tenantId, id, { enabled: false }, now);
    if (!updated) return c.json({ ok: false, error: "Schedule not found" }, 404);
    return c.json({ ok: true, tenantId, data: updated });
  });

  // POST /automation/:id/run-now — Manual run
  app.post("/automation/:id/run-now", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    const id = c.req.param("id");

    try {
      const run = await runScheduleNow(db, kv, tenantId, id, uid, now, {
        GOOGLE_MAPS_API_KEY: c.env.GOOGLE_MAPS_API_KEY,
        OPENAI_API_KEY: c.env.OPENAI_API_KEY,
      });
      await logAudit(db, tenantId, "system", "outreach.schedule_run_now", { scheduleId: id, runId: run.id });
      return c.json({ ok: true, tenantId, data: run });
    } catch (err: any) {
      return c.json({ ok: false, error: err.message || "Run failed" }, 500);
    }
  });

  // GET /automation/:id/runs — List run history
  app.get("/automation/:id/runs", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const scheduleId = c.req.param("id");
    const rows = await db
      .prepare("SELECT * FROM outreach_schedule_runs WHERE schedule_id = ?1 AND tenant_id = ?2 ORDER BY created_at DESC LIMIT 30")
      .bind(scheduleId, tenantId)
      .all<OutreachScheduleRun>();
    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // ── Phase 12: Auto Sales Copilot ─────────────────────────────────────

  // GET /copilot/recommendations — List recommendations
  app.get("/copilot/recommendations", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const status = c.req.query("status") || "open";
    const rows = await db
      .prepare(
        `SELECT * FROM outreach_copilot_recommendations
         WHERE tenant_id = ?1 AND status = ?2
         ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC
         LIMIT 50`
      )
      .bind(tenantId, status)
      .all<CopilotRecommendation>();
    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // POST /copilot/recommendations/refresh — Regenerate recommendations
  app.post("/copilot/recommendations/refresh", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    try {
      const recs = await generateRecommendations(db, tenantId, uid, now);
      await logAudit(db, tenantId, "system", "outreach.copilot_refresh", { count: recs.length });
      return c.json({ ok: true, tenantId, data: recs });
    } catch (err: any) {
      return c.json({ ok: false, error: err.message || "Refresh failed" }, 500);
    }
  });

  // POST /copilot/recommendations/:id/accept
  app.post("/copilot/recommendations/:id/accept", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const id = c.req.param("id");
    const ok = await acceptRecommendation(db, tenantId, id, now);
    return c.json({ ok, tenantId });
  });

  // POST /copilot/recommendations/:id/dismiss
  app.post("/copilot/recommendations/:id/dismiss", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const id = c.req.param("id");
    const ok = await dismissRecommendation(db, tenantId, id, now);
    return c.json({ ok, tenantId });
  });

  // GET /copilot/overview — Dashboard copilot overview (top 3 recs + health + insights)
  app.get("/copilot/overview", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    try {
      const overview = await getCopilotOverview(db, tenantId);
      return c.json({ ok: true, tenantId, data: overview });
    } catch (err: any) {
      return c.json({ ok: false, error: err.message || "Overview failed" }, 500);
    }
  });

  // GET /analytics/copilot-insights — Copilot insights for analytics page
  app.get("/analytics/copilot-insights", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    try {
      const insights = await getCopilotInsights(db, tenantId);
      return c.json({ ok: true, tenantId, data: insights });
    } catch (err: any) {
      return c.json({ ok: false, error: err.message || "Insights failed" }, 500);
    }
  });

  // GET /review/prioritized — Review queue sorted by priority
  app.get("/review/prioritized", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;

    // Compute/refresh priorities
    await computeReviewPriorities(db, tenantId);

    const rows = await db
      .prepare(
        `SELECT m.*, l.store_name, l.category, l.area, l.pipeline_stage, l.score as lead_score, l.rating, l.contact_email
         FROM lead_message_drafts m
         JOIN sales_leads l ON m.lead_id = l.id AND l.tenant_id = ?1
         WHERE m.tenant_id = ?1 AND m.status = 'pending_review'
         ORDER BY COALESCE(m.review_priority_score, 0) DESC
         LIMIT 50`
      )
      .bind(tenantId)
      .all();
    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // ── Phase 13: Auto Action Engine ──────────────────────────────────────

  // POST /copilot/recommendations/:id/execute — Execute a recommendation action
  app.post("/copilot/recommendations/:id/execute", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    const recId = c.req.param("id");
    const result = await executeRecommendationAction(db, kv, tenantId, recId, "user", uid, now, {
      GOOGLE_MAPS_API_KEY: c.env.GOOGLE_MAPS_API_KEY,
      OPENAI_API_KEY: c.env.OPENAI_API_KEY,
      RESEND_API_KEY: c.env.RESEND_API_KEY,
      EMAIL_FROM: c.env.EMAIL_FROM,
    });
    return c.json({ ok: result.ok, tenantId, result: result.result, error: result.error });
  });

  // GET /action-logs — Fetch action audit logs
  app.get("/action-logs", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const limit = Number(c.req.query("limit") || "50");
    const logs = await getActionLogs(db, tenantId, limit);
    return c.json({ ok: true, tenantId, data: logs });
  });

  // GET /auto-execution/settings — Get auto execution settings
  app.get("/auto-execution/settings", async (c) => {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const settings = await getAutoActionSettings(kv, tenantId);
    return c.json({ ok: true, tenantId, data: settings });
  });

  // PUT /auto-execution/settings — Update auto execution settings
  app.put("/auto-execution/settings", async (c) => {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const body = await c.req.json();
    const settings = await saveAutoActionSettings(kv, tenantId, body);
    return c.json({ ok: true, tenantId, data: settings });
  });

  // POST /auto-execution/run — Manually trigger auto execution
  app.post("/auto-execution/run", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    const result = await processAutoActions(db, kv, uid, now, {
      GOOGLE_MAPS_API_KEY: c.env.GOOGLE_MAPS_API_KEY,
      OPENAI_API_KEY: c.env.OPENAI_API_KEY,
    });
    return c.json({ ok: true, tenantId, data: result });
  });

  // POST /auto-campaign/run — Manually trigger auto campaign for this tenant
  app.post("/auto-campaign/run", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    const result = await runAutoCampaign(db, kv, tenantId, uid, now, {
      OPENAI_API_KEY: c.env.OPENAI_API_KEY,
      RESEND_API_KEY: c.env.RESEND_API_KEY,
      EMAIL_FROM: c.env.EMAIL_FROM,
    });
    return c.json({ ok: true, tenantId, data: result });
  });

  // ── Phase 14: Auto Reply AI ────────────────────────────────────────────

  // POST /replies/ingest — Ingest a new reply (from webhook/manual)
  app.post("/replies/ingest", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    const body = await c.req.json<{
      lead_id: string;
      campaign_id?: string;
      message_id?: string;
      reply_text: string;
      reply_source?: ReplySource;
      from_email?: string;
      subject?: string;
    }>();

    if (!body.lead_id || !body.reply_text?.trim()) {
      return c.json({ ok: false, error: "lead_id and reply_text are required" }, 400);
    }

    // Verify lead exists
    const lead = await db
      .prepare("SELECT id FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(body.lead_id, tenantId)
      .first();
    if (!lead) {
      return c.json({ ok: false, error: "Lead not found" }, 404);
    }

    const replyId = uid();
    const ts = now();
    const replySource = body.reply_source || "email";

    // Insert into outreach_replies
    await db
      .prepare(
        `INSERT INTO outreach_replies
         (id, tenant_id, lead_id, campaign_id, message_id, reply_text, reply_source, from_email, subject, status, ai_handled, ai_response_sent, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'open', 0, 0, ?10)`
      )
      .bind(replyId, tenantId, body.lead_id, body.campaign_id || null, body.message_id || null, body.reply_text, replySource, body.from_email || null, body.subject || null, ts)
      .run();

    // Auto-process immediately if enabled
    const settings = await getAutoReplySettings(kv, tenantId);
    let processResult = null;

    if (settings.autoReplyEnabled) {
      const reply: OutreachReply = {
        id: replyId,
        tenant_id: tenantId,
        lead_id: body.lead_id,
        campaign_id: body.campaign_id || null,
        message_id: body.message_id || null,
        reply_text: body.reply_text,
        reply_source: replySource,
        sentiment: null,
        intent: null,
        intent_confidence: null,
        ai_handled: 0,
        ai_response: null,
        ai_response_sent: 0,
        created_at: ts,
      };
      processResult = await processReply(
        { db, kv, tenantId, openaiApiKey: c.env.OPENAI_API_KEY, resendApiKey: c.env.RESEND_API_KEY, emailFrom: c.env.EMAIL_FROM, uid, now, aiCore: new AICore(c.env as any) },
        reply
      );
    } else {
      // Still classify for display, but don't auto-reply
      const classification = await classifyReplyIntent(body.reply_text, new AICore(c.env as any), tenantId);
      await db
        .prepare(
          `UPDATE outreach_replies
           SET intent = ?1, sentiment = ?2, intent_confidence = ?3
           WHERE id = ?4 AND tenant_id = ?5`
        )
        .bind(classification.intent, classification.sentiment, classification.confidence, replyId, tenantId)
        .run();
      processResult = {
        replyId,
        intent: classification.intent,
        sentiment: classification.sentiment,
        confidence: classification.confidence,
        sent: false,
        skippedReason: "auto_reply_disabled",
      };
    }

    // Update lead last_replied_at
    await db
      .prepare("UPDATE sales_leads SET last_replied_at = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4")
      .bind(ts, ts, body.lead_id, tenantId)
      .run();

    await logAudit(db, tenantId, "system", "outreach.reply_ingested", {
      replyId, leadId: body.lead_id, replySource,
    });

    return c.json({ ok: true, tenantId, data: processResult });
  });

  // GET /auto-reply/list — List replies (paginated, filterable)
  app.get("/auto-reply/list", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const intent = c.req.query("intent");
    const handled = c.req.query("handled");
    const limit = Math.min(Number(c.req.query("limit") || "50"), 100);

    let sql = `SELECT r.*, l.store_name, l.contact_email, l.area, l.pipeline_stage
               FROM outreach_replies r
               JOIN sales_leads l ON r.lead_id = l.id AND l.tenant_id = ?1
               WHERE r.tenant_id = ?1`;
    const params: any[] = [tenantId];

    if (intent) {
      sql += ` AND r.intent = ?${params.length + 1}`;
      params.push(intent);
    }
    if (handled === "0") {
      sql += ` AND r.ai_handled = 0`;
    } else if (handled === "1") {
      sql += ` AND r.ai_handled = 1`;
    }

    sql += ` ORDER BY r.created_at DESC LIMIT ?${params.length + 1}`;
    params.push(limit);

    const stmt = db.prepare(sql);
    const rows = await stmt.bind(...params).all();
    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // GET /auto-reply/unhandled — Unhandled replies needing human review
  app.get("/auto-reply/unhandled", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const rows = await db
      .prepare(
        `SELECT r.*, l.store_name, l.contact_email, l.area, l.pipeline_stage
         FROM outreach_replies r
         JOIN sales_leads l ON r.lead_id = l.id AND l.tenant_id = ?1
         WHERE r.tenant_id = ?1 AND r.ai_handled = 0
         ORDER BY r.created_at ASC
         LIMIT 50`
      )
      .bind(tenantId)
      .all();
    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // POST /auto-reply/:id/execute — Manually execute auto-reply on a specific reply
  app.post("/auto-reply/:id/execute", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    const replyId = c.req.param("id");

    const reply = await db
      .prepare("SELECT * FROM outreach_replies WHERE id = ?1 AND tenant_id = ?2")
      .bind(replyId, tenantId)
      .first<OutreachReply>();

    if (!reply) {
      return c.json({ ok: false, error: "Reply not found" }, 404);
    }

    if (reply.ai_response_sent) {
      return c.json({ ok: false, error: "Reply already sent" }, 400);
    }

    const result = await processReply(
      { db, kv, tenantId, openaiApiKey: c.env.OPENAI_API_KEY, resendApiKey: c.env.RESEND_API_KEY, emailFrom: c.env.EMAIL_FROM, uid, now, aiCore: new AICore(c.env as any) },
      reply
    );
    return c.json({ ok: true, tenantId, data: result });
  });

  // GET /auto-reply/logs — Reply audit logs
  app.get("/auto-reply/logs", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const limit = Math.min(Number(c.req.query("limit") || "50"), 100);
    const rows = await db
      .prepare(
        `SELECT * FROM outreach_reply_logs
         WHERE tenant_id = ?1
         ORDER BY created_at DESC
         LIMIT ?2`
      )
      .bind(tenantId, limit)
      .all<OutreachReplyLog>();
    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // GET /auto-reply/settings — Get auto-reply settings
  app.get("/auto-reply/settings", async (c) => {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const settings = await getAutoReplySettings(kv, tenantId);
    return c.json({ ok: true, tenantId, data: settings });
  });

  // PUT /auto-reply/settings — Update auto-reply settings
  app.put("/auto-reply/settings", async (c) => {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const body = await c.req.json<Partial<AutoReplySettings>>();
    const settings = await saveAutoReplySettings(kv, tenantId, body);
    await logAudit(c.env.DB, tenantId, "user", "outreach.auto_reply_settings_updated", settings);
    return c.json({ ok: true, tenantId, data: settings });
  });

  // GET /auto-reply/stats — Stats for dashboard
  app.get("/auto-reply/stats", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const todayStart = new Date().toISOString().slice(0, 10);

    const [totalToday, aiReplied, needsHuman] = await Promise.all([
      db.prepare(
        `SELECT COUNT(*) as cnt FROM outreach_replies WHERE tenant_id = ?1 AND created_at >= ?2`
      ).bind(tenantId, todayStart).first<{ cnt: number }>(),
      db.prepare(
        `SELECT COUNT(*) as cnt FROM outreach_replies WHERE tenant_id = ?1 AND created_at >= ?2 AND ai_response_sent = 1`
      ).bind(tenantId, todayStart).first<{ cnt: number }>(),
      db.prepare(
        `SELECT COUNT(*) as cnt FROM outreach_replies WHERE tenant_id = ?1 AND ai_handled = 0`
      ).bind(tenantId).first<{ cnt: number }>(),
    ]);

    const todayReplies = totalToday?.cnt ?? 0;
    const aiRepliedCount = aiReplied?.cnt ?? 0;

    return c.json({
      ok: true, tenantId,
      data: {
        todayReplies,
        aiReplied: aiRepliedCount,
        aiSuccessRate: todayReplies > 0 ? Math.round((aiRepliedCount / todayReplies) * 100) : 0,
        needsHumanCount: needsHuman?.cnt ?? 0,
      },
    });
  });

  // POST /auto-reply/process-all — Manually trigger processing of all unhandled replies
  app.post("/auto-reply/process-all", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    const result = await processUnhandledReplies({
      db, kv, tenantId, openaiApiKey: c.env.OPENAI_API_KEY, resendApiKey: c.env.RESEND_API_KEY, emailFrom: c.env.EMAIL_FROM, uid, now, aiCore: new AICore(c.env as any),
    });
    return c.json({ ok: true, tenantId, data: result });
  });

  // PUT /replies/:id/status — Update reply status (open/in_progress/resolved/dismissed)
  app.put("/replies/:id/status", async (c) => {
    const tenantId = getTenantId(c);
    const replyId = c.req.param("id");
    const db = c.env.DB;
    const body = await c.req.json<{ status: string }>();

    const validStatuses = ["open", "in_progress", "resolved", "dismissed"];
    if (!validStatuses.includes(body.status)) {
      return c.json({ ok: false, error: `status must be one of: ${validStatuses.join(", ")}` }, 400);
    }

    const existing = await db
      .prepare("SELECT id FROM outreach_replies WHERE id = ?1 AND tenant_id = ?2")
      .bind(replyId, tenantId)
      .first();
    if (!existing) return c.json({ ok: false, error: "reply_not_found" }, 404);

    await db
      .prepare("UPDATE outreach_replies SET status = ?1 WHERE id = ?2 AND tenant_id = ?3")
      .bind(body.status, replyId, tenantId)
      .run();

    return c.json({ ok: true, tenantId, replyId, status: body.status });
  });

  // ── Phase 15: Auto Close AI ──────────────────────────────────────────

  // GET /close/settings
  app.get("/close/settings", async (c) => {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const { getCloseSettings } = await import("./close-generator");
    const settings = await getCloseSettings(kv, tenantId);
    return c.json({ ok: true, tenantId, data: settings });
  });

  // PUT /close/settings
  app.put("/close/settings", async (c) => {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const body = await c.req.json();
    const { saveCloseSettings } = await import("./close-generator");
    const settings = await saveCloseSettings(kv, tenantId, body);
    const db = c.env.DB;
    const { logAudit } = await import("../lineConfig");
    await logAudit(db, tenantId, "owner", "outreach.close.settings.update", body);
    return c.json({ ok: true, tenantId, data: settings });
  });

  // POST /replies/:id/close-evaluate — evaluate close intent for a reply
  app.post("/replies/:id/close-evaluate", async (c) => {
    const tenantId = getTenantId(c);
    const replyId = c.req.param("id");
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;

    const reply = await db
      .prepare("SELECT * FROM outreach_replies WHERE id = ?1 AND tenant_id = ?2")
      .bind(replyId, tenantId)
      .first();
    if (!reply) return c.json({ ok: false, error: "reply_not_found" }, 404);

    const { classifyCloseIntent } = await import("./close-classifier");
    const result = await classifyCloseIntent(
      reply.reply_text as string,
      c.env.OPENAI_API_KEY
    );

    // Update reply record
    await db
      .prepare(
        `UPDATE outreach_replies
         SET close_intent = ?1, close_confidence = ?2, recommended_next_step = ?3,
             deal_temperature = ?4, handoff_required = ?5
         WHERE id = ?6 AND tenant_id = ?7`
      )
      .bind(
        result.close_intent, result.close_confidence, result.recommended_next_step,
        result.deal_temperature, result.recommended_next_step === "human_followup" ? 1 : 0,
        replyId, tenantId
      )
      .run();

    // Update lead
    const { CLOSE_INTENT_TO_STAGE } = await import("./types");
    const closeStage = CLOSE_INTENT_TO_STAGE[result.close_intent] || null;
    await db
      .prepare(
        `UPDATE sales_leads
         SET deal_temperature = ?1, handoff_required = ?2, close_stage = ?3, close_evaluated_at = ?4, updated_at = ?5
         WHERE id = ?6 AND tenant_id = ?7`
      )
      .bind(
        result.deal_temperature,
        result.recommended_next_step === "human_followup" ? 1 : 0,
        closeStage,
        now(),
        now(),
        reply.lead_id as string,
        tenantId
      )
      .run();

    // Write close log
    await db
      .prepare(
        `INSERT INTO outreach_close_logs
         (id, tenant_id, lead_id, reply_id, close_intent, close_confidence, deal_temperature,
          suggested_action, execution_status, handoff_required, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
      )
      .bind(
        uid(), tenantId, reply.lead_id as string, replyId,
        result.close_intent, result.close_confidence, result.deal_temperature,
        result.recommended_next_step, "suggested",
        result.recommended_next_step === "human_followup" ? 1 : 0,
        now()
      )
      .run();

    return c.json({ ok: true, tenantId, data: result });
  });

  // POST /replies/:id/close-respond — generate & optionally send close response
  app.post("/replies/:id/close-respond", async (c) => {
    const tenantId = getTenantId(c);
    const replyId = c.req.param("id");
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;

    const reply = await db
      .prepare("SELECT * FROM outreach_replies WHERE id = ?1 AND tenant_id = ?2")
      .bind(replyId, tenantId)
      .first();
    if (!reply) return c.json({ ok: false, error: "reply_not_found" }, 404);

    if (!reply.close_intent) {
      return c.json({ ok: false, error: "not_close_evaluated" }, 400);
    }

    const { getCloseSettings, generateCloseResponse } = await import("./close-generator");
    const settings = await getCloseSettings(kv, tenantId);

    const lead = await db
      .prepare("SELECT store_name FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(reply.lead_id as string, tenantId)
      .first<{ store_name: string }>();

    const closeResp = await generateCloseResponse({
      closeIntent: reply.close_intent as any,
      dealTemperature: (reply.deal_temperature as any) || "cold",
      recommendedNextStep: (reply.recommended_next_step as any) || "none",
      replyText: reply.reply_text as string,
      storeName: lead?.store_name || "弊社",
      settings,
      openaiApiKey: c.env.OPENAI_API_KEY,
    });

    // Write close log
    await db
      .prepare(
        `INSERT INTO outreach_close_logs
         (id, tenant_id, lead_id, reply_id, close_intent, close_confidence, deal_temperature,
          suggested_action, ai_response, execution_status, handoff_required, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
      )
      .bind(
        uid(), tenantId, reply.lead_id as string, replyId,
        reply.close_intent as string,
        reply.close_confidence as number,
        (reply.deal_temperature as string) || "cold",
        reply.recommended_next_step as string,
        closeResp.response_text,
        closeResp.handoff_required ? "escalated" : "suggested",
        closeResp.handoff_required ? 1 : 0,
        now()
      )
      .run();

    return c.json({ ok: true, tenantId, data: closeResp });
  });

  // GET /close-logs — list close audit logs
  app.get("/close-logs", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const limit = Math.min(Number(c.req.query("limit") || 50), 100);
    const offset = Number(c.req.query("offset") || 0);

    const rows = await db
      .prepare(
        `SELECT * FROM outreach_close_logs
         WHERE tenant_id = ?1
         ORDER BY created_at DESC
         LIMIT ?2 OFFSET ?3`
      )
      .bind(tenantId, limit, offset)
      .all();

    return c.json({ ok: true, tenantId, data: rows.results ?? [] });
  });

  // ── Phase 21: Debug pipeline status endpoint ────────────────────────────
  // GET /debug/pipeline — recent inbound → classify → reply → close events
  app.get("/debug/pipeline", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const limit = Math.min(Number(c.req.query("limit") || 10), 30);

    // 1. Recent replies (inbound)
    const replies = await db
      .prepare(
        `SELECT r.id, r.lead_id, r.from_email, r.subject, r.intent, r.intent_confidence, r.sentiment,
                r.status, r.ai_handled, r.ai_response_sent, r.close_intent, r.close_confidence,
                r.deal_temperature, r.handoff_required, r.created_at,
                l.store_name, l.pipeline_stage, l.close_stage
         FROM outreach_replies r
         LEFT JOIN sales_leads l ON r.lead_id = l.id AND l.tenant_id = ?1
         WHERE r.tenant_id = ?1
         ORDER BY r.created_at DESC LIMIT ?2`
      )
      .bind(tenantId, limit)
      .all();

    // 2. Recent close logs
    const closeLogs = await db
      .prepare(
        `SELECT id, lead_id, reply_id, close_intent, close_confidence, deal_temperature,
                suggested_action, execution_status, handoff_required, close_variant_key, created_at
         FROM outreach_close_logs
         WHERE tenant_id = ?1
         ORDER BY created_at DESC LIMIT ?2`
      )
      .bind(tenantId, limit)
      .all();

    // 3. Recent delivery events
    const deliveryEvents = await db
      .prepare(
        `SELECT id, lead_id, message_id, channel, event_type, status, metadata_json, created_at
         FROM outreach_delivery_events
         WHERE tenant_id = ?1
         ORDER BY created_at DESC LIMIT ?2`
      )
      .bind(tenantId, limit)
      .all();

    // 4. Recent handoffs
    const handoffs = await db
      .prepare(
        `SELECT id, lead_id, reply_id, reason, priority, status, created_at
         FROM outreach_handoffs
         WHERE tenant_id = ?1
         ORDER BY created_at DESC LIMIT ?2`
      )
      .bind(tenantId, limit)
      .all();

    // 5. Recent booking events
    const bookingEvents = await db
      .prepare(
        `SELECT id, lead_id, close_log_id, event_type, booking_url, variant_key, created_at
         FROM outreach_booking_events
         WHERE tenant_id = ?1
         ORDER BY created_at DESC LIMIT ?2`
      )
      .bind(tenantId, limit)
      .all();

    // 6. Reply logs (audit trail)
    const replyLogs = await db
      .prepare(
        `SELECT id, lead_id, reply_id, ai_decision, execution_status, error_message, created_at
         FROM outreach_reply_logs
         WHERE tenant_id = ?1
         ORDER BY created_at DESC LIMIT ?2`
      )
      .bind(tenantId, limit)
      .all();

    // Redact full email: show domain only
    const redactEmail = (e: string | null) => e ? `***@${e.split("@")[1] || "?"}` : null;
    const safeReplies = (replies.results ?? []).map((r: any) => ({
      ...r,
      from_email: redactEmail(r.from_email),
      reply_text: undefined, // never expose full text in debug
      ai_response: undefined,
    }));

    return c.json({
      ok: true, tenantId,
      data: {
        replies: safeReplies,
        closeLogs: closeLogs.results ?? [],
        deliveryEvents: deliveryEvents.results ?? [],
        handoffs: handoffs.results ?? [],
        bookingEvents: bookingEvents.results ?? [],
        replyLogs: replyLogs.results ?? [],
      },
    });
  });

  // GET /hot-leads — list hot/warm leads with close evaluation
  app.get("/hot-leads", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const limit = Math.min(Number(c.req.query("limit") || 20), 50);

    const rows = await db
      .prepare(
        `SELECT id, store_name, domain, deal_temperature, close_stage,
                handoff_required, close_evaluated_at, updated_at
         FROM sales_leads
         WHERE tenant_id = ?1
           AND deal_temperature IN ('hot', 'warm')
           AND pipeline_stage NOT IN ('customer', 'lost')
         ORDER BY
           CASE deal_temperature WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 ELSE 2 END,
           close_evaluated_at DESC
         LIMIT ?2`
      )
      .bind(tenantId, limit)
      .all();

    // Get latest close intent & recommended_next_step from close_logs
    const leads = [];
    for (const row of rows.results ?? []) {
      const log = await db
        .prepare(
          `SELECT close_intent, suggested_action AS recommended_next_step
           FROM outreach_close_logs
           WHERE tenant_id = ?1 AND lead_id = ?2
           ORDER BY created_at DESC LIMIT 1`
        )
        .bind(tenantId, row.id)
        .first();
      leads.push({
        ...row,
        close_intent: log?.close_intent || null,
        recommended_next_step: log?.recommended_next_step || null,
      });
    }

    return c.json({ ok: true, tenantId, data: leads });
  });

  // GET /close/insights — close analytics
  app.get("/close/insights", async (c) => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const todayStr = new Date().toISOString().slice(0, 10);

    const [pricingToday, demoToday, meetingReq, hotCount, handoffCount] = await Promise.all([
      db.prepare(
        `SELECT COUNT(*) as cnt FROM outreach_close_logs WHERE tenant_id = ?1 AND close_intent = 'pricing_request' AND created_at >= ?2`
      ).bind(tenantId, todayStr).first<{ cnt: number }>(),
      db.prepare(
        `SELECT COUNT(*) as cnt FROM outreach_close_logs WHERE tenant_id = ?1 AND close_intent = 'demo_request' AND created_at >= ?2`
      ).bind(tenantId, todayStr).first<{ cnt: number }>(),
      db.prepare(
        `SELECT COUNT(*) as cnt FROM sales_leads WHERE tenant_id = ?1 AND close_stage = 'meeting_requested' AND pipeline_stage NOT IN ('customer', 'lost')`
      ).bind(tenantId).first<{ cnt: number }>(),
      db.prepare(
        `SELECT COUNT(*) as cnt FROM sales_leads WHERE tenant_id = ?1 AND deal_temperature = 'hot' AND pipeline_stage NOT IN ('customer', 'lost')`
      ).bind(tenantId).first<{ cnt: number }>(),
      db.prepare(
        `SELECT COUNT(*) as cnt FROM sales_leads WHERE tenant_id = ?1 AND handoff_required = 1 AND pipeline_stage NOT IN ('customer', 'lost')`
      ).bind(tenantId).first<{ cnt: number }>(),
    ]);

    // Close rate by source
    const sourceRows = await db.prepare(
      `SELECT l.import_source as source,
              COUNT(CASE WHEN l.pipeline_stage IN ('customer') THEN 1 END) * 1.0 / COUNT(*) as closeRate,
              COUNT(*) as sampleSize
       FROM sales_leads l
       WHERE l.tenant_id = ?1 AND l.import_source IS NOT NULL
       GROUP BY l.import_source HAVING COUNT(*) >= 3
       ORDER BY closeRate DESC LIMIT 10`
    ).bind(tenantId).all();

    // Close rate by niche
    const nicheRows = await db.prepare(
      `SELECT l.niche,
              COUNT(CASE WHEN l.pipeline_stage IN ('customer') THEN 1 END) * 1.0 / COUNT(*) as closeRate,
              COUNT(*) as sampleSize
       FROM sales_leads l
       WHERE l.tenant_id = ?1 AND l.niche IS NOT NULL
       GROUP BY l.niche HAVING COUNT(*) >= 3
       ORDER BY closeRate DESC LIMIT 10`
    ).bind(tenantId).all();

    return c.json({
      ok: true,
      tenantId,
      data: {
        pricingRequestsToday: pricingToday?.cnt ?? 0,
        demoRequestsToday: demoToday?.cnt ?? 0,
        meetingRequestedCount: meetingReq?.cnt ?? 0,
        hotLeadsCount: hotCount?.cnt ?? 0,
        handoffRequiredCount: handoffCount?.cnt ?? 0,
        closeRateBySource: (sourceRows.results ?? []).map((r: any) => ({
          source: r.source, closeRate: r.closeRate, sampleSize: r.sampleSize,
        })),
        closeRateByNiche: (nicheRows.results ?? []).map((r: any) => ({
          niche: r.niche, closeRate: r.closeRate, sampleSize: r.sampleSize,
        })),
      },
    });
  });

  // POST /replies/:id/handoff — mark for human handoff
  app.post("/replies/:id/handoff", async (c) => {
    const tenantId = getTenantId(c);
    const replyId = c.req.param("id");
    const db = c.env.DB;

    const reply = await db
      .prepare("SELECT lead_id FROM outreach_replies WHERE id = ?1 AND tenant_id = ?2")
      .bind(replyId, tenantId)
      .first<{ lead_id: string }>();
    if (!reply) return c.json({ ok: false, error: "reply_not_found" }, 404);

    await db
      .prepare("UPDATE outreach_replies SET handoff_required = 1 WHERE id = ?1 AND tenant_id = ?2")
      .bind(replyId, tenantId)
      .run();

    await db
      .prepare("UPDATE sales_leads SET handoff_required = 1, updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3")
      .bind(now(), reply.lead_id, tenantId)
      .run();

    const { logAudit } = await import("../lineConfig");
    await logAudit(db, tenantId, "owner", "outreach.close.handoff", { replyId, leadId: reply.lead_id });

    return c.json({ ok: true, tenantId });
  });

  // POST /replies/:id/mark-won — mark lead as won
  app.post("/replies/:id/mark-won", async (c) => {
    const tenantId = getTenantId(c);
    const replyId = c.req.param("id");
    const db = c.env.DB;

    const reply = await db
      .prepare("SELECT lead_id FROM outreach_replies WHERE id = ?1 AND tenant_id = ?2")
      .bind(replyId, tenantId)
      .first<{ lead_id: string }>();
    if (!reply) return c.json({ ok: false, error: "reply_not_found" }, 404);

    await db
      .prepare("UPDATE sales_leads SET pipeline_stage = 'customer', close_stage = 'won', updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3")
      .bind(now(), reply.lead_id, tenantId)
      .run();

    await db
      .prepare(
        `INSERT INTO outreach_close_logs (id, tenant_id, lead_id, reply_id, close_intent, close_confidence, deal_temperature, suggested_action, execution_status, handoff_required, created_at)
         VALUES (?1, ?2, ?3, ?4, 'signup_request', 1.0, 'hot', 'mark_won', 'auto_sent', 0, ?5)`
      )
      .bind(uid(), tenantId, reply.lead_id, replyId, now())
      .run();

    const { logAudit } = await import("../lineConfig");
    await logAudit(db, tenantId, "owner", "outreach.close.mark_won", { replyId, leadId: reply.lead_id });

    return c.json({ ok: true, tenantId });
  });

  // POST /replies/:id/mark-lost — mark lead as lost
  app.post("/replies/:id/mark-lost", async (c) => {
    const tenantId = getTenantId(c);
    const replyId = c.req.param("id");
    const db = c.env.DB;

    const reply = await db
      .prepare("SELECT lead_id FROM outreach_replies WHERE id = ?1 AND tenant_id = ?2")
      .bind(replyId, tenantId)
      .first<{ lead_id: string }>();
    if (!reply) return c.json({ ok: false, error: "reply_not_found" }, 404);

    await db
      .prepare("UPDATE sales_leads SET pipeline_stage = 'lost', close_stage = 'lost', updated_at = ?1 WHERE id = ?2 AND tenant_id = ?3")
      .bind(now(), reply.lead_id, tenantId)
      .run();

    await db
      .prepare(
        `INSERT INTO outreach_close_logs (id, tenant_id, lead_id, reply_id, close_intent, close_confidence, deal_temperature, suggested_action, execution_status, handoff_required, created_at)
         VALUES (?1, ?2, ?3, ?4, 'cold_lead', 1.0, 'cold', 'mark_lost', 'auto_sent', 0, ?5)`
      )
      .bind(uid(), tenantId, reply.lead_id, replyId, now())
      .run();

    const { logAudit } = await import("../lineConfig");
    await logAudit(db, tenantId, "owner", "outreach.close.mark_lost", { replyId, leadId: reply.lead_id });

    return c.json({ ok: true, tenantId });
  });

  // POST /replies/:id/meeting-suggest — get meeting suggestion
  app.post("/replies/:id/meeting-suggest", async (c) => {
    const tenantId = getTenantId(c);
    const replyId = c.req.param("id");
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;

    const reply = await db
      .prepare("SELECT * FROM outreach_replies WHERE id = ?1 AND tenant_id = ?2")
      .bind(replyId, tenantId)
      .first();
    if (!reply) return c.json({ ok: false, error: "reply_not_found" }, 404);

    const { getCloseSettings } = await import("./close-generator");
    const settings = await getCloseSettings(kv, tenantId);

    const lead = await db
      .prepare("SELECT store_name FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
      .bind(reply.lead_id as string, tenantId)
      .first<{ store_name: string }>();

    const { suggestNextStep } = await import("./meeting-suggester");
    const suggestion = suggestNextStep(
      (reply.close_intent as any) || "not_close_relevant",
      (reply.deal_temperature as any) || "cold",
      settings,
      lead?.store_name || "弊社"
    );

    return c.json({ ok: true, tenantId, data: suggestion });
  });

  return app;
}
