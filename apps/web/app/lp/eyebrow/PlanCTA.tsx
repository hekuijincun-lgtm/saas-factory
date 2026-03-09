'use client';

import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';

interface PlanCTAProps {
  planId: string;
  label: string;
  highlighted?: boolean;
}

export function PlanCTA({ planId, label, highlighted = false }: PlanCTAProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/proxy/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });

      const data = await res.json() as { ok: boolean; url?: string; error?: string };

      if (data.ok && data.url) {
        window.location.href = data.url;
        return;
      }

      // Stripe not configured — fallback to direct signup
      if (data.error === 'stripe_not_configured' || data.error === 'price_not_configured') {
        window.location.href = '/signup';
        return;
      }

      setError(data.error ?? '決済の開始に失敗しました');
    } catch {
      // Network error — fallback to signup
      window.location.href = '/signup';
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={`group w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold text-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-wait ${
          highlighted
            ? 'bg-rose-500 text-white hover:bg-rose-400 focus-visible:ring-rose-400 focus-visible:ring-offset-slate-900'
            : 'bg-gray-900 text-white hover:bg-gray-700 focus-visible:ring-gray-900'
        }`}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            処理中...
          </>
        ) : (
          <>
            {label}
            <ArrowRight
              className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </>
        )}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
