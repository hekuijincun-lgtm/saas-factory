/**
 * Agent Core — Trigger Layer
 *
 * Maps external events to agent executions.
 * Creates agent state and invokes the core runner.
 */

import type { AgentType, AgentTriggerType, AgentRunInput, AgentSettings } from "./types";
import { AICore } from "../ai";
import { runAgent } from "./core";

// ── Trigger Payload Types ────────────────────────────────────────────────

export interface LineMessageTriggerPayload {
  tenantId: string;
  userId: string;
  message: string;
  replyToken?: string;
  channelAccessToken?: string;
  /** Pre-built system prompt (for booking concierge) */
  systemPrompt?: string;
  /** Store settings snapshot */
  storeSettings?: Record<string, unknown>;
}

export interface ReplyReceivedTriggerPayload {
  tenantId: string;
  leadId: string;
  replyId: string;
  replyText: string;
  replySource: string;
  storeName?: string;
}

export interface ScheduledFollowupTriggerPayload {
  tenantId: string;
  agentId: string;
  leadId?: string;
  reason: string;
}

// ── Trigger Functions ────────────────────────────────────────────────────

/**
 * Trigger agent from a LINE message.
 * Returns the agent's text response or null on failure.
 */
export async function triggerLineMessage(
  env: Record<string, unknown>,
  payload: LineMessageTriggerPayload,
): Promise<{ text: string; agentId: string } | null> {
  const kv = env.SAAS_FACTORY as KVNamespace | undefined;
  if (!kv) return null;

  // Check feature flag
  const settings = await loadAgentSettings(kv, payload.tenantId);
  if (!settings.lineConciergeEnabled) return null;

  const input: AgentRunInput = {
    tenantId: payload.tenantId,
    agentType: "line_concierge",
    triggerType: "line_message_received",
    triggerPayload: payload as unknown as Record<string, unknown>,
  };

  const result = await runAgent(input, env);
  if (!result) return null;

  const text = result.state?.memory?.responseText as string | undefined;
  return text ? { text, agentId: result.state?.agentId ?? "" } : null;
}

/**
 * Trigger agent from a reply received event.
 */
export async function triggerReplyReceived(
  env: Record<string, unknown>,
  payload: ReplyReceivedTriggerPayload,
): Promise<{ agentId: string; classification?: string } | null> {
  const kv = env.SAAS_FACTORY as KVNamespace | undefined;
  if (!kv) return null;

  const settings = await loadAgentSettings(kv, payload.tenantId);
  if (!settings.outreachFollowupEnabled) return null;

  const input: AgentRunInput = {
    tenantId: payload.tenantId,
    agentType: "outreach_followup",
    triggerType: "reply_received",
    triggerPayload: payload as unknown as Record<string, unknown>,
  };

  const result = await runAgent(input, env);
  if (!result) return null;

  return {
    agentId: result.state?.agentId ?? "",
    classification: result.state?.memory?.classification as string | undefined,
  };
}

/**
 * Trigger scheduled followup resume.
 */
export async function triggerScheduledFollowup(
  env: Record<string, unknown>,
  payload: ScheduledFollowupTriggerPayload,
): Promise<{ agentId: string } | null> {
  const kv = env.SAAS_FACTORY as KVNamespace | undefined;
  if (!kv) return null;

  const input: AgentRunInput = {
    tenantId: payload.tenantId,
    agentType: "outreach_followup",
    triggerType: "scheduled_followup",
    triggerPayload: payload as unknown as Record<string, unknown>,
    agentId: payload.agentId,
  };

  const result = await runAgent(input, env);
  if (!result) return null;

  return { agentId: result.state?.agentId ?? "" };
}

// ── Settings Helper ──────────────────────────────────────────────────────

async function loadAgentSettings(kv: KVNamespace, tenantId: string): Promise<AgentSettings> {
  const defaults: AgentSettings = {
    lineConciergeEnabled: false,
    outreachFollowupEnabled: false,
    autoSendFollowup: false,
    defaultFollowupDelayHours: 24,
  };

  try {
    const raw = await kv.get(`settings:${tenantId}`);
    if (!raw) return defaults;
    const settings = JSON.parse(raw);
    const agents = settings?.agents;
    if (!agents || typeof agents !== "object") return defaults;
    return { ...defaults, ...agents };
  } catch {
    return defaults;
  }
}
