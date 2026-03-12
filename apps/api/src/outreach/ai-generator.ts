// Outreach OS — AI Message Generator (service layer)
// ============================================================
// Isolates AI generation logic. Currently uses template fallback.
// Future: swap in OpenAI / Claude API call.

import type { OutreachLead, GeneratedMessage, GenerateMessageInput } from "./types";
import type { ExtractedFeatures } from "./analyzer";
import type { PainHypothesis } from "./pain-hypothesis";

interface AIGeneratorConfig {
  /** OpenAI API key (optional — falls back to template if missing) */
  openaiApiKey?: string;
  /** Model to use (default: gpt-4o-mini) */
  model?: string;
}

/** Extended input with Phase 2 analyzer data */
interface GeneratorContext {
  lead: OutreachLead;
  input: GenerateMessageInput;
  config: AIGeneratorConfig;
  features?: ExtractedFeatures | null;
  hypotheses?: PainHypothesis[] | null;
}

/**
 * Generate an outreach message for a lead.
 * Uses AI when API key is available, otherwise falls back to template.
 * Phase 2: accepts extracted features + pain hypotheses for more targeted messages.
 */
export async function generateOutreachMessage(
  lead: OutreachLead,
  input: GenerateMessageInput,
  config: AIGeneratorConfig,
  features?: ExtractedFeatures | null,
  hypotheses?: PainHypothesis[] | null
): Promise<GeneratedMessage> {
  const ctx: GeneratorContext = { lead, input, config, features, hypotheses };
  if (config.openaiApiKey) {
    return generateWithAI(ctx);
  }
  return generateWithTemplate(ctx);
}

// ── AI-powered generation ──────────────────────────────────────────────────

