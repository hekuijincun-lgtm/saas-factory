export type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
};
/**
 * 管理者設定APIクライアント
 */

import { apiGet, apiPut, apiPost, apiDelete, ApiClientError } from './apiClient';
import type { AdminSettings } from '../types/settings';
import { DEFAULT_ADMIN_SETTINGS } from '../types/settings';

/**
 * LINE設定関連の型
 */
export type LineConfigResponse = {
  ok: boolean;
  configured: boolean;
  masked: {
    clientIdLast4: string | null;
    tokenPresent: boolean;
    secretPresent: boolean;
  };
};

export type LineConfigInput = {
  clientId: string;
  channelAccessToken: string;
  channelSecret: string;
};

/**
 * GET /admin/settings を実行
 */
export async function getAdminSettings(): Promise<AdminSettings> {
  try {
    const response = await apiGet<ApiResponse<AdminSettings>>('/admin/settings');
    if (response.ok && response.data) {
      // 取得したデータをデフォルト値でマージして欠損フィールドを補完
      return mergeDefaults(response.data, DEFAULT_ADMIN_SETTINGS);
}
    throw new Error(response.error || 'Failed to fetch settings');
  } catch (error) {
    // API失敗時はlocalStorageから読み込む（fallback）
    console.warn('Failed to fetch settings from API, trying localStorage:', error);
    return getDefaultSettings();
  }
}

/**
 * PUT /admin/settings を実行
 */
export async function updateAdminSettings(input: AdminSettings): Promise<AdminSettings> {
  // 保存前にマージして欠損フィールドを補完
  const merged = mergeDefaults(DEFAULT_ADMIN_SETTINGS, input);
  
  try {
    const response = await apiPut<ApiResponse<AdminSettings>>('/admin/settings', merged);
    if (response.ok && response.data) {
      // レスポンスもマージして返す
      const result = mergeDefaults(response.data as unknown as Partial<AdminSettings>, DEFAULT_ADMIN_SETTINGS);
      // 成功時はlocalStorageにも保存（オフライン時のフォールバック用）
      saveToLocalStorage(result);
      return result;
    }
    throw new Error(response.error || 'Failed to update settings');
  } catch (error) {
    // API失敗時は localStorage に保存（fallback）
    console.warn('API not available, saving to localStorage:', error);
    saveToLocalStorage(merged);
    return merged;
  }
}

/**
 * POST /admin/settings/test-slack を実行（Slackテスト送信）
 */
export async function sendTestSlack(webhookUrl?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await apiPost<{ ok: boolean; error?: string }>('/admin/settings/test-slack', {
      webhookUrl: webhookUrl || undefined,
    });
    return response;
  } catch (error) {
    if (error instanceof ApiClientError) {
      return {
        ok: false,
        error: error.message,
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to send test notification',
    };
  }
}

/**
 * 深いマージ関数（デフォルト値で欠損フィールドを補完）
 */
export function mergeDefaults<T extends object>(input: Partial<T> | null | undefined, defaults: T): T {
  if (!input) return defaults;

  const merged: any = { ...(defaults as any) };
  for (const [key, value] of Object.entries(input as any)) {
    if (value === undefined || value === null) continue;
    const defVal = (defaults as any)[key];

    const valueIsObj = typeof value === 'object' && value !== null && !Array.isArray(value);
    const defIsObj   = typeof defVal === 'object' && defVal !== null && !Array.isArray(defVal);

    if (valueIsObj && defIsObj) {
      merged[key] = mergeDefaults(value as any, defVal as any);
    } else {
      merged[key] = value;
    }
  }

  return merged as T;
}

/**
 * デフォルト設定を取得
 */
function getDefaultSettings(): AdminSettings {
  // localStorage から読み込みを試行
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('lumiere.adminSettings');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<AdminSettings>;
        // マージして欠損フィールドを補完
        return mergeDefaults(parsed, DEFAULT_ADMIN_SETTINGS);
}
    } catch (err) {
      console.warn('Failed to load from localStorage:', err);
    }
  }

  // 完全なデフォルト値
  return DEFAULT_ADMIN_SETTINGS;
}

/**
 * localStorage に保存
 */
function saveToLocalStorage(settings: AdminSettings): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('lumiere.adminSettings', JSON.stringify(settings));
    } catch (err) {
      console.error('Failed to save to localStorage:', err);
    }
  }
}

export type LineStatus =
  | { kind: 'loading' }
  | { kind: 'unconfigured'; message: string }
  | { kind: 'disconnected' }
  | {
      kind: 'connected';
      provider: 'line';
      linkedAt?: string;
      notifyEnabled: boolean;
      lineUserIdMasked?: string;
      lastSentAt: {
        message: string;
        at: number;
      } | null;
      lastError: {
        message: string;
        error: string;
        at: number;
      } | null;
    }
  | { kind: 'error'; message: string };

