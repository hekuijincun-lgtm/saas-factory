import { useState, useEffect } from 'react';
import { fetchAdminSettings } from '../../lib/adminApi';

export interface AdminSettingsNormalized {
  /** 営業開始時間 "HH:mm" */
  open: string;
  /** 営業終了時間 "HH:mm" */
  close: string;
  /** 予約スロット間隔（分） */
  interval: number;
}

const FALLBACK: AdminSettingsNormalized = { open: '10:00', close: '19:00', interval: 30 };

// Module-scope cache keyed by tenantId (survives React re-renders; cleared on page refresh)
const _cache = new Map<string, AdminSettingsNormalized>();

/**
 * API レスポンス（flat or nested）→ 正規化
 * ネスト形式 { businessHours: { open, close } } を優先し、
 * フラット形式 { openTime, closeTime, slotIntervalMin } にフォールバック
 * 空文字列も FALLBACK に落とす
 */
export function normalizeSettings(raw: unknown): AdminSettingsNormalized {
  const r = raw as any;
  const openRaw  = r?.businessHours?.open  ?? r?.openTime  ?? '';
  const closeRaw = r?.businessHours?.close ?? r?.closeTime ?? '';
  const iv       = Number(r?.slotIntervalMin ?? r?.businessHours?.slotIntervalMin ?? r?.slotMinutes ?? FALLBACK.interval);
  return {
    open:  (openRaw  && /^\d{2}:\d{2}$/.test(openRaw))  ? openRaw  : FALLBACK.open,
    close: (closeRaw && /^\d{2}:\d{2}$/.test(closeRaw)) ? closeRaw : FALLBACK.close,
    interval: iv > 0 && iv <= 240 ? iv : FALLBACK.interval,
  };
}

/**
 * 管理者設定（営業時間・スロット間隔）を取得する共通 hook
 *
 * - 取得失敗時は FALLBACK 値で動作継続（既存 UI を壊さない）
 * - module-scope キャッシュにより同一 tenantId の重複 fetch を防ぐ
 *
 * @param tenantId - テナントID (default: 'default')
 * @returns { settings, loading, error, reload }
 */
export function useAdminSettings(tenantId: string = 'default') {
  const cached = _cache.get(tenantId);
  const [settings, setSettings] = useState<AdminSettingsNormalized>(cached ?? FALLBACK);
  const [loading,  setLoading]  = useState(!cached);
  const [error,    setError]    = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchAdminSettings(tenantId);
      const n = normalizeSettings(raw);
      _cache.set(tenantId, n);
      setSettings(n);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'settings取得失敗';
      setError(msg);
      // settings は FALLBACK のまま継続（UI を壊さない）
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!_cache.has(tenantId)) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  return { settings, loading, error, reload: load };
}
