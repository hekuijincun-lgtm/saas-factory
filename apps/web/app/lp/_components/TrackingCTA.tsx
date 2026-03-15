'use client';

import { useCallback } from 'react';
import Link from 'next/link';

/**
 * Phase 13: LP CTA tracking component
 *
 * Tracks CTA click events with vertical/page/variant metadata.
 * Events are sent to /api/proxy/analytics/lp-event as fire-and-forget.
 * Falls back gracefully if endpoint unavailable.
 */

export interface LpTrackEvent {
  event: 'lp_cta_click' | 'lp_signup_click' | 'lp_demo_click';
  vertical: string;
  cta: string;           // e.g. 'hero_primary', 'hero_secondary', 'flow_cta', 'pricing_starter', 'final_cta'
  variant?: string;       // A/B test variant (e.g. 'A', 'B', 'control')
  page: string;           // e.g. '/lp/nail'
  timestamp: string;
  referrer?: string;
}

function sendEvent(evt: LpTrackEvent) {
  try {
    // Fire-and-forget beacon
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/proxy/analytics/lp-event', JSON.stringify(evt));
    } else {
      fetch('/api/proxy/analytics/lp-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evt),
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Silent fail — tracking should never break UX
  }
}

interface TrackingCTAProps {
  href: string;
  vertical: string;
  cta: string;
  variant?: string;
  eventType?: LpTrackEvent['event'];
  className?: string;
  children: React.ReactNode;
}

export function TrackingCTA({
  href, vertical, cta, variant, eventType = 'lp_cta_click', className, children,
}: TrackingCTAProps) {
  const handleClick = useCallback(() => {
    sendEvent({
      event: eventType,
      vertical,
      cta,
      variant,
      page: typeof window !== 'undefined' ? window.location.pathname : `/lp/${vertical}`,
      timestamp: new Date().toISOString(),
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
    });
  }, [eventType, vertical, cta, variant]);

  return (
    <Link href={href} onClick={handleClick} className={className}>
      {children}
    </Link>
  );
}

/**
 * Hook to get A/B variant from URL query (?variant=A) or random assignment.
 * Returns stable variant per session via sessionStorage.
 */
export function useVariant(defaultVariant = 'control'): string {
  if (typeof window === 'undefined') return defaultVariant;
  const stored = sessionStorage.getItem('lp_variant');
  if (stored) return stored;
  const params = new URLSearchParams(window.location.search);
  const v = params.get('variant') ?? defaultVariant;
  sessionStorage.setItem('lp_variant', v);
  return v;
}
