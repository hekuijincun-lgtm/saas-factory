// Outreach OS — shared types (Workers side)
// ============================================================

/** Pipeline stages for CRM view */
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

/** Lead status (legacy + pipeline overlap) */
export type LeadStatus = "new" | "active" | "archived" | "unsubscribed";

/** Message draft status */
export type MessageStatus = "draft" | "pending_review" | "approved" | "rejected" | "sent";

/** Delivery event types */
export type DeliveryEventType = "queued" | "sent" | "delivered" | "bounced" | "failed" | "opened" | "clicked";

// ── DB row shapes ──────────────────────────────────────────────────────────

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
  // Phase 1 additions (migration 0017)
  rating: number | null;
  review_count: number;
  has_booking_link: number;
  contact_email: string | null;
  category: string | null;
  area: string | null;
  features_json: string | null;
  pipeline_stage: PipelineStage;
  // Phase 3
  last_replied_at: string | null;
  // Phase 4
  last_contacted_at: string | null;
  domain: string | null;
  normalized_domain: string | null;
  // Phase 4.5
  send_attempt_count: number;
  last_send_error: string | null;
  // Phase 5
  import_source: string | null;
  import_batch_id: string | null;
  // Phase 6
  source_type: string | null;
  source_run_id: string | null;
  source_ref: string | null;
  imported_at: string | null;
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
}

export interface OutreachDeliveryEvent {
  id: string;
  tenant_id: string;
  lead_id: string;
  message_id: string | null;
  channel: string;
  event_type: DeliveryEventType;
  status: string;
  metadata_json: string | null;
  created_at: string;
}

// ── API request/response shapes ────────────────────────────────────────────

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

export interface UpdateLeadInput {
  store_name?: string;
  industry?: string;
  website_url?: string;
  instagram_url?: string;
  line_url?: string;
  region?: string;
  notes?: string;
  status?: LeadStatus;
  contact_email?: string;
  category?: string;
  area?: string;
  rating?: number;
  review_count?: number;
  has_booking_link?: boolean;
  pipeline_stage?: PipelineStage;
  pain_points?: string;
  best_offer?: string;
  recommended_channel?: string;
  next_action?: string;
}

export interface GenerateMessageInput {
  tone?: "formal" | "friendly" | "casual";
  cta?: string;
  channel?: "email" | "line" | "instagram_dm";
}

export interface GeneratedMessage {
  subject: string;
  opener: string;
  body: string;
  cta: string;
  tone: string;
  painPoints: string[];
  reasoningSummary: string;
}

export interface LeadFeatures {
  hasWebsite: boolean;
  hasInstagram: boolean;
  hasLineLink: boolean;
  hasBookingLink: boolean;
  menuCountGuess: number;
  contactEmailFound: boolean;
}

/** DB row for outreach_lead_features */
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

/** DB row for outreach_pain_hypotheses */
export interface OutreachPainHypothesisRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  code: string;
  label: string;
  severity: string;
  reason: string;
  created_at: string;
}

/** Analyze result returned from POST /analyze/:id */
export interface AnalyzeResult {
  features: OutreachLeadFeatureRow;
  hypotheses: OutreachPainHypothesisRow[];
  score: { score: number; components: Record<string, number> };
}

/** Outreach settings (KV: outreach:settings:{tenantId}) */
export interface OutreachSettings {
  sendMode: "safe" | "real";
  dailyCap: number;
  hourlyCap: number;
  requireApproval: boolean;
  /** Phase 4: followup automation */
  followupDay3Enabled: boolean;
  followupDay7Enabled: boolean;
  /** Phase 4: minimum days between contacts to same lead */
  contactCooldownDays: number;
  /** Phase 6: auto-process after source import */
  autoAnalyzeOnImport: boolean;
  autoScoreOnImport: boolean;
}

export const DEFAULT_OUTREACH_SETTINGS: OutreachSettings = {
  sendMode: "safe",
  dailyCap: 50,
  hourlyCap: 10,
  requireApproval: true,
  followupDay3Enabled: true,
  followupDay7Enabled: true,
  contactCooldownDays: 7,
  autoAnalyzeOnImport: false,
  autoScoreOnImport: false,
};

