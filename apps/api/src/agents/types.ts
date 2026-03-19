/**
 * Agent Core — 共通型定義
 */

import type { AICore } from "../ai";

// ── Agent Identifiers ────────────────────────────────────────────────────

export type AgentType = "line_concierge" | "outreach_followup" | "cleaning_estimate" | "handyman_estimate" | "pet_estimate";

export type AgentTriggerType =
  | "line_message_received"
  | "lead_created"
  | "reply_received"
  | "scheduled_followup"
  | "web_inquiry";

export type AgentStatus =
  | "pending"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentActionType =
  | "send_line_message"
  | "generate_text"
  | "generate_json"
  | "classify"
  | "schedule_next_run"
  | "update_state"
  | "complete_agent"
  | "fail_agent"
  | "create_followup_task"
  | "noop";

// ── Agent Memory ─────────────────────────────────────────────────────────

export interface AgentMemory {
  [key: string]: unknown;
}

// ── Agent Decision ───────────────────────────────────────────────────────

export interface AgentDecision {
  /** Next step to execute (null = done) */
  nextStep: string | null;
  /** Actions to execute before moving to next step */
  actions: AgentActionRequest[];
  /** Whether agent is complete */
  done: boolean;
  /** If done, final status */
  finalStatus?: "completed" | "failed" | "waiting";
  /** Memory updates */
  memoryUpdates?: Partial<AgentMemory>;
  /** Schedule next run (ISO timestamp) */
  scheduleAt?: string;
}

// ── Action Request/Result ────────────────────────────────────────────────

export interface AgentActionRequest {
  type: AgentActionType;
  params: Record<string, unknown>;
}

export interface AgentActionResult {
  type: AgentActionType;
  success: boolean;
  data?: unknown;
  error?: string;
  latencyMs?: number;
}

// ── Step Result ──────────────────────────────────────────────────────────

export interface AgentStepResult {
  step: string;
  decision: AgentDecision;
  actionResults: AgentActionResult[];
  error?: string;
}

// ── Execution Context ────────────────────────────────────────────────────

export interface AgentExecutionContext {
  tenantId: string;
  agentType: AgentType;
  triggerType: AgentTriggerType;
  triggerPayload: Record<string, unknown>;
  traceId: string;
  now: string;
  aiCore: AICore;
  env: Record<string, unknown>;
  kv: KVNamespace;
  db?: D1Database;
  state?: AgentStateRecord;
  principal?: string;
  userId?: string;
}

// ── Run Input ────────────────────────────────────────────────────────────

export interface AgentRunInput {
  tenantId: string;
  agentType: AgentType;
  triggerType: AgentTriggerType;
  triggerPayload: Record<string, unknown>;
  traceId?: string;
  principal?: string;
  userId?: string;
  /** Resume existing agent instead of creating new */
  agentId?: string;
}

// ── Agent Definition ─────────────────────────────────────────────────────

export interface AgentDefinition {
  type: AgentType;
  name: string;
  description: string;
  supportedTriggers: AgentTriggerType[];
  initialStep: string;
  /** Execute a step and return a decision */
  runStep: (
    step: string,
    ctx: AgentExecutionContext,
  ) => Promise<AgentDecision>;
}

// ── State Record ─────────────────────────────────────────────────────────

export interface AgentStateRecord {
  tenantId: string;
  agentId: string;
  agentType: AgentType;
  status: AgentStatus;
  currentStep: string;
  memory: AgentMemory;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  nextRunAt?: string;
  lastError?: string;
  traceId?: string;
  triggerType?: AgentTriggerType;
  triggerPayload?: Record<string, unknown>;
}

// ── Log Record ───────────────────────────────────────────────────────────

export interface AgentLogRecord {
  id: string;
  tenantId: string;
  agentId: string;
  agentType: AgentType;
  traceId: string;
  triggerType: AgentTriggerType;
  step: string;
  actionType?: AgentActionType;
  status: "start" | "step" | "action" | "success" | "fallback" | "failure" | "complete";
  message: string;
  timestamp: string;
  latencyMs?: number;
  meta?: Record<string, unknown>;
}

// ── Schedule Record ──────────────────────────────────────────────────────

export interface AgentScheduleRecord {
  tenantId: string;
  agentId: string;
  agentType: AgentType;
  nextRunAt: string;
  status: "scheduled" | "running" | "done";
}

// ── Agent Settings (stored in settings:{tenantId}) ───────────────────────

export interface AgentSettings {
  lineConciergeEnabled?: boolean;
  outreachFollowupEnabled?: boolean;
  autoSendFollowup?: boolean;
  defaultFollowupDelayHours?: number;
}
