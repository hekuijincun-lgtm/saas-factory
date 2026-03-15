/**
 * 管理者設定の型定義とユーティリティ（API側）
 * web側の AdminSettings 型と一致させる
 */

export interface TenantInfo {
  name: string;
  email: string;
}

export interface BusinessHours {
  openTime: string; // "HH:mm"
  closeTime: string; // "HH:mm"
  slotIntervalMin?: number; // スロット間隔（分）
}

export interface BusinessException {
  date: string; // "YYYY-MM-DD"
  type: 'closed' | 'short' | 'special';
  openTime?: string; // "HH:mm" (short/special時のみ)
  closeTime?: string; // "HH:mm" (short/special時のみ)
  memo?: string;
}

export interface ReservationRules {
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
  enableCustomerNotify: boolean;
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
    channelSecret?: string; // Messaging API Channel Secret（Webhook署名検証用）
    channelAccessToken?: string; // Messaging API Channel Access Token（返信用）
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
  key: string;              // slug e.g. "booking-main", "sales-hair"
  name: string;             // 表示名
  purpose: LineAccountPurpose;
  industry: LineAccountIndustry;
  channelId: string;
  channelSecret: string;
  channelAccessToken: string;
  basicId?: string;         // @xxx
  inviteUrl?: string;
  status: 'active' | 'inactive';
  botUserId?: string;       // verifyLineToken で解決
  createdAt: string;
  updatedAt: string;
}

export interface LineRouting {
  booking?: { default?: string };              // lineAccount.id
  sales?: Record<string, string>;              // industry → lineAccount.id
  support?: { default?: string };
}

export interface OnboardingSettings {
  lineConnected?: boolean;
  enabled?: boolean;  // true のとき初回ログインで owner ブートストラップ
}

/** 業種バーティカル識別子 */
export type VerticalType = 'eyebrow' | 'nail' | 'dental' | 'hair' | 'esthetic' | 'generic';

/** 汎用リピート促進テンプレート（eyebrow 以外のフォールバック） */
export const GENERIC_REPEAT_TEMPLATE =
  '前回のご来店からそろそろ{interval}週が経ちます。またのご来店をお待ちしております。';

/** @deprecated Phase 4: use getVerticalPlugin(vertical).label instead — registry.ts に移行済み */
export const VERTICAL_LABELS: Record<VerticalType, string> = {
  generic: '汎用（業種を選択してください）',
  eyebrow: 'アイブロウサロン',
  nail: 'ネイルサロン',
  hair: 'ヘアサロン',
  esthetic: 'エステ・リラクゼーション',
  dental: '歯科・クリニック',
};

/** バーティカル共通設定（業種に依存しない汎用フォーム） */
export interface VerticalConfig {
  /** 施術同意文（施術前に顧客に表示するリスク告知テキスト） */
  consentText?: string;
  /** スタイルタイプ一覧（eyebrow なら ["natural","bold","feathering"] 等） */
  styleTypes?: string[];
  /** リピート促進設定 */
  repeat?: {
    enabled?: boolean;
    intervalDays?: number;
    template?: string;
  };
  /** 事前アンケート ON/OFF（Phase 1b: eyebrow.surveyEnabled から昇格） */
  surveyEnabled?: boolean;
  /** 事前アンケート質問リスト（Phase 1b: eyebrow.surveyQuestions から昇格） */
  surveyQuestions?: EyebrowSurveyQuestion[];
  /** ベッド数（同時施術キャパ、Phase 1b: eyebrow.bedCount から昇格） */
  bedCount?: number;
}

// CLEANUP(Phase4+): EyebrowSurveyQuestion → SurveyQuestion にリネーム可能
export interface EyebrowSurveyQuestion {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'checkbox';
  enabled: boolean;
}
/** Phase 3: vertical-agnostic alias（今後はこちらを優先して使用） */
export type SurveyQuestion = EyebrowSurveyQuestion;

