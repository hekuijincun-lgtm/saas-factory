// Outreach OS — Close Response Generator (Phase 15)
// ============================================================
// Generates close-stage responses with appropriate links.

import type { CloseIntent, DealTemperature, RecommendedNextStep } from "./close-classifier";

export interface CloseSettings {
  auto_close_enabled: boolean;
  auto_send_pricing_enabled: boolean;
  auto_send_demo_link_enabled: boolean;
  auto_send_booking_link_enabled: boolean;
  auto_escalate_complex_replies: boolean;
  close_confidence_threshold: number;
  // Links
  demo_booking_url: string;
  sales_contact_url: string;
  pricing_page_url: string;
  calendly_url: string;
  human_handoff_email: string;
}

export const DEFAULT_CLOSE_SETTINGS: CloseSettings = {
  auto_close_enabled: false,
  auto_send_pricing_enabled: false,
  auto_send_demo_link_enabled: false,
  auto_send_booking_link_enabled: false,
  auto_escalate_complex_replies: true,
  close_confidence_threshold: 0.75,
  demo_booking_url: "",
  sales_contact_url: "",
  pricing_page_url: "",
  calendly_url: "",
  human_handoff_email: "",
};

export type CloseResponseType =
  | "pricing"
  | "demo_invite"
  | "booking_invite"
  | "faq_answer"
  | "objection_response"
  | "escalation";

export type CtaType =
  | "booking_link"
  | "demo_link"
  | "pricing_link"
  | "contact_owner"
  | "none";

export interface CloseResponse {
  response_text: string;
  response_type: CloseResponseType;
  cta_type: CtaType;
  followup_window_hours: number;
  handoff_required: boolean;
}

// ── Template-based responses ────────────────────────────────────────────

function buildPricingResponse(settings: CloseSettings, storeName: string): CloseResponse {
  const link = settings.pricing_page_url
    ? `\n\n料金の詳細はこちらをご覧ください:\n${settings.pricing_page_url}`
    : "";
  return {
    response_text: `${storeName}にご興味をお持ちいただきありがとうございます。\n\nご質問の料金についてご案内いたします。${link}\n\nご不明な点がございましたら、お気軽にお問い合わせください。`,
    response_type: "pricing",
    cta_type: settings.pricing_page_url ? "pricing_link" : "contact_owner",
    followup_window_hours: 24,
    handoff_required: false,
  };
}

function buildDemoInviteResponse(settings: CloseSettings, storeName: string): CloseResponse {
  const link = settings.demo_booking_url || settings.calendly_url;
  const linkText = link
    ? `\n\nデモのご予約はこちらからお願いいたします:\n${link}`
    : "\n\nデモの日程を調整いたしますので、ご都合の良い日時をいくつかお知らせいただけますでしょうか。";
  return {
    response_text: `${storeName}のデモにご興味をお持ちいただきありがとうございます。${linkText}\n\n短時間で具体的な活用イメージをお伝えできればと思います。`,
    response_type: "demo_invite",
    cta_type: link ? "demo_link" : "contact_owner",
    followup_window_hours: 48,
    handoff_required: false,
  };
}

function buildBookingInviteResponse(settings: CloseSettings, storeName: string): CloseResponse {
  const link = settings.calendly_url || settings.demo_booking_url;
  const linkText = link
    ? `\n\nご予約はこちらからお願いいたします:\n${link}`
    : "\n\nご都合の良い日時をいくつかお知らせいただけますでしょうか。";
  return {
    response_text: `${storeName}にお問い合わせいただきありがとうございます。\n\n打ち合わせの日程を調整いたします。${linkText}`,
    response_type: "booking_invite",
    cta_type: link ? "booking_link" : "contact_owner",
    followup_window_hours: 48,
    handoff_required: false,
  };
}

function buildEscalationResponse(storeName: string): CloseResponse {
  return {
    response_text: `${storeName}にお問い合わせいただきありがとうございます。\n\nご質問の内容を確認し、担当者より改めてご連絡いたします。少々お時間をいただけますでしょうか。`,
    response_type: "escalation",
    cta_type: "contact_owner",
    followup_window_hours: 24,
    handoff_required: true,
  };
}

// ── Main generator ──────────────────────────────────────────────────────

export interface GenerateCloseResponseInput {
  closeIntent: CloseIntent;
  dealTemperature: DealTemperature;
  recommendedNextStep: RecommendedNextStep;
  replyText: string;
  storeName: string;
  settings: CloseSettings;
  openaiApiKey?: string;
  /** Phase 18: Learning context for win-pattern injection */
  learningContext?: { topTone?: { key: string } | null; topHypothesis?: { key: string; label: string } | null } | null;
}

