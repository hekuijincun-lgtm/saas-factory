/**
 * AI Core — OpenAI Provider Adapter
 *
 * Supports both Chat Completions API and Responses API.
 * Uses Chat Completions for json_object mode (gpt-4o-mini etc.)
 * Uses Responses API for structured output with json_schema.
 */

import type { ProviderAdapter } from "./base";
import type { ProviderTextRequest, ProviderJsonRequest, ProviderResponse } from "../types";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_TIMEOUT_MS = 30_000;

/** Models that support Responses API well */
const RESPONSES_API_MODELS = new Set(["gpt-4o", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "o3-mini", "o4-mini"]);

export class OpenAIAdapter implements ProviderAdapter {
  readonly name = "openai";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateText(req: ProviderTextRequest): Promise<ProviderResponse> {
    if (RESPONSES_API_MODELS.has(req.model)) {
      return this.callResponsesApi(req);
    }
    return this.callChatApi(req);
  }

  async generateJson(req: ProviderJsonRequest): Promise<ProviderResponse> {
    if (req.schema && RESPONSES_API_MODELS.has(req.model)) {
      return this.callResponsesApiWithSchema(req);
    }
    return this.callChatApiJson(req);
  }

  async classify(req: ProviderJsonRequest): Promise<ProviderResponse> {
    return this.generateJson(req);
  }

  // ── Chat Completions API ────────────────────────────────────────────────

  private async callChatApi(req: ProviderTextRequest): Promise<ProviderResponse> {
    const payload = {
      model: req.model,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt },
      ],
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxOutputTokens ?? 800,
    };

    const res = await this.fetchWithTimeout(OPENAI_CHAT_URL, payload);
    const data = (await res.json()) as any;

    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`OpenAI API error: ${msg}`);
    }

    return {
      text: data.choices?.[0]?.message?.content ?? "",
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  }

  private async callChatApiJson(req: ProviderJsonRequest): Promise<ProviderResponse> {
    const payload = {
      model: req.model,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxOutputTokens ?? 800,
    };

    const res = await this.fetchWithTimeout(OPENAI_CHAT_URL, payload);
    const data = (await res.json()) as any;

    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`OpenAI API error: ${msg}`);
    }

    return {
      text: data.choices?.[0]?.message?.content ?? "",
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  }

  // ── Responses API ───────────────────────────────────────────────────────

  private async callResponsesApi(req: ProviderTextRequest): Promise<ProviderResponse> {
    const payload = {
      model: req.model,
      store: false,
      max_output_tokens: req.maxOutputTokens ?? 1600,
      input: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt },
      ],
    };

    const res = await this.fetchWithTimeout(OPENAI_RESPONSES_URL, payload);
    const data = (await res.json()) as any;

    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`OpenAI API error: ${msg}`);
    }

    const text = this.extractResponseText(data);
    return {
      text,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    };
  }

  private async callResponsesApiWithSchema(req: ProviderJsonRequest): Promise<ProviderResponse> {
    const payload = {
      model: req.model,
      store: false,
      max_output_tokens: req.maxOutputTokens ?? 2000,
      input: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt },
      ],
      text: { format: req.schema },
    };

    const res = await this.fetchWithTimeout(OPENAI_RESPONSES_URL, payload);
    const data = (await res.json()) as any;

    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`OpenAI API error: ${msg}`);
    }

    const text = this.extractResponseText(data);
    return {
      text,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private extractResponseText(res: any): string {
    if (typeof res.output_text === "string") return res.output_text;
    if (Array.isArray(res.output)) {
      for (const item of res.output) {
        if (Array.isArray(item?.content)) {
          for (const part of item.content) {
            if (typeof part?.text === "string") return part.text;
          }
        }
      }
    }
    return "";
  }

  private async fetchWithTimeout(url: string, payload: unknown): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
