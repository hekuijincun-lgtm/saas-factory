/**
 * LINE Core — User & Conversation State Management (KV-backed)
 */

import type { LineUserRecord, LineConversationState } from "./types";

const USER_TTL = 90 * 24 * 60 * 60; // 90 days
const CONVO_TTL = 7 * 24 * 60 * 60; // 7 days

function userKey(tenantId: string, userId: string): string {
  return `line:user:${tenantId}:${userId}`;
}

function convoKey(tenantId: string, userId: string): string {
  return `line:convo:${tenantId}:${userId}`;
}

export async function getOrCreateLineUser(
  kv: KVNamespace,
  tenantId: string,
  userId: string,
  displayName?: string,
): Promise<LineUserRecord> {
  const key = userKey(tenantId, userId);
  const now = new Date().toISOString();

  const raw = await kv.get(key).catch(() => null);
  if (raw) {
    try {
      const existing: LineUserRecord = JSON.parse(raw);
      existing.lastSeenAt = now;
      existing.conversationCount = (existing.conversationCount ?? 0) + 1;
      if (displayName) existing.displayName = displayName;
      await kv.put(key, JSON.stringify(existing), { expirationTtl: USER_TTL }).catch(() => {});
      return existing;
    } catch { /* fall through to create */ }
  }

  const user: LineUserRecord = {
    tenantId,
    userId,
    displayName,
    lastSeenAt: now,
    firstSeenAt: now,
    conversationCount: 1,
  };
  await kv.put(key, JSON.stringify(user), { expirationTtl: USER_TTL }).catch(() => {});
  return user;
}

export async function updateLastSeen(
  kv: KVNamespace,
  tenantId: string,
  userId: string,
): Promise<void> {
  await getOrCreateLineUser(kv, tenantId, userId);
}

export async function getConversationState(
  kv: KVNamespace,
  tenantId: string,
  userId: string,
): Promise<LineConversationState | null> {
  const raw = await kv.get(convoKey(tenantId, userId)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveConversationState(
  kv: KVNamespace,
  state: LineConversationState,
): Promise<void> {
  const key = convoKey(state.tenantId, state.userId);
  await kv.put(key, JSON.stringify(state), { expirationTtl: CONVO_TTL }).catch(() => {});
}
