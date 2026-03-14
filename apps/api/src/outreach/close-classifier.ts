// Outreach OS — Close Intent Classifier (Phase 15)
// ============================================================
// Detects close-stage intent from reply text.
// Uses OpenAI GPT-4o-mini with keyword fallback.

export type CloseIntent =
  | "pricing_request"
  | "demo_request"
  | "compare_request"
  | "implementation_question"
  | "schedule_request"
  | "signup_request"
  | "warm_lead"
  | "cold_lead"
  | "not_close_relevant";

export type DealTemperature = "hot" | "warm" | "cold";

export type RecommendedNextStep =
  | "send_pricing"
  | "send_demo_link"
  | "send_booking_link"
  | "ask_qualification_question"
  | "human_followup"
  | "mark_lost"
  | "none";

export interface CloseClassifyResult {
  close_intent: CloseIntent;
  close_confidence: number;
  deal_temperature: DealTemperature;
  recommended_next_step: RecommendedNextStep;
}

// ── Keyword-based fallback ──────────────────────────────────────────────

const CLOSE_KEYWORDS: Array<{
  pattern: RegExp;
  intent: CloseIntent;
  temperature: DealTemperature;
  nextStep: RecommendedNextStep;
}> = [
  { pattern: /料金|費用|見積|価格|プラン|月額|年額|コスト|いくら/i, intent: "pricing_request", temperature: "hot", nextStep: "send_pricing" },
  { pattern: /デモ|体験|試[しせ]|トライアル|お試し|無料体験/i, intent: "demo_request", temperature: "hot", nextStep: "send_demo_link" },
  { pattern: /比較|違い|他社|競合|メリット|優位/i, intent: "compare_request", temperature: "warm", nextStep: "send_pricing" },
  { pattern: /導入|実装|設定|セットアップ|API|連携|カスタマイズ/i, intent: "implementation_question", temperature: "warm", nextStep: "human_followup" },
  { pattern: /予約|日程|スケジュール|打ち合わせ|ミーティング|面談|相談/i, intent: "schedule_request", temperature: "hot", nextStep: "send_booking_link" },
  { pattern: /申[しし]込|契約|始め|開始|利用したい|使いたい|導入したい/i, intent: "signup_request", temperature: "hot", nextStep: "send_booking_link" },
  { pattern: /興味|詳しく|もう少し|教えて|資料/i, intent: "warm_lead", temperature: "warm", nextStep: "ask_qualification_question" },
  { pattern: /不要|結構|必要ない|間に合って/i, intent: "cold_lead", temperature: "cold", nextStep: "mark_lost" },
];

function classifyByKeywords(text: string): CloseClassifyResult {
  for (const kw of CLOSE_KEYWORDS) {
    if (kw.pattern.test(text)) {
      return {
        close_intent: kw.intent,
        close_confidence: 0.6,
        deal_temperature: kw.temperature,
        recommended_next_step: kw.nextStep,
      };
    }
  }
  return {
    close_intent: "not_close_relevant",
    close_confidence: 0.5,
    deal_temperature: "cold",
    recommended_next_step: "none",
  };
}

// ── AI-based classification ─────────────────────────────────────────────

const SYSTEM_PROMPT = `あなたは営業メール返信の意図を分析するAIです。
返信内容から「商談化に近い意図」を判定してください。

以下のJSON形式で回答してください:
{
  "close_intent": "pricing_request" | "demo_request" | "compare_request" | "implementation_question" | "schedule_request" | "signup_request" | "warm_lead" | "cold_lead" | "not_close_relevant",
  "close_confidence": 0.0-1.0,
  "deal_temperature": "hot" | "warm" | "cold",
  "recommended_next_step": "send_pricing" | "send_demo_link" | "send_booking_link" | "ask_qualification_question" | "human_followup" | "mark_lost" | "none"
}

判定基準:
- pricing_request: 料金・費用・プランについて質問 → hot, send_pricing
- demo_request: デモ・トライアル・体験を希望 → hot, send_demo_link
- compare_request: 他社比較・差別化について質問 → warm, send_pricing
- implementation_question: 導入・設定・技術的な質問 → warm, human_followup
- schedule_request: 打ち合わせ・日程・予約を希望 → hot, send_booking_link
- signup_request: 申し込み・契約・利用開始を希望 → hot, send_booking_link
- warm_lead: 興味はあるが具体的でない → warm, ask_qualification_question
- cold_lead: 不要・断り → cold, mark_lost
- not_close_relevant: 商談に関連しない → cold, none`;

export async function classifyCloseIntent(
  replyText: string,
  openaiApiKey?: string
): Promise<CloseClassifyResult> {
  if (!openaiApiKey) {
    return classifyByKeywords(replyText);
  }

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
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `返信内容:\n${replyText.slice(0, 1000)}` },
        ],
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      console.error(`[close-classifier] OpenAI error: ${resp.status}`);
      return classifyByKeywords(replyText);
    }

    const json: any = await resp.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return classifyByKeywords(replyText);

    const parsed = JSON.parse(content) as CloseClassifyResult;

    // Validate fields
    const validIntents: CloseIntent[] = [
      "pricing_request", "demo_request", "compare_request",
      "implementation_question", "schedule_request", "signup_request",
      "warm_lead", "cold_lead", "not_close_relevant",
    ];
    if (!validIntents.includes(parsed.close_intent)) {
      return classifyByKeywords(replyText);
    }

    return {
      close_intent: parsed.close_intent,
      close_confidence: Math.max(0, Math.min(1, parsed.close_confidence ?? 0.5)),
      deal_temperature: (["hot", "warm", "cold"] as DealTemperature[]).includes(parsed.deal_temperature)
        ? parsed.deal_temperature
        : "cold",
      recommended_next_step: parsed.recommended_next_step || "none",
    };
  } catch (err: any) {
    console.error(`[close-classifier] error:`, err.message);
    return classifyByKeywords(replyText);
  }
}
