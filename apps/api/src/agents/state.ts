/**
 * Agent Core — State Management (KV-backed)
 *
 * Keys:
 *   agent:state:{tenantId}:{agentId} — individual state snapshot
 *   agent:active:{tenantId}          — list of active agent IDs (ring buffer)
 */

import type { AgentStateRecord, AgentStatus, AgentMemory, AgentType, AgentTriggerType } from "./types";

const STATE_TTL = 30 * 24 * 60 * 60; // 30 days
const MAX_ACTIVE_LIST = 200;

function stateKey(tenantId: string, agentId: string): string {
  return `agent:state:${tenantId}:${agentId}`;
}

function activeListKey(tenantId: string): string {
  return `agent:active:${tenantId}`;
}

export async function createState(
  kv: KVNamespace,
  params: {
    tenantId: string;
    agentId: string;
    agentType: AgentType;
    triggerType: AgentTriggerType;
    triggerPayload?: Record<string, unknown>;
    traceId?: string;
    initialStep: string;
  },
): Promise<AgentStateRecord> {
  const now = new Date().toISOString();
  const state: AgentStateRecord = {
    tenantId: params.tenantId,
    agentId: params.agentId,
    agentType: params.agentType,
    status: "pending",
    currentStep: params.initialStep,
    memory: {},
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    traceId: params.traceId,
    triggerType: params.triggerType,
    triggerPayload: params.triggerPayload,
  };

  await kv.put(stateKey(params.tenantId, params.agentId), JSON.stringify(state), {
    expirationTtl: STATE_TTL,
  });

  // Add to active list
  await appendToActiveList(kv, params.tenantId, params.agentId);

  return state;
}

export async function getState(
  kv: KVNamespace,
  tenantId: string,
  agentId: string,
): Promise<AgentStateRecord | null> {
  const raw = await kv.get(stateKey(tenantId, agentId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AgentStateRecord;
  } catch {
    return null;
  }
}

export async function updateState(
  kv: KVNamespace,
  tenantId: string,
  agentId: string,
  updates: {
    status?: AgentStatus;
    currentStep?: string;
    memory?: AgentMemory;
    attempts?: number;
    nextRunAt?: string;
    lastError?: string;
  },
): Promise<AgentStateRecord | null> {
  const state = await getState(kv, tenantId, agentId);
  if (!state) return null;

  if (updates.status !== undefined) state.status = updates.status;
  if (updates.currentStep !== undefined) state.currentStep = updates.currentStep;
  if (updates.memory !== undefined) state.memory = { ...state.memory, ...updates.memory };
  if (updates.attempts !== undefined) state.attempts = updates.attempts;
  if (updates.nextRunAt !== undefined) state.nextRunAt = updates.nextRunAt;
  if (updates.lastError !== undefined) state.lastError = updates.lastError;
  state.updatedAt = new Date().toISOString();

  await kv.put(stateKey(tenantId, agentId), JSON.stringify(state), {
    expirationTtl: STATE_TTL,
  });

  return state;
}

export async function completeState(
  kv: KVNamespace,
  tenantId: string,
  agentId: string,
): Promise<void> {
  await updateState(kv, tenantId, agentId, {
    status: "completed",
    nextRunAt: undefined,
  });
}

export async function failState(
  kv: KVNamespace,
  tenantId: string,
  agentId: string,
  error: string,
): Promise<void> {
  await updateState(kv, tenantId, agentId, {
    status: "failed",
    lastError: error,
    nextRunAt: undefined,
  });
}

export async function listPendingScheduledAgents(
  kv: KVNamespace,
  tenantId: string,
): Promise<AgentStateRecord[]> {
  const ids = await getActiveList(kv, tenantId);
  const now = new Date().toISOString();
  const results: AgentStateRecord[] = [];

  for (const agentId of ids) {
    const state = await getState(kv, tenantId, agentId);
    if (!state) continue;
    if (state.status === "waiting" && state.nextRunAt && state.nextRunAt <= now) {
      results.push(state);
    }
  }

  return results;
}

// ── Active List Helpers ──────────────────────────────────────────────────

async function appendToActiveList(kv: KVNamespace, tenantId: string, agentId: string): Promise<void> {
  const key = activeListKey(tenantId);
  try {
    const raw = await kv.get(key);
    let list: string[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
    list.push(agentId);
    if (list.length > MAX_ACTIVE_LIST) {
      list = list.slice(-MAX_ACTIVE_LIST);
    }
    await kv.put(key, JSON.stringify(list), { expirationTtl: STATE_TTL });
  } catch {
    // best effort
  }
}

async function getActiveList(kv: KVNamespace, tenantId: string): Promise<string[]> {
  const key = activeListKey(tenantId);
  try {
    const raw = await kv.get(key);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
