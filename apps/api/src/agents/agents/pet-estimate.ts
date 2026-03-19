/**
 * Pet Salon / Grooming Estimate Agent (ペットサロンAI)
 *
 * Handles customer inquiries for pet grooming services via LINE/web.
 * Steps: parse → estimate → present → followup
 *
 * Triggers: line_message_received, web_inquiry
 * Input payload: { tenantId, userId?, message, channelAccessToken?, replyToken? }
 */

import type { AgentDefinition, AgentDecision, AgentExecutionContext } from "../types";

// ── Pet Grooming Price Matrix ───────────────────────────────────────────
const GROOMING_SERVICES: Record<string, {
  label: string;
  prices: Record<string, number>;
  unit: string;
  durationMin: number;
  description: string;
}> = {
  trimming: {
    label: "トリミング（シャンプー+カット）",
    prices: { small: 4000, medium: 6000, large: 8000 },
    unit: "1頭",
    durationMin: 60,
    description: "シャンプー・カット・ブロー・爪切り・耳掃除・肛門腺絞り込み",
  },
  shampoo_course: {
    label: "シャンプーコース",
    prices: { small: 3000, medium: 4500, large: 6000 },
    unit: "1頭",
    durationMin: 45,
    description: "シャンプー・ブロー・爪切り・耳掃除・肛門腺絞り",
  },
  partial_cut: {
    label: "部分カット",
    prices: { min: 1500, max: 3000 },
    unit: "1箇所",
    durationMin: 20,
    description: "顔周り・足回り・お尻周りなどの部分カット",
  },
  nail_ear: {
    label: "爪切り・耳掃除",
    prices: { min: 500, max: 1000 },
    unit: "1頭",
    durationMin: 15,
    description: "爪切りと耳掃除の単品メニュー",
  },
  teeth_brushing: {
    label: "歯磨き",
    prices: { fixed: 1000 },
    unit: "1頭",
    durationMin: 10,
    description: "歯石予防のための歯磨きケア",
  },
  dental_care_set: {
    label: "デンタルケアセット",
    prices: { fixed: 2000 },
    unit: "1頭",
    durationMin: 20,
    description: "歯磨き＋口臭ケア＋歯石チェック",
  },
  matting: {
    label: "毛玉取り",
    prices: { per_spot: 500 },
    unit: "1箇所",
    durationMin: 10,
    description: "毛玉の解きほぐし・カット（1箇所あたり）",
  },
  medicated_bath: {
    label: "薬浴",
    prices: { addon: 2000 },
    unit: "追加",
    durationMin: 15,
    description: "皮膚トラブルに対応した薬用シャンプー浴",
  },
  micro_bubble: {
    label: "マイクロバブル",
    prices: { addon: 1500 },
    unit: "追加",
    durationMin: 15,
    description: "毛穴の奥まで洗浄するマイクロバブルバス",
  },
};

const OPTIONS: Record<string, { label: string; price: number }> = {
  designated_groomer: { label: "指名料", price: 500 },
  pickup: { label: "送迎", price: 1000 },
  photo: { label: "写真撮影", price: 500 },
};

// Pet size label mapping
const SIZE_LABELS: Record<string, string> = {
  small: "小型犬",
  medium: "中型犬",
  large: "大型犬",
};

export const petEstimateDefinition: AgentDefinition = {
  type: "pet_estimate",
  name: "ペットサロン見積もりAIエージェント",
  description: "ペットサロン・トリミングの問い合わせをAIで解析し、サービス分類→即時見積もり→LINE/Web返信を自動対応",
  supportedTriggers: ["line_message_received", "web_inquiry"],
  initialStep: "parse",

  async runStep(step: string, ctx: AgentExecutionContext): Promise<AgentDecision> {
    switch (step) {
      case "parse": return stepParse(ctx);
      case "estimate": return stepEstimate(ctx);
      case "present": return stepPresent(ctx);
      case "followup": return stepFollowup(ctx);
      default:
        return { nextStep: null, actions: [], done: true, finalStatus: "completed" };
    }
  },
};

// ── Step 1: Parse ────────────────────────────────────────────────────────

