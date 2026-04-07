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

    // PAY.JP flow: redirect to signup page with plan pre-selected.
    // Card input is handled on the signup page via payjp.js.
    window.location.href = `/signup?plan=${encodeURIComponent(planId)}`;
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
