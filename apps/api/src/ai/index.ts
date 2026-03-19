/**
 * AI Core — Barrel Export
 *
 * Single import point for all AI Core functionality.
 */

// Core
export { AICore } from "./core";
export type { AIEnv } from "./core";

// Types
export type {
  AIProvider,
  AICapability,
  AITask,
  AIRequestContext,
  AITextRequest,
  AITextResponse,
  AIJsonRequest,
  AIJsonResponse,
  AIClassifyRequest,
  AIClassifyResponse,
  AIResponseMeta,
  AIUsageLogRecord,
  AIRouteDecision,
  AIFeatureRouteConfig,
  AICoreSettings,
  PromptTemplate,
} from "./types";

// Settings
export {
  DEFAULT_AI_CORE_SETTINGS,
  mergeAICoreSettings,
  resolveRoute,
  extractAICoreSettings,
} from "./settings";

// Prompt Registry
export { getPrompt, listPromptKeys, hasPromptKey } from "./prompt-registry";

// Usage Log
export { writeUsageLog, readRecentUsageLogs } from "./usage-log";

// Provider Adapters (for direct use if needed)
export { OpenAIAdapter } from "./providers/openai";
export { GeminiAdapter } from "./providers/gemini";
export type { ProviderAdapter } from "./providers/base";
