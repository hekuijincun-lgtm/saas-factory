// Outreach OS — Meeting Suggester (Phase 15)
// ============================================================
// Generates next-step suggestions for close-stage leads.

import type { CloseIntent, DealTemperature } from "./close-classifier";
import type { CloseSettings } from "./close-generator";

export interface MeetingSuggestion {
  suggested_action: string;
  suggested_message: string;
  escalation_needed: boolean;
  qualification_question?: string;
}

/**
 * Generate a meeting/next-step suggestion based on close intent and context.
 */
export function suggestNextStep(
  closeIntent: CloseIntent,
  dealTemperature: DealTemperature,
  settings: CloseSettings,
  storeName: string
): MeetingSuggestion {
  switch (closeIntent) {
    case "pricing_request":
      return {
        suggested_action: "send_pricing",
        suggested_message: settings.pricing_page_url
          ? `料金ページリンクを送信してください: ${settings.pricing_page_url}`
          : `料金表を添付して返信してください`,
        escalation_needed: false,
      };

    case "demo_request":
      return {
        suggested_action: "send_demo_link",
        suggested_message: settings.demo_booking_url
          ? `デモ予約リンクを送信してください: ${settings.demo_booking_url}`
          : `デモの日程候補を提案してください`,
        escalation_needed: false,
      };

    case "schedule_request":
      return {
        suggested_action: "send_booking_link",
        suggested_message: settings.calendly_url
          ? `予約リンクを送信してください: ${settings.calendly_url}`
          : `打ち合わせの候補日時を提案してください`,
        escalation_needed: false,
      };

    case "signup_request":
      return {
        suggested_action: "send_booking_link",
        suggested_message: `申し込み意思あり。最終確認の打ち合わせを設定してください。`,
        escalation_needed: true,
      };

    case "compare_request":
      return {
        suggested_action: "send_comparison",
        suggested_message: `競合比較資料を送付し、${storeName}の強みを説明してください。`,
        escalation_needed: false,
        qualification_question: "現在他社サービスをご利用ですか？",
      };

    case "implementation_question":
      return {
        suggested_action: "human_followup",
        suggested_message: `技術的な質問のため、担当者が直接回答してください。`,
        escalation_needed: true,
        qualification_question: "具体的にどのような連携・機能が必要ですか？",
      };

    case "warm_lead":
      return {
        suggested_action: "ask_qualification",
        suggested_message: `まず1問だけヒアリングしてニーズを確認してください。`,
        escalation_needed: false,
        qualification_question: "現在どのような課題をお持ちですか？",
      };

    case "cold_lead":
      return {
        suggested_action: "mark_lost",
        suggested_message: `興味なしのため、丁寧にクローズしてください。`,
        escalation_needed: false,
      };

    default:
      return {
        suggested_action: "none",
        suggested_message: `追加情報なし。必要に応じて手動対応してください。`,
        escalation_needed: false,
      };
  }
}
