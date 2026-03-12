// Outreach OS — API client
// ============================================================
// Follows same pattern as adminApi.ts: apiGet/apiPost/apiPatch via /api/proxy

import { apiGet, apiPost, apiPut, apiDelete, ApiClientError } from "./apiClient";
import { apiRequest } from "./apiClient";
import type {
  OutreachLead,
  OutreachMessage,
  OutreachAnalytics,
  OutreachDeliveryEvent,
  ScoreResult,
  GeneratedMessageResult,
  LeadDetail,
  AnalyzeResult,
  OutreachSettings,
  SendStats,
  UnsubscribedLead,
  RecordReplyResult,
  OutreachFollowup,
  LearningAnalytics,
  ImportPreviewRow,
  ImportPreviewSummary,
  ImportResult,
  OutreachCampaign,
  OutreachCampaignVariant,
  CampaignPreview,
  CampaignAnalytics,
  OutreachSourceRun,
  OutreachSourceCandidate,
  SourceSearchResult,
  SourceImportResult,
  SourceAnalytics,
  WinningPatternsData,
} from "@/src/types/outreach";

// ── Leads ──────────────────────────────────────────────────────────────────

interface LeadsListResponse {
  ok: boolean;
  data: {
    leads: OutreachLead[];
    total: number;
    limit: number;
    offset: number;
  };
}

export async function fetchOutreachLeads(
  tenantId: string,
  params?: {
    status?: string;
    pipeline_stage?: string;
    sort?: string;
    order?: string;
    limit?: number;
    offset?: number;
  }
): Promise<LeadsListResponse["data"]> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.pipeline_stage) sp.set("pipeline_stage", params.pipeline_stage);
  if (params?.sort) sp.set("sort", params.sort);
  if (params?.order) sp.set("order", params.order);
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  const path = `/admin/outreach/leads${qs ? `?${qs}` : ""}`;
  const res = await apiGet<LeadsListResponse>(path, { tenantId });
  return res.data;
}

export async function fetchLeadDetail(
  tenantId: string,
  leadId: string
): Promise<LeadDetail> {
  const res = await apiGet<{ ok: boolean; data: LeadDetail }>(
    `/admin/outreach/leads/${leadId}`,
    { tenantId }
  );
  return res.data;
}

export interface CreateLeadInput {
  store_name: string;
  industry?: string;
  website_url?: string;
  instagram_url?: string;
  line_url?: string;
  region?: string;
  notes?: string;
  contact_email?: string;
  category?: string;
  area?: string;
  rating?: number;
  review_count?: number;
  has_booking_link?: boolean;
}

export async function createOutreachLead(
  tenantId: string,
  input: CreateLeadInput
): Promise<OutreachLead> {
  const res = await apiPost<{ ok: boolean; data: OutreachLead }>(
    "/admin/outreach/leads",
    input,
    { tenantId }
  );
  return res.data;
}

export async function updateOutreachLead(
  tenantId: string,
  leadId: string,
  input: Record<string, any>
): Promise<OutreachLead> {
  const res = await apiRequest<{ ok: boolean; data: OutreachLead }>(
    `/admin/outreach/leads/${leadId}`,
    {
      method: "PATCH",
      tenantId,
      body: JSON.stringify(input),
    }
  );
  return res.data;
}

// ── Website Analysis (Phase 2) ─────────────────────────────────────────────

export async function analyzeOutreachLead(
  tenantId: string,
  leadId: string
): Promise<AnalyzeResult> {
  const res = await apiPost<{ ok: boolean; data: AnalyzeResult }>(
    `/admin/outreach/analyze/${leadId}`,
    {},
    { tenantId, timeout: 15000 } // analyzer may take longer due to external fetch
  );
  return res.data;
}

export async function rescoreOutreachLead(
  tenantId: string,
  leadId: string
): Promise<ScoreResult & { hasFeatures: boolean }> {
  const res = await apiPost<{ ok: boolean; data: ScoreResult & { hasFeatures: boolean } }>(
    `/admin/outreach/rescore/${leadId}`,
    {},
    { tenantId }
  );
  return res.data;
}

// ── Scoring ────────────────────────────────────────────────────────────────

export async function scoreOutreachLead(
  tenantId: string,
  leadId: string
): Promise<ScoreResult> {
  const res = await apiPost<{ ok: boolean; data: ScoreResult }>(
    `/admin/outreach/score/${leadId}`,
    {},
    { tenantId }
  );
  return res.data;
}

