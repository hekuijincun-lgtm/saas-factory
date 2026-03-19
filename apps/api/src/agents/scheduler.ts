/**
 * Agent Core — Scheduler
 *
 * Runs due agents from KV state. Called from the Workers scheduled() handler.
 */

import type { AgentStateRecord } from "./types";
import { listPendingScheduledAgents } from "./state";
import { runAgent } from "./core";

/**
 * Process all due scheduled agents for a tenant.
 * Safe: catches per-agent errors, never throws to caller.
 */
export async function runDueAgents(
  env: Record<string, unknown>,
  tenantId: string,
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const kv = env.SAAS_FACTORY as KVNamespace | undefined;
  if (!kv) return { processed: 0, succeeded: 0, failed: 0 };

  let agents: AgentStateRecord[];
  try {
    agents = await listPendingScheduledAgents(kv, tenantId);
  } catch (err) {
    console.error(`[agent-scheduler] Failed to list pending agents for tenant=${tenantId}:`, err);
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const agent of agents) {
    processed++;
    try {
      const result = await runAgent(
        {
          tenantId,
          agentType: agent.agentType,
          triggerType: agent.triggerType ?? "scheduled_followup",
          triggerPayload: agent.triggerPayload ?? {},
          agentId: agent.agentId,
        },
        env,
      );
      if (result?.state?.status === "failed") {
        failed++;
      } else {
        succeeded++;
      }
    } catch (err) {
      failed++;
      console.error(`[agent-scheduler] Agent ${agent.agentId} failed:`, err);
    }
  }

  if (processed > 0) {
    console.log(`[agent-scheduler] tenant=${tenantId} processed=${processed} succeeded=${succeeded} failed=${failed}`);
  }

  return { processed, succeeded, failed };
}

/**
 * Run due agents across all known tenants.
 * Uses KV list to discover tenants with active agents.
 */
export async function runAllDueAgents(
  env: Record<string, unknown>,
): Promise<{ tenants: number; totalProcessed: number }> {
  const kv = env.SAAS_FACTORY as KVNamespace | undefined;
  if (!kv) return { tenants: 0, totalProcessed: 0 };

  let tenants = 0;
  let totalProcessed = 0;

  try {
    // List all tenant active lists
    const list = await kv.list({ prefix: "agent:active:", limit: 100 });
    for (const key of list.keys) {
      const tenantId = key.name.replace("agent:active:", "");
      if (!tenantId) continue;
      tenants++;
      const result = await runDueAgents(env, tenantId);
      totalProcessed += result.processed;
    }
  } catch (err) {
    console.error("[agent-scheduler] runAllDueAgents error:", err);
  }

  return { tenants, totalProcessed };
}
