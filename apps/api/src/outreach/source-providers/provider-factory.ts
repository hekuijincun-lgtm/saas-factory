// Source Provider Factory (Phase 6)
// ============================================================
// Resolves the correct provider based on source_type.

import type { SourceProvider } from "./types";
import { MockDirectoryProvider } from "./mock-directory";

const providers: Record<string, () => SourceProvider> = {
  directory: () => new MockDirectoryProvider(),
  map: () => new MockDirectoryProvider(), // placeholder: map uses same mock for now
};

/**
 * Resolve a SourceProvider by source type.
 * Throws if no provider is registered for the given type.
 */
export function resolveSourceProvider(sourceType: string): SourceProvider {
  const factory = providers[sourceType];
  if (!factory) {
    throw new Error(`Unknown source type: ${sourceType}. Available: ${Object.keys(providers).join(", ")}`);
  }
  return factory();
}

/** List available source types */
export function availableSourceTypes(): string[] {
  return Object.keys(providers);
}
