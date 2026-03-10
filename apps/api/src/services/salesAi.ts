/**
 * Sales AI Service — OpenAI Responses API を使った営業AI機能
 *
 * analyzeLead: リードのAI採点・分析
 * generateDrafts: 営業文ドラフト生成
 * classifyReply: 返信分類
 */

const SALES_AI_MODEL = "gpt-4o";
const MAX_OUTPUT_TOKENS = 2000;

// ── Industry-specific context ───────────────────────────────────────────────
const INDUSTRY_CONTEXT: Record<string, string> = {
  eyebrow: "眉毛サロン向け。LINE公式アカウント連携による予約導線の最適化、予約取りこぼし防止、無料眉毛診断による初回来店訴求が有効。Instagram経由の集客も多い業界。",
  hair: "美容室・ヘアサロン向け。予約導線の簡略化、リピート来店促進（次回予約促進）、指名予約の管理が重要。LINE予約との連携が効果的。",
  nail: "ネイルサロン向け。Instagram経由の集客が主力。デザインギャラリー表示、指名予約、リピート管理が重要。LINE公式アカウントでのデザイン相談も有効。",
  esthetic: "エステサロン向け。カウンセリング予約の導線が重要。初回割引・体験コースの訴求、LINE経由での予約リマインド、リピート促進が効果的。",
  dental: "歯科医院向け。予約管理の効率化、リマインド通知による無断キャンセル防止、定期検診の促進が重要。LINE予約連携で電話対応削減が訴求ポイント。",
  shared: "サービス業全般向け。予約管理の効率化、顧客管理、LINE公式アカウント連携による集客・リピート促進が主な価値提案。業種に合わせたカスタマイズ提案が有効。",
};

// ── Types ───────────────────────────────────────────────────────────────────

export interface LeadAnalysisInput {
  storeName: string;
  industry: string;
  websiteUrl?: string;
  instagramUrl?: string;
  lineUrl?: string;
  region?: string;
  notes?: string;
}

export interface LeadAnalysisResult {
  score: number;
  painPoints: string[];
  bestOffer: string;
  recommendedChannel: string;
  nextAction: string;
  aiSummary: string;
}

export interface DraftGenerationInput {
  storeName: string;
  industry: string;
  websiteUrl?: string;
  instagramUrl?: string;
  region?: string;
  painPoints?: string[];
  bestOffer?: string;
  notes?: string;
}

export interface GeneratedDrafts {
  email: { subject: string; body: string };
  lineInitial: { body: string };
  lineFollowup: { body: string };
}

export interface ReplyClassificationInput {
  storeName: string;
  industry: string;
  rawReply: string;
  previousContext?: string;
}

export interface ReplyClassificationResult {
  label: string;
  confidence: number;
  suggestedNextAction: string;
}

// ── JSON Schemas for structured output ──────────────────────────────────────

const ANALYSIS_SCHEMA = {
  type: "json_schema" as const,
  name: "lead_analysis",
  strict: true,
  schema: {
    type: "object",
    properties: {
      score: { type: "number", description: "Lead score 0-100" },
      painPoints: { type: "array", items: { type: "string" }, description: "Identified pain points" },
      bestOffer: { type: "string", description: "Best offer/approach for this lead" },
      recommendedChannel: { type: "string", description: "Recommended outreach channel" },
      nextAction: { type: "string", description: "Suggested next action" },
      aiSummary: { type: "string", description: "Brief AI summary of this lead" },
    },
    required: ["score", "painPoints", "bestOffer", "recommendedChannel", "nextAction", "aiSummary"],
    additionalProperties: false,
  },
};

const DRAFTS_SCHEMA = {
  type: "json_schema" as const,
  name: "message_drafts",
  strict: true,
  schema: {
    type: "object",
    properties: {
      email: {
        type: "object",
        properties: {
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["subject", "body"],
        additionalProperties: false,
      },
      lineInitial: {
        type: "object",
        properties: {
          body: { type: "string" },
        },
        required: ["body"],
        additionalProperties: false,
      },
      lineFollowup: {
        type: "object",
        properties: {
          body: { type: "string" },
        },
        required: ["body"],
        additionalProperties: false,
      },
    },
    required: ["email", "lineInitial", "lineFollowup"],
    additionalProperties: false,
  },
};

const CLASSIFICATION_SCHEMA = {
  type: "json_schema" as const,
  name: "reply_classification",
  strict: true,
  schema: {
    type: "object",
    properties: {
      label: { type: "string", description: "Classification label: interested / not_interested / needs_info / meeting_request / price_inquiry / already_using / wrong_person / auto_reply" },
      confidence: { type: "number", description: "Confidence 0.0-1.0" },
      suggestedNextAction: { type: "string", description: "Suggested next action based on classification" },
    },
    required: ["label", "confidence", "suggestedNextAction"],
    additionalProperties: false,
  },
};

// ── Helper ──────────────────────────────────────────────────────────────────

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  schema: any,
  model?: string,
): Promise<any> {
  const payload = {
    model: model || SALES_AI_MODEL,
    store: false,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    text: { format: schema },
  };

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const err = await r.json().catch(() => null);
    throw new Error(`OpenAI API error: ${r.status} ${err?.error?.message ?? ""}`);
  }

  const res: any = await r.json();

  // Extract text from Responses API output
  let text = "";
  if (typeof res.output_text === "string") {
    text = res.output_text;
  } else if (Array.isArray(res.output)) {
    for (const item of res.output) {
      if (Array.isArray(item?.content)) {
        for (const part of item.content) {
          if (typeof part?.text === "string") {
            text = part.text;
            break;
          }
        }
      }
      if (text) break;
    }
  }

  if (!text) throw new Error("Empty response from OpenAI");
  return JSON.parse(text);
}

