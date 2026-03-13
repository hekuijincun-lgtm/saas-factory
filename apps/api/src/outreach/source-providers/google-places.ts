// Google Places Provider (Phase 9)
// ============================================================
// Real Google Maps / Places API integration for lead sourcing.
// Uses Text Search (New) + Place Details APIs.

import type { SourceProvider, SourceSearchInput, SourceSearchResult, CandidateResult } from "./types";

// ── Configuration ─────────────────────────────────────────────────────

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";

/** Max candidates per search (safe limit) */
const DEFAULT_MAX_RESULTS = 20;
const ABSOLUTE_MAX_RESULTS = 60;

/** Max Place Details calls per search (cost control) */
const MAX_DETAILS_PER_SEARCH = 20;

/** Request timeout in ms */
const REQUEST_TIMEOUT_MS = 15_000;

/** Retry config */
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 1_000;

// ── Types: Google Places API (New) responses ─────────────────────────

interface GoogleTextSearchResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
}

interface GooglePlace {
  id: string; // place_id
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  googleMapsUri?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text: string };
  shortFormattedAddress?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function buildTextSearchBody(
  input: SourceSearchInput,
  pageToken?: string
): { textQuery: string; pageSize: number; pageToken?: string; languageCode: string } {
  // Compose query: combine query + niche + location
  const parts: string[] = [];
  if (input.niche) parts.push(input.niche);
  if (input.query) parts.push(input.query);
  if (input.location) parts.push(input.location);
  const textQuery = parts.join(" ").trim() || "店舗";

  const pageSize = Math.min(input.maxResults ?? DEFAULT_MAX_RESULTS, 20); // API max is 20 per page

  const body: any = { textQuery, pageSize, languageCode: "ja" };
  if (pageToken) body.pageToken = pageToken;
  return body;
}

function buildFieldMask(includeDetails: boolean): string {
  const base = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.shortFormattedAddress",
    "places.location",
    "places.rating",
    "places.userRatingCount",
    "places.types",
    "places.primaryType",
    "places.primaryTypeDisplayName",
    "places.googleMapsUri",
  ];
  if (includeDetails) {
    base.push("places.websiteUri", "places.nationalPhoneNumber", "places.internationalPhoneNumber");
  }
  return base.join(",");
}

/** Extract area from address (Japanese: after 都道府県, take 市区町村) */
function extractArea(address: string | undefined): string | undefined {
  if (!address) return undefined;
  // Match patterns like "東京都渋谷区..." → "渋谷区", "埼玉県さいたま市大宮区" → "大宮区"
  const match = address.match(/(?:東京都|北海道|(?:大阪|京都)府|.{2,3}県)(.+?[市区町村郡])/);
  if (match) return match[1];
  // Fallback: first significant segment
  const parts = address.split(/[,、\s]+/).filter(Boolean);
  return parts[1] || parts[0] || undefined;
}

/** Map Google types to a human-readable category */
function mapCategory(place: GooglePlace): string | undefined {
  if (place.primaryTypeDisplayName?.text) return place.primaryTypeDisplayName.text;
  if (place.primaryType) {
    const typeLabels: Record<string, string> = {
      beauty_salon: "美容室",
      hair_care: "ヘアケア",
      nail_salon: "ネイルサロン",
      spa: "スパ",
      gym: "ジム",
      restaurant: "レストラン",
      cafe: "カフェ",
      bar: "バー",
      store: "店舗",
      lodging: "宿泊",
      health: "健康",
    };
    return typeLabels[place.primaryType] || place.primaryType;
  }
  if (place.types?.length) return place.types[0];
  return undefined;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, REQUEST_TIMEOUT_MS);
      if (res.ok || res.status < 500) return res; // Don't retry client errors
      lastError = new Error(`Google API ${res.status}: ${res.statusText}`);
    } catch (err: any) {
      lastError = err;
      if (err.name === "AbortError") {
        lastError = new Error("Google API request timed out");
      }
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  throw lastError ?? new Error("Google API request failed");
}

