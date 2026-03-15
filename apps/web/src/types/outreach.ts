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
  /** UX: default LP URL for {{lp_url}} token */
  defaultLpUrl: string;
  /** Phase 18: Guard Rails */
  autoCampaignPaused?: boolean;
  pauseReason?: string;
  autoLeadSupplyEnabled?: boolean;
  autoCloseEnabled?: boolean;
  monitoringAlertsEnabled?: boolean;
  autoPauseEnabled?: boolean;
  autoPauseFailureThreshold?: number;
  autoPauseBounceThreshold?: number;
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
  landing_page_url: string | null;
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
  map: "Google マップ",
  directory: "デモデータ",
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

// ── Phase 11: Auto Outreach Scheduler ──────────────────────────────────

export type ScheduleFrequency = "daily" | "weekdays" | "weekly";
export type ScheduleMode = "review_only" | "approved_send_existing_only" | "hybrid" | "auto_send";
export type ScheduleAreaMode = "manual" | "auto" | "rotation";
export type ScheduleRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export const SCHEDULE_FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  daily: "毎日",
  weekdays: "平日のみ",
  weekly: "毎週月曜",
};

export const SCHEDULE_MODE_LABELS: Record<ScheduleMode, string> = {
  review_only: "レビューのみ",
  approved_send_existing_only: "承認済み送信",
  hybrid: "ハイブリッド",
  auto_send: "自動送信",
};

export const SCHEDULE_AREA_MODE_LABELS: Record<ScheduleAreaMode, string> = {
  manual: "手動固定",
  auto: "AI 自動選定",
  rotation: "ローテーション",
};

export const SCHEDULE_RUN_STATUS_LABELS: Record<ScheduleRunStatus, string> = {
  pending: "待機中",
  running: "実行中",
  completed: "完了",
  failed: "失敗",
  cancelled: "キャンセル",
};

export const SCHEDULE_RUN_STATUS_COLORS: Record<ScheduleRunStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-400",
};

