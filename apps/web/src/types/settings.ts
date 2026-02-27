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

export interface NotificationSettings {
  enableAdminNotify: boolean;
  slackWebhookUrl?: string;
  email?: string;
  enableCustomerNotify: boolean; // 将来用
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

export interface OnboardingSettings {
  lineConnected?: boolean;
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


