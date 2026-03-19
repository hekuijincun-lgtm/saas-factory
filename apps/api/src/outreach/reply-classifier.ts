// Outreach OS — Reply Classifier (Phase 4 + Phase 14 + AI Core)
// ============================================================
// Classifies reply text using AI Core. Falls back to keyword matching.
// Phase 14: Added classifyReplyIntent() with expanded intent categories.
// AI Core: Migrated from direct OpenAI calls to AI Core unified interface.

import type { ReplyClassification, ReplyIntent } from "./types";
import type { AICore } from "../ai";

interface ClassifyResult {
  classification: ReplyClassification;
  confidence: number;
  reason: string;
}

/**
 * Classify a reply using AI Core (with keyword fallback).
 * Accepts either an AICore instance or a legacy openaiApiKey for backward compat.
 */
export async function classifyReply(
  replyText: string,
  openaiApiKeyOrAiCore?: string | AICore,
  tenantId: string = "default",
): Promise<ClassifyResult> {
  if (!replyText.trim()) {
    return { classification: "other", confidence: 0, reason: "empty_reply" };
  }

  // AI Core path
  if (openaiApiKeyOrAiCore && typeof openaiApiKeyOrAiCore !== "string") {
    try {
      return await classifyWithAICore(replyText, openaiApiKeyOrAiCore, tenantId);
    } catch (err) {
      console.error("[reply-classifier] AI Core failed, using keyword fallback:", err);
    }
    return classifyWithKeywords(replyText);
  }

  // Legacy path (direct OpenAI key)
  if (openaiApiKeyOrAiCore && typeof openaiApiKeyOrAiCore === "string") {
    try {
      return await classifyWithAICoreLegacy(replyText, openaiApiKeyOrAiCore);
    } catch (err) {
      console.error("[reply-classifier] AI failed, using keyword fallback:", err);
    }
  }

  return classifyWithKeywords(replyText);
}

// ── AI Core classification ──────────────────────────────────────────────

async function classifyWithAICore(
  replyText: string,
  aiCore: AICore,
  tenantId: string,
): Promise<ClassifyResult> {
  const result = await aiCore.classify<ReplyClassification>({
    capability: "classification",
    tenantId,
    app: "outreach",
    feature: "reply_classifier",
    task: "reply_classifier",
    promptKey: "outreach.reply_classifier.v1",
    variables: { replyText },
    validLabels: ["interested", "not_interested", "later", "spam", "other"],
    defaultLabel: "other",
    temperature: 0.1,
    maxOutputTokens: 200,
  });

  return {
    classification: result.label,
    confidence: result.confidence,
    reason: result.reason,
  };
}

// ── Legacy fallback (direct OpenAI — kept for backward compat) ──────────

