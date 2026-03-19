/**
 * Cleaning Estimate Agent (クリーンプロAI)
 *
 * Handles customer inquiries for house cleaning services via LINE/web.
 * Steps: parse_inquiry → qualify_lead → generate_estimate → present_estimate → book_or_followup
 *
 * Triggers: line_message_received, web_inquiry
 * Input payload: { tenantId, userId?, message, channelAccessToken?, replyToken? }
 */

import type { AgentDefinition, AgentDecision, AgentExecutionContext } from "../types";

// ── Cleaning Price Matrix ────────────────────────────────────────────────
// Base prices by cleaning type (JPY)
const CLEANING_TYPES: Record<string, { label: string; basePrice: number; perRoom: number; durationMin: number }> = {
  standard: { label: "通常清掃", basePrice: 15000, perRoom: 3000, durationMin: 120 },
  deep: { label: "ハウスクリーニング（徹底清掃）", basePrice: 25000, perRoom: 5000, durationMin: 240 },
  moveout: { label: "退去時クリーニング", basePrice: 30000, perRoom: 6000, durationMin: 300 },
  kitchen: { label: "キッチン集中清掃", basePrice: 18000, perRoom: 0, durationMin: 150 },
  bathroom: { label: "浴室・水回り清掃", basePrice: 16000, perRoom: 0, durationMin: 120 },
  aircon: { label: "エアコンクリーニング", basePrice: 12000, perRoom: 0, durationMin: 90 },
  office: { label: "オフィス清掃", basePrice: 20000, perRoom: 4000, durationMin: 180 },
};

const OPTIONS: Record<string, { label: string; price: number }> = {
  range_hood: { label: "レンジフード", price: 8000 },
  window: { label: "窓ガラス（1枚）", price: 3000 },
  balcony: { label: "ベランダ", price: 5000 },
  toilet: { label: "トイレ追加", price: 4000 },
  carpet: { label: "カーペット洗浄", price: 6000 },
};

export const cleaningEstimateDefinition: AgentDefinition = {
  type: "cleaning_estimate",
  name: "清掃見積もりAIエージェント",
  description: "ハウスクリーニングの問い合わせを解析し、即時見積もりを生成。予約誘導またはフォローアップまで自動対応。",
  supportedTriggers: ["line_message_received", "web_inquiry"],
  initialStep: "parse_inquiry",

  async runStep(step: string, ctx: AgentExecutionContext): Promise<AgentDecision> {
    switch (step) {
      case "parse_inquiry": return stepParseInquiry(ctx);
      case "qualify_lead": return stepQualifyLead(ctx);
      case "generate_estimate": return stepGenerateEstimate(ctx);
      case "present_estimate": return stepPresentEstimate(ctx);
      case "book_or_followup": return stepBookOrFollowup(ctx);
      default:
        return { nextStep: null, actions: [], done: true, finalStatus: "completed" };
    }
  },
};

// ── Step 1: Parse Inquiry ────────────────────────────────────────────────

async function stepParseInquiry(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const message = String(ctx.triggerPayload.message ?? "").trim();
  if (!message) {
    return {
      nextStep: null, actions: [], done: true, finalStatus: "completed",
      memoryUpdates: { skipped: true, reason: "empty_message" },
    };
  }

  // Use AI Core to parse the inquiry
  const result = await ctx.aiCore.generateJson<{
    cleaningType: string;
    rooms: number | null;
    options: string[];
    urgency: string;
    address: string;
    preferredDate: string;
    additionalInfo: string;
    needsMoreInfo: boolean;
    missingFields: string[];
  }>({
    capability: "json_generation",
    tenantId: ctx.tenantId,
    app: "cleaning",
    feature: "estimate",
    task: "cleaning_estimate",
    promptKey: "cleaning.parse_inquiry.v1",
    variables: { message },
    temperature: 0.2,
    maxOutputTokens: 500,
    traceId: ctx.traceId,
    fallbackEnabled: true,
    fallbackDefault: {
      cleaningType: "standard",
      rooms: null,
      options: [],
      urgency: "normal",
      address: "",
      preferredDate: "",
      additionalInfo: message,
      needsMoreInfo: true,
      missingFields: ["rooms", "cleaningType"],
    },
  });

  const parsed = result.data;

  return {
    nextStep: parsed.needsMoreInfo ? "qualify_lead" : "generate_estimate",
    actions: [],
    done: false,
    memoryUpdates: {
      originalMessage: message,
      cleaningType: parsed.cleaningType,
      rooms: parsed.rooms,
      options: parsed.options,
      urgency: parsed.urgency,
      address: parsed.address,
      preferredDate: parsed.preferredDate,
      additionalInfo: parsed.additionalInfo,
      needsMoreInfo: parsed.needsMoreInfo,
      missingFields: parsed.missingFields,
    },
  };
}

