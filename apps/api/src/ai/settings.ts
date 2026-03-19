/**
 * AI Core — Settings Resolution
 *
 * Resolves AI Core settings from tenant KV settings.
 */

import type { AIProvider, AICoreSettings, AIRouteDecision, AITask } from "./types";

/** System-wide defaults when tenant has no AI Core config */
export const DEFAULT_AI_CORE_SETTINGS: AICoreSettings = {
  enabled: true,
  defaultProvider: "openai",
  defaultModel: "gpt-4o-mini",
  fallbackProvider: "gemini",
  fallbackModel: "gemini-2.0-flash",
  temperature: 0.7,
  maxOutputTokens: 800,
  features: {
    bookingReply: true,
    salesGeneration: true,
    replyClassifier: true,
  },
  routing: {
    booking_reply: { provider: "openai", model: "gpt-4o" },
    sales_message_generation: { provider: "openai", model: "gpt-4o-mini" },
    sales_lead_analysis: { provider: "openai", model: "gpt-4o" },
    sales_draft_generation: { provider: "openai", model: "gpt-4o" },
    sales_reply_classification: { provider: "openai", model: "gpt-4o" },
    reply_classifier: { provider: "openai", model: "gpt-4o-mini" },
    reply_intent_classifier: { provider: "openai", model: "gpt-4o-mini" },
    followup_generation: { provider: "openai", model: "gpt-4o-mini" },
  },
};

/**
 * Merge partial AI Core settings with defaults.
 */
export function mergeAICoreSettings(
  partial?: Partial<AICoreSettings> | null,
): AICoreSettings {
  if (!partial) return { ...DEFAULT_AI_CORE_SETTINGS };

  return {
    enabled: partial.enabled ?? DEFAULT_AI_CORE_SETTINGS.enabled,
    defaultProvider: partial.defaultProvider ?? DEFAULT_AI_CORE_SETTINGS.defaultProvider,
    defaultModel: partial.defaultModel ?? DEFAULT_AI_CORE_SETTINGS.defaultModel,
    fallbackProvider: partial.fallbackProvider ?? DEFAULT_AI_CORE_SETTINGS.fallbackProvider,
    fallbackModel: partial.fallbackModel ?? DEFAULT_AI_CORE_SETTINGS.fallbackModel,
    temperature: partial.temperature ?? DEFAULT_AI_CORE_SETTINGS.temperature,
    maxOutputTokens: partial.maxOutputTokens ?? DEFAULT_AI_CORE_SETTINGS.maxOutputTokens,
    features: {
      bookingReply: partial.features?.bookingReply ?? DEFAULT_AI_CORE_SETTINGS.features.bookingReply,
      salesGeneration: partial.features?.salesGeneration ?? DEFAULT_AI_CORE_SETTINGS.features.salesGeneration,
      replyClassifier: partial.features?.replyClassifier ?? DEFAULT_AI_CORE_SETTINGS.features.replyClassifier,
    },
    routing: {
      ...DEFAULT_AI_CORE_SETTINGS.routing,
      ...(partial.routing ?? {}),
    },
  };
}

/**
 * Resolve which provider + model to use for a given request.
 *
 * Priority:
 * 1. request.preferredProvider / preferredModel
 * 2. tenant routing for this task
 * 3. tenant default provider / model
 * 4. system defaults
 */
export function resolveRoute(
  task: AITask,
  settings: AICoreSettings,
  preferredProvider?: AIProvider,
  preferredModel?: string,
): AIRouteDecision {
  // 1. Request-level override
  if (preferredProvider && preferredModel) {
    return { provider: preferredProvider, model: preferredModel, source: "request" };
  }

  // 2. Task-level routing
  const taskRoute = settings.routing[task];
  if (taskRoute) {
    return {
      provider: preferredProvider ?? taskRoute.provider,
      model: preferredModel ?? taskRoute.model,
      source: "tenant_routing",
    };
  }

  // 3. Tenant default
  return {
    provider: preferredProvider ?? settings.defaultProvider,
    model: preferredModel ?? settings.defaultModel,
    source: "tenant_default",
  };
}

/**
 * Load AI Core settings from the unified settings object.
 * Falls back to defaults if not present.
 */
export function extractAICoreSettings(adminSettings: any): AICoreSettings {
  const aiCore = adminSettings?.ai?.core;
  return mergeAICoreSettings(aiCore);
}
