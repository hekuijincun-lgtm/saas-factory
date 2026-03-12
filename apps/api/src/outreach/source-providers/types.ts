// Source Provider Abstraction (Phase 6)
// ============================================================
// Defines the interface that all source providers must implement.

export interface SourceSearchInput {
  query: string;
  location?: string;
  niche?: string;
  maxResults?: number;
}

export interface CandidateResult {
  storeName: string;
  category?: string;
  area?: string;
  address?: string;
  websiteUrl?: string;
  phone?: string;
  email?: string;
  rating?: number;
  reviewCount?: number;
  sourceUrl?: string;
  externalId?: string;
  rawPayload?: Record<string, unknown>;
}

export interface SourceSearchResult {
  candidates: CandidateResult[];
  totalFound: number;
  truncated: boolean;
}

export interface SourceProvider {
  readonly name: string;
  readonly sourceType: string;
  searchCandidates(input: SourceSearchInput): Promise<SourceSearchResult>;
}
