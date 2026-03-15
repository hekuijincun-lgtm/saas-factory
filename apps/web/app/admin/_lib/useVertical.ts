import { useState, useEffect } from 'react';
import { fetchAdminSettings } from '../../lib/adminApi';
import { resolveVertical, type VerticalType } from '@/src/types/settings';

export type { VerticalType };

// Module-scope cache (same pattern as useAdminSettings)
const _verticalCache = new Map<string, { vertical: VerticalType; ts: number }>();
const CACHE_TTL_MS = 30_000;

/**
 * テナントの vertical を取得する hook
 * Phase 1a: Admin UI の eyebrow ゲーティングに使用
 */
export function useVertical(tenantId: string): { vertical: VerticalType; loading: boolean } {
  const cached = _verticalCache.get(tenantId);
  const isFresh = cached && (Date.now() - cached.ts < CACHE_TTL_MS);
  const [vertical, setVertical] = useState<VerticalType>(isFresh ? cached.vertical : 'generic');
  const [loading, setLoading] = useState(!isFresh);

  useEffect(() => {
    if (tenantId === 'default') return;
    const entry = _verticalCache.get(tenantId);
    if (entry && (Date.now() - entry.ts < CACHE_TTL_MS)) {
      setVertical(entry.vertical);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchAdminSettings(tenantId)
      .then((raw: any) => {
        const v = resolveVertical(raw);
        _verticalCache.set(tenantId, { vertical: v, ts: Date.now() });
        setVertical(v);
      })
      .catch(() => { /* fallback: generic */ })
      .finally(() => setLoading(false));
  }, [tenantId]);

  return { vertical, loading };
}
