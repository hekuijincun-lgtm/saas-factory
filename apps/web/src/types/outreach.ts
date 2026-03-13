// Outreach OS — Frontend types
// ============================================================

export type PipelineStage =
  | "new"
  | "approved"
  | "contacted"
  | "replied"
  | "meeting"
  | "customer"
  | "lost";

export const PIPELINE_STAGES: PipelineStage[] = [
  "new",
  "approved",
  "contacted",
  "replied",
  "meeting",
  "customer",
  "lost",
];

export const PIPELINE_LABELS: Record<PipelineStage, string> = {
  new: "新規",
  approved: "承認済",
  contacted: "連絡済",
  replied: "返信あり",
  meeting: "商談",
  customer: "成約",
  lost: "失注",
};

export const PIPELINE_COLORS: Record<PipelineStage, string> = {
  new: "bg-gray-100 text-gray-700",
  approved: "bg-blue-100 text-blue-700",
  contacted: "bg-yellow-100 text-yellow-700",
  replied: "bg-green-100 text-green-700",
  meeting: "bg-purple-100 text-purple-700",
  customer: "bg-emerald-100 text-emerald-700",
  lost: "bg-red-100 text-red-700",
};

export type LeadStatus = "new" | "active" | "archived" | "unsubscribed";

export type MessageStatus = "draft" | "pending_review" | "approved" | "rejected" | "sent";

export interface OutreachLead {
  id: string;
  tenant_id: string;
  industry: string;
  store_name: string;
  website_url: string | null;
  instagram_url: string | null;
  line_url: string | null;
  region: string | null;
  notes: string | null;
  status: LeadStatus;
  score: number | null;
  pain_points: string | null;
  best_offer: string | null;
  recommended_channel: string | null;
  next_action: string | null;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
  line_user_id: string | null;
  rating: number | null;
  review_count: number;
  has_booking_link: number;
  contact_email: string | null;
  category: string | null;
  area: string | null;
  features_json: string | null;
  pipeline_stage: PipelineStage;
  last_replied_at?: string | null;
  last_contacted_at?: string | null;
  domain?: string | null;
  normalized_domain?: string | null;
  /** Phase 4.5 */
  send_attempt_count?: number;
  last_send_error?: string | null;
  /** Phase 5 */
  import_source?: string | null;
  import_batch_id?: string | null;
  /** Phase 6 */
  source_type?: string | null;
  source_run_id?: string | null;
  source_ref?: string | null;
  imported_at?: string | null;
}

export interface OutreachMessage {
  id: string;
  lead_id: string;
  tenant_id: string | null;
  kind: string;
  subject: string | null;
  body: string;
  status: MessageStatus;
  tone: string | null;
  pain_points_json: string | null;
  reasoning_summary: string | null;
  created_at: string;
  // Phase 5
  campaign_id?: string | null;
  variant_key?: string | null;
  // Joined from lead
  store_name?: string;
  area?: string;
  category?: string;
  pipeline_stage?: PipelineStage;
}

export interface OutreachDeliveryEvent {
  id: string;
  tenant_id: string;
  lead_id: string;
  message_id: string | null;
  channel: string;
  event_type: string;
  status: string;
  metadata_json: string | null;
  created_at: string;
}

export interface ScoreResult {
  score: number;
  components: Record<string, number>;
}

export interface GeneratedMessageResult {
  messageId: string;
  generated: {
    subject: string;
    opener: string;
    body: string;
    cta: string;
    tone: string;
    painPoints: string[];
    reasoningSummary: string;
  };
}

// ── Phase 3: Settings & Stats types ──────────────────────────────────────

export interface OutreachSettings {
  sendMode: "safe" | "real";
  dailyCap: number;
  hourlyCap: number;
  requireApproval: boolean;
  /** Phase 4 */
  followupDay3Enabled: boolean;
  followupDay7Enabled: boolean;
  contactCooldownDays: number;
  /** Phase 6 */
  autoAnalyzeOnImport: boolean;
  autoScoreOnImport: boolean;
}

