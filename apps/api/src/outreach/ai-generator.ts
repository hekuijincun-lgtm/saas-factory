// Outreach OS — AI Message Generator (service layer + AI Core)
// ============================================================
// Isolates AI generation logic. Uses AI Core when available, template fallback otherwise.
// Phase 6: accepts LearningContext for winning pattern injection.
// AI Core: Migrated from direct OpenAI calls to AI Core unified interface.

import type { OutreachLead, GeneratedMessage, GenerateMessageInput } from "./types";
import type { ExtractedFeatures } from "./analyzer";
import type { PainHypothesis } from "./pain-hypothesis";
import type { LearningContext } from "./learning";
import type { AICore } from "../ai";

interface AIGeneratorConfig {
  /** OpenAI API key (optional — falls back to template if missing) */
  openaiApiKey?: string;
  /** Model to use (default: gpt-4o-mini) */
  model?: string;
  /** AI Core instance (preferred over direct API key) */
  aiCore?: AICore;
  /** Tenant ID for AI Core routing */
  tenantId?: string;
}

/** Extended input with Phase 2 analyzer data + Phase 6 learning context */
interface GeneratorContext {
  lead: OutreachLead;
  input: GenerateMessageInput;
  config: AIGeneratorConfig;
  features?: ExtractedFeatures | null;
  hypotheses?: PainHypothesis[] | null;
  learning?: LearningContext | null;
}

/**
 * Generate an outreach message for a lead.
 * Uses AI Core when available, direct OpenAI when API key provided, otherwise template.
 */
export async function generateOutreachMessage(
  lead: OutreachLead,
  input: GenerateMessageInput,
  config: AIGeneratorConfig,
  features?: ExtractedFeatures | null,
  hypotheses?: PainHypothesis[] | null,
  learning?: LearningContext | null
): Promise<GeneratedMessage> {
  const ctx: GeneratorContext = { lead, input, config, features, hypotheses, learning };

  // Prefer AI Core path
  if (config.aiCore) {
    try {
      return await generateWithAICore(ctx);
    } catch (err) {
      console.error("[ai-generator] AI Core failed, trying legacy:", err);
    }
  }

  // Legacy direct OpenAI path
  if (config.openaiApiKey) {
    try {
      return await generateWithAILegacy(ctx);
    } catch (err) {
      console.error("[ai-generator] Legacy AI failed, falling back to template:", err);
    }
  }

  return generateWithTemplate(ctx);
}

// ── Learning context formatter ──────────────────────────────────────────

function formatLearningContext(learning: LearningContext | null | undefined): string {
  if (!learning) return "";
  const lines: string[] = [];

  if (learning.topTone) {
    lines.push(
      `- 最も効果的なトーン: 「${learning.topTone.key}」(返信率${learning.topTone.replyRate}%, n=${learning.topTone.sampleSize})`
    );
  }
  if (learning.topHypothesis) {
    lines.push(
      `- 最も刺さる課題: 「${learning.topHypothesis.label}」(返信率${learning.topHypothesis.replyRate}%, n=${learning.topHypothesis.sampleSize})`
    );
  }
  if (learning.topCta) {
    lines.push(
      `- 最も効果的なバリアント: 「${learning.topCta.key}」(返信率${learning.topCta.replyRate}%, n=${learning.topCta.sampleSize})`
    );
  }

  return lines.length > 0
    ? `\n過去の営業活動から学習した勝ちパターン:\n${lines.join("\n")}\nこれらの傾向を参考にしてください（ただし個別リードの特性を最優先すること）。`
    : "";
}

// ── Build prompt variables ──────────────────────────────────────────────