async function stepParse(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const message = String(ctx.triggerPayload.message ?? "").trim();
  if (!message) {
    return {
      nextStep: null, actions: [], done: true, finalStatus: "completed",
      memoryUpdates: { skipped: true, reason: "empty_message" },
    };
  }

  const validServices = Object.keys(GROOMING_SERVICES).join(", ");

  const result = await ctx.aiCore.generateJson<{
    service: string;
    petSize: string;
    petType: string;
    petBreed: string;
    mattingSpots: number;
    options: string[];
    urgency: string;
    additionalInfo: string;
    preferredDate: string;
    confidence: number;
  }>({
    capability: "json_generation",
    tenantId: ctx.tenantId,
    app: "pet",
    feature: "estimate",
    task: "pet_estimate",
    promptKey: "pet-estimate:parse",
    variables: { message, validServices },
    temperature: 0.2,
    maxOutputTokens: 500,
    traceId: ctx.traceId,
    fallbackEnabled: true,
    fallbackDefault: {
      service: "trimming",
      petSize: "small",
      petType: "dog",
      petBreed: "",
      mattingSpots: 0,
      options: [],
      urgency: "normal",
      additionalInfo: message,
      preferredDate: "",
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

// ── Step 2: Estimate ─────────────────────────────────────────────────────

async function stepEstimate(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const m = ctx.state?.memory ?? {};
  const service = String(m.service ?? "trimming");
  const petSize = String(m.petSize ?? "small");
  const mattingSpots = Math.max(0, Number(m.mattingSpots ?? 0));
  const options = (m.options as string[]) ?? [];

  const svc = GROOMING_SERVICES[service] ?? GROOMING_SERVICES.trimming;
  let total = 0;
  let priceLabel = "";

  // Calculate base price
  if (svc.prices.small !== undefined && svc.prices[petSize] !== undefined) {
    // Size-based pricing
    total = svc.prices[petSize];
    priceLabel = `${SIZE_LABELS[petSize] ?? petSize}: ¥${total.toLocaleString()}`;
  } else if (svc.prices.fixed !== undefined) {
    total = svc.prices.fixed;
    priceLabel = `¥${total.toLocaleString()}`;
  } else if (svc.prices.min !== undefined && svc.prices.max !== undefined) {
    total = Math.round((svc.prices.min + svc.prices.max) / 2);
    priceLabel = `¥${svc.prices.min.toLocaleString()}〜¥${svc.prices.max.toLocaleString()}（目安: ¥${total.toLocaleString()}）`;
  } else if (svc.prices.addon !== undefined) {
    total = svc.prices.addon;
    priceLabel = `+¥${total.toLocaleString()}`;
  } else if (svc.prices.per_spot !== undefined) {
    total = svc.prices.per_spot * Math.max(1, mattingSpots);
    priceLabel = `¥${svc.prices.per_spot.toLocaleString()} × ${Math.max(1, mattingSpots)}箇所 = ¥${total.toLocaleString()}`;
  }

  // Add options
  const optDetails: { label: string; price: number }[] = [];
  for (const opt of options) {
    const o = OPTIONS[opt];
    if (o) {
      total += o.price;
      optDetails.push(o);
    }
  }

  const taxIncluded = Math.round(total * 1.1);
  const durationEst = svc.durationMin + (optDetails.length * 5);

  const breakdown = [
    `【概算お見積もり】`,
    ``,
    `■ ${svc.label}`,
    `  ${svc.description}`,
    `  ${priceLabel}`,
    ...optDetails.map(o => `  ${o.label}: +¥${o.price.toLocaleString()}`),
    ``,
    `━━━━━━━━━━━━`,
    `合計（税込）: ¥${taxIncluded.toLocaleString()}`,
    `所要時間目安: 約${durationEst >= 60 ? `${Math.round(durationEst / 60 * 10) / 10}時間` : `${durationEst}分`}`,
    ``,
    `※ 犬種・毛量・毛玉の状態により変動する場合があります`,
    `※ 初回はカウンセリングのお時間をいただきます`,
  ].join("\n");

  return {
    nextStep: "present",
    actions: [],
    done: false,
    memoryUpdates: {
      estimateBreakdown: breakdown,
      totalPrice: taxIncluded,
      estimatedDurationMin: durationEst,
      serviceLabel: svc.label,
    },
  };
}

// ── Step 3: Present ──────────────────────────────────────────────────────

async function stepPresent(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const m = ctx.state?.memory ?? {};

  const result = await ctx.aiCore.generateText({
    capability: "text_generation",
    tenantId: ctx.tenantId,
    app: "pet",
    feature: "estimate",
    task: "pet_estimate",
    promptKey: "pet-estimate:present",
    variables: {
      estimateBreakdown: String(m.estimateBreakdown ?? ""),
      service: String(m.serviceLabel ?? "トリミング"),
      originalMessage: String(m.originalMessage ?? ""),
      petType: String(m.petType ?? "ペット"),
      petBreed: String(m.petBreed ?? ""),
      urgency: String(m.urgency ?? "normal"),
    },
    temperature: 0.6,
    maxOutputTokens: 500,
    traceId: ctx.traceId,
    fallbackEnabled: true,
  });

  const responseText = result.text || `お問い合わせありがとうございます！\n\n${m.estimateBreakdown}\n\nご予約・ご質問はお気軽にどうぞ！`;

  const actions = [];
  const token = ctx.triggerPayload.channelAccessToken as string | undefined;
  const userId = ctx.triggerPayload.userId as string | undefined;

  if (token && userId) {
    actions.push({
      type: "send_line_message" as const,
      params: { channelAccessToken: token, userId, message: responseText, dedup: `pet_estimate:${ctx.traceId}` },
    });
  }

  return {
    nextStep: "followup",
    actions,
    done: false,
    memoryUpdates: { responseText, estimateSent: true, sentAt: new Date().toISOString() },
  };
}

// ── Step 4: Followup ─────────────────────────────────────────────────────

async function stepFollowup(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const urgency = String(ctx.state?.memory?.urgency ?? "normal");
  if (urgency === "urgent") {
    return { nextStep: null, actions: [], done: true, finalStatus: "completed", memoryUpdates: { finalAction: "urgent_complete" } };
  }

  return {
    nextStep: "parse",
    actions: [],
    done: true,
    finalStatus: "waiting",
    scheduleAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    memoryUpdates: { finalAction: "followup_scheduled", followupAttempt: ((ctx.state?.memory?.followupAttempt as number) ?? 0) + 1 },
  };
}
