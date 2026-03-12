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
    // API returns { ok, tenantId, data: {...} } — extract .data
    const res = await apiGet<any>('/admin/settings', { tenantId });
    return (res?.data ?? res) as AdminSettings;
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
      if (error.status === 409) {
        const d = error.data;
        if (d && typeof d === 'object' && 'kind' in d) return d as LineStatusResponse;
        return { ok: true, tenantId: tenantId ?? 'default', kind: 'unconfigured' };
      }
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

// ============================================================================
// LINE Rich Menu
// ============================================================================

export interface RichMenuStatusResponse {
  ok: boolean;
  tenantId: string;
  linked: boolean;
  configured: boolean;
  templateKey: string | null;
  richMenuId: string | null;
  lastPublishedAt: string | null;
  menuVersion: number | null;
  previewUrls: {
    booking: string;
    storeInfo: string;
    menu: string;
  };
  webhookUrl: string;
  error?: string;
}

export interface RichMenuPublishResponse {
  ok: boolean;
  tenantId: string;
  richMenuId?: string;
  templateKey?: string;
  menuVersion?: number;
  lastPublishedAt?: string;
  previewUrls?: {
    booking: string;
    storeInfo: string;
    menu: string;
  };
  error?: string;
  step?: string;
  detail?: string;
}

