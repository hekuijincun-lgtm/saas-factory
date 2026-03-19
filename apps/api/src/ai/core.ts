/**
 * AI Core — Main Orchestrator
 *
 * Unified entry point for all AI operations.
 * Handles: settings resolution → routing → prompt → provider call → fallback → logging.
 */

import type {
  AIProvider,
  AITextRequest,
  AITextResponse,
  AIJsonRequest,
  AIJsonResponse,
  AIClassifyRequest,
  AIClassifyResponse,
  AIResponseMeta,
  AIUsageLogRecord,
  AICoreSettings,
  ProviderTextRequest,
  ProviderJsonRequest,
} from "./types";
import type { ProviderAdapter } from "./providers/base";
import { OpenAIAdapter } from "./providers/openai";
import { GeminiAdapter } from "./providers/gemini";
import { getPrompt } from "./prompt-registry";
import { extractAICoreSettings, resolveRoute } from "./settings";
import { writeUsageLog } from "./usage-log";

// ── Env / Bindings ───────────────────────────────────────────────────────

export interface AIEnv {
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  SAAS_FACTORY?: KVNamespace;
  [key: string]: unknown;
}

// ── AI Core Instance ─────────────────────────────────────────────────────

export class AICore {
  private env: AIEnv;
  private kv: KVNamespace | null;
  private adapters: Map<AIProvider, ProviderAdapter> = new Map();
  private uid: () => string;