// ── AI Message Generation ──────────────────────────────────────────────────

export async function generateMessage(
  tenantId: string,
  leadId: string,
  input?: { tone?: string; cta?: string; channel?: string }
): Promise<GeneratedMessageResult> {
  const res = await apiPost<{ ok: boolean; data: GeneratedMessageResult }>(
    `/admin/outreach/generate-message/${leadId}`,
    input ?? {},
    { tenantId }
  );
  return res.data;
}

// ── Review ─────────────────────────────────────────────────────────────────

export async function fetchReviewQueue(
  tenantId: string,
  status?: string
): Promise<OutreachMessage[]> {
  const sp = status ? `?status=${status}` : "";
  const res = await apiGet<{ ok: boolean; data: OutreachMessage[] }>(
    `/admin/outreach/review${sp}`,
    { tenantId }
  );
  return res.data;
}

export async function approveMessage(
  tenantId: string,
  messageId: string
): Promise<void> {
  await apiPost(`/admin/outreach/review/${messageId}/approve`, {}, { tenantId });
}

export async function rejectMessage(
  tenantId: string,
  messageId: string
): Promise<void> {
  await apiPost(`/admin/outreach/review/${messageId}/reject`, {}, { tenantId });
}

// ── Campaign Send ──────────────────────────────────────────────────────────

export async function sendCampaign(
  tenantId: string,
  messageId: string
): Promise<{ sent: boolean; provider: string; eventId: string; error?: string }> {
  const res = await apiPost<{
    ok: boolean;
    data: { sent: boolean; provider: string; eventId: string; error?: string };
  }>(`/admin/outreach/campaigns/${messageId}/send`, {}, { tenantId });
  return res.data;
}

// ── Analytics ──────────────────────────────────────────────────────────────

export async function fetchOutreachAnalytics(
  tenantId: string
): Promise<OutreachAnalytics> {
  const res = await apiGet<{ ok: boolean; data: OutreachAnalytics }>(
    "/admin/outreach/analytics",
    { tenantId }
  );
  return res.data;
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 3: Settings, Unsubscribes, Replies, Delivery Events, Send Stats
// ══════════════════════════════════════════════════════════════════════════

// ── Settings ──────────────────────────────────────────────────────────────

export async function fetchOutreachSettings(
  tenantId: string
): Promise<OutreachSettings> {
  const res = await apiGet<{ ok: boolean; data: OutreachSettings }>(
    "/admin/outreach/settings",
    { tenantId }
  );
  return res.data;
}

export async function saveOutreachSettings(
  tenantId: string,
  settings: Partial<OutreachSettings>
): Promise<OutreachSettings> {
  const res = await apiPut<{ ok: boolean; data: OutreachSettings }>(
    "/admin/outreach/settings",
    settings,
    { tenantId }
  );
  return res.data;
}

// ── Unsubscribes ──────────────────────────────────────────────────────────

export async function fetchUnsubscribes(
  tenantId: string
): Promise<UnsubscribedLead[]> {
  const res = await apiGet<{ ok: boolean; data: UnsubscribedLead[] }>(
    "/admin/outreach/unsubscribes",
    { tenantId }
  );
  return res.data;
}

export async function addUnsubscribe(
  tenantId: string,
  leadId: string
): Promise<void> {
  await apiPost(`/admin/outreach/unsubscribes/${leadId}`, {}, { tenantId });
}

export async function removeUnsubscribe(
  tenantId: string,
  leadId: string
): Promise<void> {
  await apiDelete(`/admin/outreach/unsubscribes/${leadId}`, { tenantId });
}

// ── Replies ───────────────────────────────────────────────────────────────

export async function recordReply(
  tenantId: string,
  leadId: string,
  data: { channel?: string; replyBody?: string }
): Promise<RecordReplyResult> {
  const res = await apiPost<{ ok: boolean; data: RecordReplyResult }>(
    `/admin/outreach/replies/${leadId}`,
    data,
    { tenantId }
  );
  return res.data;
}

// ── Delivery Events ───────────────────────────────────────────────────────

export async function fetchDeliveryEvents(
  tenantId: string,
  params?: { lead_id?: string; event_type?: string; limit?: number }
): Promise<OutreachDeliveryEvent[]> {
  const sp = new URLSearchParams();
  if (params?.lead_id) sp.set("lead_id", params.lead_id);
  if (params?.event_type) sp.set("event_type", params.event_type);
  if (params?.limit) sp.set("limit", String(params.limit));
  const qs = sp.toString();
  const res = await apiGet<{ ok: boolean; data: OutreachDeliveryEvent[] }>(
    `/admin/outreach/delivery-events${qs ? `?${qs}` : ""}`,
    { tenantId }
  );
  return res.data;
}

// ── Send Stats ────────────────────────────────────────────────────────────

export async function fetchSendStats(
  tenantId: string
): Promise<SendStats> {
  const res = await apiGet<{ ok: boolean; data: SendStats }>(
    "/admin/outreach/send-stats",
    { tenantId }
  );
  return res.data;
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 4: Followups, Learning Analytics
// ══════════════════════════════════════════════════════════════════════════

// ── Followups ─────────────────────────────────────────────────────────────

export async function fetchFollowups(
  tenantId: string,
  params?: { status?: string; lead_id?: string; limit?: number }
): Promise<OutreachFollowup[]> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.lead_id) sp.set("lead_id", params.lead_id);
  if (params?.limit) sp.set("limit", String(params.limit));
  const qs = sp.toString();
  const res = await apiGet<{ ok: boolean; data: OutreachFollowup[] }>(
    `/admin/outreach/followups${qs ? `?${qs}` : ""}`,
    { tenantId }
  );
  return res.data;
}