/** @deprecated use verticalConfig instead — CLEANUP(Phase4+): 全テナント移行後に削除 */
export interface EyebrowSettings {
  consentText?: string;        // 眉毛施術同意文
  repeat?: {
    enabled?: boolean;
    intervalDays?: number;
    template?: string;
  };
  bedCount?: number;           // ベッド数（同時施術キャパ）デフォルト1
  surveyEnabled?: boolean;     // 事前アンケート ON/OFF
  surveyQuestions?: EyebrowSurveyQuestion[]; // 事前アンケート質問リスト
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
}

/** AI接客コア設定 */
export interface AISettings {
  enabled: boolean;
  voice: string;
  answerLength: string;
  character: string;
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
  /** @deprecated use vertical + verticalConfig instead */
  eyebrow?: EyebrowSettings;
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
}

/**
 * デフォルト設定
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
    slotIntervalMin: 30,
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
    lineReminder: {
      enabled: false,
      sendAtHour: 18,
      template: '【{storeName}】明日 {date} {time} のご予約があります。\n\nメニュー: {menuName}\nスタッフ: {staffName}\n\n{address}\n\n当日お会いできるのを楽しみにしております！\n\n予約管理: {manageUrl}',
    },
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
      lastError: undefined,
    },
    stripe: {
      connected: false,
    },
  },
};

/**
 * 設定のバリデーション
 */
