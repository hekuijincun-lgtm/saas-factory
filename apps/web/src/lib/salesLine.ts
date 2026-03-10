/**
 * Sales LINE configuration — single source of truth for the sales LINE CTA URL.
 *
 * Set NEXT_PUBLIC_SALES_LINE_URL in Pages env or .env.local to activate.
 * When unset, CTAs show a disabled/placeholder state — no broken links.
 *
 * Future: read from admin settings API for per-tenant customization.
 */

// ── URL config ──────────────────────────────────────────────────────────────

const RAW_URL = process.env.NEXT_PUBLIC_SALES_LINE_URL ?? '';

/** Validated LINE URL or null if unset/invalid */
export function getSalesLineUrl(): string | null {
  const url = RAW_URL.trim();
  if (!url) return null;
  // Basic URL validation — accept https:// and http:// (dev)
  if (/^https?:\/\/.+/.test(url)) return url;
  return null;
}

/** Whether the sales LINE CTA should be active */
export function isSalesLineActive(): boolean {
  return getSalesLineUrl() !== null;
}

// ── Fallback config ─────────────────────────────────────────────────────────

/** Fallback mailto for when LINE URL is not yet configured */
export const SALES_FALLBACK_EMAIL = 'hello@lumibook.jp';

/** Fallback mailto href */
export function getSalesFallbackHref(): string {
  return `mailto:${SALES_FALLBACK_EMAIL}?subject=${encodeURIComponent('LumiBook 導入相談')}`;
}

// ── Analytics ───────────────────────────────────────────────────────────────

/**
 * Lightweight analytics event wrapper.
 * Currently logs to console in development and sets data attributes.
 * Replace internals with gtag / posthog / plausible when ready.
 */
export function trackSalesEvent(
  eventName: string,
  params?: Record<string, string>,
): void {
  const payload = { event: eventName, ...params, ts: new Date().toISOString() };

  // Console log in all environments for now (easy to grep in CF logs)
  if (typeof console !== 'undefined') {
    console.log('[sales-analytics]', JSON.stringify(payload));
  }

  // Future: gtag('event', eventName, params);
  // Future: posthog.capture(eventName, params);
}