// ── Step 2: Qualify Lead ─────────────────────────────────────────────────

async function stepQualifyLead(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const memory = ctx.state?.memory ?? {};
  const missingFields = (memory.missingFields as string[]) ?? [];

  // Generate qualification questions via AI
  const result = await ctx.aiCore.generateText({
    capability: "text_generation",
    tenantId: ctx.tenantId,
    app: "cleaning",
    feature: "estimate",
    task: "cleaning_estimate",
    promptKey: "cleaning.qualify_lead.v1",
    variables: {
      missingFields: missingFields.join(", "),
      cleaningType: String(memory.cleaningType ?? "不明"),
      originalMessage: String(memory.originalMessage ?? ""),
    },
    temperature: 0.5,
    maxOutputTokens: 300,
    traceId: ctx.traceId,
    fallbackEnabled: true,
  });

  const qualifyText = result.text || buildDefaultQualifyMessage(missingFields);

  // For now, generate a preliminary estimate with defaults and include questions
  return {
    nextStep: "generate_estimate",
    actions: [],
    done: false,
    memoryUpdates: {
      qualifyText,
      // Set defaults for missing info so estimate can proceed
      rooms: memory.rooms ?? 2,
      cleaningType: memory.cleaningType ?? "standard",
    },
  };
}

// ── Step 3: Generate Estimate ────────────────────────────────────────────

async function stepGenerateEstimate(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const memory = ctx.state?.memory ?? {};
  const cleaningType = String(memory.cleaningType ?? "standard");
  const rooms = Number(memory.rooms ?? 2);
  const options = (memory.options as string[]) ?? [];

  // Calculate price
  const typeConfig = CLEANING_TYPES[cleaningType] ?? CLEANING_TYPES.standard;
  let totalPrice = typeConfig.basePrice + (typeConfig.perRoom * Math.max(0, rooms - 1));
  const optionDetails: { label: string; price: number }[] = [];

  for (const opt of options) {
    const optConfig = OPTIONS[opt];
    if (optConfig) {
      totalPrice += optConfig.price;
      optionDetails.push(optConfig);
    }
  }

  const estimatedDuration = typeConfig.durationMin + (options.length * 30);

  // Format estimate
  const estimateBreakdown = [
    `【お見積もり】`,
    ``,
    `■ ${typeConfig.label}`,
    `  基本料金: ¥${typeConfig.basePrice.toLocaleString()}`,
    rooms > 1 ? `  追加部屋(${rooms - 1}部屋): ¥${(typeConfig.perRoom * (rooms - 1)).toLocaleString()}` : null,
    ...optionDetails.map(o => `  ${o.label}: ¥${o.price.toLocaleString()}`),
    ``,
    `━━━━━━━━━━━━`,
    `合計（税込）: ¥${Math.round(totalPrice * 1.1).toLocaleString()}`,
    `所要時間目安: 約${Math.round(estimatedDuration / 60 * 10) / 10}時間`,
    ``,
    `※ 現地確認後に正式なお見積もりをご提示します`,
    `※ 汚れの状態により追加費用が発生する場合があります`,
  ].filter(Boolean).join("\n");

  return {
    nextStep: "present_estimate",
    actions: [],
    done: false,
    memoryUpdates: {
      estimateBreakdown,
      totalPrice: Math.round(totalPrice * 1.1),
      estimatedDurationMin: estimatedDuration,
      typeLabel: typeConfig.label,
    },
  };
}

