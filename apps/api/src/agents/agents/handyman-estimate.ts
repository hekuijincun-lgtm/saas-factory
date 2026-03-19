/**
 * Handyman Estimate Agent (ベンリプロAI)
 *
 * Handles customer inquiries for handyman/便利屋 services.
 * Steps: parse_request → estimate → present → followup
 *
 * Triggers: line_message_received, web_inquiry
 */

import type { AgentDefinition, AgentDecision, AgentExecutionContext } from "../types";

// ── Service Category Price Matrix ────────────────────────────────────────
const CATEGORIES: Record<string, {
  label: string;
  basePrice: number;
  unit: string;
  durationMin: number;
  description: string;
}> = {
  furniture_assembly: { label: "家具組み立て", basePrice: 5000, unit: "1点", durationMin: 60, description: "IKEA・ニトリ等の家具組み立て" },
  furniture_move: { label: "家具移動", basePrice: 6000, unit: "1点", durationMin: 30, description: "室内の家具移動・配置換え" },
  hanging: { label: "取付・設置作業", basePrice: 5000, unit: "1箇所", durationMin: 30, description: "棚・カーテンレール・照明・TV壁掛け等" },
  water_trouble: { label: "水回りトラブル", basePrice: 8000, unit: "1件", durationMin: 60, description: "蛇口修理・排水つまり・トイレ修理" },
  electrical: { label: "電気工事・修理", basePrice: 8000, unit: "1件", durationMin: 60, description: "コンセント増設・照明交換・配線" },
  cleaning: { label: "清掃・片付け", basePrice: 10000, unit: "1時間〜", durationMin: 120, description: "部屋の片付け・ゴミ屋敷・遺品整理" },
  garden: { label: "庭木・草刈り", basePrice: 8000, unit: "1時間〜", durationMin: 120, description: "草刈り・剪定・除草" },
  painting: { label: "塗装・補修", basePrice: 10000, unit: "1箇所〜", durationMin: 120, description: "壁穴補修・ペンキ塗り・フローリング補修" },
  pest: { label: "害虫・害獣駆除", basePrice: 15000, unit: "1件", durationMin: 120, description: "ゴキブリ・ネズミ・ハチの巣" },
  key: { label: "鍵トラブル", basePrice: 8000, unit: "1件", durationMin: 30, description: "鍵開け・鍵交換・ドアノブ修理" },
  moving_help: { label: "引越し手伝い", basePrice: 10000, unit: "1時間〜", durationMin: 180, description: "小規模引越し・荷物搬入搬出" },
  errands: { label: "代行・お手伝い", basePrice: 5000, unit: "1時間〜", durationMin: 60, description: "買い物代行・並び代行・各種代行" },
  other: { label: "その他", basePrice: 5000, unit: "1時間〜", durationMin: 60, description: "上記に当てはまらない作業" },
};

const OPTIONS: Record<string, { label: string; price: number }> = {
  urgent: { label: "緊急対応（当日・翌日）", price: 5000 },
  night: { label: "夜間対応（18時以降）", price: 3000 },
  weekend: { label: "土日祝対応", price: 2000 },
  disposal: { label: "廃棄物処分", price: 3000 },
  materials: { label: "材料費込み", price: 0 }, // estimated separately
};

export const handymanEstimateDefinition: AgentDefinition = {
  type: "handyman_estimate",
  name: "便利屋見積もりAIエージェント",
  description: "便利屋への問い合わせをAIで解析し、カテゴリ分類→即時見積もり→LINE/Web返信を自動対応",
  supportedTriggers: ["line_message_received", "web_inquiry"],
  initialStep: "parse_request",

  async runStep(step: string, ctx: AgentExecutionContext): Promise<AgentDecision> {
    switch (step) {
      case "parse_request": return stepParseRequest(ctx);
      case "estimate": return stepEstimate(ctx);
      case "present": return stepPresent(ctx);
      case "followup": return stepFollowup(ctx);
      default:
        return { nextStep: null, actions: [], done: true, finalStatus: "completed" };
    }
  },
};

// ── Steps ────────────────────────────────────────────────────────────────

