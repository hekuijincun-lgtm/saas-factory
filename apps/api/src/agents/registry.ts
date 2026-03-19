/**
 * Agent Core — Agent Registry
 *
 * Registers agent definitions. Each agent type maps to a definition
 * that includes supported triggers, initial step, and step runner.
 */

import type { AgentDefinition, AgentType } from "./types";
import { lineConciergeDefinition } from "./agents/line-concierge";
import { outreachFollowupDefinition } from "./agents/outreach-followup";

const REGISTRY: Map<AgentType, AgentDefinition> = new Map();

// Register built-in agents
REGISTRY.set("line_concierge", lineConciergeDefinition);
REGISTRY.set("outreach_followup", outreachFollowupDefinition);

/**
 * Get an agent definition by type.
 * @throws if agentType is unknown
 */
export function getAgentDefinition(agentType: AgentType): AgentDefinition {
  const def = REGISTRY.get(agentType);
  if (!def) {
    throw new Error(`Unknown agent type: "${agentType}". Available: ${listAgents().join(", ")}`);
  }
  return def;
}

/** List all registered agent types */
export function listAgents(): AgentType[] {
  return Array.from(REGISTRY.keys());
}

/** Check if an agent type is registered */
export function hasAgent(agentType: string): boolean {
  return REGISTRY.has(agentType as AgentType);
}