export async function fetchRichMenuStatus(tenantId?: string): Promise<RichMenuStatusResponse> {
  try {
    return await apiGet<RichMenuStatusResponse>('/admin/integrations/line/richmenu/status', { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to fetch rich menu status');
  }
}

export async function publishRichMenu(tenantId?: string): Promise<RichMenuPublishResponse> {
  try {
    return await apiPost<RichMenuPublishResponse>('/admin/integrations/line/richmenu', {}, { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to publish rich menu');
  }
}

export async function deleteRichMenu(tenantId?: string): Promise<{ ok: boolean; tenantId: string; deleted: string | null }> {
  try {
    return await apiDelete<{ ok: boolean; tenantId: string; deleted: string | null }>('/admin/integrations/line/richmenu', { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to delete rich menu');
  }
}

// ============================================================================
// Admin Members (RBAC)
// ============================================================================

export type MemberRole = 'owner' | 'admin' | 'viewer';

export interface AdminMember {
  lineUserId: string;
  role: MemberRole;
  enabled: boolean;
  displayName?: string;
  createdAt: string;
  passwordHash?: string;
  authMethods?: string[];
}

export interface AdminMembersStore {
  version: 1;
  members: AdminMember[];
}

/**
 * 管理者メンバー一覧を取得
 */
export async function fetchAdminMembers(tenantId?: string): Promise<AdminMembersStore> {
  const res = await apiGet<any>('/admin/members', { tenantId });
  return (res?.data ?? { version: 1, members: [] }) as AdminMembersStore;
}

/**
 * 管理者メンバー一覧を保存（callerLineUserId が owner の場合のみ許可）
 */
export async function saveAdminMembers(
  store: AdminMembersStore,
  callerLineUserId: string,
  tenantId?: string
): Promise<AdminMembersStore> {
  const res = await apiPut<any>('/admin/members',
    { ...store, callerLineUserId }, { tenantId });
  return (res?.data ?? store) as AdminMembersStore;
}

// ============================================================================
// Bootstrap Key
// ============================================================================

export interface BootstrapKeyResponse {
  ok: boolean;
  tenantId: string;
  bootstrapKeyPlain: string;
  expiresAt: string;
  error?: string;
}

/**
 * Bootstrap Key を発行（owner 登録用使い捨てトークン、24h 有効）
 */
export async function createBootstrapKey(
  callerLineUserId: string,
  tenantId?: string,
): Promise<BootstrapKeyResponse> {
  return await apiPost<BootstrapKeyResponse>(
    '/admin/bootstrap-key',
    { callerLineUserId },
    { tenantId },
  );
}

// ============================================================================
// Multi-LINE Account Management
// ============================================================================

import type { LineAccount, LineRouting } from '../../src/types/settings';

export interface LineAccountsResponse {
  ok: boolean;
  tenantId: string;
  accounts: (LineAccount & { synthesized?: boolean })[];
  synthesized: boolean;
}

export interface LineAccountResponse {
  ok: boolean;
  tenantId: string;
  account: LineAccount;
}

export interface LineRoutingResponse {
  ok: boolean;
  tenantId: string;
  routing: LineRouting;
}

export async function fetchLineAccounts(tenantId?: string): Promise<LineAccountsResponse> {
  try {
    return await apiGet<LineAccountsResponse>('/admin/integrations/line/accounts', { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to fetch LINE accounts');
  }
}

export async function createLineAccount(
  data: Partial<LineAccount>,
  tenantId?: string,
): Promise<LineAccountResponse> {
  try {
    return await apiPost<LineAccountResponse>('/admin/integrations/line/accounts', data, { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to create LINE account');
  }
}

export async function updateLineAccount(
  id: string,
  data: Partial<LineAccount>,
  tenantId?: string,
): Promise<LineAccountResponse> {
  try {
    return await apiPut<LineAccountResponse>(`/admin/integrations/line/accounts/${id}`, data, { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to update LINE account');
  }
}

export async function deleteLineAccount(
  id: string,
  tenantId?: string,
): Promise<{ ok: boolean; tenantId: string; accountId: string; status: string }> {
  try {
    return await apiDelete<{ ok: boolean; tenantId: string; accountId: string; status: string }>(
      `/admin/integrations/line/accounts/${id}`, { tenantId },
    );
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to delete LINE account');
  }
}

export async function fetchLineRouting(tenantId?: string): Promise<LineRoutingResponse> {
  try {
    return await apiGet<LineRoutingResponse>('/admin/integrations/line/routing', { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to fetch LINE routing');
  }
}

export async function saveLineRouting(
  routing: Partial<LineRouting>,
  tenantId?: string,
): Promise<LineRoutingResponse> {
  try {
    return await apiPut<LineRoutingResponse>('/admin/integrations/line/routing', routing, { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to save LINE routing');
  }
}

// ============================================================================
// Sales Leads (Owner)
// ============================================================================

export interface SalesLead {
  id: string;
  tenantId: string;
  industry: string;
  storeName: string;
  websiteUrl?: string;
  instagramUrl?: string;
  lineUrl?: string;
  region?: string;
  notes?: string;
  status: string;
  score?: number;
  painPoints?: string[];
  bestOffer?: string;
  recommendedChannel?: string;
  nextAction?: string;
  aiSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadDraft {
  id: string;
  leadId: string;
  kind: string;
  subject?: string;
  body: string;
  createdAt: string;
}

export interface LeadClassification {
  id: string;
  leadId: string;
  rawReply: string;
  label: string;
  confidence?: number;
  suggestedNextAction?: string;
  createdAt: string;
}

export interface LeadDetailResponse {
  ok: boolean;
  lead: SalesLead;
  drafts: LeadDraft[];
  classifications: LeadClassification[];
}

export async function fetchLeads(tenantId?: string): Promise<{ ok: boolean; leads: SalesLead[] }> {
  try {
    return await apiGet<{ ok: boolean; leads: SalesLead[] }>('/owner/leads', { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to fetch leads');
  }
}

export async function createLead(
  data: {
    storeName: string;
    industry?: string;
    websiteUrl?: string;
    instagramUrl?: string;
    lineUrl?: string;
    region?: string;
    notes?: string;
    tenantId?: string;
  },
  tenantId?: string,
): Promise<{ ok: boolean; id: string; createdAt: string }> {
  try {
    return await apiPost<{ ok: boolean; id: string; createdAt: string }>('/owner/leads', data, { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to create lead');
  }
}

export async function fetchLead(id: string, tenantId?: string): Promise<LeadDetailResponse> {
  try {
    return await apiGet<LeadDetailResponse>(`/owner/leads/${id}`, { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to fetch lead');
  }
}

export async function analyzeLeadApi(id: string, tenantId?: string): Promise<{ ok: boolean; analysis: any; updatedAt: string }> {
  try {
    return await apiPost<{ ok: boolean; analysis: any; updatedAt: string }>(`/owner/leads/${id}/analyze`, {}, { tenantId, timeout: 30000 });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to analyze lead');
  }
}

export async function generateDraftsApi(id: string, tenantId?: string): Promise<{ ok: boolean; drafts: any; createdAt: string }> {
  try {
    return await apiPost<{ ok: boolean; drafts: any; createdAt: string }>(`/owner/leads/${id}/generate-draft`, {}, { tenantId, timeout: 30000 });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to generate drafts');
  }
}

export async function classifyReplyApi(
  id: string,
  rawReply: string,
  tenantId?: string,
): Promise<{ ok: boolean; classification: any; createdAt: string }> {
  try {
    return await apiPost<{ ok: boolean; classification: any; createdAt: string }>(
      `/owner/leads/${id}/classify-reply`, { rawReply }, { tenantId, timeout: 30000 },
    );
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to classify reply');
  }
}

export async function updateLeadStatus(
  id: string,
  status: string,
  tenantId?: string,
): Promise<{ ok: boolean; status: string; updatedAt: string }> {
  try {
    return await apiPut<{ ok: boolean; status: string; updatedAt: string }>(
      `/owner/leads/${id}/status`, { status }, { tenantId },
    );
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to update lead status');
  }
}

// ============================================================================
// Sales AI Config (Owner — per LINE account)
// ============================================================================

export interface SalesAiIntent {
  key: string;
  label: string;
  keywords: string[];
  reply: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface SalesAiLlmSettings {
  enabled: boolean;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

export interface SalesAiConfig {
  enabled: boolean;
  welcomeMessage: string;
  fallbackMessage: string;
  tone: string;
  goal: string;
  cta: { label: string; url: string };
  qualificationQuestions: string[];
  handoffMessage: string;
  intents: SalesAiIntent[];
  llm?: SalesAiLlmSettings;
  version: number;
  updatedAt: string;
}

export interface SalesAiConfigResponse {
  ok: boolean;
  accountId: string;
  config: SalesAiConfig;
}

export interface SalesAiTestResponse {
  ok: boolean;
  accountId: string;
  message: string;
  enabled: boolean;
  matchedIntent: { key: string; label: string } | null;
  reply: string;
  branch: string;
  cta?: { label: string; url: string } | null;
  tone?: string;
  goal?: string;
  llmUsed?: boolean;
  llmModel?: string;
  llmAnswer?: string;
}

export async function fetchSalesAiConfig(
  accountId: string,
  tenantId?: string,
): Promise<SalesAiConfigResponse> {
  try {
    return await apiGet<SalesAiConfigResponse>(`/owner/sales-ai/${accountId}`, { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to fetch sales AI config');
  }
}

export async function saveSalesAiConfig(
  accountId: string,
  config: Partial<SalesAiConfig>,
  tenantId?: string,
): Promise<SalesAiConfigResponse> {
  try {
    return await apiPut<SalesAiConfigResponse>(`/owner/sales-ai/${accountId}`, config, { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to save sales AI config');
  }
}

export async function testSalesAi(
  accountId: string,
  message: string,
  tenantId?: string,
): Promise<SalesAiTestResponse> {
  try {
    return await apiPost<SalesAiTestResponse>(`/owner/sales-ai/${accountId}/test`, { message }, { tenantId });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to test sales AI');
  }
}

