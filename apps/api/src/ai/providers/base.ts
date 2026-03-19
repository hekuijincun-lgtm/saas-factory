/**
 * AI Core — Provider Adapter Base Interface
 */

import type { ProviderTextRequest, ProviderJsonRequest, ProviderResponse } from "../types";

export interface ProviderAdapter {
  readonly name: string;

  /** Generate text response */
  generateText(req: ProviderTextRequest): Promise<ProviderResponse>;

  /** Generate JSON response (uses structured output when available) */
  generateJson(req: ProviderJsonRequest): Promise<ProviderResponse>;

  /** Classify text (convenience: calls generateJson internally) */
  classify(req: ProviderJsonRequest): Promise<ProviderResponse>;
}