export interface SendStats {
  dailyUsed: number;
  dailyCap: number;
  hourlyUsed: number;
  hourlyCap: number;
  sendMode: "safe" | "real";
}

export interface UnsubscribedLead {
  id: string;
  store_name: string;
  contact_email: string | null;
  area: string | null;
  category: string | null;
}

export interface RecordReplyResult {
  leadId: string;
  eventId: string;
  autoTransitioned: boolean;
  classification?: ReplyClassification;
  classifyConfidence?: number;
  classifyReason?: string;
  highConfidence?: boolean;
  newStage?: string;
}

// ── Phase 4 types ──────────────────────────────────────────────────────────

export type ReplyClassification = "interested" | "not_interested" | "later" | "spam" | "other";

export const REPLY_CLASSIFICATION_LABELS: Record<ReplyClassification, string> = {
  interested: "興味あり",
  not_interested: "興味なし",
  later: "検討中",
  spam: "スパム",
  other: "その他",
};

export const REPLY_CLASSIFICATION_COLORS: Record<ReplyClassification, string> = {
  interested: "bg-green-100 text-green-700",
  not_interested: "bg-red-100 text-red-700",
  later: "bg-yellow-100 text-yellow-700",
  spam: "bg-gray-100 text-gray-500",
  other: "bg-gray-100 text-gray-600",
};

export type FollowupStep = "first_followup" | "second_followup";
export type FollowupStatus = "scheduled" | "sent" | "cancelled" | "skipped";

export interface OutreachFollowup {
  id: string;
  tenant_id: string;
  lead_id: string;
  step: FollowupStep;
  scheduled_at: string;
  sent_at: string | null;
  status: FollowupStatus;
  message_id: string | null;
  created_at: string;
  store_name?: string;
  /** Phase 4.5 */
  processing_at?: string | null;
  attempt_count?: number;
  provider_message_id?: string | null;
}

export interface LearningInsight {
  key: string;
  label: string;
  totalSent: number;
  totalReplied: number;
  replyRate: number;
  sampleSize?: number;
}

export interface LearningAnalytics {
  replyRateByScore: Array<{ scoreBucket: string; sent: number; replied: number; rate: number }>;
  replyRateByHypothesis: LearningInsight[];
  replyRateByTone: LearningInsight[];
  topHypothesis: LearningInsight | null;
  topTone: LearningInsight | null;
}

export interface OutreachAnalytics {
  totalLeads: number;
  byPipelineStage: Record<string, number>;
  totalMessagesSent: number;
  totalApproved: number;
  totalReplied: number;
  totalMeetings: number;
  avgScore: number | null;
}

export interface LeadDetail {
  lead: OutreachLead;
  messages: OutreachMessage[];
  deliveryEvents: OutreachDeliveryEvent[];
  features: OutreachLeadFeatureRow | null;
  hypotheses: OutreachPainHypothesisRow[];
}

// ── Phase 2: Analyzer types ────────────────────────────────────────────────

export interface OutreachLeadFeatureRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  has_website: number;
  has_instagram: number;
  has_line_link: number;
  has_booking_link: number;
  contact_email_found: number;
  phone_found: number;
  menu_count_guess: number;
  price_info_found: number;
  booking_cta_count: number;
  booking_cta_depth_guess: number;
  title_found: number;
  meta_description_found: number;
  raw_signals_json: string | null;
  analyzed_at: string;
  created_at: string;
  updated_at: string;
}

export interface OutreachPainHypothesisRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  code: string;
  label: string;
  severity: "low" | "medium" | "high";
  reason: string;
  created_at: string;
}

export interface AnalyzeResult {
  features: OutreachLeadFeatureRow;
  hypotheses: OutreachPainHypothesisRow[];
  score: ScoreResult;
}

export const SEVERITY_LABELS: Record<string, string> = {
  high: "重大",
  medium: "中程度",
  low: "軽微",
};

export const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

