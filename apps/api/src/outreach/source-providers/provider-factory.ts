// Source Provider Factory (Phase 6 + Phase 9 Google Places)
// ============================================================
// Resolves the correct provider based on source_type.

import type { SourceProvider } from "./types";
import { MockDirectoryProvider } from "./mock-directory";
import { GooglePlacesProvider } from "./google-places";

/** Env keys relevant for provider resolution */
export interface ProviderEnv {
  GOOGLE_MAPS_API_KEY?: string;
}

/**
 * Resolve a SourceProvider by source type.
 * Throws if no provider is registered for the given type.
 */
export function resolveSourceProvider(sourceType: string, env?: ProviderEnv): SourceProvider {
  switch (sourceType) {
    case "directory":
      return new MockDirectoryProvider();
    case "map": {
      const apiKey = env?.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        throw new Error("Google Maps API キーが設定されていません。管理者に GOOGLE_MAPS_API_KEY の設定を依頼してください。");
      }
      return new GooglePlacesProvider(apiKey);
    }
    default:
      throw new Error(`Unknown source type: ${sourceType}. Available: directory, map`);
  }
}

/** List available source types */
export function availableSourceTypes(): string[] {
  return ["directory", "map"];
}
