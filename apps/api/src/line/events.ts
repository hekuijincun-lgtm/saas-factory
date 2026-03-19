/**
 * LINE Core — Event Normalization
 *
 * Converts raw LINE webhook events into a normalized internal format.
 */

import type { LineRawEvent, LineNormalizedEvent } from "./types";

/**
 * Normalize a raw LINE webhook event into internal format.
 */
export function normalizeEvent(tenantId: string, raw: LineRawEvent): LineNormalizedEvent {
  const eventId = `${tenantId}:${raw.timestamp ?? Date.now()}:${raw.source?.userId ?? "unknown"}:${raw.type ?? "unknown"}`;

  let type: LineNormalizedEvent["type"] = "unknown";
  if (raw.type === "message") type = "message";
  else if (raw.type === "follow") type = "follow";
  else if (raw.type === "unfollow") type = "unfollow";
  else if (raw.type === "postback") type = "postback";

  return {
    tenantId,
    eventId,
    type,
    replyToken: raw.replyToken,
    userId: raw.source?.userId,
    groupId: raw.source?.groupId,
    roomId: raw.source?.roomId,
    timestamp: raw.timestamp ?? Date.now(),
    messageType: raw.message?.type,
    text: raw.message?.text,
    postbackData: raw.postback?.data,
    raw,
  };
}

/**
 * Normalize all events from a webhook body.
 */
export function normalizeEvents(tenantId: string, body: any): LineNormalizedEvent[] {
  const events = body?.events;
  if (!Array.isArray(events)) return [];
  return events.map((e: LineRawEvent) => normalizeEvent(tenantId, e));
}

/**
 * Check if an event is a text message.
 */
export function isTextMessage(event: LineNormalizedEvent): boolean {
  return event.type === "message" && event.messageType === "text" && !!event.text;
}
