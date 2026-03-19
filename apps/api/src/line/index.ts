/**
 * LINE Core — Barrel Export
 */

// Core
export { LineCore } from "./core";

// Types
export type {
  LineTenantConfig,
  LineMessagingConfig,
  LineLoginConfig,
  LineWebhookContext,
  LineNormalizedEvent,
  LineMessagePayload,
  LineMessage,
  LineReplyRequest,
  LinePushRequest,
  LineSendResult,
  LineTemplateKey,
  LineLogRecord,
  LineUserRecord,
  LineConversationState,
  LineRouteDecision,
  LineCoreSettings,
} from "./types";

// Tenant Config
export { getLineTenantConfig, getLineMessagingConfig, getLineCoreSettings, assertLineEnabled } from "./tenant-config";

// Signature
export { verifySignature } from "./signature";

// Webhook
export { handleWebhook } from "./webhook";
export type { WebhookHandleResult } from "./webhook";

// Sender
export { replyMessage, pushMessage, pushText, replyText } from "./sender";

// Events
export { normalizeEvent, normalizeEvents, isTextMessage } from "./events";

// Templates
export { buildTextMessage, buildBookingCtaMessage, buildEstimateMessage, buildFollowupMessage, buildReminderMessage, buildGenericCtaMessage } from "./templates";

// Users
export { getOrCreateLineUser, updateLastSeen, getConversationState, saveConversationState } from "./users";

// Logs
export { logInboundEvent, logOutboundMessage, listRecentLineLogs } from "./logs";
