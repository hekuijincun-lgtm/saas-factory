'use client';

import { MessageCircle, ArrowRight, Mail } from 'lucide-react';
import {
  getSalesLineUrl,
  getSalesFallbackHref,
  isSalesLineActive,
  trackSalesEvent,
  type SalesLineTarget,
} from '@/src/lib/salesLine';

// ── Types ───────────────────────────────────────────────────────────────────

type CTAVariant = 'hero' | 'section' | 'sticky' | 'inline';

interface SalesLineCTAProps {
  variant?: CTAVariant;
  /** Override default CTA label */
  label?: string;
  /** Sub-text shown below the button (hero/section only) */
  subtitle?: string;
  className?: string;
  /**
   * Pre-resolved target from server component.
   * When provided, takes precedence over env-based resolution.
   * Enables routing → env → mailto cascade from admin settings.
   */
  target?: SalesLineTarget;
}

// ── Styles per variant ──────────────────────────────────────────────────────

const VARIANT_STYLES: Record<CTAVariant, {
  button: string;
  icon: string;
  label: string;
  defaultLabel: string;
  defaultDisabledLabel: string;
}> = {
  hero: {
    button:
      'inline-flex items-center gap-2.5 px-8 py-4 bg-[#06C755] text-white font-bold rounded-full text-base hover:bg-[#05b34d] transition-all duration-200 shadow-xl shadow-green-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
    icon: 'w-5 h-5',
    label: '',
    defaultLabel: 'LINEで無料診断する',
    defaultDisabledLabel: 'LINE準備中 — メールでご相談',
  },
  section: {
    button:
      'inline-flex items-center gap-2 px-7 py-3.5 bg-[#06C755] text-white font-bold rounded-full text-sm hover:bg-[#05b34d] transition-all duration-200 shadow-lg shadow-green-900/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2',
    icon: 'w-4 h-4',
    label: '',
    defaultLabel: 'LINEで相談する',
    defaultDisabledLabel: 'メールでご相談',
  },
  sticky: {
    button:
      'flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-[#06C755] text-white font-bold rounded-full text-sm hover:bg-[#05b34d] transition-all duration-200 shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400',
    icon: 'w-4 h-4',
    label: '',
    defaultLabel: '30秒で相談スタート',
    defaultDisabledLabel: 'メールでお問い合わせ',
  },
  inline: {
    button:
      'inline-flex items-center gap-1.5 text-sm font-semibold text-[#06C755] hover:text-[#05b34d] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded',
    icon: 'w-4 h-4',
    label: '',
    defaultLabel: 'LINEで相談する',
    defaultDisabledLabel: 'メールで相談する',
  },
};

// ── Component ───────────────────────────────────────────────────────────────

export function SalesLineCTA({
  variant = 'section',
  label,
  subtitle,
  className = '',
  target,
}: SalesLineCTAProps) {
  // Use pre-resolved target if provided, otherwise fall back to env-only logic
  const active = target ? target.active : isSalesLineActive();
  const source = target?.source ?? (isSalesLineActive() ? 'env' : 'mailto');
  const styles = VARIANT_STYLES[variant];

  const displayLabel =
    label ?? (active ? styles.defaultLabel : styles.defaultDisabledLabel);

  const href = target
    ? target.href
    : (active ? getSalesLineUrl()! : getSalesFallbackHref());

  const handleClick = () => {
    if (active) {
      trackSalesEvent('sales_line_cta_click', {
        variant,
        label: displayLabel,
        source,
      });
    } else {
      trackSalesEvent('sales_line_cta_disabled_click', {
        variant,
        label: displayLabel,
        fallback: 'email',
        source,
      });
    }
  };

  const Icon = active ? MessageCircle : Mail;

  return (
    <div className={className}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        data-analytics="sales_line_cta"
        data-analytics-variant={variant}
        data-analytics-active={active ? '1' : '0'}
        data-analytics-source={source}
        className={`group ${styles.button}`}
      >
        <Icon className={`${styles.icon} shrink-0`} aria-hidden="true" />
        <span>{displayLabel}</span>
        {variant !== 'inline' && (
          <ArrowRight
            className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          />
        )}
      </a>
      {subtitle && variant !== 'sticky' && (
        <p className="mt-2 text-xs text-gray-400">{subtitle}</p>
      )}
    </div>
  );
}

// ── Sticky CTA bar (mobile) ─────────────────────────────────────────────────

export function SalesLineStickyBar({ target }: { target?: SalesLineTarget }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden p-3 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <SalesLineCTA variant="sticky" target={target} />
    </div>
  );
}
