'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PlanLimits } from '@/src/lib/plan-limits';

interface TrialInfo {
  endsAt: number;
  expired: boolean;
  daysLeft: number;
}

interface PlanLimitsResponse {
  planId: string;
  status: string;
  limits: PlanLimits;
  trial: TrialInfo | null;
}

export default function TrialBanner({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<PlanLimitsResponse | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/proxy/billing/plan-limits?tenantId=${encodeURIComponent(tenantId)}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [tenantId]);

  if (!data) return null;

  const { status, trial } = data;

  // Active paid plan — no banner
  if (status === 'active' && !trial) return null;

  // Trial active
  if (status === 'trialing' && trial && !trial.expired) {
    const urgent = trial.daysLeft <= 3;
    return (
      <div
        className={`px-4 py-2 text-sm font-medium flex items-center justify-between ${
          urgent
            ? 'bg-red-100 text-red-800 border-b border-red-200'
            : 'bg-amber-50 text-amber-800 border-b border-amber-200'
        }`}
      >
        <span>
          無料トライアル中：残り <strong>{trial.daysLeft}</strong> 日
        </span>
        <Link
          href="/admin/billing"
          className={`px-3 py-1 rounded text-xs font-bold ${
            urgent
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-amber-600 text-white hover:bg-amber-700'
          }`}
        >
          アップグレード
        </Link>
      </div>
    );
  }

  // Cancelled or trial expired
  if (status === 'cancelled' || (trial && trial.expired)) {
    return (
      <div className="px-4 py-2 text-sm font-medium flex items-center justify-between bg-red-100 text-red-800 border-b border-red-200">
        <span>プランが無効です。アップグレードしてください。</span>
        <Link
          href="/admin/billing"
          className="px-3 py-1 rounded text-xs font-bold bg-red-600 text-white hover:bg-red-700"
        >
          アップグレード
        </Link>
      </div>
    );
  }

  return null;
}