async function generateWithAI(ctx: GeneratorContext): Promise<GeneratedMessage> {
  const { lead, input, config, features, hypotheses } = ctx;
  const tone = input.tone ?? "friendly";
  const cta = input.cta ?? "無料相談のご案内";
  const channel = input.channel ?? "email";

  // Build pain points context from hypotheses
  const painContext = hypotheses?.length
    ? hypotheses.map((h) => `- [${h.severity}] ${h.label}: ${h.reason}`).join("\n")
    : "不明（サイト未解析）";

  // Build features context
  const featureContext = features
    ? [
        `サイト到達: ${features.hasWebsite ? "OK" : "NG"}`,
        `予約CTA数: ${features.bookingCtaCount}`,
        `メニュー数推定: ${features.menuCountGuess}`,
        `料金表示: ${features.priceInfoFound ? "あり" : "なし"}`,
        `連絡先: ${[features.contactEmailFound ? "Email" : null, features.phoneFound ? "電話" : null].filter(Boolean).join("/") || "なし"}`,
        features.rawSignals?.title ? `タイトル: ${features.rawSignals.title}` : null,
      ].filter(Boolean).join("\n")
    : "（サイト未解析）";

  const systemPrompt = `あなたはB2B営業のプロフェッショナルです。
与えられたリード情報と課題分析から、パーソナライズされた営業メッセージを生成してください。

ルール:
- トーン: ${tone === "formal" ? "丁寧・ビジネス" : tone === "casual" ? "カジュアル・フレンドリー" : "親しみやすいが丁寧"}
- チャネル: ${channel}
- CTA: ${cta}
- 課題仮説の中から最も刺さりそうなものを1-2点選び、本文に自然に織り込むこと
- 内部の推論（reasoningSummary）は送信本文に含めないこと
- 日本語で書くこと
- 短く要点をまとめること（200文字以内の本文）
- 相手のウェブサイトを具体的に見たことが伝わる表現を使うこと

JSON形式で返してください:
{
  "subject": "件名",
  "opener": "冒頭の挨拶（1文）",
  "body": "本文",
  "cta": "CTA文",
  "tone": "${tone}",
  "painPoints": ["課題1", "課題2"],
  "reasoningSummary": "なぜこのアプローチが効果的か（内部メモ）"
}`;

  const userPrompt = `リード情報:
- 店舗名: ${lead.store_name}
- エリア: ${lead.area ?? lead.region ?? "不明"}
- カテゴリ: ${lead.category ?? lead.industry ?? "不明"}
- 評価: ${lead.rating ?? "不明"} (${lead.review_count}件のレビュー)
- ウェブサイト: ${lead.website_url ?? "なし"}
- Instagram: ${lead.instagram_url ? "あり" : "なし"}
- LINE: ${lead.line_url ? "あり" : "なし"}
- メモ: ${lead.notes ?? "なし"}

サイト解析結果:
${featureContext}

特定された課題:
${painContext}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: config.model ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!res.ok) {
      console.error("[ai-generator] OpenAI error:", res.status, await res.text());
      return generateWithTemplate(ctx);
    }

    const data = (await res.json()) as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return generateWithTemplate(ctx);

    const parsed = JSON.parse(content) as GeneratedMessage;
    return {
      subject: parsed.subject || `${lead.store_name}様へのご提案`,
      opener: parsed.opener || "",
      body: parsed.body || "",
      cta: parsed.cta || cta,
      tone: parsed.tone || tone,
      painPoints: Array.isArray(parsed.painPoints) ? parsed.painPoints : [],
      reasoningSummary: parsed.reasoningSummary || "",
    };
  } catch (err) {
    console.error("[ai-generator] AI generation failed, falling back to template:", err);
    return generateWithTemplate(ctx);
  }
}

// ── Template fallback ──────────────────────────────────────────────────────

function generateWithTemplate(ctx: GeneratorContext): GeneratedMessage {
  const { lead, input, hypotheses } = ctx;
  const tone = input.tone ?? "friendly";
  const cta = input.cta ?? "無料相談";
  const storeName = lead.store_name || "御社";
  const area = lead.area ?? lead.region ?? "";
  const category = lead.category ?? lead.industry ?? "";

  // Use pain hypotheses if available, otherwise fall back to basic checks
  let painPoints: string[];
  if (hypotheses?.length) {
    painPoints = hypotheses
      .filter((h) => h.severity === "high" || h.severity === "medium")
      .slice(0, 3)
      .map((h) => h.label);
  } else {
    painPoints = [];
    if (!lead.has_booking_link) painPoints.push("オンライン予約未導入");
    if (!lead.website_url) painPoints.push("ウェブサイト未整備");
    if (!lead.instagram_url) painPoints.push("SNS活用の余地あり");
    if (!lead.line_url) painPoints.push("LINE公式アカウント未活用");
  }

  const subject = `${storeName}様 — ${category || "サービス"}の集客改善のご提案`;

  const opener = tone === "formal"
    ? `${storeName}様\n\n突然のご連絡失礼いたします。`
    : `${storeName}様\n\nはじめまして！`;

  const bodyLines = [
    area ? `${area}エリアで${category || "サービス業"}を運営されている${storeName}様に、` : `${storeName}様に、`,
    `集客・予約管理の効率化についてご提案したくご連絡いたしました。`,
    "",
    painPoints.length > 0
      ? `特に以下の点でお力になれると考えております：\n${painPoints.map((p) => `・${p}`).join("\n")}`
      : "貴店の更なる成長をサポートできると確信しております。",
  ];

  const ctaText = `ぜひ一度、${cta}にてお話しさせていただければ幸いです。`;

  const reasoningSources = hypotheses?.length
    ? `解析済み: ${hypotheses.length}件の課題を特定`
    : `基本チェック`;

  return {
    subject,
    opener,
    body: bodyLines.join("\n"),
    cta: ctaText,
    tone,
    painPoints,
    reasoningSummary: `テンプレート生成: ${storeName} (${area} ${category}) — ${reasoningSources}。`,
  };
}