async function stepParseRequest(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const message = String(ctx.triggerPayload.message ?? "").trim();
  if (!message) {
    return {
      nextStep: null, actions: [], done: true, finalStatus: "completed",
      memoryUpdates: { skipped: true, reason: "empty_message" },
    };
  }

  const validCategories = Object.keys(CATEGORIES).join(", ");

  const result = await ctx.aiCore.generateJson<{
    category: string;
    quantity: number;
    urgency: string;
    description: string;
    location: string;
    preferredDate: string;
    options: string[];
    confidence: number;
  }>({
    capability: "json_generation",
    tenantId: ctx.tenantId,
    app: "handyman",
    feature: "estimate",
    task: "handyman_estimate",
    promptKey: "handyman.parse_request.v1",
    variables: { message, validCategories },
    temperature: 0.2,
    maxOutputTokens: 400,
    traceId: ctx.traceId,
    fallbackEnabled: true,
    fallbackDefault: {
      category: "other",
      quantity: 1,
      urgency: "normal",
      description: message,
      location: "",
      preferredDate: "",
      options: [],
      confidence: 0.3,
    },
  });

  return {
    nextStep: "estimate",
    actions: [],
    done: false,
    memoryUpdates: {
      originalMessage: message,
      ...result.data,
    },
  };
}

async function stepEstimate(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const m = ctx.state?.memory ?? {};
  const category = String(m.category ?? "other");
  const quantity = Math.max(1, Number(m.quantity ?? 1));
  const options = (m.options as string[]) ?? [];
  const urgency = String(m.urgency ?? "normal");

  const cat = CATEGORIES[category] ?? CATEGORIES.other;
  let total = cat.basePrice * quantity;
  const optDetails: { label: string; price: number }[] = [];

  // Add urgency surcharge
  if (urgency === "urgent" && !options.includes("urgent")) {
    options.push("urgent");
  }

  for (const opt of options) {
    const o = OPTIONS[opt];
    if (o && o.price > 0) {
      total += o.price;
      optDetails.push(o);
    }
  }

  const taxIncluded = Math.round(total * 1.1);
  const durationEst = cat.durationMin * quantity;

  const breakdown = [
    `【概算お見積もり】`,
    ``,
    `■ ${cat.label}`,
    `  ${cat.description}`,
    `  基本料金: ¥${cat.basePrice.toLocaleString()} × ${quantity}${cat.unit} = ¥${(cat.basePrice * quantity).toLocaleString()}`,
    ...optDetails.map(o => `  ${o.label}: +¥${o.price.toLocaleString()}`),
    ``,
    `━━━━━━━━━━━━`,
    `合計（税込）: ¥${taxIncluded.toLocaleString()}`,
    `作業時間目安: 約${durationEst >= 60 ? `${Math.round(durationEst / 60 * 10) / 10}時間` : `${durationEst}分`}`,
    ``,
    `※ 現地状況により変動する場合があります`,
    `※ 出張費は地域により別途かかる場合があります`,
  ].join("\n");

  return {
    nextStep: "present",
    actions: [],
    done: false,
    memoryUpdates: {
      estimateBreakdown: breakdown,
      totalPrice: taxIncluded,
      estimatedDurationMin: durationEst,
      categoryLabel: cat.label,
    },
  };
}

async function stepPresent(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const m = ctx.state?.memory ?? {};

  const result = await ctx.aiCore.generateText({
    capability: "text_generation",
    tenantId: ctx.tenantId,
    app: "handyman",
    feature: "estimate",
    task: "handyman_estimate",
    promptKey: "handyman.present_estimate.v1",
    variables: {
      estimateBreakdown: String(m.estimateBreakdown ?? ""),
      category: String(m.categoryLabel ?? "作業"),
      originalMessage: String(m.originalMessage ?? ""),
      urgency: String(m.urgency ?? "normal"),
    },
    temperature: 0.6,
    maxOutputTokens: 400,
    traceId: ctx.traceId,
    fallbackEnabled: true,
  });

  const responseText = result.text || `お問い合わせありがとうございます！\n\n${m.estimateBreakdown}\n\nお気軽にご連絡ください！`;

  const actions = [];
  const token = ctx.triggerPayload.channelAccessToken as string | undefined;
  const userId = ctx.triggerPayload.userId as string | undefined;

  if (token && userId) {
    actions.push({
      type: "send_line_message" as const,
      params: { channelAccessToken: token, userId, message: responseText, dedup: `handyman:${ctx.traceId}` },
    });
  }

  return {
    nextStep: "followup",
    actions,
    done: false,
    memoryUpdates: { responseText, estimateSent: true, sentAt: new Date().toISOString() },
  };
}

async function stepFollowup(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const urgency = String(ctx.state?.memory?.urgency ?? "normal");
  if (urgency === "urgent") {
    return { nextStep: null, actions: [], done: true, finalStatus: "completed", memoryUpdates: { finalAction: "urgent_complete" } };
  }

  return {
    nextStep: "parse_request",
    actions: [],
    done: true,
    finalStatus: "waiting",
    scheduleAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    memoryUpdates: { finalAction: "followup_scheduled", followupAttempt: ((ctx.state?.memory?.followupAttempt as number) ?? 0) + 1 },
  };
}
