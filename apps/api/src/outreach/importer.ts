// Outreach OS — CSV Lead Importer (Phase 5)
// ============================================================
// Validates, normalizes, detects duplicates, and imports leads from CSV.

import type { ImportPreviewRow, ImportResult } from "./types";

// ── CSV Parsing ─────────────────────────────────────────────────────────────

/** Known CSV header aliases → canonical field names */
const HEADER_MAP: Record<string, string> = {
  store_name: "store_name",
  storename: "store_name",
  "店舗名": "store_name",
  name: "store_name",

  category: "category",
  "カテゴリ": "category",
  "業種": "category",

  area: "area",
  "エリア": "area",
  "地域": "area",
  region: "area",

  website_url: "website_url",
  website: "website_url",
  url: "website_url",
  "ウェブサイト": "website_url",

  email: "email",
  contact_email: "email",
  "メール": "email",

  phone: "phone",
  "電話": "phone",
  "電話番号": "phone",

  rating: "rating",
  "評価": "rating",

  review_count: "review_count",
  reviews: "review_count",
  "レビュー数": "review_count",
};

export interface ParsedRow {
  rowIndex: number;
  store_name?: string;
  category?: string;
  area?: string;
  website_url?: string;
  email?: string;
  phone?: string;
  rating?: number;
  review_count?: number;
}

/**
 * Parse CSV text into structured rows with header mapping.
 */
export function parseCsv(csvText: string): ParsedRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
  const fieldMap = headers.map((h) => HEADER_MAP[h] ?? null);

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: any = { rowIndex: i };
    for (let j = 0; j < fieldMap.length; j++) {
      const field = fieldMap[j];
      if (!field) continue;
      const val = cols[j]?.trim().replace(/^["']|["']$/g, "") ?? "";
      if (!val) continue;
      if (field === "rating") {
        row.rating = parseFloat(val) || undefined;
      } else if (field === "review_count") {
        row.review_count = parseInt(val, 10) || undefined;
      } else {
        row[field] = val;
      }
    }
    rows.push(row);
  }
  return rows;
}

/** Split a CSV line respecting quoted fields */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"' && !inQuote) { inQuote = true; continue; }
    if (ch === '"' && inQuote) { inQuote = false; continue; }
    if (ch === "," && !inQuote) { result.push(current); current = ""; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

// ── Validation ──────────────────────────────────────────────────────────────

export function validateRow(row: ParsedRow): string[] {
  const errors: string[] = [];
  if (!row.store_name?.trim()) {
    errors.push("store_name は必須です");
  }
  if (row.website_url && !isValidUrl(row.website_url)) {
    errors.push("website_url が不正です");
  }
  if (row.email && !isValidEmail(row.email)) {
    errors.push("email が不正です");
  }
  if (row.rating != null && (row.rating < 0 || row.rating > 5)) {
    errors.push("rating は 0-5 の範囲で指定してください");
  }
  return errors;
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url.startsWith("http") ? url : `https://${url}`);
    return true;
  } catch { return false; }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Domain Normalization ────────────────────────────────────────────────────

export function normalizeDomain(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch { return null; }
}

// ── Dedup Detection ─────────────────────────────────────────────────────────

export interface ExistingLead {
  id: string;
  store_name: string;
  normalized_domain: string | null;
  contact_email: string | null;
  area: string | null;
}

/**
 * Build preview rows with dedup detection.
 */
export function buildPreview(
  parsed: ParsedRow[],
  existingLeads: ExistingLead[]
): ImportPreviewRow[] {
  // Build lookup indexes
  const byDomain = new Map<string, ExistingLead>();
  const byEmail = new Map<string, ExistingLead>();
  const byNameArea = new Map<string, ExistingLead>();

  for (const lead of existingLeads) {
    if (lead.normalized_domain) byDomain.set(lead.normalized_domain, lead);
    if (lead.contact_email) byEmail.set(lead.contact_email.toLowerCase(), lead);
    const key = `${lead.store_name?.toLowerCase()}|${lead.area?.toLowerCase() ?? ""}`;
    byNameArea.set(key, lead);
  }

  return parsed.map((row) => {
    const errors = validateRow(row);
    if (errors.length > 0) {
      return {
        rowIndex: row.rowIndex,
        store_name: row.store_name ?? "",
        category: row.category,
        area: row.area,
        website_url: row.website_url,
        email: row.email,
        phone: row.phone,
        rating: row.rating,
        review_count: row.review_count,
        status: "invalid" as const,
        errors,
      };
    }

    // Check domain match
    const domain = normalizeDomain(row.website_url);
    let match = domain ? byDomain.get(domain) : undefined;

    // Check email match
    if (!match && row.email) {
      match = byEmail.get(row.email.toLowerCase());
    }

    // Loose: store_name + area
    if (!match && row.store_name && row.area) {
      const key = `${row.store_name.toLowerCase()}|${row.area.toLowerCase()}`;
      match = byNameArea.get(key);
    }

    if (match) {
      return {
        rowIndex: row.rowIndex,
        store_name: row.store_name ?? "",
        category: row.category,
        area: row.area,
        website_url: row.website_url,
        email: row.email,
        phone: row.phone,
        rating: row.rating,
        review_count: row.review_count,
        status: "duplicate" as const,
        errors: [],
        duplicateLeadId: match.id,
        duplicateStoreName: match.store_name,
      };
    }

    return {
      rowIndex: row.rowIndex,
      store_name: row.store_name ?? "",
      category: row.category,
      area: row.area,
      website_url: row.website_url,
      email: row.email,
      phone: row.phone,
      rating: row.rating,
      review_count: row.review_count,
      status: "valid" as const,
      errors: [],
    };
  });
}

// ── Merge Logic ─────────────────────────────────────────────────────────────

/**
 * Build SQL SET clauses for merging CSV data into existing lead.
 * Only fills in empty fields — never overwrites existing data.
 */
export function buildMergeSets(
  existing: Record<string, any>,
  csvRow: ParsedRow
): { sets: string[]; vals: any[] } {
  const sets: string[] = [];
  const vals: any[] = [];
  const mergeFields: Array<[string, any]> = [
    ["category", csvRow.category],
    ["area", csvRow.area],
    ["website_url", csvRow.website_url],
    ["contact_email", csvRow.email],
    ["rating", csvRow.rating],
    ["review_count", csvRow.review_count],
  ];

  let idx = 1;
  for (const [col, val] of mergeFields) {
    if (val != null && val !== "" && (existing[col] == null || existing[col] === "")) {
      sets.push(`${col} = ?${idx}`);
      vals.push(val);
      idx++;
    }
  }

  // Always update domain if website_url was merged
  if (csvRow.website_url && !existing.website_url) {
    const domain = normalizeDomain(csvRow.website_url);
    if (domain) {
      sets.push(`domain = ?${idx}`);
      vals.push(domain);
      idx++;
      sets.push(`normalized_domain = ?${idx}`);
      vals.push(domain);
      idx++;
    }
  }

  return { sets, vals };
}