export interface OutreachSchedule {
  id: string;
  tenant_id: string;
  name: string;
  niche: string;
  areas_json: string;
  source_type: string;
  enabled: number;
  frequency: ScheduleFrequency;
  run_hour: number;
  run_minute: number;
  max_target_count: number;
  max_per_area: number;
  quality_threshold: number;
  auto_accept_enabled: number;
  auto_import_enabled: number;
  auto_analyze_enabled: number;
  auto_score_enabled: number;
  auto_draft_enabled: number;
  mode: ScheduleMode;
  area_mode: ScheduleAreaMode;
  daily_send_limit: number;
  min_score_for_auto_send: number;
  /** Phase 19: area rotation state */
  rotation_index: number;
  rotation_cursor_updated_at: string | null;
  last_executed_area: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutreachScheduleRun {
  id: string;
  tenant_id: string;
  schedule_id: string;
  status: ScheduleRunStatus;
  searched_count: number;
  accepted_count: number;
  imported_count: number;
  analyzed_count: number;
  scored_count: number;
  drafted_count: number;
  queued_send_count: number;
  error_count: number;
  sent_count: number;
  skipped_count: number;
  review_count: number;
  chosen_area: string | null;
  area_mode: string | null;
  send_mode: string | null;
  selection_reason: string | null;
  summary_json: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface ScheduleCreateInput {
  name?: string;
  niche: string;
  areas: string[];
  source_type?: string;
  frequency?: ScheduleFrequency;
  run_hour?: number;
  run_minute?: number;
  max_target_count?: number;
  max_per_area?: number;
  quality_threshold?: number;
  auto_accept_enabled?: boolean;
  auto_import_enabled?: boolean;
  auto_analyze_enabled?: boolean;
  auto_score_enabled?: boolean;
  auto_draft_enabled?: boolean;
  mode?: ScheduleMode;
  area_mode?: ScheduleAreaMode;
  daily_send_limit?: number;
  min_score_for_auto_send?: number;
}

// ── Phase 12: Auto Sales Copilot types ───────────────────────────────

export type RecommendationType =
  | "run_schedule_now"
  | "pause_schedule"
  | "raise_quality_threshold"
  | "lower_quality_threshold"
  | "expand_area"
  | "stop_area"
  | "try_new_niche"
  | "prioritize_review_queue"
  | "retry_high_quality_source"
  | "recommend_campaign";

export type RecommendationPriority = "high" | "medium" | "low";
export type RecommendationStatus = "open" | "accepted" | "dismissed" | "completed";

export const RECOMMENDATION_PRIORITY_LABELS: Record<RecommendationPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export const RECOMMENDATION_PRIORITY_COLORS: Record<RecommendationPriority, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

export const RECOMMENDATION_TYPE_LABELS: Record<RecommendationType, string> = {
  run_schedule_now: "即時実行",
  pause_schedule: "一時停止",
  raise_quality_threshold: "品質閾値↑",
  lower_quality_threshold: "品質閾値↓",
  expand_area: "エリア拡大",
  stop_area: "エリア停止",
  try_new_niche: "新ニッチ",
  prioritize_review_queue: "レビュー優先",
  retry_high_quality_source: "高品質再試行",
  recommend_campaign: "キャンペーン推奨",
};

export type ActionExecutionStatus = "pending" | "eligible" | "executed" | "failed" | "skipped" | "blocked";
export type ExecutionMode = "manual_only" | "auto_safe" | "auto_if_enabled";

export const EXECUTION_STATUS_LABELS: Record<ActionExecutionStatus, string> = {
  pending: "待機中",
  eligible: "実行可能",
  executed: "実行済",
  failed: "失敗",
  skipped: "スキップ",
  blocked: "ブロック",
};

export const EXECUTION_STATUS_COLORS: Record<ActionExecutionStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  eligible: "bg-blue-100 text-blue-700",
  executed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-yellow-100 text-yellow-700",
  blocked: "bg-orange-100 text-orange-700",
};

export interface CopilotRecommendation {
  id: string;
  tenant_id: string;
  recommendation_type: RecommendationType;
  title: string;
  summary: string;
  priority: RecommendationPriority;
  status: RecommendationStatus;
  payload_json: string | null;
  action_type: string | null;
  action_payload_json: string | null;
  auto_executable: number;
  execution_status: ActionExecutionStatus;
  execution_mode: ExecutionMode;
  executed_at: string | null;
  execution_result_json: string | null;
  execution_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionLog {
  id: string;
  tenant_id: string;
  recommendation_id: string | null;
  action_type: string;
  action_payload_json: string | null;
  execution_mode: string;
  execution_status: string;
  executed_by: string;
  result_json: string | null;
  error_message: string | null;
  created_at: string;
}

export interface AutoActionSettings {
  auto_action_enabled: boolean;
  auto_execute_safe_recommendations: boolean;
  auto_execute_schedule_runs: boolean;
  auto_execute_threshold_adjustments: boolean;
  auto_execute_send_existing_approved_only: boolean;
  auto_action_max_executions_per_day: number;
}

export interface ScheduleHealthScore {
  schedule_id: string;
  schedule_name: string;
  niche: string;
  health_score: number;
  metrics: {
    run_count_7d: number;
    candidate_count_7d: number;
    imported_count_7d: number;
    drafted_count_7d: number;
    error_rate_7d: number;
    stale_days: number;
    reply_rate_30d: number;
    meeting_rate_30d: number;
    won_rate_30d: number;
    avg_quality_score_30d: number;
  };
}

export interface CopilotInsight {
  type: string;
  title: string;
  summary: string;
  metric_value: number | null;
  comparison: string | null;
}

export interface CopilotOverview {
  recommendations: CopilotRecommendation[];
  schedule_health: ScheduleHealthScore[];
  insights: CopilotInsight[];
  high_priority_review_count: number;
}

export interface PrioritizedReviewItem {
  id: string;
  lead_id: string;
  tenant_id: string;
  subject: string | null;
  body: string;
  status: string;
  tone: string | null;
  review_priority_score: number | null;
  store_name: string;
  category: string | null;
  area: string | null;
  pipeline_stage: string;
  lead_score: number | null;
  rating: number | null;
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

// ── Phase 14: Auto Reply AI types ──────────────────────────────────────

export type ReplyIntent =
  | "question"
  | "interested"
  | "not_interested"
  | "later"
  | "pricing"
  | "demo"
  | "unsubscribe"
  | "unknown";

export type ReplySource = "email" | "instagram" | "line" | "webform";

export type ReplyStatus = "open" | "in_progress" | "resolved" | "dismissed";

export const REPLY_STATUS_LABELS: Record<ReplyStatus, string> = {
  open: "未対応",
  in_progress: "対応中",
  resolved: "対応済み",
  dismissed: "却下",
};

export const REPLY_STATUS_COLORS: Record<ReplyStatus, string> = {
  open: "bg-red-100 text-red-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
  dismissed: "bg-gray-100 text-gray-600",
};

export interface OutreachReply {
  id: string;
  tenant_id: string;
  lead_id: string;
  campaign_id: string | null;
  message_id: string | null;
  reply_text: string;
  reply_source: ReplySource;
  from_email: string | null;
  subject: string | null;
  status: ReplyStatus;
  sentiment: string | null;
  intent: ReplyIntent | null;
  intent_confidence: number | null;
  ai_handled: number;
  ai_response: string | null;
  ai_response_sent: number;
  created_at: string;
  // Phase 15: Close evaluation fields
  close_intent?: CloseIntent | null;
  close_confidence?: number | null;
  recommended_next_step?: RecommendedNextStep | null;
  handoff_required?: number;
  deal_temperature?: DealTemperature | null;
  // Joined
  store_name?: string;
  contact_email?: string | null;
  area?: string | null;
  pipeline_stage?: PipelineStage;
}

export interface OutreachReplyLog {
  id: string;
  tenant_id: string;
  lead_id: string;
  reply_id: string | null;
  ai_decision: string;
  ai_response: string | null;
  execution_status: "pending" | "sent" | "failed" | "skipped";
  error_message: string | null;
  created_at: string;
}

export interface AutoReplySettings {
  autoReplyEnabled: boolean;
  maxRepliesPerLead: number;
  cooldownMinutes: number;
  confidenceThreshold: number;
}

export const DEFAULT_AUTO_REPLY_SETTINGS: AutoReplySettings = {
  autoReplyEnabled: false,
  maxRepliesPerLead: 3,
  cooldownMinutes: 60,
  confidenceThreshold: 0.7,
};

export const REPLY_INTENT_LABELS: Record<ReplyIntent, string> = {
  question: "質問",
  interested: "興味あり",
  not_interested: "興味なし",
  later: "後日",
  pricing: "料金確認",
  demo: "デモ希望",
  unsubscribe: "配信停止",
  unknown: "不明",
};

export const REPLY_INTENT_COLORS: Record<ReplyIntent, string> = {
  question: "bg-blue-100 text-blue-700",
  interested: "bg-green-100 text-green-700",
  not_interested: "bg-red-100 text-red-700",
  later: "bg-yellow-100 text-yellow-700",
  pricing: "bg-purple-100 text-purple-700",
  demo: "bg-emerald-100 text-emerald-700",
  unsubscribe: "bg-orange-100 text-orange-700",
  unknown: "bg-gray-100 text-gray-600",
};

export interface AutoReplyStats {
  todayReplies: number;
  aiReplied: number;
  aiSuccessRate: number;
  needsHumanCount: number;
}

// ── Phase 15: Auto Close AI ─────────────────────────────────────────────

export type CloseIntent =
  | "pricing_request"
  | "demo_request"
  | "compare_request"
  | "implementation_question"
  | "schedule_request"
  | "signup_request"
  | "warm_lead"
  | "cold_lead"
  | "not_close_relevant";

export type DealTemperature = "hot" | "warm" | "cold";

export type RecommendedNextStep =
  | "send_pricing"
  | "send_demo_link"
  | "send_booking_link"
  | "ask_qualification_question"
  | "human_followup"
  | "mark_lost"
  | "none";

export type CloseStage =
  | "interested"
  | "meeting_requested"
  | "pricing_sent"
  | "demo_sent"
  | "qualified"
  | "negotiation"
  | "won"
  | "lost";

export interface OutreachCloseLog {
  id: string;
  tenant_id: string;
  lead_id: string;
  reply_id: string | null;
  close_intent: string;
  close_confidence: number;
  deal_temperature: string;
  suggested_action: string | null;
  ai_response: string | null;
  execution_status: string;
  handoff_required: number;
  created_at: string;
}

export interface CloseSettings {
  auto_close_enabled: boolean;
  auto_send_pricing_enabled: boolean;
  auto_send_demo_link_enabled: boolean;
  auto_send_booking_link_enabled: boolean;
  auto_escalate_complex_replies: boolean;
  close_confidence_threshold: number;
  demo_booking_url: string;
  sales_contact_url: string;
  pricing_page_url: string;
  calendly_url: string;
  human_handoff_email: string;
}

export const DEFAULT_CLOSE_SETTINGS: CloseSettings = {
  auto_close_enabled: false,
  auto_send_pricing_enabled: false,
  auto_send_demo_link_enabled: false,
  auto_send_booking_link_enabled: false,
  auto_escalate_complex_replies: true,
  close_confidence_threshold: 0.75,
  demo_booking_url: "",
  sales_contact_url: "",
  pricing_page_url: "",
  calendly_url: "",
  human_handoff_email: "",
};

export interface CloseInsights {
  pricingRequestsToday: number;
  demoRequestsToday: number;
  meetingRequestedCount: number;
  hotLeadsCount: number;
  handoffRequiredCount: number;
  closeRateBySource: Array<{ source: string; closeRate: number; sampleSize: number }>;
  closeRateByNiche: Array<{ niche: string; closeRate: number; sampleSize: number }>;
}

export interface HotLead {
  id: string;
  store_name: string;
  domain: string;
  close_intent: string;
  deal_temperature: string;
  close_stage: string | null;
  handoff_required: number;
  recommended_next_step: string | null;
  close_evaluated_at: string | null;
  updated_at: string;
}

export interface MeetingSuggestion {
  suggested_action: string;
  suggested_message: string;
  escalation_needed: boolean;
  qualification_question?: string;
}

export const CLOSE_INTENT_LABELS: Record<CloseIntent, string> = {
  pricing_request: "料金確認",
  demo_request: "デモ希望",
  compare_request: "比較検討",
  implementation_question: "導入相談",
  schedule_request: "日程調整",
  signup_request: "申込希望",
  warm_lead: "温かいリード",
  cold_lead: "冷たいリード",
  not_close_relevant: "該当なし",
};

export const CLOSE_INTENT_COLORS: Record<CloseIntent, string> = {
  pricing_request: "bg-purple-100 text-purple-700",
  demo_request: "bg-emerald-100 text-emerald-700",
  compare_request: "bg-blue-100 text-blue-700",
  implementation_question: "bg-amber-100 text-amber-700",
  schedule_request: "bg-teal-100 text-teal-700",
  signup_request: "bg-green-100 text-green-700",
  warm_lead: "bg-orange-100 text-orange-700",
  cold_lead: "bg-gray-100 text-gray-600",
  not_close_relevant: "bg-gray-50 text-gray-400",
};

export const DEAL_TEMPERATURE_LABELS: Record<DealTemperature, string> = {
  hot: "ホット",
  warm: "ウォーム",
  cold: "コールド",
};

export const DEAL_TEMPERATURE_COLORS: Record<DealTemperature, string> = {
  hot: "bg-red-100 text-red-700",
  warm: "bg-orange-100 text-orange-700",
  cold: "bg-blue-100 text-blue-700",
};

export const CLOSE_STAGE_LABELS: Record<CloseStage, string> = {
  interested: "興味あり",
  meeting_requested: "商談希望",
  pricing_sent: "料金送付済",
  demo_sent: "デモ案内済",
  qualified: "適格",
  negotiation: "交渉中",
  won: "成約",
  lost: "失注",
};

export const CLOSE_STAGE_COLORS: Record<CloseStage, string> = {
  interested: "bg-blue-100 text-blue-700",
  meeting_requested: "bg-teal-100 text-teal-700",
  pricing_sent: "bg-purple-100 text-purple-700",
  demo_sent: "bg-emerald-100 text-emerald-700",
  qualified: "bg-green-100 text-green-700",
  negotiation: "bg-amber-100 text-amber-700",
  won: "bg-green-200 text-green-800",
  lost: "bg-red-100 text-red-700",
};

// ── Phase 18: Monitoring & Guard Rails ──────────────────────────────────

export interface HealthMetrics {
  last_auto_campaign_run_at: string | null;
  last_followup_run_at: string | null;
  last_close_engine_run_at: string | null;
  sent_last_24h: number;
  failed_last_24h: number;
  bounce_like_failures_last_24h: number;
  reply_count_last_24h: number;
  unsubscribe_count_last_24h: number;
  auto_campaign_enabled: boolean;
  auto_campaign_paused: boolean;
  pending_followups: number;
  stale_followups: number;
}

export interface UnhealthyFlag {
  code: string;
  severity: "warning" | "critical";
  message: string;
}

export interface HealthResult {
  status: "healthy" | "degraded" | "unhealthy";
  tenantId: string;
  timestamp: string;
  metrics: HealthMetrics;
  flags: UnhealthyFlag[];
}

export interface MonitoringTimeSeries {
  period: string;
  sent: number;
  failed: number;
  replies: number;
  unsubscribes: number;
  meetings: number;
  closes: number;
}

export interface OutreachHandoff {
  id: string;
  tenant_id: string;
  lead_id: string;
  reply_id: string | null;
  reason: string;
  priority: "high" | "normal" | "low";
  status: "open" | "assigned" | "resolved" | "dismissed";
  assigned_to: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  store_name?: string;
  contact_email?: string | null;
  reply_text?: string;
}

export const HANDOFF_PRIORITY_LABELS: Record<string, string> = {
  high: "高",
  normal: "通常",
  low: "低",
};

export const HANDOFF_PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  normal: "bg-blue-100 text-blue-700",
  low: "bg-gray-100 text-gray-600",
};

export const HANDOFF_STATUS_LABELS: Record<string, string> = {
  open: "未対応",
  assigned: "対応中",
  resolved: "解決済",
  dismissed: "却下",
};

export const HANDOFF_STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-700",
  assigned: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  dismissed: "bg-gray-100 text-gray-400",
};

export interface OutreachCloseVariant {
  id: string;
  tenant_id: string;
  close_type: string;
  variant_key: string;
  subject_template: string | null;
  body_template: string;
  is_active: number;
  sent_count: number;
  meeting_count: number;
  close_count: number;
  created_at: string;
  updated_at: string;
}

export interface CloseAnalytics {
  total_close_evaluations: number;
  by_intent: Record<string, number>;
  by_temperature: Record<string, number>;
  handoffs_created: number;
  variant_performance: Array<{
    variant: string;
    sent: number;
    meetings: number;
    closes: number;
    meeting_rate: number;
  }>;
  booking_funnel: {
    links_sent: number;
    clicked: number;
    booked: number;
  };
}