export async function generateCloseResponse(
  input: GenerateCloseResponseInput
): Promise<CloseResponse> {
  const { closeIntent, recommendedNextStep, storeName, settings, openaiApiKey } = input;

  // Determine if handoff is needed
  const needsHandoff =
    closeIntent === "implementation_question" && settings.auto_escalate_complex_replies;

  if (needsHandoff) {
    return buildEscalationResponse(storeName);
  }

  // Route by recommended_next_step
  switch (recommendedNextStep) {
    case "send_pricing":
      if (settings.auto_send_pricing_enabled || !settings.auto_close_enabled) {
        return buildPricingResponse(settings, storeName);
      }
      return buildEscalationResponse(storeName);

    case "send_demo_link":
      if (settings.auto_send_demo_link_enabled || !settings.auto_close_enabled) {
        return buildDemoInviteResponse(settings, storeName);
      }
      return buildEscalationResponse(storeName);

    case "send_booking_link":
      if (settings.auto_send_booking_link_enabled || !settings.auto_close_enabled) {
        return buildBookingInviteResponse(settings, storeName);
      }
      return buildEscalationResponse(storeName);

    case "ask_qualification_question":
      // Try AI generation for qualification question
      if (openaiApiKey) {
        return generateAICloseResponse(input);
      }
      return {
        response_text: `${storeName}にご興味をお持ちいただきありがとうございます。\n\nもう少し詳しくお伺いしてもよろしいでしょうか。現在どのような課題をお持ちですか？`,
        response_type: "faq_answer",
        cta_type: "none",
        followup_window_hours: 72,
        handoff_required: false,
      };

    case "human_followup":
      return buildEscalationResponse(storeName);

    case "mark_lost":
      return {
        response_text: `ご連絡いただきありがとうございます。\n\n承知いたしました。今後何かございましたらお気軽にお問い合わせください。`,
        response_type: "objection_response",
        cta_type: "none",
        followup_window_hours: 0,
        handoff_required: false,
      };

    default:
      return buildEscalationResponse(storeName);
  }
}

// ── AI-generated close response ─────────────────────────────────────────

async function generateAICloseResponse(
  input: GenerateCloseResponseInput
): Promise<CloseResponse> {
  const { closeIntent, replyText, storeName, settings, openaiApiKey } = input;

  const linksContext = [
    settings.pricing_page_url && `料金ページ: ${settings.pricing_page_url}`,
    settings.demo_booking_url && `デモ予約: ${settings.demo_booking_url}`,
    settings.calendly_url && `予約リンク: ${settings.calendly_url}`,
  ].filter(Boolean).join("\n");

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `あなたは${storeName}の営業担当AIです。丁寧で簡潔な返信を生成してください。
3〜5文程度で回答してください。日本語で回答してください。
相手の質問や関心に直接答えてください。
${linksContext ? `\n利用可能なリンク:\n${linksContext}` : ""}
適切な場合はリンクを含めてください。`,
          },
          {
            role: "user",
            content: `意図: ${closeIntent}\n返信内容: ${replyText.slice(0, 800)}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 400,
      }),
    });

    if (!resp.ok) {
      console.error(`[close-generator] OpenAI error: ${resp.status}`);
      return buildEscalationResponse(storeName);
    }

    const json: any = await resp.json();
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) return buildEscalationResponse(storeName);

    return {
      response_text: content,
      response_type: "faq_answer",
      cta_type: "none",
      followup_window_hours: 48,
      handoff_required: false,
    };
  } catch (err: any) {
    console.error(`[close-generator] error:`, err.message);
    return buildEscalationResponse(storeName);
  }
}

// ── Settings helpers ────────────────────────────────────────────────────

export async function getCloseSettings(
  kv: KVNamespace,
  tenantId: string
): Promise<CloseSettings> {
  const raw = await kv.get(`outreach:close-settings:${tenantId}`);
  if (!raw) return { ...DEFAULT_CLOSE_SETTINGS };
  try {
    return { ...DEFAULT_CLOSE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CLOSE_SETTINGS };
  }
}

export async function saveCloseSettings(
  kv: KVNamespace,
  tenantId: string,
  settings: Partial<CloseSettings>
): Promise<CloseSettings> {
  const current = await getCloseSettings(kv, tenantId);
  const merged = { ...current, ...settings };
  await kv.put(`outreach:close-settings:${tenantId}`, JSON.stringify(merged));
  return merged;
}