function buildPromptVars(ctx: GeneratorContext): Record<string, string> {
  const { lead, input, features, hypotheses, learning } = ctx;
  const tone = input.tone ?? "friendly";
  const cta = input.cta ?? "無料相談のご案内";
  const channel = input.channel ?? "email";

  const toneMap: Record<string, string> = {
    formal: "丁寧・ビジネス",
    casual: "カジュアル・フレンドリー",
    friendly: "親しみやすいが丁寧",
  };

  const painContext = hypotheses?.length
    ? hypotheses.map((h) => `- [${h.severity}] ${h.label}: ${h.reason}`).join("\n")
    : "不明（サイト未解析）";

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

  return {
    toneInstruction: toneMap[tone] ?? toneMap.friendly,
    tone,
    channel,
    cta,
    learningContext: formatLearningContext(learning),
    storeName: lead.store_name,
    area: lead.area ?? lead.region ?? "不明",
    category: lead.category ?? lead.industry ?? "不明",
    rating: String(lead.rating ?? "不明"),
    reviewCount: String(lead.review_count ?? 0),
    websiteUrl: lead.website_url ?? "なし",
    instagramUrl: lead.instagram_url ? "あり" : "なし",
    lineUrl: lead.line_url ? "あり" : "なし",
    notes: lead.notes ?? "なし",
    featureContext,
    painContext,
  };
}

// ── AI Core generation ──────────────────────────────────────────────────

async function generateWithAICore(ctx: GeneratorContext): Promise<GeneratedMessage> {
  const { config, input } = ctx;
  const aiCore = config.aiCore!;
  const tone = input.tone ?? "friendly";
  const cta = input.cta ?? "無料相談のご案内";

  const vars = buildPromptVars(ctx);

  const result = await aiCore.generateJson<GeneratedMessage>({
    capability: "json_generation",
    tenantId: config.tenantId ?? "default",
    app: "outreach",
    feature: "first_message",
    task: "sales_message_generation",
    promptKey: "outreach.first_message.v1",
    variables: vars,
    temperature: 0.7,
    maxOutputTokens: 1000,
    fallbackDefault: generateWithTemplate(ctx),
  });

  const parsed = result.data;
  return {
    subject: parsed.subject || `${ctx.lead.store_name}様へのご提案`,
    opener: parsed.opener || "",
    body: parsed.body || "",
    cta: parsed.cta || cta,
    tone: parsed.tone || tone,
    painPoints: Array.isArray(parsed.painPoints) ? parsed.painPoints : [],
    reasoningSummary: parsed.reasoningSummary || "",
  };
}

// ── Legacy AI-powered generation ────────────────────────────────────────

async function generateWithAILegacy(ctx: GeneratorContext): Promise<GeneratedMessage> {
  const { lead, input, config, features, hypotheses, learning } = ctx;
  const tone = input.tone ?? "friendly";
  const cta = input.cta ?? "無料相談のご案内";
  const channel = input.channel ?? "email";

  const painContext = hypotheses?.length
    ? hypotheses.map((h) => `- [${h.severity}] ${h.label}: ${h.reason}`).join("\n")
    : "不明（サイト未解析）";

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

  const learningContext = formatLearningContext(learning);

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
${learningContext}

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
  const { lead, input, hypotheses, learning } = ctx;
  const tone = input.tone ?? (learning?.topTone?.key as any) ?? "friendly";
  const cta = input.cta ?? "無料相談";
  const storeName = lead.store_name || "御社";
  const area = lead.area ?? lead.region ?? "";
  const category = lead.category ?? lead.industry ?? "";

  let painPoints: string[];
  if (hypotheses?.length) {
    const winningCode = learning?.topHypothesis?.key;
    const sorted = winningCode
      ? [...hypotheses].sort((a, b) => (a.code === winningCode ? -1 : b.code === winningCode ? 1 : 0))
      : hypotheses;
    painPoints = sorted
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

  const learningNote = learning?.topTone
    ? ` / 勝ちトーン: ${learning.topTone.key}(${learning.topTone.replyRate}%)`
    : "";
  const reasoningSources = hypotheses?.length
    ? `解析済み: ${hypotheses.length}件の課題を特定${learningNote}`
    : `基本チェック${learningNote}`;

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
