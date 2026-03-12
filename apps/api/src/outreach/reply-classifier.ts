// Outreach OS — Reply Classifier (Phase 4)
// ============================================================
// Classifies reply text using OpenAI. Falls back to keyword matching.

import type { ReplyClassification } from "./types";

interface ClassifyResult {
  classification: ReplyClassification;
  confidence: number;
  reason: string;
}

/**
 * Classify a reply using OpenAI (with keyword fallback).
 */
export async function classifyReply(
  replyText: string,
  openaiApiKey?: string
): Promise<ClassifyResult> {
  if (!replyText.trim()) {
    return { classification: "other", confidence: 0, reason: "empty_reply" };
  }

  if (openaiApiKey) {
    try {
      return await classifyWithAI(replyText, openaiApiKey);
    } catch (err) {
      console.error("[reply-classifier] AI failed, using keyword fallback:", err);
    }
  }

  return classifyWithKeywords(replyText);
}

// ── AI classification ─────────────────────────────────────────────────────

async function classifyWithAI(
  replyText: string,
  apiKey: string
): Promise<ClassifyResult> {
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
          content: `あなたはB2B営業の返信分類器です。
返信テキストを以下のカテゴリに分類してください:
- interested: 興味がある、詳しく聞きたい、資料が欲しい
- not_interested: 不要、結構です、興味ない
- later: 今は忙しい、また後で、検討します
- spam: 自動返信、不在通知、配信解除リクエスト
- other: 上記に当てはまらない

JSON形式で返してください:
{"classification":"...", "confidence":0.0-1.0, "reason":"短い理由"}`,
        },
        { role: "user", content: replyText },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 200,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI error: ${res.status}`);
  }

  const data = (await res.json()) as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty response");

  const parsed = JSON.parse(content);
  const valid: ReplyClassification[] = ["interested", "not_interested", "later", "spam", "other"];
  const classification = valid.includes(parsed.classification) ? parsed.classification : "other";

  return {
    classification,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    reason: parsed.reason || "ai_classified",
  };
}

// ── Keyword fallback ──────────────────────────────────────────────────────

function classifyWithKeywords(text: string): ClassifyResult {
  const lower = text.toLowerCase();

  const interestedKw = ["興味", "詳しく", "資料", "お話", "ぜひ", "検討したい", "教えて", "聞きたい"];
  const notInterestedKw = ["不要", "結構です", "興味ない", "必要ない", "お断り", "いらない"];
  const laterKw = ["忙しい", "また後で", "今は", "検討します", "改めて", "時期を見て"];
  const spamKw = ["自動返信", "不在", "配信停止", "unsubscribe", "out of office"];

  if (notInterestedKw.some((kw) => lower.includes(kw))) {
    return { classification: "not_interested", confidence: 0.7, reason: "keyword_match" };
  }
  if (spamKw.some((kw) => lower.includes(kw))) {
    return { classification: "spam", confidence: 0.7, reason: "keyword_match" };
  }
  if (interestedKw.some((kw) => lower.includes(kw))) {
    return { classification: "interested", confidence: 0.7, reason: "keyword_match" };
  }
  if (laterKw.some((kw) => lower.includes(kw))) {
    return { classification: "later", confidence: 0.6, reason: "keyword_match" };
  }

  return { classification: "other", confidence: 0.3, reason: "no_keyword_match" };
}
