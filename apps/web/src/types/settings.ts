/**
 * 管理者設定の型定義
 */

export interface TenantInfo {
  name: string;
  email: string;
  address?: string;
}

export interface BusinessHours {
  openTime: string; // "HH:mm"
  closeTime: string; // "HH:mm"
}

export interface BusinessException {
  date: string; // "YYYY-MM-DD"
  type: 'closed' | 'short' | 'special';
  openTime?: string; // "HH:mm" (short/special時のみ)
  closeTime?: string; // "HH:mm" (short/special時のみ)
  memo?: string;
}

export interface ReservationRules {
  publicDays?: number;
  cutoffMinutes: number; // 予約締切（当日何分前まで予約可）
  cancelMinutes: number; // キャンセル締切（何分前までキャンセル可）
  anyCapacityPerSlot: number; // 指名なし上限
}

export interface LineReminderSettings {
  enabled: boolean;
  sendAtHour: number; // 0-23 JST
  template: string;   // {storeName} {date} {time} {menuName} {staffName} {address} {manageUrl}
}

export interface NotificationSettings {
  enableAdminNotify: boolean;
  slackWebhookUrl?: string;
  email?: string;
  enableCustomerNotify: boolean; // 将来用
  lineReminder?: LineReminderSettings;
}

export interface AssignmentSettings {
  mode: 'manual' | 'auto';
  strategy?: 'priority' | 'round_robin' | 'least_busy';
  priorityOrder?: string[]; // staffId[]
}

export interface IntegrationSettings {
  line?: {
    connected: boolean;
    channelId?: string; // Messaging API Channel ID
    channelSecret?: string; // Messaging API Channel Secret
    channelAccessToken?: string; // Messaging API Channel Access Token
    bookingUrl?: string; // 予約ページURL（未設定時は origin/booking?tenantId=... で自動補完）
    userId?: string; // LINEユーザーID（表示用メタ）
    displayName?: string; // 表示名（表示用メタ）
    connectedAt?: number; // 接続日時（Unix timestamp、表示用メタ）
    notifyOnReservation?: boolean; // 予約確定通知（default: true）
    notifyOnCancel?: boolean; // キャンセル通知（default: true）
    notifyOnReminder?: boolean; // リマインド通知（default: false）
    lastError?: string; // 最後のエラーメッセージ
  };
  stripe?: {
    connected: boolean;
    accountId?: string;
  };
}

// ── Multi-LINE Account Management ───────────────────────────────────────────
export type LineAccountPurpose = 'booking' | 'sales' | 'support' | 'broadcast' | 'internal';
export type LineAccountIndustry = 'hair' | 'nail' | 'eyebrow' | 'esthetic' | 'dental' | 'shared';

