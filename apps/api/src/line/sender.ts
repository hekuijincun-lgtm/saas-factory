/**
 * LINE Core — Unified Sender
 *
 * Consolidates all LINE reply/push operations into a single sender.
 */

import type { LineMessage, LineReplyRequest, LinePushRequest, LineSendResult } from "./types";
import { logOutboundMessage } from "./logs";

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const SEND_TIMEOUT_MS = 10_000;

/**
 * Reply to a LINE message using replyToken.
 */
export async function replyMessage(
  channelAccessToken: string,
  req: LineReplyRequest,
  kv?: KVNamespace | null,
): Promise<LineSendResult> {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(LINE_REPLY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        replyToken: req.replyToken,
        messages: req.messages,
      }),
    });

    const bodyText = await res.text().catch(() => "");
    const result: LineSendResult = {
      success: res.ok,
      status: res.status,
      error: res.ok ? undefined : bodyText.slice(0, 200),
      latencyMs: Date.now() - start,
    };

    // Best-effort log
    if (kv) {
      logOutboundMessage(kv, {
        tenantId: req.tenantId,
        requestType: "reply",
        success: result.success,
        traceId: req.traceId,
        errorMessage: result.error,
        latencyMs: result.latencyMs,
      }).catch(() => {});
    }

    return result;
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? String(err),
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Push a message to a LINE user.
 */
export async function pushMessage(
  channelAccessToken: string,
  req: LinePushRequest,
  kv?: KVNamespace | null,
): Promise<LineSendResult> {
  const start = Date.now();

  // Dedup check
  if (req.dedup && kv) {
    const dedupKey = `line:dedup:${req.tenantId}:${req.dedup}`;
    const existing = await kv.get(dedupKey).catch(() => null);
    if (existing) {
      return { success: true, deduplicated: true, latencyMs: 0 };
    }
    await kv.put(dedupKey, "1", { expirationTtl: 3600 }).catch(() => {});
  }

  try {
    const res = await fetchWithTimeout(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: req.userId,
        messages: req.messages,
      }),
    });

    const bodyText = await res.text().catch(() => "");
    const result: LineSendResult = {
      success: res.ok,
      status: res.status,
      error: res.ok ? undefined : bodyText.slice(0, 200),
      latencyMs: Date.now() - start,
    };

    if (kv) {
      logOutboundMessage(kv, {
        tenantId: req.tenantId,
        requestType: "push",
        userId: req.userId,
        success: result.success,
        traceId: req.traceId,
        errorMessage: result.error,
        latencyMs: result.latencyMs,
      }).catch(() => {});
    }

    return result;
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? String(err),
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Convenience: push a text message.
 */
export async function pushText(
  channelAccessToken: string,
  tenantId: string,
  userId: string,
  text: string,
  kv?: KVNamespace | null,
  dedup?: string,
): Promise<LineSendResult> {
  return pushMessage(channelAccessToken, {
    tenantId,
    userId,
    messages: [{ type: "text", text }],
    dedup,
  }, kv);
}

/**
 * Convenience: reply with a text message.
 */
export async function replyText(
  channelAccessToken: string,
  tenantId: string,
  replyToken: string,
  text: string,
  kv?: KVNamespace | null,
): Promise<LineSendResult> {
  return replyMessage(channelAccessToken, {
    tenantId,
    replyToken,
    messages: [{ type: "text", text }],
  }, kv);
}

// ── Internal ─────────────────────────────────────────────────────────────

function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}
