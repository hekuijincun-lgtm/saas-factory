import { useEffect, useState } from 'react';
import type { PlanLimits } from '@/src/lib/plan-limits';

interface TrialInfo {
  endsAt: number;
  expired: boolean;
  daysLeft: number;
}

export interface PlanLimitsResult {
  planId: string;
  status: string;
  limits: PlanLimits;
  trial: TrialInfo | null;
  loading: boolean;
  error: string | null;
}

// Module-level cache keyed by tenantId
const cache: Record<string, { planId: string; status: string; limits: PlanLimits; trial: TrialInfo | null }> = {};

export function usePlanLimits(tenantId: string | undefined): PlanLimitsResult {
  const [result, setResult] = useState<Omit<PlanLimitsResult, 'loading' | 'error'> | null>(
    tenantId && cache[tenantId] ? cache[tenantId] : null,
  );
  const [loading, setLoading] = useState(!result);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    // Return cached value without refetching
    if (cache[tenantId]) {
      setResult(cache[tenantId]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/proxy/billing/plan-limits?tenantId=${encodeURIComponent(tenantId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<any>;
      })
      .then((data: any) => {
        if (cancelled) return;
        const entry = { planId: data.planId, status: data.status, limits: data.limits, trial: data.trial };
        cache[tenantId] = entry;
        setResult(entry);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'fetch failed');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return {
    planId: result?.planId ?? 'starter',
    status: result?.status ?? 'active',
    limits: result?.limits ?? {
      maxStaff: 2,
      maxMenus: 10,
      aiEnabled: false,
      repeatEnabled: false,
      surveyEnabled: false,
      multiLineAccounts: false,
      maxReservationsPerMonth: 100,
    },
    trial: result?.trial ?? null,
    loading,
    error,
  };
}