export interface LineAccount {
  id: string;
  key: string;
  name: string;
  purpose: LineAccountPurpose;
  industry: LineAccountIndustry;
  channelId: string;
  channelSecret: string;
  channelAccessToken: string;
  basicId?: string;
  inviteUrl?: string;
  status: 'active' | 'inactive';
  botUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LineRouting {
  booking?: { default?: string };
  sales?: Record<string, string>;
  support?: { default?: string };
}

export interface OnboardingSettings {
  lineConnected?: boolean;
  enabled?: boolean;  // true のとき初回ログインで owner ブートストラップ
}

/** 業種バーティカル識別子 */
export type VerticalType = 'eyebrow' | 'nail' | 'dental' | 'hair' | 'esthetic' | 'pet' | 'generic';

/** バーティカル共通設定（業種に依存しない汎用フォーム） */
export interface VerticalConfig {
  /** 施術同意文（施術前に顧客に表示するリスク告知テキスト） */
  consentText?: string;
  /** スタイルタイプ一覧（vertical 固有の分類キー） */
  styleTypes?: string[];
  /** リピート促進設定 */
  repeat?: {
    enabled?: boolean;
    intervalDays?: number;
    template?: string;
  };
  /** 事前アンケート ON/OFF */
  surveyEnabled?: boolean;
  /** 事前アンケート質問リスト */
  surveyQuestions?: SurveyQuestion[];
  /** ベッド数（同時施術キャパ） */
  bedCount?: number;
}

export interface SurveyQuestion {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'checkbox';
  enabled: boolean;
}

export type PlanId = 'starter' | 'pro' | 'enterprise';

export interface SubscriptionInfo {
  planId: PlanId;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeSessionId?: string;
  status: 'active' | 'past_due' | 'cancelled' | 'trialing';
  currentPeriodEnd?: number;
  createdAt: number;
  trialEndsAt?: number;
}

/** AI Provider 識別子 */
export type AIProviderType = "openai" | "gemini";

/** AI Core 統合設定（provider routing / fallback / feature toggles） */
export interface AICoreConfig {
  enabled: boolean;
  defaultProvider: AIProviderType;
  defaultModel: string;
  fallbackProvider?: AIProviderType;
  fallbackModel?: string;
  temperature: number;
  maxOutputTokens: number;
  features: {
    bookingReply: boolean;
    salesGeneration: boolean;
    replyClassifier: boolean;
  };
  routing: Record<string, { provider: AIProviderType; model: string }>;
}

/** AI接客コア設定 */
export interface AISettings {
  enabled: boolean;
  voice: string;
  answerLength: string;
  character: string;
  /** AI Core 統合設定（provider routing etc.） */
  core?: AICoreConfig;
}

export interface AdminSettings {
  storeName?: string; // 店舗名（表示用）
  storeAddress?: string; // 店舗住所（LINE通知等に使用）
  consentText?: string; // 予約確認画面の同意チェックボックス文言
  staffSelectionEnabled?: boolean; // スタッフ選択を予約フローで表示するか（デフォルト: true）
  publicDays: number; // 今日から何日後まで公開
  tenant: TenantInfo;
  businessHours: BusinessHours;
  closedWeekdays: number[]; // 0=日曜, 1=月曜, ..., 6=土曜
  exceptions: BusinessException[];
  rules: ReservationRules;
  notifications: NotificationSettings;
  assignment: AssignmentSettings;
  integrations: IntegrationSettings;
  onboarding?: OnboardingSettings;
  /** 業種バーティカル（'eyebrow' | 'nail' | 'dental' | 'generic'） */
  vertical?: VerticalType;
  /** バーティカル詳細設定（vertical に対応する設定値） */
  verticalConfig?: VerticalConfig;
  /** 管理者ログイン許可 LINE userId リスト（空 = セルフシード待ち） */
  allowedAdminLineUserIds?: string[];
  /** サブスクリプション情報（Stripe Checkout 経由で設定） */
  subscription?: SubscriptionInfo;
  /** マルチLINEアカウント */
  lineAccounts?: LineAccount[];
  /** LINEルーティング（用途別デフォルトアカウント） */
  lineRouting?: LineRouting;
  /** AI接客コア設定（settings:{tenantId}.ai に統合） */
  ai?: AISettings;
  /** Agent Core 設定 */
  agents?: AgentCoreSettings;
  /** LINE Core 設定 */
  lineCore?: LineCoreSettingsConfig;
}

/** LINE Core 設定（settings:{tenantId}.lineCore） */
export interface LineCoreSettingsConfig {
  enabled?: boolean;
  agentRoutingEnabled?: boolean;
  loggingEnabled?: boolean;
  defaultReplyMode?: "agent" | "legacy" | "disabled";
  dedupWindowSec?: number;
}

/** Agent Core 設定（settings:{tenantId}.agents） */
export interface AgentCoreSettings {
  lineConciergeEnabled?: boolean;
  outreachFollowupEnabled?: boolean;
  autoSendFollowup?: boolean;
  defaultFollowupDelayHours?: number;
}

/**
 * 完全なデフォルト設定値
 */
export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  storeAddress: "",
  consentText: "予約内容を確認し、同意の上で予約を確定します",
  staffSelectionEnabled: true,
  publicDays: 14,
  tenant: {
    name: '',
    email: '',
  },
  businessHours: {
    openTime: '10:00',
    closeTime: '19:00',
  },
  closedWeekdays: [0], // 日曜日
  exceptions: [],
  rules: {
    cutoffMinutes: 120, // 2時間前
    cancelMinutes: 1440, // 24時間前
    anyCapacityPerSlot: 1,
  },
  notifications: {
    enableAdminNotify: false,
    slackWebhookUrl: '',
    email: '',
    enableCustomerNotify: false,
  },
  assignment: {
    mode: 'manual',
    strategy: 'priority',
    priorityOrder: [],
  },
  integrations: {
    line: {
      connected: false,
      notifyOnReservation: true,
      notifyOnCancel: true,
      notifyOnReminder: false,
    },
    stripe: {
      connected: false,
    },
  },
};

// ── Phase 1b: vertical 読み取り helper ─────────────────────────────

/**
 * resolveVertical — API 側と同じロジックで vertical type を解決する。
 * 優先順位: settings.vertical → 'generic'
 */
export function resolveVertical(s: Partial<AdminSettings> | Record<string, any>): VerticalType {
  if (s?.vertical) return s.vertical as VerticalType;
  return 'generic';
}

/**
 * getVerticalConfig — verticalConfig から業種別設定を正規化して返す。read-only adapter。
 */
export function getVerticalConfig(raw: Partial<AdminSettings> | Record<string, any>): VerticalConfig {
  const vc = (raw as any)?.verticalConfig as VerticalConfig | undefined;
  return {
    consentText:     vc?.consentText,
    repeat:          vc?.repeat,
    surveyEnabled:   vc?.surveyEnabled,
    surveyQuestions: vc?.surveyQuestions,
    bedCount:        vc?.bedCount,
    styleTypes:      vc?.styleTypes,
  };
}