  constructor(env: AIEnv, uid?: () => string) {
    this.env = env;
    this.kv = (env.SAAS_FACTORY as KVNamespace) ?? null;
    this.uid = uid ?? (() => crypto.randomUUID());

    // Initialize available adapters
    if (env.OPENAI_API_KEY) {
      this.adapters.set("openai", new OpenAIAdapter(env.OPENAI_API_KEY as string));
    }
    if (env.GEMINI_API_KEY) {
      this.adapters.set("gemini", new GeminiAdapter(env.GEMINI_API_KEY as string));
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Generate text via AI Core.
   */
  async generateText(req: AITextRequest): Promise<AITextResponse> {
    const settings = await this.loadSettings(req.tenantId);
    const prompt = getPrompt(req.promptKey, req.variables);
    const route = resolveRoute(req.task, settings, req.preferredProvider, req.preferredModel);

    const providerReq: ProviderTextRequest = {
      model: route.model,
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      temperature: req.temperature ?? settings.temperature,
      maxOutputTokens: req.maxOutputTokens ?? settings.maxOutputTokens,
    };

    const start = Date.now();
    let meta: AIResponseMeta;
    let text = "";

    try {
      const adapter = this.getAdapter(route.provider);
      const result = await adapter.generateText(providerReq);
      text = result.text;
      meta = this.buildMeta(route.provider, route.model, start, true, false, req, result.inputTokens, result.outputTokens);
    } catch (err) {
      // Attempt fallback
      if (req.fallbackEnabled !== false && settings.fallbackProvider) {
        try {
          const fbAdapter = this.getAdapter(settings.fallbackProvider);
          const fbReq = { ...providerReq, model: settings.fallbackModel ?? providerReq.model };
          const result = await fbAdapter.generateText(fbReq);
          text = result.text;
          meta = this.buildMeta(settings.fallbackProvider, fbReq.model, start, true, true, req, result.inputTokens, result.outputTokens);
        } catch (fbErr) {
          meta = this.buildMeta(route.provider, route.model, start, false, true, req, 0, 0, String(fbErr));
        }
      } else {
        meta = this.buildMeta(route.provider, route.model, start, false, false, req, 0, 0, String(err));
      }
    }

    this.logUsage(req, meta);
    return { text, meta };
  }

  /**
   * Generate structured JSON via AI Core.
   */
  async generateJson<T = unknown>(req: AIJsonRequest<T>): Promise<AIJsonResponse<T>> {
    const settings = await this.loadSettings(req.tenantId);
    const prompt = getPrompt(req.promptKey, req.variables);
    const route = resolveRoute(req.task, settings, req.preferredProvider, req.preferredModel);

    const providerReq: ProviderJsonRequest = {
      model: route.model,
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      temperature: req.temperature ?? settings.temperature ?? 0.3,
      maxOutputTokens: req.maxOutputTokens ?? settings.maxOutputTokens,
      schema: req.schema,
    };

    const start = Date.now();
    let meta: AIResponseMeta;
    let data: T;

    try {
      const adapter = this.getAdapter(route.provider);
      const result = await adapter.generateJson(providerReq);
      data = this.parseJson<T>(result.text, req.fallbackDefault);
      meta = this.buildMeta(route.provider, route.model, start, true, false, req, result.inputTokens, result.outputTokens);
    } catch (err) {
      if (req.fallbackEnabled !== false && settings.fallbackProvider) {
        try {
          const fbAdapter = this.getAdapter(settings.fallbackProvider);
          const fbReq = { ...providerReq, model: settings.fallbackModel ?? providerReq.model };
          const result = await fbAdapter.generateJson(fbReq);
          data = this.parseJson<T>(result.text, req.fallbackDefault);
          meta = this.buildMeta(settings.fallbackProvider, fbReq.model, start, true, true, req, result.inputTokens, result.outputTokens);
        } catch (fbErr) {
          data = req.fallbackDefault as T;
          meta = this.buildMeta(route.provider, route.model, start, false, true, req, 0, 0, String(fbErr));
        }
      } else {
        data = req.fallbackDefault as T;
        meta = this.buildMeta(route.provider, route.model, start, false, false, req, 0, 0, String(err));
      }
    }

    this.logUsage(req, meta);
    return { data, meta };
  }

  /**
   * Classify text via AI Core.
   */
  async classify<TLabel extends string>(req: AIClassifyRequest<TLabel>): Promise<AIClassifyResponse<TLabel>> {
    const settings = await this.loadSettings(req.tenantId);
    const prompt = getPrompt(req.promptKey, req.variables);
    const route = resolveRoute(req.task, settings, req.preferredProvider, req.preferredModel);

    const providerReq: ProviderJsonRequest = {
      model: route.model,
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      temperature: req.temperature ?? 0.1,
      maxOutputTokens: req.maxOutputTokens ?? 200,
    };

    const start = Date.now();
    let meta: AIResponseMeta;
    let label: TLabel = req.defaultLabel;
    let confidence = 0;
    let reason = "error";

    try {
      const adapter = this.getAdapter(route.provider);
      const result = await adapter.classify(providerReq);
      const parsed = this.safeParseJson(result.text);

      // Extract classification fields flexibly
      const rawLabel = parsed?.classification ?? parsed?.intent ?? parsed?.label;
      if (rawLabel && req.validLabels.includes(rawLabel as TLabel)) {
        label = rawLabel as TLabel;
      }
      confidence = typeof parsed?.confidence === "number" ? parsed.confidence : 0.5;
      reason = parsed?.reason ?? "ai_classified";

      meta = this.buildMeta(route.provider, route.model, start, true, false, req, result.inputTokens, result.outputTokens);
    } catch (err) {
      if (req.fallbackEnabled !== false && settings.fallbackProvider) {
        try {
          const fbAdapter = this.getAdapter(settings.fallbackProvider);
          const fbReq = { ...providerReq, model: settings.fallbackModel ?? providerReq.model };
          const result = await fbAdapter.classify(fbReq);
          const parsed = this.safeParseJson(result.text);

          const rawLabel = parsed?.classification ?? parsed?.intent ?? parsed?.label;
          if (rawLabel && req.validLabels.includes(rawLabel as TLabel)) {
            label = rawLabel as TLabel;
          }
          confidence = typeof parsed?.confidence === "number" ? parsed.confidence : 0.5;
          reason = parsed?.reason ?? "ai_classified_fallback";

          meta = this.buildMeta(settings.fallbackProvider, fbReq.model, start, true, true, req, result.inputTokens, result.outputTokens);
        } catch (fbErr) {
          meta = this.buildMeta(route.provider, route.model, start, false, true, req, 0, 0, String(fbErr));
        }
      } else {
        meta = this.buildMeta(route.provider, route.model, start, false, false, req, 0, 0, String(err));
      }
    }

    this.logUsage(req, meta);
    return { label, confidence, reason, meta };
  }

  /**
   * Check if a provider is available (has API key configured).
   */
  hasProvider(provider: AIProvider): boolean {
    return this.adapters.has(provider);
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private getAdapter(provider: AIProvider): ProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`AI provider "${provider}" not configured (missing API key)`);
    }
    return adapter;
  }

