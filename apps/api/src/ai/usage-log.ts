/**
 * AI Core — Usage Log
 *
 * Best-effort logging of AI usage to KV.
 * Uses append-pattern with TTL for automatic cleanup.
 * Non-blocking: never throws to caller.
 */

import type { AIUsageLogRecord } from "./types";

const LOG_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_RECENT_LOGS = 200;

/**
 * Write a usage log record to KV. Best-effort, never throws.
 */
export async function writeUsageLog(
  kv: KVNamespace | null | undefined,
  record: AIUsageLogRecord,
): Promise<void> {
  if (!kv) return;

  try {
    // Individual record (for detailed lookup)
    const key = `ai:usage:${record.tenantId}:${record.id}`;
    await kv.put(key, JSON.stringify(record), { expirationTtl: LOG_TTL_SECONDS });

    // Append to recent list (ring buffer pattern)
    const listKey = `ai:usage:recent:${record.tenantId}`;
    const existing = await kv.get(listKey).catch(() => null);
    let entries: AIUsageLogRecord[] = [];
    if (existing) {
      try {
        entries = JSON.parse(existing);
        if (!Array.isArray(entries)) entries = [];
      } catch { entries = []; }
    }
    entries.push(record);
    if (entries.length > MAX_RECENT_LOGS) {
      entries = entries.slice(-MAX_RECENT_LOGS);
    }
    await kv.put(listKey, JSON.stringify(entries), { expirationTtl: LOG_TTL_SECONDS });
  } catch (err) {
    console.error("[ai-usage-log] Write failed (non-fatal):", err);
  }
}

/**
 * Read recent usage logs for a tenant. Best-effort.
 */
export async function readRecentUsageLogs(
  kv: KVNamespace | null | undefined,
  tenantId: string,
  limit: number = 50,
): Promise<AIUsageLogRecord[]> {
  if (!kv) return [];

  try {
    const listKey = `ai:usage:recent:${tenantId}`;
    const raw = await kv.get(listKey);
    if (!raw) return [];
    const entries: AIUsageLogRecord[] = JSON.parse(raw);
    return Array.isArray(entries) ? entries.slice(-limit) : [];
  } catch {
    return [];
  }
}
