/**
 * Agent Core — Execution Log (KV-backed, best-effort)
 *
 * Keys:
 *   agent:log:{tenantId}:recent — ring buffer of recent log entries
 *   agent:log:{tenantId}:{agentId} — per-agent log
 */

import type { AgentLogRecord, AgentType, AgentTriggerType, AgentActionType } from "./types";

const LOG_TTL = 14 * 24 * 60 * 60; // 14 days
const MAX_RECENT = 200;
const MAX_PER_AGENT = 50;

export async function writeAgentLog(
  kv: KVNamespace | null | undefined,
  record: AgentLogRecord,
): Promise<void> {
  if (!kv) return;

  try {
    // Per-agent log
    const agentKey = `agent:log:${record.tenantId}:${record.agentId}`;
    const agentRaw = await kv.get(agentKey).catch(() => null);
    let agentEntries: AgentLogRecord[] = [];
    if (agentRaw) {
      try { agentEntries = JSON.parse(agentRaw); } catch { agentEntries = []; }
    }
    agentEntries.push(record);
    if (agentEntries.length > MAX_PER_AGENT) {
      agentEntries = agentEntries.slice(-MAX_PER_AGENT);
    }
    await kv.put(agentKey, JSON.stringify(agentEntries), { expirationTtl: LOG_TTL });

    // Tenant-wide recent log
    const recentKey = `agent:log:${record.tenantId}:recent`;
    const recentRaw = await kv.get(recentKey).catch(() => null);
    let recentEntries: AgentLogRecord[] = [];
    if (recentRaw) {
      try { recentEntries = JSON.parse(recentRaw); } catch { recentEntries = []; }
    }
    recentEntries.push(record);
    if (recentEntries.length > MAX_RECENT) {
      recentEntries = recentEntries.slice(-MAX_RECENT);
    }
    await kv.put(recentKey, JSON.stringify(recentEntries), { expirationTtl: LOG_TTL });
  } catch (err) {
    console.error("[agent-log] Write failed (non-fatal):", err);
  }
}

export async function readAgentLogs(
  kv: KVNamespace | null | undefined,
  tenantId: string,
  agentId: string,
  limit: number = 50,
): Promise<AgentLogRecord[]> {
  if (!kv) return [];
  try {
    const raw = await kv.get(`agent:log:${tenantId}:${agentId}`);
    if (!raw) return [];
    const entries: AgentLogRecord[] = JSON.parse(raw);
    return Array.isArray(entries) ? entries.slice(-limit) : [];
  } catch {
    return [];
  }
}

export async function readRecentAgentLogs(
  kv: KVNamespace | null | undefined,
  tenantId: string,
  limit: number = 50,
): Promise<AgentLogRecord[]> {
  if (!kv) return [];
  try {
    const raw = await kv.get(`agent:log:${tenantId}:recent`);
    if (!raw) return [];
    const entries: AgentLogRecord[] = JSON.parse(raw);
    return Array.isArray(entries) ? entries.slice(-limit) : [];
  } catch {
    return [];
  }
}

/** Convenience: build a log record */
export function buildLogRecord(
  params: {
    tenantId: string;
    agentId: string;
    agentType: AgentType;
    traceId: string;
    triggerType: AgentTriggerType;
    step: string;
    status: AgentLogRecord["status"];
    message: string;
    actionType?: AgentActionType;
    latencyMs?: number;
    meta?: Record<string, unknown>;
  },
): AgentLogRecord {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...params,
  };
}
