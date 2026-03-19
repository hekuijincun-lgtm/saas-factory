/**
 * Agent Core — Main Orchestrator
 *
 * Handles: state creation → step dispatch → action execution → state update → logging
 */

import type {
  AgentRunInput,
  AgentExecutionContext,
  AgentDecision,
  AgentActionRequest,
  AgentActionResult,
  AgentStepResult,
  AgentStateRecord,
} from "./types";
import { AICore } from "../ai";
import { getAgentDefinition } from "./registry";
import { createState, getState, updateState, completeState, failState } from "./state";
import { writeAgentLog, buildLogRecord } from "./log";
import {
  sendLineMessageAction,
  generateTextAction,
  classifyAction,
  scheduleNextRunAction,
  updateAgentStateAction,
  completeAgentAction,
  failAgentAction,
} from "./actions";

const MAX_STEPS_PER_RUN = 10; // prevent infinite loops

export interface AgentRunResult {
  state: AgentStateRecord | null;
  steps: AgentStepResult[];
  error?: string;
}

/**
 * Run or resume an agent.
 */
export async function runAgent(
  input: AgentRunInput,
  env: Record<string, unknown>,
): Promise<AgentRunResult | null> {
  const kv = env.SAAS_FACTORY as KVNamespace | undefined;
  if (!kv) {
    console.error("[agent-core] No KV namespace");
    return null;
  }

  const aiCore = new AICore(env as any);
  const traceId = input.traceId ?? crypto.randomUUID();
  const now = new Date().toISOString();

  // Get definition
  let definition;
  try {
    definition = getAgentDefinition(input.agentType);
  } catch (err: any) {
    console.error("[agent-core]", err.message);
    return null;
  }

  // Load or create state
  let state: AgentStateRecord | null = null;
  if (input.agentId) {
    state = await getState(kv, input.tenantId, input.agentId);
  }

  if (!state) {
    state = await createState(kv, {
      tenantId: input.tenantId,
      agentId: crypto.randomUUID(),
      agentType: input.agentType,
      triggerType: input.triggerType,
      triggerPayload: input.triggerPayload,
      traceId,
      initialStep: definition.initialStep,
    });
  }

  // Build execution context
  const ctx: AgentExecutionContext = {
    tenantId: input.tenantId,
    agentType: input.agentType,
    triggerType: input.triggerType,
    triggerPayload: input.triggerPayload,
    traceId,
    now,
    aiCore,
    env,
    kv,
    db: env.DB as D1Database | undefined,
    state,
    principal: input.principal,
    userId: input.userId,
  };

  // Mark running
  state = await updateState(kv, input.tenantId, state.agentId, {
    status: "running",
    attempts: state.attempts + 1,
  });
  if (!state) return null;
  ctx.state = state;

  // Log start
  await writeAgentLog(kv, buildLogRecord({
    tenantId: input.tenantId,
    agentId: state.agentId,
    agentType: input.agentType,
    traceId,
    triggerType: input.triggerType,
    step: state.currentStep,
    status: "start",
    message: `Agent started: ${input.agentType} trigger=${input.triggerType}`,
  }));

  // Step loop
  const steps: AgentStepResult[] = [];
  let stepCount = 0;

  while (stepCount < MAX_STEPS_PER_RUN) {
    stepCount++;
    const currentStep = state.currentStep;

    let decision: AgentDecision;
    try {
      decision = await definition.runStep(currentStep, ctx);
    } catch (err: any) {
      // Step failed — mark agent as failed
      const errorMsg = err?.message ?? String(err);
      await failState(kv, input.tenantId, state.agentId, errorMsg);
      await writeAgentLog(kv, buildLogRecord({
        tenantId: input.tenantId,
        agentId: state.agentId,
        agentType: input.agentType,
        traceId,
        triggerType: input.triggerType,
        step: currentStep,
        status: "failure",
        message: `Step "${currentStep}" failed: ${errorMsg}`,
      }));
      state = await getState(kv, input.tenantId, state.agentId);
      steps.push({ step: currentStep, decision: { nextStep: null, actions: [], done: true, finalStatus: "failed" }, actionResults: [], error: errorMsg });
      return { state, steps, error: errorMsg };
    }

    // Execute actions
    const actionResults: AgentActionResult[] = [];
    for (const action of decision.actions) {
      const result = await executeAction(ctx, action);
      actionResults.push(result);

      await writeAgentLog(kv, buildLogRecord({
        tenantId: input.tenantId,
        agentId: state.agentId,
        agentType: input.agentType,
        traceId,
        triggerType: input.triggerType,
        step: currentStep,
        actionType: action.type,
        status: result.success ? "action" : "failure",
        message: result.success ? `Action ${action.type} succeeded` : `Action ${action.type} failed: ${result.error}`,
        latencyMs: result.latencyMs,
      }));
    }

    steps.push({ step: currentStep, decision, actionResults });

    // Apply memory updates
    if (decision.memoryUpdates) {
      state = await updateState(kv, input.tenantId, state.agentId, {
        memory: { ...state.memory, ...decision.memoryUpdates } as any,
      });
      if (state) ctx.state = state;
    }

    // Handle completion
    if (decision.done) {
      if (decision.finalStatus === "waiting" && decision.scheduleAt) {
        state = await updateState(kv, input.tenantId, state!.agentId, {
          status: "waiting",
          nextRunAt: decision.scheduleAt,
          currentStep: decision.nextStep ?? currentStep,
        });
      } else if (decision.finalStatus === "failed") {
        await failState(kv, input.tenantId, state!.agentId, "Agent decided to fail");
        state = await getState(kv, input.tenantId, state!.agentId);
      } else {
        await completeState(kv, input.tenantId, state!.agentId);
        state = await getState(kv, input.tenantId, state!.agentId);
      }

      await writeAgentLog(kv, buildLogRecord({
        tenantId: input.tenantId,
        agentId: state?.agentId ?? "",
        agentType: input.agentType,
        traceId,
        triggerType: input.triggerType,
        step: currentStep,
        status: "complete",
        message: `Agent ${decision.finalStatus ?? "completed"}`,
      }));

      break;
    }

    // Move to next step
    if (decision.nextStep) {
      state = await updateState(kv, input.tenantId, state!.agentId, {
        currentStep: decision.nextStep,
      });
      if (state) ctx.state = state;
    } else {
      // No next step and not done → complete
      await completeState(kv, input.tenantId, state!.agentId);
      state = await getState(kv, input.tenantId, state!.agentId);
      break;
    }
  }

  return { state, steps };
}