export async function cancelFollowup(
  tenantId: string,
  followupId: string
): Promise<void> {
  await apiPost(`/admin/outreach/followups/${followupId}/cancel`, {}, { tenantId });
}

// ── Learning Analytics ────────────────────────────────────────────────────

export async function fetchLearningAnalytics(
  tenantId: string
): Promise<LearningAnalytics> {
  const res = await apiGet<{ ok: boolean; data: LearningAnalytics }>(
    "/admin/outreach/analytics/learning",
    { tenantId }
  );
  return res.data;
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 5: CSV Import, Campaigns, AB Test
// ══════════════════════════════════════════════════════════════════════════

// ── Import ────────────────────────────────────────────────────────────────

export async function importPreview(
  tenantId: string,
  csvText: string
): Promise<{ rows: ImportPreviewRow[]; summary: ImportPreviewSummary }> {
  const res = await apiPost<{
    ok: boolean;
    data: { rows: ImportPreviewRow[]; summary: ImportPreviewSummary };
  }>("/admin/outreach/import/preview", { csvText }, { tenantId });
  return res.data;
}

export async function importExecute(
  tenantId: string,
  csvText: string,
  actions: Record<number, "create" | "merge" | "skip">
): Promise<ImportResult> {
  const res = await apiPost<{ ok: boolean; data: ImportResult }>(
    "/admin/outreach/import/execute",
    { csvText, actions },
    { tenantId }
  );
  return res.data;
}

// ── Campaigns ─────────────────────────────────────────────────────────────

export async function fetchCampaigns(
  tenantId: string
): Promise<OutreachCampaign[]> {
  const res = await apiGet<{ ok: boolean; data: OutreachCampaign[] }>(
    "/admin/outreach/campaigns",
    { tenantId }
  );
  return res.data;
}

export async function createCampaign(
  tenantId: string,
  input: { name: string; niche?: string; area?: string; min_score?: number }
): Promise<OutreachCampaign> {
  const res = await apiPost<{ ok: boolean; data: OutreachCampaign }>(
    "/admin/outreach/campaigns-create",
    input,
    { tenantId }
  );
  return res.data;
}

export async function updateCampaign(
  tenantId: string,
  campaignId: string,
  input: Partial<OutreachCampaign>
): Promise<OutreachCampaign> {
  const res = await apiRequest<{ ok: boolean; data: OutreachCampaign }>(
    `/admin/outreach/campaigns-manage/${campaignId}`,
    { method: "PATCH", tenantId, body: JSON.stringify(input) }
  );
  return res.data;
}

// ── Campaign Variants ─────────────────────────────────────────────────────

export async function fetchCampaignVariants(
  tenantId: string,
  campaignId: string
): Promise<OutreachCampaignVariant[]> {
  const res = await apiGet<{ ok: boolean; data: OutreachCampaignVariant[] }>(
    `/admin/outreach/campaigns-manage/${campaignId}/variants`,
    { tenantId }
  );
  return res.data;
}

export async function createCampaignVariant(
  tenantId: string,
  campaignId: string,
  input: {
    variant_key: string;
    subject_template?: string;
    opener_template?: string;
    cta_template?: string;
    tone?: string;
  }
): Promise<OutreachCampaignVariant> {
  const res = await apiPost<{ ok: boolean; data: OutreachCampaignVariant }>(
    `/admin/outreach/campaigns-manage/${campaignId}/variants`,
    input,
    { tenantId }
  );
  return res.data;
}

// ── Campaign Preview + Generate ───────────────────────────────────────────

export async function fetchCampaignPreview(
  tenantId: string,
  campaignId: string
): Promise<CampaignPreview> {
  const res = await apiGet<{ ok: boolean; data: CampaignPreview }>(
    `/admin/outreach/campaigns-manage/${campaignId}/preview`,
    { tenantId }
  );
  return res.data;
}

export async function generateReviewItems(
  tenantId: string,
  campaignId: string
): Promise<{ generated: number; skippedDup: number; skippedUnsub: number }> {
  const res = await apiPost<{
    ok: boolean;
    data: { generated: number; skippedDup: number; skippedUnsub: number };
  }>(
    `/admin/outreach/campaigns-manage/${campaignId}/generate-review-items`,
    {},
    { tenantId, timeout: 60000 }
  );
  return res.data;
}

// ── Campaign Analytics ────────────────────────────────────────────────────

export async function fetchCampaignAnalytics(
  tenantId: string
): Promise<CampaignAnalytics> {
  const res = await apiGet<{ ok: boolean; data: CampaignAnalytics }>(
    "/admin/outreach/analytics/campaigns",
    { tenantId }
  );
  return res.data;
}

// ── Phase 6: Source Search / Import ──────────────────────────────────────

export async function searchSources(
  tenantId: string,
  input: { source_type: string; query?: string; location?: string; niche?: string; maxResults?: number }
): Promise<SourceSearchResult> {
  const res = await apiPost<{ ok: boolean; data: SourceSearchResult }>(
    "/admin/outreach/sources/search",
    input,
    { tenantId, timeout: 30000 }
  );
  return res.data;
}

export async function fetchSourceRuns(
  tenantId: string
): Promise<OutreachSourceRun[]> {
  const res = await apiGet<{ ok: boolean; data: OutreachSourceRun[] }>(
    "/admin/outreach/sources/runs",
    { tenantId }
  );
  return res.data;
}

export async function fetchSourceRunDetail(
  tenantId: string,
  runId: string
): Promise<{ run: OutreachSourceRun; candidates: OutreachSourceCandidate[] }> {
  const res = await apiGet<{ ok: boolean; data: { run: OutreachSourceRun; candidates: OutreachSourceCandidate[] } }>(
    `/admin/outreach/sources/runs/${runId}`,
    { tenantId }
  );
  return res.data;
}

export async function importSourceCandidates(
  tenantId: string,
  runId: string,
  candidateIds: string[]
): Promise<SourceImportResult> {
  const res = await apiPost<{ ok: boolean; data: SourceImportResult }>(
    `/admin/outreach/sources/runs/${runId}/import`,
    { candidateIds },
    { tenantId, timeout: 60000 }
  );
  return res.data;
}

export async function fetchSourceAnalytics(
  tenantId: string
): Promise<SourceAnalytics> {
  const res = await apiGet<{ ok: boolean; data: SourceAnalytics }>(
    "/admin/outreach/analytics/sources",
    { tenantId }
  );
  return res.data;
}

// ── Winning Patterns ────────────────────────────────────────────────────

export async function fetchWinningPatterns(
  tenantId: string
): Promise<WinningPatternsData> {
  const res = await apiGet<{ ok: boolean; data: WinningPatternsData }>(
    "/admin/outreach/analytics/winning-patterns",
    { tenantId }
  );
  return res.data;
}

export async function refreshWinningPatterns(
  tenantId: string
): Promise<{ updated: number; deleted: number }> {
  const res = await apiPost<{ ok: boolean; data: { updated: number; deleted: number } }>(
    "/admin/outreach/analytics/refresh-patterns",
    {},
    { tenantId }
  );
  return res.data;
}
