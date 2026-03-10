/**
 * Sales LINE configuration — single source of truth for the sales LINE CTA URL.
 *
 * Resolution priority:
 *   1. lineRouting.sales.{industry} → lineAccounts[].inviteUrl  (admin-managed)
 *   2. NEXT_PUBLIC_SALES_LINE_URL env var                         (env fallback)
 *   3. mailto fallback                                            (safety net)
 *
 * Set NEXT_PUBLIC_SALES_LINE_URL in Pages env or .env.local to activate env fallback.
 * When all sources are unset, CTAs show a disabled/placeholder state — no broken links.
 */

import type { LineAccountIndustry } from '@/src/types/settings';

// ── Types ───────────────────────────────────────────────────────────────────

export type SalesLineSource = 'routing' | 'env' | 'mailto';

export interface SalesLineTarget {
  href: string;
  source: SalesLineSource;
  active: boolean;
  accountId?: string;
}

/** Sanitized account info from the public API (no secrets) */
export interface PublicSalesAccount {
  id: string;
  industry: string;
  purpose: string;
  inviteUrl: string;
  status: 'active' | 'inactive';
  name: string;
}

/** Response from GET /public/sales-line */
export interface PublicSalesLineResponse {
  ok: boolean;
  tenantId: string;
  salesRouting: Record<string, string>;       // industry → accountId
  salesAccounts: PublicSalesAccount[];
}

// ── URL config (env-based, backward compat) ─────────────────────────────────

const RAW_URL = process.env.NEXT_PUBLIC_SALES_LINE_URL ?? '';

/** Validated LINE URL or null if unset/invalid */
export function getSalesLineUrl(): string | null {
  const url = RAW_URL.trim();
  if (!url) return null;
  if (/^https?:\/\/.+/.test(url)) return url;
  return null;
}

/** Whether the sales LINE CTA should be active (env-only check) */
export function isSalesLineActive(): boolean {
  return getSalesLineUrl() !== null;
}

/** Validate a URL is safe (https/http only) */
function isValidUrl(url: string): boolean {
  return /^https?:\/\/.+/.test(url.trim());
}

// ── Fallback config ─────────────────────────────────────────────────────────

export const SALES_FALLBACK_EMAIL = 'hello@lumibook.jp';

export function getSalesFallbackHref(): string {
  return `mailto:${SALES_FALLBACK_EMAIL}?subject=${encodeURIComponent('LumiBook 導入相談')}`;
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve the sales LINE CTA target for a given industry.
 *
 * Priority:
 *   1. routing: salesRouting[industry] → matching account inviteUrl
 *   2. env:     NEXT_PUBLIC_SALES_LINE_URL
 *   3. mailto:  fallback email
 *
 * @param industry - e.g. "eyebrow", "hair", "nail"
 * @param salesData - data from public API (optional; omit for env-only mode)
 */
export function resolveSalesLineTarget(
  industry: LineAccountIndustry | string,
  salesData?: { salesRouting: Record<string, string>; salesAccounts: PublicSalesAccount[] } | null,
): SalesLineTarget {
  // 1. Try routing → account inviteUrl
  if (salesData) {
    const accountId = salesData.salesRouting[industry];
    if (accountId) {
      const account = salesData.salesAccounts.find(
        (a) => a.id === accountId && a.status === 'active',
      );
      if (account?.inviteUrl && isValidUrl(account.inviteUrl)) {
        return {
          href: account.inviteUrl,
          source: 'routing',
          active: true,
          accountId,
        };
      }
    }
    // Also try direct match by industry (account with matching industry, even without routing entry)
    const directMatch = salesData.salesAccounts.find(
      (a) => a.industry === industry && a.status === 'active' && a.inviteUrl && isValidUrl(a.inviteUrl),
    );
    if (directMatch) {
      return {
        href: directMatch.inviteUrl,
        source: 'routing',
        active: true,
        accountId: directMatch.id,
      };
    }
  }

  // 2. Try env
  const envUrl = getSalesLineUrl();
  if (envUrl) {
    return { href: envUrl, source: 'env', active: true };
  }

  // 3. Mailto fallback
  return { href: getSalesFallbackHref(), source: 'mailto', active: false };
}

// ── Server-side data fetcher ────────────────────────────────────────────────

/**
 * Fetch public sales LINE data from Workers API.
 * For use in server components only.
 * Returns null on any error (graceful degradation to env/mailto).
 */
export async function fetchPublicSalesLine(
  tenantId: string,
): Promise<PublicSalesLineResponse | null> {
  try {
    const base = (
      process.env.API_BASE?.trim() ||
      process.env.NEXT_PUBLIC_API_BASE?.trim() ||
      ''
    ).replace(/\/+$/, '');
    if (!base) return null;

    const url = `${base}/public/sales-line?tenantId=${encodeURIComponent(tenantId)}`;
    const res = await fetch(url, {
      next: { revalidate: 300 }, // 5 min ISR cache
    });
    if (!res.ok) return null;
    const data = await res.json() as PublicSalesLineResponse;
    return data.ok ? data : null;
  } catch {
    return null;
  }
}

// ── Analytics ───────────────────────────────────────────────────────────────

export function trackSalesEvent(
  eventName: string,
  params?: Record<string, string>,
): void {
  const payload = { event: eventName, ...params, ts: new Date().toISOString() };
  if (typeof console !== 'undefined') {
    console.log('[sales-analytics]', JSON.stringify(payload));
  }
}
