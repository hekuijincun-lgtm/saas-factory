/**
 * Agent Core — Actions Layer
 *
 * Common actions that agents can invoke. Each action is a thin wrapper
 * that handles logging, error recovery, and delegates to the appropriate system.
 */

import type { AICore } from "../ai";
import type {
  AgentActionResult,
  AgentActionType,
  AgentExecutionContext,
  AgentStateRecord,
} from "./types";
import { updateState, completeState, failState } from "./state";
import { writeAgentLog, buildLogRecord } from "./log";

// ── LINE Message Action ──────────────────────────────────────────────────

export async function sendLineMessageAction(
  ctx: AgentExecutionContext,
  params: {
    channelAccessToken: string;
    userId: string;
    message: string;
    dedup?: string;
  },
): Promise<AgentActionResult> {
  const start = Date.now();
  try {
    // Dedup check via traceId
    if (params.dedup) {
      const dedupKey = `agent:dedup:${ctx.tenantId}:${params.dedup}`;
      const existing = await ctx.kv.get(dedupKey);
      if (existing) {
        return { type: "send_line_message", success: true, data: { deduplicated: true } };
      }
      await ctx.kv.put(dedupKey, "1", { expirationTtl: 3600 });
    }

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.channelAccessToken}`,
      },
      body: JSON.stringify({
        to: params.userId,
        messages: [{ type: "text", text: params.message }],
      }),
    });

    const bodyText = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`LINE push failed: ${res.status} ${bodyText.slice(0, 200)}`);
    }

    return {
      type: "send_line_message",
      success: true,
      data: { status: res.status },
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      type: "send_line_message",
      success: false,
      error: err?.message ?? String(err),
      latencyMs: Date.now() - start,
    };
  }
}

// ── AI Core Text Generation ──────────────────────────────────────────────

export async function generateTextAction(
  ctx: AgentExecutionContext,
  params: {
    promptKey: string;
    variables: Record<string, string>;
    task?: string;
    app?: string;
    feature?: string;
    maxOutputTokens?: number;
    temperature?: number;
  },
): Promise<AgentActionResult> {
  const start = Date.now();
  try {
    const result = await ctx.aiCore.generateText({
      capability: "text_generation",
      tenantId: ctx.tenantId,
      app: params.app ?? "agent",
      feature: params.feature ?? ctx.agentType,
      task: params.task ?? ctx.agentType,
      promptKey: params.promptKey,
      variables: params.variables,
      maxOutputTokens: params.maxOutputTokens,
      temperature: params.temperature,
      traceId: ctx.traceId,
      fallbackEnabled: true,
    });

    return {
      type: "generate_text",
      success: result.meta.success,
      data: {
        text: result.text,
        provider: result.meta.provider,
        model: result.meta.model,
        latencyMs: result.meta.latencyMs,
      },
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      type: "generate_text",
      success: false,
      error: err?.message ?? String(err),
      latencyMs: Date.now() - start,
    };
  }
}

// ── AI Core Classification ───────────────────────────────────────────────

export async function classifyAction<TLabel extends string>(
  ctx: AgentExecutionContext,
  params: {
    promptKey: string;
    variables: Record<string, string>;
    validLabels: TLabel[];
    defaultLabel: TLabel;
    task?: string;
    app?: string;
    feature?: string;
  },
): Promise<AgentActionResult> {
  const start = Date.now();
  try {
    const result = await ctx.aiCore.classify<TLabel>({
      capability: "classification",
      tenantId: ctx.tenantId,
      app: params.app ?? "agent",
      feature: params.feature ?? ctx.agentType,
      task: params.task ?? "classify",
      promptKey: params.promptKey,
      variables: params.variables,
      validLabels: params.validLabels,
      defaultLabel: params.defaultLabel,
      traceId: ctx.traceId,
      fallbackEnabled: true,
    });

    return {
      type: "classify",
      success: result.meta.success,
      data: {
        label: result.label,
        confidence: result.confidence,
        reason: result.reason,
        provider: result.meta.provider,
      },
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      type: "classify",
      success: false,
      error: err?.message ?? String(err),
      latencyMs: Date.now() - start,
    };
  }
}

// ── Schedule Next Run ────────────────────────────────────────────────────

export async function scheduleNextRunAction(
  ctx: AgentExecutionContext,
  params: { delayMs: number },
): Promise<AgentActionResult> {
  try {
    const nextRunAt = new Date(Date.now() + params.delayMs).toISOString();
    const agentId = ctx.state?.agentId;
    if (!agentId) throw new Error("No agentId in state");

    await updateState(ctx.kv, ctx.tenantId, agentId, {
      status: "waiting",
      nextRunAt,
    });

    return {
      type: "schedule_next_run",
      success: true,
      data: { nextRunAt },
    };
  } catch (err: any) {
    return {
      type: "schedule_next_run",
      success: false,
      error: err?.message ?? String(err),
    };
  }
}

// ── Update Agent State ───────────────────────────────────────────────────

export async function updateAgentStateAction(
  ctx: AgentExecutionContext,
  params: { memory?: Record<string, unknown>; currentStep?: string },
): Promise<AgentActionResult> {
  try {
    const agentId = ctx.state?.agentId;
    if (!agentId) throw new Error("No agentId in state");

    await updateState(ctx.kv, ctx.tenantId, agentId, {
      memory: params.memory as any,
      currentStep: params.currentStep,
    });

    return { type: "update_state", success: true };
  } catch (err: any) {
    return { type: "update_state", success: false, error: err?.message ?? String(err) };
  }
}

// ── Complete Agent ───────────────────────────────────────────────────────

export async function completeAgentAction(
  ctx: AgentExecutionContext,
): Promise<AgentActionResult> {
  try {
    const agentId = ctx.state?.agentId;
    if (!agentId) throw new Error("No agentId in state");

    await completeState(ctx.kv, ctx.tenantId, agentId);
    return { type: "complete_agent", success: true };
  } catch (err: any) {
    return { type: "complete_agent", success: false, error: err?.message ?? String(err) };
  }
}

// ── Fail Agent ───────────────────────────────────────────────────────────

export async function failAgentAction(
  ctx: AgentExecutionContext,
  params: { error: string },
): Promise<AgentActionResult> {
  try {
    const agentId = ctx.state?.agentId;
    if (!agentId) throw new Error("No agentId in state");

    await failState(ctx.kv, ctx.tenantId, agentId, params.error);
    return { type: "fail_agent", success: true };
  } catch (err: any) {
    return { type: "fail_agent", success: false, error: err?.message ?? String(err) };
  }
}
