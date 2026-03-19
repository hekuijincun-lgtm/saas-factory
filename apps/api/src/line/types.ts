/**
 * LINE Core — 共通型定義
 */

// ── Tenant Config ────────────────────────────────────────────────────────

export interface LineTenantConfig {
  tenantId: string;
  enabled: boolean;
  messaging: LineMessagingConfig;
  login?: LineLoginConfig;
  defaultReplyMode?: "agent" | "legacy" | "disabled";
  webhookEnabled?: boolean;
  agentRoutingEnabled?: boolean;
}

export interface LineMessagingConfig {
  channelAccessToken: string;
  channelSecret: string;
  channelId?: string;
  botUserId?: string;
  enabled: boolean;
}

export interface LineLoginConfig {
  channelId: string;
  channelSecret: string;
  enabled: boolean;
}

// ── Webhook ──────────────────────────────────────────────────────────────

export interface LineWebhookContext {
  tenantId: string;
  config: LineTenantConfig;
  rawBody: string;
  signature: string;
  traceId: string;
  timestamp: string;
}

export interface LineRawEvent {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string; groupId?: string; roomId?: string };
  timestamp?: number;
  message?: { id?: string; type?: string; text?: string };
  postback?: { data?: string };
  [key: string]: unknown;
}

export interface LineNormalizedEvent {
  tenantId: string;
  eventId: string;
  type: "message" | "follow" | "unfollow" | "postback" | "unknown";
  replyToken?: string;
  userId?: string;
  groupId?: string;
  roomId?: string;
  timestamp: number;
  messageType?: string;
  text?: string;
  postbackData?: string;
  raw: LineRawEvent;
}

// ── Sender ───────────────────────────────────────────────────────────────

export interface LineMessagePayload {
  type: "text";
  text: string;
}

export interface LineFlexPayload {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
}

export type LineMessage = LineMessagePayload | LineFlexPayload | Record<string, unknown>;

export interface LineReplyRequest {
  tenantId: string;
  replyToken: string;
  messages: LineMessage[];
  traceId?: string;
}

export interface LinePushRequest {
  tenantId: string;
  userId: string;
  messages: LineMessage[];
  traceId?: string;
  dedup?: string;
}

export interface LineSendResult {
  success: boolean;
  status?: number;
  error?: string;
  deduplicated?: boolean;
  latencyMs?: number;
}

// ── Templates ────────────────────────────────────────────────────────────

export type LineTemplateKey =
  | "text"
  | "booking_cta"
  | "estimate_result"
  | "followup"
  | "generic_cta"
  | "reminder";

// ── Logs ─────────────────────────────────────────────────────────────────

export interface LineLogRecord {
  id: string;
  tenantId: string;
  direction: "inbound" | "outbound";
  eventType: string;
  messageType?: string;
  provider: "line";
  success: boolean;
  traceId?: string;
  userId?: string;
  requestType?: "reply" | "push";
  timestamp: string;
  errorCode?: string;
  errorMessage?: string;
  meta?: Record<string, unknown>;
}

// ── Users / Conversation ─────────────────────────────────────────────────

export interface LineUserRecord {
  tenantId: string;
  userId: string;
  displayName?: string;
  lastSeenAt: string;
  firstSeenAt: string;
  conversationCount: number;
}

export interface LineConversationState {
  tenantId: string;
  userId: string;
  agentType?: string;
  agentId?: string;
  lastMessageAt?: string;
  context?: Record<string, unknown>;
}

// ── Route Decision ───────────────────────────────────────────────────────

export interface LineRouteDecision {
  handler: "agent" | "legacy" | "noop";
  agentType?: string;
  reason: string;
}

// ── Core Settings ────────────────────────────────────────────────────────

export interface LineCoreSettings {
  enabled: boolean;
  agentRoutingEnabled: boolean;
  loggingEnabled: boolean;
  defaultReplyMode: "agent" | "legacy" | "disabled";
  dedupWindowSec: number;
}
