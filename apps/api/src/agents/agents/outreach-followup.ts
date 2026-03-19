/**
 * Outreach Followup Agent
 *
 * Handles reply classification and scheduled followup generation.
 * Steps: classify → decide → generate_followup → schedule_or_complete
 *
 * Triggers: reply_received, scheduled_followup
 * Input payload:
 *   reply_received: { tenantId, leadId, replyId, replyText, replySource, storeName? }
 *   scheduled_followup: { tenantId, agentId, leadId?, reason }
 */

import type { AgentDefinition, AgentDecision, AgentExecutionContext } from "../types";

const DEFAULT_FOLLOWUP_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours

export const outreachFollowupDefinition: AgentDefinition = {
  type: "outreach_followup",
  name: "営業フォローアップエージェント",
  description: "返信を分類し、必要に応じてフォローアップメッセージを生成・スケジュールします",
  supportedTriggers: ["reply_received", "scheduled_followup"],
  initialStep: "classify",

  async runStep(step: string, ctx: AgentExecutionContext): Promise<AgentDecision> {
    switch (step) {
      case "classify":
        return stepClassify(ctx);
      case "decide":
        return stepDecide(ctx);
      case "generate_followup":
        return stepGenerateFollowup(ctx);
      case "schedule_or_complete":
        return stepScheduleOrComplete(ctx);
      default:
        return { nextStep: null, actions: [], done: true, finalStatus: "completed" };
    }
  },
};

// ── Steps ────────────────────────────────────────────────────────────────

async function stepClassify(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const payload = ctx.triggerPayload;

  // If this is a scheduled followup resume, skip classification
  if (ctx.triggerType === "scheduled_followup") {
    const prevClassification = ctx.state?.memory?.classification as string | undefined;
    return {
      nextStep: "generate_followup",
      actions: [],
      done: false,
      memoryUpdates: {
        classification: prevClassification ?? "later",
        resumeReason: payload.reason ?? "scheduled",
      },
    };
  }

  const replyText = String(payload.replyText ?? "").trim();
  if (!replyText) {
    return {
      nextStep: null,
      actions: [],
      done: true,
      finalStatus: "completed",
      memoryUpdates: { skipped: true, reason: "empty_reply" },
    };
  }

  // Classify via AI Core
  const result = await ctx.aiCore.classify<string>({
    capability: "classification",
    tenantId: ctx.tenantId,
    app: "outreach",
    feature: "reply_classifier",
    task: "reply_classifier",
    promptKey: "outreach.reply_classifier.v1",
    variables: { replyText },
    validLabels: ["interested", "not_interested", "later", "spam", "other"],
    defaultLabel: "other",
    temperature: 0.1,
    maxOutputTokens: 200,
    traceId: ctx.traceId,
    fallbackEnabled: true,
  });

  return {
    nextStep: "decide",
    actions: [],
    done: false,
    memoryUpdates: {
      classification: result.label,
      confidence: result.confidence,
      reason: result.reason,
      replyText,
      leadId: payload.leadId,
      replyId: payload.replyId,
      storeName: payload.storeName,
      replySource: payload.replySource,
    },
  };
}

async function stepDecide(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const classification = ctx.state?.memory?.classification as string;

  switch (classification) {
    case "interested":
      // Interested → complete (human should take over)
      return {
        nextStep: null,
        actions: [],
        done: true,
        finalStatus: "completed",
        memoryUpdates: { action: "handoff_to_human", decisionReason: "interested_lead" },
      };

    case "not_interested":
    case "spam":
      // Not interested or spam → complete, no followup
      return {
        nextStep: null,
        actions: [],
        done: true,
        finalStatus: "completed",
        memoryUpdates: { action: "no_followup", decisionReason: `${classification}_lead` },
      };

    case "later":
      // Later → schedule followup
      return {
        nextStep: "schedule_or_complete",
        actions: [],
        done: false,
        memoryUpdates: { action: "schedule_followup", decisionReason: "lead_said_later" },
      };

    case "other":
    default:
      // Unknown → generate followup message for review
      return {
        nextStep: "generate_followup",
        actions: [],
        done: false,
        memoryUpdates: { action: "generate_followup", decisionReason: "unclear_reply" },
      };
  }
}

async function stepGenerateFollowup(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const storeName = String(ctx.state?.memory?.storeName ?? "弊社");
  const classification = String(ctx.state?.memory?.classification ?? "other");
  const replyText = String(ctx.state?.memory?.replyText ?? "");

  // Generate a followup message via AI Core
  const result = await ctx.aiCore.generateText({
    capability: "text_generation",
    tenantId: ctx.tenantId,
    app: "outreach",
    feature: "followup",
    task: "followup_generation",
    promptKey: "outreach.first_message.v1",
    variables: {
      toneInstruction: "親しみやすいが丁寧",
      tone: "friendly",
      channel: "email",
      cta: "無料相談のご案内",
      learningContext: "",
      storeName,
      area: "不明",
      category: "不明",
      rating: "不明",
      reviewCount: "0",
      websiteUrl: "なし",
      instagramUrl: "なし",
      lineUrl: "なし",
      notes: `前回の返信分類: ${classification}。返信内容抜粋: ${replyText.slice(0, 100)}`,
      featureContext: "（フォローアップ）",
      painContext: "不明",
    },
    maxOutputTokens: 500,
    fallbackEnabled: true,
    traceId: ctx.traceId,
  });

  return {
    nextStep: "schedule_or_complete",
    actions: [],
    done: false,
    memoryUpdates: {
      followupText: result.text,
      followupGenerated: result.meta.success,
      followupProvider: result.meta.provider,
    },
  };
}

async function stepScheduleOrComplete(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const classification = ctx.state?.memory?.classification as string;

  // If "later", schedule a followup
  if (classification === "later") {
    const delayMs = DEFAULT_FOLLOWUP_DELAY_MS;
    const scheduleAt = new Date(Date.now() + delayMs).toISOString();

    return {
      nextStep: "generate_followup",
      actions: [],
      done: true,
      finalStatus: "waiting",
      scheduleAt,
      memoryUpdates: { scheduledFor: scheduleAt, followupAttempt: ((ctx.state?.memory?.followupAttempt as number) ?? 0) + 1 },
    };
  }

  // Otherwise, complete
  return {
    nextStep: null,
    actions: [],
    done: true,
    finalStatus: "completed",
    memoryUpdates: { finalAction: "followup_ready_for_review" },
  };
}