// ── Step 4: Present Estimate ─────────────────────────────────────────────

async function stepPresentEstimate(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const memory = ctx.state?.memory ?? {};
  const estimateBreakdown = String(memory.estimateBreakdown ?? "");
  const qualifyText = memory.qualifyText as string | undefined;

  // Generate polite presentation message via AI
  const result = await ctx.aiCore.generateText({
    capability: "text_generation",
    tenantId: ctx.tenantId,
    app: "cleaning",
    feature: "estimate",
    task: "cleaning_estimate",
    promptKey: "cleaning.present_estimate.v1",
    variables: {
      estimateBreakdown,
      qualifyText: qualifyText ?? "",
      cleaningType: String(memory.typeLabel ?? "清掃"),
      needsMoreInfo: String(memory.needsMoreInfo ?? false),
    },
    temperature: 0.6,
    maxOutputTokens: 500,
    traceId: ctx.traceId,
    fallbackEnabled: true,
  });

  const responseText = result.text || `お問い合わせありがとうございます！\n\n${estimateBreakdown}\n\nご予約・ご質問はお気軽にどうぞ！`;

  // Build actions based on available LINE credentials
  const channelAccessToken = ctx.triggerPayload.channelAccessToken as string | undefined;
  const userId = ctx.triggerPayload.userId as string | undefined;
  const actions = [];

  if (channelAccessToken && userId) {
    actions.push({
      type: "send_line_message" as const,
      params: {
        channelAccessToken,
        userId,
        message: responseText,
        dedup: `cleaning_estimate:${ctx.traceId}`,
      },
    });
  }

  return {
    nextStep: "book_or_followup",
    actions,
    done: false,
    memoryUpdates: {
      responseText,
      estimateSent: true,
      sentAt: new Date().toISOString(),
    },
  };
}

// ── Step 5: Book or Followup ─────────────────────────────────────────────

async function stepBookOrFollowup(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const memory = ctx.state?.memory ?? {};
  const urgency = String(memory.urgency ?? "normal");

  // If urgent, complete immediately (human should follow up quickly)
  if (urgency === "urgent") {
    return {
      nextStep: null, actions: [], done: true, finalStatus: "completed",
      memoryUpdates: { finalAction: "urgent_handoff", handoffReason: "urgent_inquiry" },
    };
  }

  // Schedule a followup in 24 hours if not booked
  const scheduleAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return {
    nextStep: "qualify_lead",
    actions: [],
    done: true,
    finalStatus: "waiting",
    scheduleAt,
    memoryUpdates: {
      finalAction: "followup_scheduled",
      followupAttempt: ((memory.followupAttempt as number) ?? 0) + 1,
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function buildDefaultQualifyMessage(missingFields: string[]): string {
  const questions: string[] = [];
  if (missingFields.includes("rooms")) questions.push("お部屋の間取り（例: 1LDK, 3LDK）を教えていただけますか？");
  if (missingFields.includes("cleaningType")) questions.push("ご希望の清掃内容を教えてください（通常清掃 / ハウスクリーニング / 退去時 / エアコン / 水回り）");
  if (missingFields.includes("address")) questions.push("ご住所（市区町村まで）を教えていただけますか？");
  if (missingFields.includes("preferredDate")) questions.push("ご希望の日時はございますか？");
  return questions.length > 0
    ? `お問い合わせありがとうございます！\nお見積もりのために、以下を教えていただけますか？\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
    : "お問い合わせありがとうございます！詳細をお聞かせください。";
}
