/**
 * 管理画面用APIクライアント
 * 
 * すべての admin 系 API 呼び出しを統一クライアント経由で行います。
 * baseURL は常に "/api/proxy" を使用し、localStorage や env での上書きは一切許可しません。
 */

import { apiGet, apiPost, apiPut, apiDelete, ApiClientError } from './apiClient';

// ============================================================================
// Types (re-export from src/lib/adminApi for compatibility)
// ============================================================================

// Type definitions moved to src/types/settings.ts
// Re-export for backward compatibility
export type { AdminSettings, ReservationRules } from '../../src/types/settings';
import type { AdminSettings } from '../../src/types/settings';

// ============================================================================
// API Functions
// ============================================================================

/**
 * 管理者設定を取得
 *
 * API レスポンスはフラット形式: { ok, tenantId, storeName, assignmentMode, ... }
 *
 * @param tenantId - テナントID（指定されていない場合は 'default' が自動付与される）
 * @returns 管理者設定データ
 */
export async function fetchAdminSettings(tenantId?: string): Promise<AdminSettings> {
  try {
    return await apiGet<AdminSettings>('/admin/settings', { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to fetch admin settings');
  }
}

/**
 * 管理者設定を保存（PUT — 部分更新対応、既存フィールドは deep-merge される）
 *
 * @param settings - 保存する設定データ（部分更新可）
 * @param tenantId - テナントID（指定されていない場合は 'default' が自動付与される）
 * @returns 保存後の設定データ
 */
export async function saveAdminSettings(
  settings: Partial<AdminSettings>,
  tenantId?: string
): Promise<AdminSettings> {
  try {
    return await apiPut<AdminSettings>('/admin/settings', settings, { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to save admin settings');
  }
}

/**
 * LINE連携ステータス型
 */
export interface LineIntegrationState {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  updatedAt: string;
}

export interface LineStatusResponse {
  ok: boolean;
  tenantId: string;
  kind: 'connected' | 'unconfigured';
  line?: LineIntegrationState;
  error?: string;
}

/**
 * LINE認証URL取得レスポンス型
 */
export interface LineAuthUrlResponse {
  ok: boolean;
  url?: string;
  error?: string;
  message?: string;
}

/**
 * LINE連携ステータスを取得
 * 
 * @param tenantId - テナントID（指定されていない場合は 'default' が自動付与される）
 * @returns LINE連携ステータス
 */
export async function fetchLineStatus(tenantId?: string): Promise<LineStatusResponse> {
  try {
    return await apiGet<LineStatusResponse>('/admin/integrations/line/status', { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to fetch LINE status');
  }
}

/**
 * LINE認証URLを取得
 * 
 * @param tenantId - テナントID（指定されていない場合は 'default' が自動付与される）
 * @returns LINE認証URL
 */
export async function fetchLineAuthUrl(tenantId?: string): Promise<LineAuthUrlResponse> {
  try {
    return await apiGet<LineAuthUrlResponse>('/admin/line/auth-url', { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to fetch LINE auth URL');
  }
}

/**
 * LINE Messaging API 連携ステータス型
 */
export interface MessagingStatusResponse {
  ok: boolean;
  tenantId: string;
  kind: 'unconfigured' | 'partial' | 'linked';
  checks: {
    token: 'ok' | 'ng';
    webhook: 'ok' | 'ng';
    lastWebhookAt?: string;
  };
  error?: string;
}

/**
 * LINE Messaging API 連携ステータスを取得
 * 
 * @param tenantId - テナントID（指定されていない場合は 'default' が自動付与される）
 * @returns Messaging API 連携ステータス
 */
export async function fetchMessagingStatus(tenantId?: string): Promise<MessagingStatusResponse> {
  try {
    return await apiGet<MessagingStatusResponse>('/admin/integrations/line/messaging/status', { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to fetch Messaging API status');
  }
}

/**
 * LINE Messaging API 設定を保存
 * 
 * @param data - 設定データ
 * @param tenantId - テナントID（指定されていない場合は 'default' が自動付与される）
 * @returns 保存後のステータス
 */
export async function saveMessagingConfig(
  data: {
    channelAccessToken: string;
    channelSecret: string;
    webhookUrl?: string;
  },
  tenantId?: string
): Promise<MessagingStatusResponse> {
  try {
    return await apiPost<MessagingStatusResponse>('/admin/integrations/line/messaging/save', data, { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to save Messaging API config');
  }
}

/**
 * LINE Messaging API 設定を削除
 * 
 * @param tenantId - テナントID（指定されていない場合は 'default' が自動付与される）
 * @returns 削除後のステータス
 */
export async function deleteMessagingConfig(tenantId?: string): Promise<MessagingStatusResponse> {
  try {
    return await apiDelete<MessagingStatusResponse>('/admin/integrations/line/messaging', { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to delete Messaging API config');
  }
}