export function validateAdminSettings(settings: Partial<AdminSettings>): { valid: boolean; error?: string } {
  // publicDays
  if (settings.publicDays !== undefined) {
    if (typeof settings.publicDays !== 'number' || settings.publicDays < 1 || settings.publicDays > 365) {
      return { valid: false, error: 'publicDays must be between 1 and 365' };
    }
  }

  // tenant
  if (settings.tenant) {
    if (!settings.tenant.name || typeof settings.tenant.name !== 'string' || settings.tenant.name.trim().length === 0) {
      return { valid: false, error: 'tenant.name is required' };
    }
    if (settings.tenant.name.length > 80) {
      return { valid: false, error: 'tenant.name must be 80 characters or less' };
    }
    if (!settings.tenant.email || typeof settings.tenant.email !== 'string' || settings.tenant.email.trim().length === 0) {
      return { valid: false, error: 'tenant.email is required' };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(settings.tenant.email)) {
      return { valid: false, error: 'tenant.email must be a valid email address' };
    }
  }

  // businessHours
  if (settings.businessHours) {
    if (!settings.businessHours.openTime || !/^\d{2}:\d{2}$/.test(settings.businessHours.openTime)) {
      return { valid: false, error: 'businessHours.openTime must be HH:mm format' };
    }
    if (!settings.businessHours.closeTime || !/^\d{2}:\d{2}$/.test(settings.businessHours.closeTime)) {
      return { valid: false, error: 'businessHours.closeTime must be HH:mm format' };
    }
    const openMin = timeToMinutes(settings.businessHours.openTime);
    const closeMin = timeToMinutes(settings.businessHours.closeTime);
    if (openMin >= closeMin) {
      return { valid: false, error: 'businessHours.closeTime must be after openTime' };
    }
    if (settings.businessHours.slotIntervalMin !== undefined) {
      if (typeof settings.businessHours.slotIntervalMin !== 'number' || settings.businessHours.slotIntervalMin <= 0) {
        return { valid: false, error: 'businessHours.slotIntervalMin must be positive number' };
      }
    }
  }

  // closedWeekdays
  if (settings.closedWeekdays !== undefined) {
    if (!Array.isArray(settings.closedWeekdays) || !settings.closedWeekdays.every((d) => typeof d === 'number' && d >= 0 && d <= 6)) {
      return { valid: false, error: 'closedWeekdays must be array of numbers 0-6' };
    }
  }

  // exceptions
  if (settings.exceptions !== undefined) {
    if (!Array.isArray(settings.exceptions)) {
      return { valid: false, error: 'exceptions must be array' };
    }
    const dateSet = new Set<string>();
    for (const ex of settings.exceptions) {
      if (!ex.date || !/^\d{4}-\d{2}-\d{2}$/.test(ex.date)) {
        return { valid: false, error: 'exception.date must be YYYY-MM-DD format' };
      }
      if (dateSet.has(ex.date)) {
        return { valid: false, error: `duplicate exception date: ${ex.date}` };
      }
      dateSet.add(ex.date);
      
      if (ex.type !== 'closed' && ex.type !== 'short' && ex.type !== 'special') {
        return { valid: false, error: 'exception.type must be closed, short, or special' };
      }
      
      if (ex.type === 'short' || ex.type === 'special') {
        if (!ex.openTime || !/^\d{2}:\d{2}$/.test(ex.openTime)) {
          return { valid: false, error: 'exception.openTime is required for short/special type' };
        }
        if (!ex.closeTime || !/^\d{2}:\d{2}$/.test(ex.closeTime)) {
          return { valid: false, error: 'exception.closeTime is required for short/special type' };
        }
        const exOpenMin = timeToMinutes(ex.openTime);
        const exCloseMin = timeToMinutes(ex.closeTime);
        if (exOpenMin >= exCloseMin) {
          return { valid: false, error: 'exception.closeTime must be after openTime' };
        }
      }
    }
  }

  // rules
  if (settings.rules) {
    if (settings.rules.cutoffMinutes !== undefined) {
      if (typeof settings.rules.cutoffMinutes !== 'number' || settings.rules.cutoffMinutes < 0 || settings.rules.cutoffMinutes > 10080) {
        return { valid: false, error: 'rules.cutoffMinutes must be between 0 and 10080' };
      }
    }
    if (settings.rules.cancelMinutes !== undefined) {
      if (typeof settings.rules.cancelMinutes !== 'number' || settings.rules.cancelMinutes < 0 || settings.rules.cancelMinutes > 10080) {
        return { valid: false, error: 'rules.cancelMinutes must be between 0 and 10080' };
      }
    }
    if (settings.rules.anyCapacityPerSlot !== undefined) {
      if (typeof settings.rules.anyCapacityPerSlot !== 'number' || settings.rules.anyCapacityPerSlot < 0) {
        return { valid: false, error: 'rules.anyCapacityPerSlot must be non-negative number' };
      }
    }
  }

  // notifications
  if (settings.notifications) {
    if (settings.notifications.enableAdminNotify && settings.notifications.slackWebhookUrl) {
      if (!settings.notifications.slackWebhookUrl.startsWith('https://hooks.slack.com/services/')) {
        return { valid: false, error: 'notifications.slackWebhookUrl must be valid Slack webhook URL' };
      }
    }
    if (settings.notifications.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(settings.notifications.email)) {
        return { valid: false, error: 'notifications.email must be valid email address' };
      }
    }
  }

  // assignment
  if (settings.assignment) {
    if (settings.assignment.mode !== undefined && settings.assignment.mode !== 'manual' && settings.assignment.mode !== 'auto') {
      return { valid: false, error: 'assignment.mode must be manual or auto' };
    }
    if (settings.assignment.strategy !== undefined) {
      if (settings.assignment.strategy !== 'priority' && settings.assignment.strategy !== 'round_robin' && settings.assignment.strategy !== 'least_busy') {
        return { valid: false, error: 'assignment.strategy must be priority, round_robin, or least_busy' };
      }
    }
  }

  return { valid: true };
}

/**
 * 時刻文字列を分に変換
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 設定をマージ（デフォルト値で補完）
 */