async function classifyWithAICoreLegacy(
  replyText: string,
  apiKey: string,
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

// ── Phase 14: Intent classifier (expanded categories) ────────────────────

export interface IntentClassifyResult {
  intent: ReplyIntent;
  sentiment: "positive" | "neutral" | "negative";
  confidence: number;
  reason: string;
}

/**
 * Classify reply intent with expanded categories for auto-reply.
 * Uses AI Core with keyword fallback.
 */
export async function classifyReplyIntent(
  replyText: string,
  openaiApiKeyOrAiCore?: string | AICore,
  tenantId: string = "default",
): Promise<IntentClassifyResult> {
  if (!replyText.trim()) {
    return { intent: "unknown", sentiment: "neutral", confidence: 0, reason: "empty_reply" };
  }

  // AI Core path
  if (openaiApiKeyOrAiCore && typeof openaiApiKeyOrAiCore !== "string") {
    try {
      return await classifyIntentWithAICore(replyText, openaiApiKeyOrAiCore, tenantId);
    } catch (err) {
      console.error("[reply-classifier] Intent AI Core failed, using keyword fallback:", err);
    }
    return classifyIntentWithKeywords(replyText);
  }

  // Legacy path
  if (openaiApiKeyOrAiCore && typeof openaiApiKeyOrAiCore === "string") {
    try {
      return await classifyIntentWithAILegacy(replyText, openaiApiKeyOrAiCore);
    } catch (err) {
      console.error("[reply-classifier] Intent AI failed, using keyword fallback:", err);
    }
  }

  return classifyIntentWithKeywords(replyText);
}

// ── AI Core intent classification ───────────────────────────────────────

async function classifyIntentWithAICore(
  replyText: string,
  aiCore: AICore,
  tenantId: string,
): Promise<IntentClassifyResult> {
  const result = await aiCore.classify<string>({
    capability: "classification",
    tenantId,
    app: "outreach",
    feature: "reply_intent_classifier",
    task: "reply_intent_classifier",
    promptKey: "outreach.reply_intent_classifier.v1",
    variables: { replyText },
    validLabels: ["question", "interested", "not_interested", "later", "pricing", "demo", "unsubscribe", "unknown"],
    defaultLabel: "unknown",
    temperature: 0.1,
    maxOutputTokens: 200,
  });

  // The classify response extracts the raw parsed JSON internally,
  // but we also need sentiment. Re-parse from the AI Core's raw response
  // is not available here, so we use a secondary extraction:
  // The prompt asks for sentiment, and the classify method parses "intent" field.
  // For sentiment, we rely on the reason field or default to neutral.
  const validIntents: ReplyIntent[] = ["question", "interested", "not_interested", "later", "pricing", "demo", "unsubscribe", "unknown"];
  const intent: ReplyIntent = validIntents.includes(result.label as ReplyIntent)
    ? (result.label as ReplyIntent)
    : "unknown";

  // Infer sentiment from intent as a heuristic (AI Core classify doesn't expose raw JSON)
  const sentimentMap: Record<string, "positive" | "neutral" | "negative"> = {
    interested: "positive",
    question: "neutral",
    pricing: "positive",
    demo: "positive",
    not_interested: "negative",
    unsubscribe: "negative",
    later: "neutral",
    unknown: "neutral",
  };

  return {
    intent,
    sentiment: sentimentMap[intent] ?? "neutral",
    confidence: result.confidence,
    reason: result.reason,
  };
}

// ── Legacy intent AI ────────────────────────────────────────────────────

async function classifyIntentWithAILegacy(
  replyText: string,
  apiKey: string,
): Promise<IntentClassifyResult> {
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
- question: 具体的な質問をしている（機能、使い方、対応範囲など）
- pricing: 料金・費用・コストについて聞いている
- demo: デモ・体験・試用を希望している
- not_interested: 不要、結構です、興味ない
- unsubscribe: 配信停止、メール不要、今後送らないで、unsubscribe
- later: 今は忙しい、また後で、検討します
- unknown: 上記に当てはまらない、自動返信、不在通知

sentimentも判定してください:
- positive: 前向き・好意的
- neutral: 中立
- negative: 否定的・拒否的

JSON形式で返してください:
{"intent":"...", "sentiment":"positive|neutral|negative", "confidence":0.0-1.0, "reason":"短い理由"}`,
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
  const validIntents: ReplyIntent[] = ["question", "interested", "not_interested", "later", "pricing", "demo", "unsubscribe", "unknown"];
  const validSentiments = ["positive", "neutral", "negative"] as const;

  return {
    intent: validIntents.includes(parsed.intent) ? parsed.intent : "unknown",
    sentiment: validSentiments.includes(parsed.sentiment) ? parsed.sentiment : "neutral",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    reason: parsed.reason || "ai_classified",
  };
}

function classifyIntentWithKeywords(text: string): IntentClassifyResult {
  const lower = text.toLowerCase();

  const pricingKw = ["料金", "費用", "値段", "コスト", "いくら", "価格", "月額", "プラン"];
  const demoKw = ["デモ", "体験", "試用", "お試し", "使ってみ", "見せて"];
  const questionKw = ["どう", "どんな", "何が", "できます", "対応", "教えて", "質問"];
  const interestedKw = ["興味", "詳しく", "資料", "お話", "ぜひ", "検討したい", "聞きたい"];
  const notInterestedKw = ["不要", "結構です", "興味ない", "必要ない", "お断り", "いらない"];
  const unsubscribeKw = ["配信停止", "配信解除", "メール不要", "送らないで", "unsubscribe", "opt out", "opt-out", "停止して", "解除して"];
  const laterKw = ["忙しい", "また後で", "今は", "検討します", "改めて", "時期を見て"];

  if (unsubscribeKw.some((kw) => lower.includes(kw))) {
    return { intent: "unsubscribe", sentiment: "negative", confidence: 0.9, reason: "keyword_match" };
  }
  if (notInterestedKw.some((kw) => lower.includes(kw))) {
    return { intent: "not_interested", sentiment: "negative", confidence: 0.7, reason: "keyword_match" };
  }
  if (pricingKw.some((kw) => lower.includes(kw))) {
    return { intent: "pricing", sentiment: "positive", confidence: 0.7, reason: "keyword_match" };
  }
  if (demoKw.some((kw) => lower.includes(kw))) {
    return { intent: "demo", sentiment: "positive", confidence: 0.7, reason: "keyword_match" };
  }
  if (interestedKw.some((kw) => lower.includes(kw))) {
    return { intent: "interested", sentiment: "positive", confidence: 0.7, reason: "keyword_match" };
  }
  if (questionKw.some((kw) => lower.includes(kw))) {
    return { intent: "question", sentiment: "neutral", confidence: 0.6, reason: "keyword_match" };
  }
  if (laterKw.some((kw) => lower.includes(kw))) {
    return { intent: "later", sentiment: "neutral", confidence: 0.6, reason: "keyword_match" };
  }

  return { intent: "unknown", sentiment: "neutral", confidence: 0.3, reason: "no_keyword_match" };
}
