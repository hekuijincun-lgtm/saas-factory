/**
 * LINE Core — Inbound/Outbound Log (KV-backed, best-effort)
 */

import type { LineLogRecord } from "./types";

const LOG_TTL = 14 * 24 * 60 * 60; // 14 days
const MAX_RECENT = 200;

export async function logInboundEvent(
  kv: KVNamespace | null | undefined,
  params: {
    tenantId: string;
    eventType: string;
    messageType?: string;
    userId?: string;
    traceId?: string;
    success?: boolean;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  if (!kv) return;
  const record: LineLogRecord = {
    id: crypto.randomUUID(),
    tenantId: params.tenantId,
    direction: "inbound",
    eventType: params.eventType,
    messageType: params.messageType,
    provider: "line",
    success: params.success ?? true,
    traceId: params.traceId,
    userId: params.userId,
    timestamp: new Date().toISOString(),
    meta: params.meta,
  };
  await appendLog(kv, record).catch(() => {});
}

export async function logOutboundMessage(
  kv: KVNamespace | null | undefined,
  params: {
    tenantId: string;
    requestType: "reply" | "push";
    userId?: string;
    success: boolean;
    traceId?: string;
    errorMessage?: string;
    latencyMs?: number;
  },
): Promise<void> {
  if (!kv) return;
  const record: LineLogRecord = {
    id: crypto.randomUUID(),
    tenantId: params.tenantId,
    direction: "outbound",
    eventType: "message",
    provider: "line",
    success: params.success,
    traceId: params.traceId,
    userId: params.userId,
    requestType: params.requestType,
    timestamp: new Date().toISOString(),
    errorMessage: params.errorMessage,
    meta: params.latencyMs ? { latencyMs: params.latencyMs } : undefined,
  };
  await appendLog(kv, record).catch(() => {});
}

export async function listRecentLineLogs(
  kv: KVNamespace | null | undefined,
  tenantId: string,
  limit: number = 50,
): Promise<LineLogRecord[]> {
  if (!kv) return [];
  try {
    const raw = await kv.get(`line:logs:recent:${tenantId}`);
    if (!raw) return [];
    const entries: LineLogRecord[] = JSON.parse(raw);
    return Array.isArray(entries) ? entries.slice(-limit) : [];
  } catch {
    return [];
  }
}

async function appendLog(kv: KVNamespace, record: LineLogRecord): Promise<void> {
  const key = `line:logs:recent:${record.tenantId}`;
  try {
    const raw = await kv.get(key).catch(() => null);
    let entries: LineLogRecord[] = [];
    if (raw) {
      try { entries = JSON.parse(raw); } catch { entries = []; }
    }
    entries.push(record);
    if (entries.length > MAX_RECENT) entries = entries.slice(-MAX_RECENT);
    await kv.put(key, JSON.stringify(entries), { expirationTtl: LOG_TTL });
  } catch { /* best effort */ }
}