export function mergeSettings(defaults: AdminSettings, partial: Partial<AdminSettings>): AdminSettings {
  return {
    storeName: partial.storeName ?? defaults.storeName,
    storeAddress: partial.storeAddress ?? defaults.storeAddress,
    consentText: partial.consentText ?? defaults.consentText,
    staffSelectionEnabled: partial.staffSelectionEnabled ?? defaults.staffSelectionEnabled,
    publicDays: partial.publicDays ?? defaults.publicDays,
    tenant: {
      name: partial.tenant?.name ?? defaults.tenant.name,
      email: partial.tenant?.email ?? defaults.tenant.email,
    },
    businessHours: {
      openTime: partial.businessHours?.openTime ?? defaults.businessHours.openTime,
      closeTime: partial.businessHours?.closeTime ?? defaults.businessHours.closeTime,
      slotIntervalMin: partial.businessHours?.slotIntervalMin ?? defaults.businessHours.slotIntervalMin,
    },
    closedWeekdays: partial.closedWeekdays ?? defaults.closedWeekdays,
    exceptions: partial.exceptions ?? defaults.exceptions,
    rules: {
      cutoffMinutes: partial.rules?.cutoffMinutes ?? defaults.rules.cutoffMinutes,
      cancelMinutes: partial.rules?.cancelMinutes ?? defaults.rules.cancelMinutes,
      anyCapacityPerSlot: partial.rules?.anyCapacityPerSlot ?? defaults.rules.anyCapacityPerSlot,
    },
    notifications: {
      enableAdminNotify: partial.notifications?.enableAdminNotify ?? defaults.notifications.enableAdminNotify,
      slackWebhookUrl: partial.notifications?.slackWebhookUrl ?? defaults.notifications.slackWebhookUrl,
      email: partial.notifications?.email ?? defaults.notifications.email,
      enableCustomerNotify: partial.notifications?.enableCustomerNotify ?? defaults.notifications.enableCustomerNotify,
      lineReminder: (partial.notifications?.lineReminder || defaults.notifications.lineReminder)
        ? {
            enabled: partial.notifications?.lineReminder?.enabled ?? defaults.notifications.lineReminder?.enabled ?? false,
            sendAtHour: partial.notifications?.lineReminder?.sendAtHour ?? defaults.notifications.lineReminder?.sendAtHour ?? 18,
            template: partial.notifications?.lineReminder?.template ?? defaults.notifications.lineReminder?.template ?? '',
          }
        : undefined,
    },
    assignment: {
      mode: partial.assignment?.mode ?? defaults.assignment.mode,
      strategy: partial.assignment?.strategy ?? defaults.assignment.strategy,
      priorityOrder: partial.assignment?.priorityOrder ?? defaults.assignment.priorityOrder,
    },
    integrations: {
      line: {
        connected: partial.integrations?.line?.connected ?? defaults.integrations.line?.connected ?? false,
        channelId:          partial.integrations?.line?.channelId          ?? defaults.integrations.line?.channelId,
        channelSecret:      partial.integrations?.line?.channelSecret      ?? defaults.integrations.line?.channelSecret,
        channelAccessToken: partial.integrations?.line?.channelAccessToken ?? defaults.integrations.line?.channelAccessToken,
        bookingUrl:         partial.integrations?.line?.bookingUrl         ?? defaults.integrations.line?.bookingUrl,
        userId:             partial.integrations?.line?.userId             ?? defaults.integrations.line?.userId,
        displayName:        partial.integrations?.line?.displayName        ?? defaults.integrations.line?.displayName,
        connectedAt:        partial.integrations?.line?.connectedAt        ?? defaults.integrations.line?.connectedAt,
        notifyOnReservation: partial.integrations?.line?.notifyOnReservation ?? defaults.integrations.line?.notifyOnReservation,
        notifyOnCancel:      partial.integrations?.line?.notifyOnCancel      ?? defaults.integrations.line?.notifyOnCancel,
        notifyOnReminder:    partial.integrations?.line?.notifyOnReminder    ?? defaults.integrations.line?.notifyOnReminder,
        lastError:           partial.integrations?.line?.lastError           ?? defaults.integrations.line?.lastError,
      },
      stripe: {
        connected: partial.integrations?.stripe?.connected ?? defaults.integrations.stripe?.connected ?? false,
        accountId: partial.integrations?.stripe?.accountId ?? defaults.integrations.stripe?.accountId,
      },
    },
    onboarding: (partial.onboarding || defaults.onboarding)
      ? {
          lineConnected: partial.onboarding?.lineConnected ?? defaults.onboarding?.lineConnected,
          enabled: partial.onboarding?.enabled ?? defaults.onboarding?.enabled,
        }
      : undefined,
    // Phase 6: eyebrow merge 停止 — 新規 write は verticalConfig のみ
    // 既存 KV データの eyebrow はそのまま残る（read fallback resolveVertical で参照）
    // partial.eyebrow が来ても mergeSettings では eyebrow を更新しない
    eyebrow: defaults.eyebrow,  // 既存値を保持（新規 merge は行わない）
    subscription: partial.subscription ?? defaults.subscription,
    lineAccounts: partial.lineAccounts ?? defaults.lineAccounts,
    lineRouting: (partial.lineRouting || defaults.lineRouting)
      ? {
          booking: partial.lineRouting?.booking ?? defaults.lineRouting?.booking,
          sales: partial.lineRouting?.sales ?? defaults.lineRouting?.sales,
          support: partial.lineRouting?.support ?? defaults.lineRouting?.support,
        }
      : undefined,
    ai: (partial.ai || defaults.ai)
      ? {
          enabled: partial.ai?.enabled ?? defaults.ai?.enabled ?? false,
          voice: partial.ai?.voice ?? defaults.ai?.voice ?? "friendly",
          answerLength: partial.ai?.answerLength ?? defaults.ai?.answerLength ?? "normal",
          character: partial.ai?.character ?? defaults.ai?.character ?? "",
        }
      : undefined,
    vertical: partial.vertical ?? defaults.vertical,
    verticalConfig: (partial.verticalConfig || defaults.verticalConfig)
      ? {
          consentText: partial.verticalConfig?.consentText ?? defaults.verticalConfig?.consentText,
          styleTypes: partial.verticalConfig?.styleTypes ?? defaults.verticalConfig?.styleTypes,
          repeat: (partial.verticalConfig?.repeat || defaults.verticalConfig?.repeat)
            ? {
                enabled: partial.verticalConfig?.repeat?.enabled ?? defaults.verticalConfig?.repeat?.enabled,
                intervalDays: partial.verticalConfig?.repeat?.intervalDays ?? defaults.verticalConfig?.repeat?.intervalDays,
                template: partial.verticalConfig?.repeat?.template ?? defaults.verticalConfig?.repeat?.template,
              }
            : undefined,
          surveyEnabled: partial.verticalConfig?.surveyEnabled ?? defaults.verticalConfig?.surveyEnabled,
          surveyQuestions: partial.verticalConfig?.surveyQuestions ?? defaults.verticalConfig?.surveyQuestions,
          bedCount: partial.verticalConfig?.bedCount ?? defaults.verticalConfig?.bedCount,
        }
      : undefined,
  };
}

/**
 * 設定から現在の業種バーティカルと設定を解決する。
 * 新形式（vertical + verticalConfig）を優先し、旧形式（eyebrow）にフォールバック。
 * GET /admin/settings レスポンスへの注入・P4 プラグイン選択に使用する。
 */
export function resolveVertical(s: Partial<AdminSettings>): { vertical: VerticalType; verticalConfig: VerticalConfig } {
  // 1. 新形式: vertical + verticalConfig が両方存在すればそのまま返す
  if (s.vertical && s.verticalConfig) {
    return { vertical: s.vertical, verticalConfig: s.verticalConfig };
  }
  // CLEANUP(Phase4+): eyebrow legacy fallback — 全テナント vertical+verticalConfig 設定後に削除
  if (s.eyebrow) {
    return {
      vertical: 'eyebrow',
      verticalConfig: {
        consentText: s.eyebrow.consentText,
        repeat: s.eyebrow.repeat,
        surveyEnabled: s.eyebrow.surveyEnabled,
        surveyQuestions: s.eyebrow.surveyQuestions,
        bedCount: s.eyebrow.bedCount,
      },
    };
  }
  // 3. デフォルト: generic
  return { vertical: 'generic', verticalConfig: {} };
}
