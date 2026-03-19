/**
 * LINE Core — Message Template Registry
 */

import type { LineMessage } from "./types";

/** Build a simple text message. */
export function buildTextMessage(text: string): LineMessage {
  return { type: "text", text };
}

/** Build a booking CTA message with URL. */
export function buildBookingCtaMessage(storeName: string, bookingUrl: string): LineMessage {
  return {
    type: "text",
    text: `${storeName}のご予約はこちらからどうぞ：\n${bookingUrl}`,
  };
}

/** Build an estimate result message. */
export function buildEstimateMessage(params: {
  categoryLabel: string;
  breakdown: string;
  totalPrice: number;
  duration: string;
}): LineMessage {
  return {
    type: "text",
    text: [
      `【${params.categoryLabel} お見積もり】`,
      "",
      params.breakdown,
      "",
      `合計（税込）: ¥${params.totalPrice.toLocaleString()}`,
      `作業時間目安: ${params.duration}`,
      "",
      "※ 現地確認後に正式見積もりをご提示します",
    ].join("\n"),
  };
}

/** Build a followup message. */
export function buildFollowupMessage(storeName: string, customerName: string, message: string): LineMessage {
  return {
    type: "text",
    text: `${customerName}様\n\n${message}\n\n${storeName}`,
  };
}

/** Build a reminder message with variable substitution. */
export function buildReminderMessage(template: string, vars: Record<string, string>): LineMessage {
  let text = template;
  for (const [key, val] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${key}\\}`, "g"), val);
  }
  return { type: "text", text };
}

/** Build a generic CTA message. */
export function buildGenericCtaMessage(text: string, url: string, label: string): LineMessage {
  return {
    type: "text",
    text: `${text}\n\n${label}: ${url}`,
  };
}
