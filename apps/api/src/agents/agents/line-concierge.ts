/**
 * LINE Concierge Agent
 *
 * Handles LINE customer messages via AI Core.
 * Steps: receive → generate_reply → respond → complete
 *
 * Trigger: line_message_received
 * Input payload: { tenantId, userId, message, channelAccessToken, systemPrompt?, storeSettings? }
 */

import type { AgentDefinition, AgentDecision, AgentExecutionContext } from "../types";

export const lineConciergeDefinition: AgentDefinition = {
  type: "line_concierge",
  name: "LINE接客エージェント",
  description: "LINEメッセージを受信してAI応答を生成し、必要に応じてLINE返信を送信します",
  supportedTriggers: ["line_message_received"],
  initialStep: "generate_reply",

  async runStep(step: string, ctx: AgentExecutionContext): Promise<AgentDecision> {
    switch (step) {
      case "generate_reply":
        return stepGenerateReply(ctx);
      case "send_reply":
        return stepSendReply(ctx);
      default:
        return { nextStep: null, actions: [], done: true, finalStatus: "completed" };
    }
  },
};

// ── Steps ────────────────────────────────────────────────────────────────

async function stepGenerateReply(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const payload = ctx.triggerPayload;
  const message = String(payload.message ?? "").trim();

  if (!message) {
    return {
      nextStep: null,
      actions: [],
      done: true,
      finalStatus: "completed",
      memoryUpdates: { responseText: "", skipped: true, reason: "empty_message" },
    };
  }

  // Build variables for the booking concierge prompt
  const systemPrompt = String(payload.systemPrompt ?? "あなたはお店のAIアシスタントです。");

  // Use AI Core to generate response
  const result = await ctx.aiCore.generateText({
    capability: "text_generation",
    tenantId: ctx.tenantId,
    app: "booking",
    feature: "concierge",
    task: "booking_reply",
    promptKey: "booking.concierge.reply.v1",
    variables: {
      characterLine: systemPrompt.includes("あなたは") ? systemPrompt.split("\n")[0] : "あなたはお店のAIアシスタントです。",
      voiceInstruction: String(payload.voiceInstruction ?? "親しみやすく温かい口調で話してください。"),
      lengthInstruction: String(payload.lengthInstruction ?? "回答は適度な長さ（3〜4文程度）にしてください。"),
      verticalAiHint: String(payload.verticalAiHint ?? ""),
      storeBlock: String(payload.storeBlock ?? ""),
      faqBlock: String(payload.faqBlock ?? ""),
      hardRulesBlock: String(payload.hardRulesBlock ?? ""),
      prohibitedBlock: String(payload.prohibitedBlock ?? ""),
      verticalSafetyNotes: String(payload.verticalSafetyNotes ?? ""),
      verticalBookingEmphasis: String(payload.verticalBookingEmphasis ?? ""),
      message,
    },
    maxOutputTokens: 1600,
    fallbackEnabled: true,
    traceId: ctx.traceId,
    channel: "line",
  });

  if (!result.meta.success || !result.text) {
    return {
      nextStep: null,
      actions: [],
      done: true,
      finalStatus: "failed",
      memoryUpdates: {
        responseText: "",
        error: result.meta.error ?? "AI generation failed",
        provider: result.meta.provider,
        model: result.meta.model,
      },
    };
  }

  const memoryUpdates: Record<string, unknown> = {
    responseText: result.text,
    provider: result.meta.provider,
    model: result.meta.model,
    latencyMs: result.meta.latencyMs,
    fallbackUsed: result.meta.fallbackUsed,
    inputMessage: message,
  };

  // If channelAccessToken and userId are present, move to send step
  const channelAccessToken = payload.channelAccessToken as string | undefined;
  const userId = payload.userId as string | undefined;

  if (channelAccessToken && userId) {
    return {
      nextStep: "send_reply",
      actions: [],
      done: false,
      memoryUpdates,
    };
  }

  // No LINE credentials — just return the text (caller handles sending)
  return {
    nextStep: null,
    actions: [],
    done: true,
    finalStatus: "completed",
    memoryUpdates,
  };
}

async function stepSendReply(ctx: AgentExecutionContext): Promise<AgentDecision> {
  const payload = ctx.triggerPayload;
  const responseText = ctx.state?.memory?.responseText as string;
  const channelAccessToken = payload.channelAccessToken as string;
  const userId = payload.userId as string;

  if (!responseText || !channelAccessToken || !userId) {
    return {
      nextStep: null,
      actions: [],
      done: true,
      finalStatus: "completed",
      memoryUpdates: { sendSkipped: true, reason: "missing_params" },
    };
  }

  return {
    nextStep: null,
    actions: [
      {
        type: "send_line_message",
        params: {
          channelAccessToken,
          userId,
          message: responseText,
          dedup: `line_concierge:${ctx.traceId}`,
        },
      },
    ],
    done: true,
    finalStatus: "completed",
    memoryUpdates: { sendAttempted: true },
  };
}