// ── Action Executor ──────────────────────────────────────────────────────

async function executeAction(
  ctx: AgentExecutionContext,
  action: AgentActionRequest,
): Promise<AgentActionResult> {
  const p = action.params;

  switch (action.type) {
    case "send_line_message":
      return sendLineMessageAction(ctx, {
        channelAccessToken: p.channelAccessToken as string,
        userId: p.userId as string,
        message: p.message as string,
        dedup: p.dedup as string | undefined,
      });

    case "generate_text":
      return generateTextAction(ctx, {
        promptKey: p.promptKey as string,
        variables: p.variables as Record<string, string>,
        task: p.task as string | undefined,
        app: p.app as string | undefined,
        feature: p.feature as string | undefined,
        maxOutputTokens: p.maxOutputTokens as number | undefined,
        temperature: p.temperature as number | undefined,
      });

    case "classify":
      return classifyAction(ctx, {
        promptKey: p.promptKey as string,
        variables: p.variables as Record<string, string>,
        validLabels: p.validLabels as string[],
        defaultLabel: p.defaultLabel as string,
        task: p.task as string | undefined,
        app: p.app as string | undefined,
        feature: p.feature as string | undefined,
      });

    case "schedule_next_run":
      return scheduleNextRunAction(ctx, {
        delayMs: p.delayMs as number,
      });

    case "update_state":
      return updateAgentStateAction(ctx, {
        memory: p.memory as Record<string, unknown> | undefined,
        currentStep: p.currentStep as string | undefined,
      });

    case "complete_agent":
      return completeAgentAction(ctx);

    case "fail_agent":
      return failAgentAction(ctx, {
        error: p.error as string,
      });

    case "noop":
      return { type: "noop", success: true };

    default:
      return { type: action.type, success: false, error: `Unknown action: ${action.type}` };
  }
}