export const FEATURE_LABELS: Record<string, string> = {
  has_website: "ウェブサイト",
  has_instagram: "Instagram",
  has_line_link: "LINE",
  has_booking_link: "予約リンク",
  contact_email_found: "メール",
  phone_found: "電話番号",
  menu_count_guess: "メニュー数",
  price_info_found: "料金情報",
  booking_cta_count: "予約CTA数",
  booking_cta_depth_guess: "CTA深さ",
  title_found: "ページタイトル",
  meta_description_found: "メタ説明",
};

// ── Phase 5 types ─────────────────────────────────────────────────────────

export type CampaignStatus = "draft" | "ready" | "running" | "paused" | "archived";

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "下書き",
  ready: "準備完了",
  running: "実行中",
  paused: "一時停止",
  archived: "アーカイブ",
};

export const CAMPAIGN_STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  ready: "bg-blue-100 text-blue-700",
  running: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  archived: "bg-gray-100 text-gray-400",
};

export interface OutreachCampaign {
  id: string;
  tenant_id: string;
  name: string;
  niche: string | null;
  area: string | null;
  min_score: number | null;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
}

export interface OutreachCampaignVariant {
  id: string;
  tenant_id: string;
  campaign_id: string;
  variant_key: string;
  subject_template: string | null;
  opener_template: string | null;
  cta_template: string | null;
  tone: string;
  is_active: number;
  created_at: string;
}

export interface ImportPreviewRow {
  rowIndex: number;
  store_name: string;
  category?: string;
  area?: string;
  website_url?: string;
  email?: string;
  phone?: string;
  rating?: number;
  review_count?: number;
  status: "valid" | "invalid" | "duplicate" | "merge";
  errors: string[];
  duplicateLeadId?: string;
  duplicateStoreName?: string;
}

export interface ImportPreviewSummary {
  total: number;
  valid: number;
  duplicate: number;
  invalid: number;
}

export interface ImportResult {
  created: number;
  skipped: number;
  merged: number;
  invalid: number;
  batchId: string;
}

export interface CampaignPreview {
  campaign: OutreachCampaign;
  matchingLeads: number;
  unsubscribedExcluded: number;
  sampleLeads: Array<{
    id: string;
    store_name: string;
    area: string | null;
    category: string | null;
    score: number | null;
    pipeline_stage: string;
  }>;
  variants: OutreachCampaignVariant[];
}

export interface VariantPerformance {
  campaignId: string;
  campaignName: string;
  variantKey: string;
  totalSent: number;
  replied: number;
  meetings: number;
  replyRate: number;
  meetingRate: number;
  sampleSize: number;
}

export interface CampaignAnalytics {
  variantPerformance: VariantPerformance[];
  importedLeadsCount: number;
  importBatchCount: number;
}

// ── Phase 6 types ─────────────────────────────────────────────────────────

export type SourceType = "csv" | "manual" | "map" | "directory";
export type SourceRunStatus = "draft" | "running" | "completed" | "failed";
export type CandidateImportStatus = "new" | "duplicate" | "imported" | "skipped" | "invalid";

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  csv: "CSV",
  manual: "手動",
  map: "マップ",
  directory: "ディレクトリ",
};

export const CANDIDATE_STATUS_LABELS: Record<CandidateImportStatus, string> = {
  new: "新規",
  duplicate: "重複",
  imported: "取込済",
  skipped: "スキップ",
  invalid: "無効",
};

export const CANDIDATE_STATUS_COLORS: Record<CandidateImportStatus, string> = {
  new: "bg-green-50 text-green-700",
  duplicate: "bg-yellow-50 text-yellow-700",
  imported: "bg-blue-50 text-blue-700",
  skipped: "bg-gray-50 text-gray-500",
  invalid: "bg-red-50 text-red-700",
};

export interface OutreachSourceRun {
  id: string;
  tenant_id: string;
  source_type: SourceType;
  query: string | null;
  location: string | null;
  niche: string | null;
  status: SourceRunStatus;
  error_message: string | null;
  result_count: number;
  imported_count: number;
  created_at: string;
  updated_at: string;
}

export type AcceptanceStatus = "pending" | "accepted" | "rejected";