/**
 * NOTE:
 * /api/proxy/* は Next.js の Route Handler。
 * Worker の API_BASE は使わず、必ず相対パスで叩く。
 */
export async function getLineStatus(tenantId?: string): Promise<LineStatus> {
  try {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    const response = await fetch(`https://saas-factory-api..workers.dev/admin/integrations/line/status${qs}`, {
      cache: 'no-store',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json() as LineStatus;
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Failed to fetch LINE status',
    };
  }
}

/**
 * PATCH /admin/integrations/line/notify を実行（通知ON/OFF）
 */
export async function updateLineNotify(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await apiPut<{ ok: boolean; error?: string }>('/api/proxy/admin/line/notify', {
      enabled,
    });
    return response;
  } catch (error) {
    if (error instanceof ApiClientError) {
      return {
        ok: false,
        error: error.message,
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to update LINE notify settings',
    };
  }
}

/**
 * GET /admin/line/client-id を実行（LINE Client ID取得）
 */
export async function getLineClientId(tenantId?: string): Promise<{ ok: boolean; clientId?: string; error?: string }> {
  try {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    const response = await fetch(`/api/proxy/admin/line/client-id${qs}`, {
      cache: 'no-store',
    });
    const json = await response.json();
    if (response.ok && json.ok && json.clientId) {
      return { ok: true, clientId: json.clientId };
    }
    return {
      ok: false,
      error: json.error || 'Failed to get LINE client ID',
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to get LINE client ID',
    };
  }
}

/**
 * GET /admin/integrations/line/auth-url を実行（LINE認証URL取得）
 */
export async function getLineAuthUrl(): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    // まず clientId を取得（D1から）
    const clientIdResult = await getLineClientId();
    if (!clientIdResult.ok || !clientIdResult.clientId) {
      return {
        ok: false,
        error: clientIdResult.error || 'LINE Client ID is not configured',
      };
    }

    // auth-url エンドポイントを呼び出す（clientId は既に Worker 側で取得済み）
    const response = await apiGet<{ ok: boolean; url?: string; error?: string }>('https://saas-factory-api..workers.dev/admin/integrations/line/auth-url');
    return response;
  } catch (error) {
    if (error instanceof ApiClientError) {
      return {
        ok: false,
        error: error.message,
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to get LINE auth URL',
    };
  }
}

/**
 * POST /admin/integrations/line/disconnect を実行（LINE連携解除）
 */
export async function disconnectLine(): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await apiPost<{ ok: boolean; error?: string }>('/api/proxy/admin/line/disconnect', {});
    return response;
  } catch (error) {
    if (error instanceof ApiClientError) {
      return {
        ok: false,
        error: error.message,
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to disconnect LINE',
    };
  }
}

/**
 * POST /admin/integrations/line/test を実行（LINE疎通テスト）
 */
export async function testLineConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await apiPost<{ ok: boolean; error?: string }>('/api/proxy/admin/line/test', {});
    return response;
  } catch (error) {
    if (error instanceof ApiClientError) {
      return {
        ok: false,
        error: error.message,
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to test LINE connection',
    };
  }
}

/**
 * GET /admin/line/config を実行
 */
export async function getLineConfig(): Promise<LineConfigResponse> {
  const response = await apiGet<ApiResponse<LineConfigResponse>>('/api/proxy/admin/line/config');
  if (response.ok && response.data) {
    return response.data;
  }
  throw new Error(response.error || 'Failed to fetch LINE config');
}

/**
 * POST /admin/line/config を実行（相対パスで Next.js proxy を経由）
 * NOTE: /api/proxy/* は Next.js の Route Handler なので、必ず相対パスで叩く。
 */
export async function updateLineConfig(input: LineConfigInput, tenantId?: string): Promise<LineConfigResponse> {
  const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
  const res = await fetch(`/api/proxy/admin/line/config${qs}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });

  const text = await res.text();

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // json parse failed; keep raw text
  }

  // success判定を堅牢化
  if (res.ok && (json?.ok === true || json?.configured === true)) {
    return json ?? { ok: true, configured: true, masked: { clientIdLast4: null, tokenPresent: false, secretPresent: false } };
  }

  // 失敗時は正しいステータスを含める
  const msg = json?.error || json?.message || text || `HTTP ${res.status}`;
  throw new Error(`LINE config update failed: ${msg} (status=${res.status})`);
}

/**
 * DELETE /admin/line/config を実行
 */
export async function deleteLineConfig(): Promise<LineConfigResponse> {
  const response = await apiDelete<ApiResponse<LineConfigResponse>>('/api/proxy/admin/line/config');
  if (response.ok && response.data) {
    return response.data;
  }
  throw new Error(response.error || 'Failed to delete LINE config');
}