// ── Public functions ────────────────────────────────────────────────────────

export async function analyzeLead(
  apiKey: string,
  input: LeadAnalysisInput,
  model?: string,
): Promise<LeadAnalysisResult> {
  const ctx = INDUSTRY_CONTEXT[input.industry] || INDUSTRY_CONTEXT.shared;

  const systemPrompt = `あなたはSaaS営業のAIアシスタントです。リード情報を分析し、採点と営業戦略を提案します。

業界コンテキスト: ${ctx}

以下の基準でスコアリングしてください（0-100）:
- ウェブサイトの有無と質（+20）
- Instagram活用度（+15）
- LINE公式アカウントの有無（+15）
- 地域の市場規模（+10）
- 業界のデジタル化ニーズ（+20）
- メモからの追加情報（+20）

painPointsは具体的な課題を3-5個挙げてください。
bestOfferはこのリードに最も響く提案を1つ。
recommendedChannelは email / line / instagram / phone のいずれか。
nextActionは具体的な次のアクション。`;

  const userPrompt = `店舗名: ${input.storeName}
業界: ${input.industry}
ウェブサイト: ${input.websiteUrl || "なし"}
Instagram: ${input.instagramUrl || "なし"}
LINE: ${input.lineUrl || "なし"}
地域: ${input.region || "不明"}
メモ: ${input.notes || "なし"}`;

  return callOpenAI(apiKey, systemPrompt, userPrompt, ANALYSIS_SCHEMA, model);
}

export async function generateDrafts(
  apiKey: string,
  input: DraftGenerationInput,
  model?: string,
): Promise<GeneratedDrafts> {
  const ctx = INDUSTRY_CONTEXT[input.industry] || INDUSTRY_CONTEXT.shared;

  const systemPrompt = `あなたはSaaS営業のAIアシスタントです。リード情報に基づいて営業メッセージのドラフトを3種類生成します。

業界コンテキスト: ${ctx}

生成するドラフト:
1. email: 初回営業メール（件名 + 本文）。丁寧だが端的に。
2. lineInitial: LINE初回メッセージ。カジュアルで短く、200文字以内。
3. lineFollowup: LINEフォローアップ。前回送信後1週間想定。150文字以内。

注意:
- 具体的な課題に言及し、解決策としてのプロダクト紹介を自然に行う
- 押しつけがましくない、相手の状況に寄り添うトーン
- CTAは1つに絞る（デモ予約、資料送付、無料相談など）`;

  const painPointsStr = input.painPoints?.length
    ? input.painPoints.join(", ")
    : "未分析";

  const userPrompt = `店舗名: ${input.storeName}
業界: ${input.industry}
ウェブサイト: ${input.websiteUrl || "なし"}
Instagram: ${input.instagramUrl || "なし"}
地域: ${input.region || "不明"}
課題: ${painPointsStr}
最適な提案: ${input.bestOffer || "未分析"}
メモ: ${input.notes || "なし"}`;

  return callOpenAI(apiKey, systemPrompt, userPrompt, DRAFTS_SCHEMA, model);
}

export async function classifyReply(
  apiKey: string,
  input: ReplyClassificationInput,
  model?: string,
): Promise<ReplyClassificationResult> {
  const ctx = INDUSTRY_CONTEXT[input.industry] || INDUSTRY_CONTEXT.shared;

  const systemPrompt = `あなたはSaaS営業のAIアシスタントです。営業メッセージへの返信を分類します。

業界コンテキスト: ${ctx}

分類ラベル:
- interested: 興味あり・前向き
- not_interested: 興味なし・断り
- needs_info: 追加情報を求めている
- meeting_request: 打ち合わせ・デモを希望
- price_inquiry: 料金について質問
- already_using: 競合サービスを利用中
- wrong_person: 担当者が違う
- auto_reply: 自動返信・不在通知

confidenceは0.0-1.0で返してください。
suggestedNextActionは分類に基づく具体的な次のアクション。`;

  const userPrompt = `店舗名: ${input.storeName}
業界: ${input.industry}
${input.previousContext ? `前回の営業コンテキスト: ${input.previousContext}` : ""}
返信内容:
${input.rawReply}`;

  return callOpenAI(apiKey, systemPrompt, userPrompt, CLASSIFICATION_SCHEMA, model);
}