export interface OutreachSourceCandidate {
  id: string;
  tenant_id: string;
  run_id: string;
  source_type: string;
  external_id: string | null;
  store_name: string;
  category: string | null;
  area: string | null;
  address: string | null;
  website_url: string | null;
  phone: string | null;
  email: string | null;
  rating: number | null;
  review_count: number;
  source_url: string | null;
  normalized_domain: string | null;
  import_status: CandidateImportStatus;
  dedup_reason: string | null;
  dedup_lead_id: string | null;
  raw_payload_json: string | null;
  created_at: string;
  updated_at: string;
  // Phase 8.1: Quality Layer
  quality_score?: number | null;
  acceptance_status?: AcceptanceStatus;
  rejection_reason?: string | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
  // Phase 8.2: Source key
  source_key?: string | null;
  // Phase 8.3: Quality learning + automation
  quality_score_v2?: number | null;
  quality_score_base?: number | null;
  quality_score_lift?: number | null;
  automation_status?: string;
  analyze_status?: string;
  score_status?: string;
  last_automation_error?: string | null;
  automation_updated_at?: string | null;
}

export interface SourceSearchResult {
  runId: string;
  candidates: OutreachSourceCandidate[];
  summary: {
    total: number;
    new: number;
    duplicate: number;
    invalid: number;
  };
}

export interface SourceImportResult {
  created: number;
  skipped: number;
  invalid: number;
  autoErrors: Array<{ leadId: string; error: string }>;
}

export interface SourceAnalytics {
  leadsBySourceType: Array<{ source_type: string; count: number }>;
  runsBySource: Array<{ source_type: string; runs: number; total_results: number; total_imported: number }>;
  duplicateRateBySource: Array<{ source_type: string; total: number; duplicates: number; rate: number }>;
  avgScoreBySource: Array<{ source_type: string; avg_score: number; sample_size: number }>;
  meetingRateBySource: Array<{ source_type: string; total: number; meetings: number; rate: number; sample_size: number }>;
}

// ── Phase 6: Winning Pattern Learning ────────────────────────────────────

export type LearningPatternType = "source" | "hypothesis" | "tone" | "cta" | "variant";