// ── Phase 4 types ──────────────────────────────────────────────────────────

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
  /** Phase 4.5: idempotency */
  processing_at: string | null;
  attempt_count: number;
  provider_message_id: string | null;
}

export type ReplyClassification = "interested" | "not_interested" | "later" | "spam" | "other";

export const REPLY_CLASSIFICATION_LABELS: Record<ReplyClassification, string> = {
  interested: "興味あり",
  not_interested: "興味なし",
  later: "検討中",
  spam: "スパム",
  other: "その他",
};

export interface LearningInsight {
  /** e.g. hypothesis code or message tone */
  key: string;
  label: string;
  totalSent: number;
  totalReplied: number;
  replyRate: number;
  /** Phase 4.5: sample size for statistical reliability */
  sampleSize?: number;
}

export interface LearningAnalytics {
  replyRateByScore: Array<{ scoreBucket: string; sent: number; replied: number; rate: number }>;
  replyRateByHypothesis: LearningInsight[];
  replyRateByTone: LearningInsight[];
  topHypothesis: LearningInsight | null;
  topTone: LearningInsight | null;
}

// ── Phase 4.5 types ─────────────────────────────────────────────────────────

export type OutreachEventType = "initial_send" | "followup_send" | "reply_received" | "reply_classified" | "meeting_created";

export interface OutreachEvent {
  id: string;
  tenant_id: string;
  lead_id: string;
  type: OutreachEventType;
  metadata: string | null;
  created_at: string;
}

/** Confidence threshold for auto CRM transitions */
export const CLASSIFY_CONFIDENCE_THRESHOLD = 0.6;

// ── Phase 5 types ─────────────────────────────────────────────────────────

export type CampaignStatus = "draft" | "ready" | "running" | "paused" | "archived";

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

export interface ImportResult {
  created: number;
  skipped: number;
  merged: number;
  invalid: number;
  batchId: string;
}

// ── Phase 6 types ─────────────────────────────────────────────────────────

export type SourceType = "csv" | "manual" | "map" | "directory";
export type SourceRunStatus = "draft" | "running" | "completed" | "failed";
export type CandidateImportStatus = "new" | "duplicate" | "imported" | "skipped" | "invalid";

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
  quality_score: number | null;
  acceptance_status: AcceptanceStatus;
  rejection_reason: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  // Phase 8.2: Source key for granular tracking
  source_key: string | null;
  // Phase 8.3: Quality learning + automation
  quality_score_v2: number | null;
  quality_score_base: number | null;
  quality_score_lift: number | null;
  automation_status: string;
  analyze_status: string;
  score_status: string;
  last_automation_error: string | null;
  automation_updated_at: string | null;
}

export interface SourceAnalytics {
  leadsBySourceType: Array<{ source_type: string; count: number }>;
  runsBySource: Array<{ source_type: string; runs: number; total_results: number; total_imported: number }>;
  duplicateRateBySource: Array<{ source_type: string; total: number; duplicates: number; rate: number }>;
  avgScoreBySource: Array<{ source_type: string; avg_score: number; sample_size: number }>;
  meetingRateBySource: Array<{ source_type: string; total: number; meetings: number; rate: number; sample_size: number }>;
}

// ── Phase 6: Learning Patterns ────────────────────────────────────────────

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

// ── Phase 7 types ─────────────────────────────────────────────────────────

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

export interface LearningRefreshLog {
  id: string;
  tenant_id: string;
  patterns_updated: number;
  patterns_deleted: number;
  templates_generated: number;
  triggered_by: string;
  created_at: string;
}

// ── Phase 10: Auto Prospect Batch types ──────────────────────────────────

export type BatchJobMode = "review_only" | "approved_send";
export type BatchJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

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

/** Analytics summary */
export interface OutreachAnalytics {
  totalLeads: number;
  byPipelineStage: Record<PipelineStage, number>;
  totalMessagesSent: number;
  totalApproved: number;
  totalReplied: number;
  totalMeetings: number;
  avgScore: number | null;
}