// ── Provider ─────────────────────────────────────────────────────────

export class GooglePlacesProvider implements SourceProvider {
  readonly name = "google-places";
  readonly sourceType = "map";

  private apiKey: string;
  private detailsEnabled: boolean;

  constructor(apiKey: string, options?: { detailsEnabled?: boolean }) {
    this.apiKey = apiKey;
    this.detailsEnabled = options?.detailsEnabled ?? true;
  }

  async searchCandidates(input: SourceSearchInput): Promise<SourceSearchResult> {
    const maxResults = Math.min(input.maxResults ?? DEFAULT_MAX_RESULTS, ABSOLUTE_MAX_RESULTS);
    const allPlaces: GooglePlace[] = [];
    let pageToken: string | undefined;
    let pages = 0;
    const maxPages = Math.ceil(maxResults / 20);

    // Request details fields inline if enabled (saves separate Details calls)
    const fieldMask = buildFieldMask(this.detailsEnabled);

    // Paginated text search
    while (allPlaces.length < maxResults && pages < maxPages) {
      const body = buildTextSearchBody(input, pageToken);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": fieldMask,
      };

      console.log(`[GooglePlaces] Text Search page=${pages + 1}, query="${body.textQuery}", maxResults=${maxResults}`);

      const res = await fetchWithRetry(TEXT_SEARCH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const status = res.status;
        console.error(`[GooglePlaces] API error: status=${status}, body=${errText.slice(0, 500)}`);
        if (status === 403 || status === 401) {
          // Parse Google error for specific reason
          const isDisabled = errText.includes("SERVICE_DISABLED") || errText.includes("has not been used");
          if (isDisabled) {
            throw new Error("Google Places API (New) が有効になっていません。Google Cloud Console で Places API (New) を有効にしてください。");
          }
          throw new Error(`Google API 認証エラー (${status}): APIキーまたは権限を確認してください。`);
        }
        if (status === 429) {
          throw new Error("Google API のレート制限に達しました。しばらく待ってから再試行してください。");
        }
        throw new Error(`Google Places API error (${status}): ${errText.slice(0, 200)}`);
      }

      const data: GoogleTextSearchResponse = await res.json();
      const places = data.places ?? [];

      if (places.length === 0) break;
      allPlaces.push(...places);
      pages++;

      pageToken = data.nextPageToken;
      if (!pageToken) break;

      // Google requires a short delay before using nextPageToken
      if (allPlaces.length < maxResults && pageToken) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    console.log(`[GooglePlaces] Total fetched: ${allPlaces.length} places in ${pages} page(s)`);

    // Optionally fetch details for places missing website/phone
    // (Only needed if we didn't request details fields in Text Search)
    let detailsFetched = 0;
    if (!this.detailsEnabled) {
      // Details are requested inline via field mask, so no extra calls needed
      // This block would only run if detailsEnabled was false AND we wanted selective details
    }

    // Map to CandidateResult
    const truncated = allPlaces.length > maxResults;
    const limited = allPlaces.slice(0, maxResults);
    const candidates: CandidateResult[] = limited.map((place) => ({
      storeName: place.displayName?.text ?? "Unknown",
      category: mapCategory(place),
      area: extractArea(place.formattedAddress),
      address: place.formattedAddress,
      websiteUrl: place.websiteUri ?? undefined,
      phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? undefined,
      rating: place.rating,
      reviewCount: place.userRatingCount,
      sourceUrl: place.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${place.id}`,
      externalId: place.id,
      rawPayload: {
        types: place.types,
        primaryType: place.primaryType,
        location: place.location,
        shortAddress: place.shortFormattedAddress,
        detailsFetched,
      },
    }));

    return {
      candidates,
      totalFound: allPlaces.length,
      truncated,
    };
  }
}
