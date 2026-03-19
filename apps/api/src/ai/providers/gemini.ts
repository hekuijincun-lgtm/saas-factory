/**
 * AI Core — Google Gemini Provider Adapter
 *
 * Uses Gemini REST API (generateContent endpoint).
 */

import type { ProviderAdapter } from "./base";
import type { ProviderTextRequest, ProviderJsonRequest, ProviderResponse } from "../types";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TIMEOUT_MS = 30_000;

export class GeminiAdapter implements ProviderAdapter {
  readonly name = "gemini";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateText(req: ProviderTextRequest): Promise<ProviderResponse> {
    return this.callGenerateContent(req);
  }

  async generateJson(req: ProviderJsonRequest): Promise<ProviderResponse> {
    return this.callGenerateContent({
      ...req,
      systemPrompt: req.systemPrompt + "\n\nJSON形式で回答してください。必ず有効なJSONのみを返してください。",
    });
  }

  async classify(req: ProviderJsonRequest): Promise<ProviderResponse> {
    return this.generateJson(req);
  }

  private async callGenerateContent(req: ProviderTextRequest): Promise<ProviderResponse> {
    const url = `${GEMINI_BASE_URL}/${req.model}:generateContent?key=${this.apiKey}`;

    const payload = {
      system_instruction: {
        parts: [{ text: req.systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: req.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxOutputTokens ?? 800,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const data = (await res.json()) as any;

    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Gemini API error: ${msg}`);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const usage = data?.usageMetadata;

    return {
      text,
      inputTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
    };
  }
}
