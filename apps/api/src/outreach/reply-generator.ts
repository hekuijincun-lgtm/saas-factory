// Outreach OS — Reply Generator (Phase 14)
// ============================================================
// Generates auto-reply messages based on classified intent.
// Template-based with optional AI enhancement.

import type { ReplyIntent } from "./types";

/** Template map for each intent */
const REPLY_TEMPLATES: Record<ReplyIntent, string> = {
  pricing: `ありがとうございます！
料金についてご案内いたします。

▼ 料金の詳細はこちら
{{booking_url}}

ご不明点があればお気軽にどうぞ。`,

  interested: `ありがとうございます！
もしよければ10分ほどデモさせていただけます。

▼ こちらから日程をお選びいただけます
{{booking_url}}`,

  question: `ご質問ありがとうございます。
以下の通りお答えいたします:`,

  later: `承知しました！
またタイミングが合うときにご連絡させていただきます。
いつでもお気軽にご連絡ください。`,

  not_interested: `ご返信ありがとうございます！
また機会がありましたら、よろしくお願いいたします。`,

  demo: `ありがとうございます！
ぜひデモをご案内させてください。

▼ こちらから10分だけお時間ください
{{booking_url}}`,

  unsubscribe: `承知しました。今後メールをお送りしないよう設定いたしました。
ご迷惑をおかけし申し訳ございませんでした。`,

  unknown: "",
};

export interface GenerateReplyInput {
  intent: ReplyIntent;
  replyText: string;
  storeName: string;
  openaiApiKey?: string;
  bookingUrl?: string;
  /** Intent-specific URLs for close-aware templates */
  pricingPageUrl?: string;
  demoBookingUrl?: string;
}

export interface GenerateReplyResult {
  response: string;
  method: "template" | "ai";
}

/**
 * Generate a reply based on intent.
 * Uses AI enhancement when available, otherwise falls back to templates.
 * Returns empty string for unknown intent (needs human review).
 */
export async function generateReply(
  input: GenerateReplyInput
): Promise<GenerateReplyResult> {
  const { intent, replyText, storeName, openaiApiKey, bookingUrl, pricingPageUrl, demoBookingUrl } = input;

  // Unknown intent → needs human review, no auto-reply
  if (intent === "unknown") {
    return { response: "", method: "template" };
  }

  let template = REPLY_TEMPLATES[intent];

  // Resolve intent-specific URL
  const resolveUrl = (): string => {
    switch (intent) {
      case "pricing": return pricingPageUrl || bookingUrl || "";
      case "demo": return demoBookingUrl || bookingUrl || "";
      default: return bookingUrl || "";
    }
  };
  const url = resolveUrl();
  template = template.replace(/\{\{booking_url\}\}/g, url || "(予約URLは管理画面で設定してください)");

  // Try AI-enhanced reply for question intent (needs contextual answer)
  if (intent === "question" && openaiApiKey) {
    try {
      const aiResponse = await generateAIReply(replyText, storeName, openaiApiKey);
      if (aiResponse) {
        return { response: aiResponse, method: "ai" };
      }
    } catch (err) {
      console.error("[reply-generator] AI failed, using template:", err);
    }
  }

  return { response: template, method: "template" };
}

async function generateAIReply(
  replyText: string,
  storeName: string,
  apiKey: string
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `あなたは${storeName}の営業担当AIアシスタントです。
見込み客からの質問に対して、丁寧かつ簡潔に返信を作成してください。

ルール:
- 敬語を使う
- 3-5文程度で簡潔に
- 具体的な数字や技術情報は含めず、一般的な回答に留める
- 詳細は別途相談できる旨を伝える
- 返信文のみ出力（挨拶含む）`,
        },
        {
          role: "user",
          content: `以下の質問への返信を作成してください:\n\n${replyText}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);

  const data = (await res.json()) as any;
  return data.choices?.[0]?.message?.content?.trim() || "";
}
