/**
 * AI Core — 共通型定義
 */

// ── Provider / Capability ────────────────────────────────────────────────

export type AIProvider = "openai" | "gemini";

export type AICapability =
  | "text_generation"
  | "json_generation"
  | "classification"
  | "embeddings";

export type AITask =
  | "booking_reply"
  | "sales_message_generation"
  | "sales_lead_analysis"
  | "sales_draft_generation"
  | "sales_reply_classification"
  | "reply_classifier"
  | "reply_intent_classifier"
  | "followup_generation"
  | string; // extensible

// ── Request Context ──────────────────────────────────────────────────────

export interface AIRequestContext {
  tenantId: string;
  /** Application area (e.g. "booking", "outreach", "sales") */
  app: string;
  /** Feature name (e.g. "concierge", "first_message", "reply_classifier") */
  feature: string;
  /** Specific task identifier */
  task: AITask;
  /** Prompt registry key */
  promptKey: string;
  /** Variables to inject into prompt template */
  variables: Record<string, string>;
  /** Override provider selection */
  preferredProvider?: AIProvider;
  /** Override model selection */
  preferredModel?: string;
  /** Enable fallback to alternate provider on failure */
  fallbackEnabled?: boolean;
  /** Temperature override */
  temperature?: number;
  /** Max output tokens override */
  maxOutputTokens?: number;
  /** Trace ID for observability */
  traceId?: string;
  /** User identifier (optional) */
  userId?: string;
  /** Channel (e.g. "line", "email", "web") */
  channel?: string;
}

// ── Text Request/Response ────────────────────────────────────────────────

export interface AITextRequest extends AIRequestContext {
  capability: "text_generation";
}

export interface AITextResponse {
  text: string;
  meta: AIResponseMeta;
}

// ── JSON Request/Response ────────────────────────────────────────────────

export interface AIJsonRequest<T = unknown> extends AIRequestContext {
  capability: "json_generation";
  /** JSON schema for structured output (provider-specific handling) */
  schema?: Record<string, unknown>;
  /** Fallback default value if parsing fails */
  fallbackDefault?: T;
}

export interface AIJsonResponse<T = unknown> {
  data: T;
  meta: AIResponseMeta;
}

// ── Classification Request/Response ──────────────────────────────────────

export interface AIClassifyRequest<TLabel extends string = string> extends AIRequestContext {
  capability: "classification";
  /** Valid label set for validation */
  validLabels: TLabel[];
  /** Default label if classification fails */
  defaultLabel: TLabel;
}

export interface AIClassifyResponse<TLabel extends string = string> {
  label: TLabel;
  confidence: number;
  reason: string;
  meta: AIResponseMeta;
}

// ── Response Meta ────────────────────────────────────────────────────────

export interface AIResponseMeta {
  provider: AIProvider;
  model: string;
  latencyMs: number;
  success: boolean;
  fallbackUsed: boolean;
  promptKey: string;
  task: AITask;
  estimatedCostUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

// ── Usage Log ────────────────────────────────────────────────────────────

export interface AIUsageLogRecord {
  id: string;
  tenantId: string;
  app: string;
  feature: string;
  task: AITask;
  provider: AIProvider;
  model: string;
  promptKey: string;
  success: boolean;
  fallbackUsed: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  timestamp: string;
  traceId?: string;
  error?: string;
}

// ── Routing ──────────────────────────────────────────────────────────────

export interface AIRouteDecision {
  provider: AIProvider;
  model: string;
  source: "request" | "tenant_routing" | "tenant_default" | "system_default";
}

export interface AIFeatureRouteConfig {
  provider: AIProvider;
  model: string;
}

// ── Tenant AI Settings (stored in settings:{tenantId}.ai) ────────────────

export interface AICoreSettings {
  /** Master toggle for AI Core routing */
  enabled: boolean;
  defaultProvider: AIProvider;
  defaultModel: string;
  fallbackProvider?: AIProvider;
  fallbackModel?: string;
  temperature: number;
  maxOutputTokens: number;
  /** Feature toggles */
  features: {
    bookingReply: boolean;
    salesGeneration: boolean;
    replyClassifier: boolean;
  };
  /** Per-task routing overrides */
  routing: Record<string, AIFeatureRouteConfig>;
}

// ── Provider Adapter Types ───────────────────────────────────────────────

export interface ProviderTextRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ProviderJsonRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  schema?: Record<string, unknown>;
}

export interface ProviderResponse {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

// ── Prompt Template ──────────────────────────────────────────────────────

export interface PromptTemplate {
  system: string;
  user: string;
}