export interface OutreachLearningPattern {
  id: string;
  tenant_id: string;
  pattern_type: LearningPatternType;
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

export interface WinningPatternsData {
  topTone: { key: string; replyRate: number; sampleSize: number } | null;
  topHypothesis: { key: string; label: string; replyRate: number; sampleSize: number } | null;
  topCta: { key: string; replyRate: number; sampleSize: number } | null;
  topSource: { key: string; meetingRate: number; sampleSize: number } | null;
  patterns: OutreachLearningPattern[];
}

export const PATTERN_TYPE_LABELS: Record<LearningPatternType, string> = {
  source: "ソース",
  hypothesis: "課題仮説",
  tone: "トーン",
  cta: "CTA",
  variant: "バリアント",
};

// ── Phase 7: Campaign Auto Optimization ──────────────────────────────────

export interface OutreachNicheTemplate {
  id: string;
  tenant_id: string;
  niche: string;
  name: string;
  tone: string;
  subject_template: string | null;
  opener_template: string | null;
  body_template: string | null;
  cta_template: string | null;
  hypothesis_codes: string | null;
  win_score: number;
  sample_size: number;
  is_auto_generated: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignDraftInput {
  niche: string;
  area?: string;
  min_score?: number;
  tone?: "formal" | "friendly" | "casual";
  auto_variants?: boolean;
}

export interface CampaignDraftResult {
  campaign: OutreachCampaign;
  variants: OutreachCampaignVariant[];
  matchingLeads: number;
  learningContext: {
    topTone: string | null;
    topHypothesis: string | null;
    nicheTemplate: string | null;
  };
}

export interface CampaignInsight {
  campaign_id: string;
  campaign_name: string;
  niche: string | null;
  area: string | null;
  status: string;
  total_leads: number;
  total_sent: number;
  total_replied: number;
  total_meetings: number;
  reply_rate: number;
  meeting_rate: number;
  created_at: string;
}

export interface TemplateStats {
  niche: string;
  count: number;
  best_score: number;
  total_samples: number;
}

export interface LearningRefreshLog {
  id: string;
  tenant_id: string;
  patterns_updated: number;
  patterns_deleted: number;
  templates_generated: number;
  triggered_by: string;
  created_at: string;
}

export interface CampaignInsightsData {
  campaigns: CampaignInsight[];
  refreshHistory: LearningRefreshLog[];
  templateStats: TemplateStats[];
}

// ── Phase 8.1: Source Quality Layer ──────────────────────────────────────

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

export interface SourceQualitySummary {
  totalSources: number;
  totalImported: number;
  totalReplies: number;
  totalMeetings: number;
  totalWon: number;
  avgQuality: number;
}

export interface TopSourceRow extends SourceQualityRow {
  composite_score: number;
}

export const ACCEPTANCE_STATUS_LABELS: Record<AcceptanceStatus, string> = {
  pending: "保留",
  accepted: "承認",
  rejected: "却下",
};

export const ACCEPTANCE_STATUS_COLORS: Record<AcceptanceStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export function qualityLabel(score: number | null | undefined): { text: string; color: string } {
  if (score == null) return { text: "—", color: "text-gray-400" };
  if (score >= 0.8) return { text: "High", color: "text-green-600" };
  if (score >= 0.4) return { text: "Medium", color: "text-amber-600" };
  return { text: "Low", color: "text-red-500" };
}

// ── Phase 8.2: Source Quality Daily + Trends ──────────────────────────

export interface BatchActionResult {
  updated: number;
  skipped: number;
}

export interface AcceptedImportResult {
  created: number;
  skipped: number;
  invalid: number;
  accepted: number;
  autoErrors: Array<{ leadId: string; error: string }>;
}

export interface AcceptedCountResult {
  accepted: number;
  pending: number;
  rejected: number;
  importable: number;
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

// ── Phase 8.3: Candidate Quality Learning ──────────────────────────────

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

export interface QualityLearningRefreshResult {
  updated: number;
  deleted: number;
}

export interface QualityV2BackfillResult {
  updated: number;
  skipped: number;
}

// ── Phase 10: Auto Prospect Batch ──────────────────────────────────────

export type BatchJobMode = "review_only" | "approved_send";
export type BatchJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export const BATCH_STATUS_LABELS: Record<BatchJobStatus, string> = {
  pending: "待機中",
  running: "実行中",
  completed: "完了",
  failed: "失敗",
  cancelled: "キャンセル",
};

export const BATCH_STATUS_COLORS: Record<BatchJobStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-400",
};

export const BATCH_MODE_LABELS: Record<BatchJobMode, string> = {
  review_only: "レビューのみ",
  approved_send: "承認済み送信",
};

export interface OutreachBatchJob {
  id: string;
  tenant_id: string;
  niche: string;
  areas_json: string;
  randomize_areas: number;
  target_count: number;
  max_per_area: number;
  quality_threshold: number;
  mode: BatchJobMode;
  status: BatchJobStatus;
  source_type: string;
  created_count: number;
  imported_count: number;
  draft_count: number;
  queued_send_count: number;
  error_count: number;
  result_summary_json: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutreachBatchJobItem {
  id: string;
  tenant_id: string;
  batch_job_id: string;
  source_candidate_id: string | null;
  lead_id: string | null;
  review_item_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface BatchJobCreateInput {
  niche: string;
  areas: string[];
  randomize_areas?: boolean;
  target_count?: number;
  max_per_area?: number;
  quality_threshold?: number;
  mode?: BatchJobMode;
  source_type?: string;
}

export interface BatchJobResult {
  job: OutreachBatchJob;
  items: OutreachBatchJobItem[];
  summary: {
    searched: number;
    accepted: number;
    imported: number;
    drafted: number;
    errors: number;
  };
}

export const AUTOMATION_STATUS_LABELS: Record<string, string> = {
  none: "—",
  processing: "処理中",
  done: "完了",
  error: "エラー",
};

export const AUTOMATION_STATUS_COLORS: Record<string, string> = {
  none: "text-gray-400",
  processing: "text-blue-500",
  done: "text-green-600",
  error: "text-red-500",
};