  private async loadSettings(tenantId: string): Promise<AICoreSettings> {
    if (!this.kv) return extractAICoreSettings(null);

    try {
      const raw = await this.kv.get(`settings:${tenantId}`);
      if (!raw) return extractAICoreSettings(null);
      const settings = JSON.parse(raw);
      return extractAICoreSettings(settings);
    } catch {
      return extractAICoreSettings(null);
    }
  }

  private buildMeta(
    provider: AIProvider,
    model: string,
    startMs: number,
    success: boolean,
    fallbackUsed: boolean,
    req: { promptKey: string; task: string },
    inputTokens?: number,
    outputTokens?: number,
    error?: string,
  ): AIResponseMeta {
    const latencyMs = Date.now() - startMs;
    const estimatedCostUsd = this.estimateCost(provider, model, inputTokens ?? 0, outputTokens ?? 0);
    return {
      provider,
      model,
      latencyMs,
      success,
      fallbackUsed,
      promptKey: req.promptKey,
      task: req.task,
      estimatedCostUsd,
      inputTokens,
      outputTokens,
      error,
    };
  }

  private estimateCost(provider: AIProvider, model: string, inputTokens: number, outputTokens: number): number {
    // Rough cost estimation (USD per 1M tokens)
    const rates: Record<string, { input: number; output: number }> = {
      "gpt-4o": { input: 2.5, output: 10 },
      "gpt-4o-mini": { input: 0.15, output: 0.6 },
      "gpt-4.1": { input: 2, output: 8 },
      "gpt-4.1-mini": { input: 0.4, output: 1.6 },
      "gpt-4.1-nano": { input: 0.1, output: 0.4 },
      "gemini-2.0-flash": { input: 0.1, output: 0.4 },
      "gemini-1.5-pro": { input: 1.25, output: 5 },
      "gemini-1.5-flash": { input: 0.075, output: 0.3 },
    };
    const rate = rates[model] ?? { input: 1, output: 3 };
    return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
  }

  private parseJson<T>(text: string, fallback?: T): T {
    try {
      return JSON.parse(text) as T;
    } catch {
      if (fallback !== undefined) return fallback;
      throw new Error("Failed to parse AI response as JSON");
    }
  }

  private safeParseJson(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private logUsage(req: { tenantId: string; app: string; feature: string; task: string; promptKey: string; traceId?: string }, meta: AIResponseMeta): void {
    const record: AIUsageLogRecord = {
      id: this.uid(),
      tenantId: req.tenantId,
      app: req.app,
      feature: req.feature,
      task: req.task,
      provider: meta.provider,
      model: meta.model,
      promptKey: req.promptKey,
      success: meta.success,
      fallbackUsed: meta.fallbackUsed,
      latencyMs: meta.latencyMs,
      inputTokens: meta.inputTokens ?? 0,
      outputTokens: meta.outputTokens ?? 0,
      estimatedCostUsd: meta.estimatedCostUsd ?? 0,
      timestamp: new Date().toISOString(),
      traceId: req.traceId,
      error: meta.error,
    };

    // Fire-and-forget
    writeUsageLog(this.kv, record).catch(() => {});
  }
}
