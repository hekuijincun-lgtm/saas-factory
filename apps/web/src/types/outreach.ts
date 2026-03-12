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
