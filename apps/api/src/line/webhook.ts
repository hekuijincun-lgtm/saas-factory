/**
 * LINE Core — Webhook Handler
 *
 * Common webhook processing: signature verify → tenant resolve → normalize → route → log.
 */

import type { LineNormalizedEvent, LineRouteDecision, LineTenantConfig } from "./types";
import { verifySignature } from "./signature";
import { normalizeEvents, isTextMessage } from "./events";
import { getLineTenantConfig, getLineCoreSettings } from "./tenant-config";
import { logInboundEvent } from "./logs";
import { getOrCreateLineUser, saveConversationState } from "./users";

export interface WebhookHandleResult {
  ok: boolean;
  tenantId: string;
  events: LineNormalizedEvent[];
  routes: { event: LineNormalizedEvent; decision: LineRouteDecision }[];
  error?: string;
}

/**
 * Handle a LINE webhook request.
 * Returns normalized events and routing decisions.
 * Does NOT execute agent logic — caller decides what to do with routes.
 */
export async function handleWebhook(
  rawBody: string,
  signature: string,
  tenantId: string,
  env: Record<string, unknown>,
): Promise<WebhookHandleResult> {
  const kv = env.SAAS_FACTORY as KVNamespace | undefined;
  if (!kv) {
    return { ok: false, tenantId, events: [], routes: [], error: "kv_missing" };
  }

  // 1. Load tenant config
  const config = await getLineTenantConfig(kv, tenantId);
  if (!config) {
    return { ok: false, tenantId, events: [], routes: [], error: "tenant_not_configured" };
  }

  // 2. Verify signature
  const valid = await verifySignature(rawBody, signature, config.messaging.channelSecret);
  if (!valid) {
    console.error(`[line-webhook] Signature verification failed for tenant=${tenantId}`);
    return { ok: false, tenantId, events: [], routes: [], error: "invalid_signature" };
  }

  // 3. Parse and normalize events
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false, tenantId, events: [], routes: [], error: "invalid_json" };
  }

  const events = normalizeEvents(tenantId, body);
  if (events.length === 0) {
    return { ok: true, tenantId, events: [], routes: [] };
  }

  // 4. Load core settings for routing
  const coreSettings = await getLineCoreSettings(kv, tenantId);

  // 5. Process each event
  const routes: { event: LineNormalizedEvent; decision: LineRouteDecision }[] = [];

  for (const event of events) {
    // Log inbound (best-effort)
    logInboundEvent(kv, {
      tenantId,
      eventType: event.type,
      messageType: event.messageType,
      userId: event.userId,
      traceId: event.eventId,
    }).catch(() => {});

    // Track user (best-effort)
    if (event.userId) {
      getOrCreateLineUser(kv, tenantId, event.userId).catch(() => {});
    }

    // Route decision
    const decision = resolveRoute(event, config, coreSettings);
    routes.push({ event, decision });
  }

  return { ok: true, tenantId, events, routes };
}

/**
 * Determine how to handle a LINE event.
 */
function resolveRoute(
  event: LineNormalizedEvent,
  config: LineTenantConfig,
  coreSettings: { agentRoutingEnabled: boolean; defaultReplyMode: string },
): LineRouteDecision {
  // Follow/unfollow: no-op (just logged)
  if (event.type === "follow" || event.type === "unfollow") {
    return { handler: "noop", reason: `${event.type}_event` };
  }

  // Non-text messages: legacy handler
  if (event.type === "message" && !isTextMessage(event)) {
    return { handler: "legacy", reason: "non_text_message" };
  }

  // Agent routing enabled → route to agent
  if (coreSettings.agentRoutingEnabled && config.agentRoutingEnabled) {
    return {
      handler: "agent",
      agentType: "line_concierge",
      reason: "agent_routing_enabled",
    };
  }

  // Default: legacy handler
  return {
    handler: coreSettings.defaultReplyMode === "disabled" ? "noop" : "legacy",
    reason: "default_reply_mode",
  };
}
