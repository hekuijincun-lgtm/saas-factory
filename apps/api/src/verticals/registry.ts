/**
 * Vertical Plugin Registry
 *
 * 業種ごとの差分定義（defaultMenu / onboarding / repeat / labels / flags）を管理する。
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ 新 vertical 追加手順:                                               │
 * │ 1. apps/api/src/verticals/{vertical}.ts を作成（eyebrow.ts を参照） │
 * │ 2. このファイル (registry.ts) に plugin 定義を追加                   │
 * │ 3. apps/web/src/lib/verticalPlugins.ts に UI plugin を追加          │
 * │ 4. apps/api/src/settings.ts の VerticalType union に追加            │
 * │ 5. apps/web/src/types/settings.ts の VerticalType union に追加      │
 * │ ※ _template.ts にテンプレートあり                                   │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import type { VerticalType, VerticalCoreType } from '../settings';
import { GENERIC_REPEAT_TEMPLATE } from '../settings';
import { DEFAULT_REPEAT_TEMPLATE as NAIL_REPEAT_TEMPLATE } from './nail';
import { DEFAULT_REPEAT_TEMPLATE as HAIR_REPEAT_TEMPLATE } from './hair';
import { DEFAULT_REPEAT_TEMPLATE as DENTAL_REPEAT_TEMPLATE } from './dental';
import { DEFAULT_REPEAT_TEMPLATE as ESTHETIC_REPEAT_TEMPLATE } from './esthetic';
import { DEFAULT_REPEAT_TEMPLATE as CLEANING_REPEAT_TEMPLATE } from './cleaning';
import { DEFAULT_REPEAT_TEMPLATE as HANDYMAN_REPEAT_TEMPLATE } from './handyman';
import { DEFAULT_REPEAT_TEMPLATE as PET_REPEAT_TEMPLATE } from './pet';
import { DEFAULT_REPEAT_TEMPLATE as SEITAI_REPEAT_TEMPLATE } from './seitai';

// ── Special Feature Catalog ──────────────────────────────────────────

/** 業務特化機能の識別子 */
export type SpecialFeatureKey =
  | 'vaccineRecord'       // ワクチン・予防接種履歴（動物病院・ペット）
  | 'progressRecord'      // 成績・進捗記録（学習塾・スクール）
  | 'shootingManagement'  // 撮影カット数・データ管理（フォトスタジオ）
  | 'treatmentBodyMap'    // 施術部位・症状マッピング（整体・歯科・エステ）
  | 'colorFormula'        // カラー調合レシピ（美容・ネイル）
  | 'equipmentCheck'      // 機器・器具チェックリスト（ジム・清掃・便利屋）
  | 'beforeAfterPhoto'    // 施術前後写真（エステ・美容・ネイル）
  | 'courseCurriculum'    // カリキュラム管理（スクール・塾）
  | 'petProfile'          // ペットプロフィール（犬種・体重・アレルギー）
  | 'allergyRecord'       // アレルギー・禁忌記録（医療・エステ・ペット）
  | 'visitSummary';       // 来店サマリー・施術メモ（全業種共通カルテ拡張）

/** 特化機能の詳細定義 */
export interface SpecialFeatureConfig {
  key: SpecialFeatureKey;
  /** 日本語ラベル */
  label: string;
  /** 機能の説明（1行） */
  description: string;
  /** 管理画面のルート（{vertical} はプレースホルダ） */
  adminRoute: string;
  /** D1 マイグレーションが必要か */
  requiresD1?: boolean;
  /** R2 ファイルストレージが必要か */
  requiresR2?: boolean;
  /** この機能に適した業種の例（generate-vertical の選定ヒント） */
  suitableFor: string[];
}

/** 利用可能な特化機能のカタログ */
export const SPECIAL_FEATURE_CATALOG: Record<SpecialFeatureKey, SpecialFeatureConfig> = {
  vaccineRecord: {
    key: 'vaccineRecord',
    label: 'ワクチン・予防接種管理',
    description: 'ワクチン接種履歴と有効期限のアラート管理',
    adminRoute: '/admin/{vertical}/vaccines',
    requiresD1: false,
    suitableFor: ['ペットサロン', '動物病院', 'トリミング'],
  },
  progressRecord: {
    key: 'progressRecord',
    label: '成績・進捗記録',
    description: '生徒の成績推移や学習進捗の記録・可視化',
    adminRoute: '/admin/{vertical}/progress',
    requiresD1: true,
    suitableFor: ['学習塾', 'スクール', '習い事教室', 'プログラミング教室'],
  },
  shootingManagement: {
    key: 'shootingManagement',
    label: '撮影データ管理',
    description: '撮影カット数・データ納品・セレクト管理',
    adminRoute: '/admin/{vertical}/shooting',
    requiresR2: true,
    suitableFor: ['フォトスタジオ', '写真館', '撮影スタジオ'],
  },
  treatmentBodyMap: {
    key: 'treatmentBodyMap',
    label: '施術部位マッピング',
    description: '施術部位・症状を人体図上で記録',
    adminRoute: '/admin/{vertical}/body-map',
    requiresD1: false,
    suitableFor: ['整体', 'マッサージ', '鍼灸', '歯科', 'エステ', '接骨院'],
  },
  colorFormula: {
    key: 'colorFormula',
    label: 'カラー調合レシピ',
    description: '顧客ごとのカラー配合・使用薬剤の記録',
    adminRoute: '/admin/{vertical}/formulas',
    requiresD1: false,
    suitableFor: ['ヘアサロン', 'ネイルサロン', '美容室'],
  },
  equipmentCheck: {
    key: 'equipmentCheck',
    label: '機器チェックリスト',
    description: '作業前後の機器・道具の点検記録',
    adminRoute: '/admin/{vertical}/equipment',
    requiresD1: false,
    suitableFor: ['ジム', 'フィットネス', 'ハウスクリーニング', '便利屋', '整体'],
  },
  beforeAfterPhoto: {
    key: 'beforeAfterPhoto',
    label: 'ビフォーアフター写真',
    description: '施術前後の写真を記録・比較表示',
    adminRoute: '/admin/{vertical}/before-after',
    requiresR2: true,
    suitableFor: ['エステ', 'ヘアサロン', 'ネイルサロン', 'ホワイトニング', '整体'],
  },
  courseCurriculum: {
    key: 'courseCurriculum',
    label: 'カリキュラム管理',
    description: 'コース進行・受講状況・修了証の管理',
    adminRoute: '/admin/{vertical}/curriculum',
    requiresD1: true,
    suitableFor: ['学習塾', 'スクール', 'プログラミング教室', '料理教室'],
  },
  petProfile: {
    key: 'petProfile',
    label: 'ペットプロフィール',
    description: 'ペットの犬種・体重・アレルギー・性格の管理',
    adminRoute: '/admin/{vertical}/profiles',
    requiresD1: false,
    suitableFor: ['ペットサロン', '動物病院', 'ペットホテル'],
  },
  allergyRecord: {
    key: 'allergyRecord',
    label: 'アレルギー・禁忌記録',
    description: 'アレルギー情報と禁忌事項の一元管理・施術時アラート',
    adminRoute: '/admin/{vertical}/allergies',
    requiresD1: false,
    suitableFor: ['歯科', 'エステ', 'ヘアサロン', 'ネイルサロン', '鍼灸'],
  },
  visitSummary: {
    key: 'visitSummary',
    label: '来店サマリー・施術メモ',
    description: '来店ごとの施術内容・お客様の要望を記録',
    adminRoute: '/admin/{vertical}/visit-notes',
    requiresD1: false,
    suitableFor: ['全業種'],
  },
};

// ── VerticalPlugin interface ────────────────────────────────────────

/** Plugin UI labels shape — shared between API and Web */
export interface VerticalPluginLabels {
  karteTab: string;
  menuFilterHeading: string;
  kpiHeading: string;
  settingsHeading: string;
  menuSettingsHeading: string;
  staffSettingsHeading: string;
  settingsDescription: string;
}

/** Plugin feature flags shape — shared between API and Web */
export interface VerticalPluginFlags {
  hasKarte: boolean;
  hasMenuFilter: boolean;
  hasVerticalKpi: boolean;
  hasStaffAttributes: boolean;
  hasMenuAttributes: boolean;
  hasVerticalSettings: boolean;
}

export interface OnboardingCheckItem {
  key: string;
  label: string;
  done: boolean;
  action: string;
  detail?: string;
}

export interface VerticalPlugin {
  /** vertical 識別子 */
  key: VerticalType;

  /** 業種コアタイプ（reservation=予約系, project=案件系） */
  coreType: VerticalCoreType;

  /** UI 表示用ラベル（例: 'アイブロウサロン'） */
  label: string;

  /** 初回セットアップ時のデフォルトメニュー */
  defaultMenu(): Array<{
    id: string;
    name: string;
    price: number;
    durationMin: number;
    active: boolean;
    sortOrder: number;
  }>;

  /** 設定デフォルト値のパッチ（verticalConfig 初期値など） */
  getDefaultSettingsPatch(): Record<string, any>;

  /** vertical 固有のオンボーディングチェック項目 */
  getOnboardingChecks(opts: {
    menuVerticalCount: number;
    repeatEnabled: boolean;
    templateSet: boolean;
  }): OnboardingCheckItem[];

  /** リピート促進メッセージのデフォルトテンプレート */
  getRepeatTemplateFallback(): string;

  /** UI ラベル集（admin / booking 画面用） */
  labels: VerticalPluginLabels;

  /** 表示制御フラグ */
  flags: VerticalPluginFlags;

  /** メニューフィルタ設定（booking 画面のフィルタ UI 用） */
  menuFilterConfig?: {
    /** フィルタ対象の verticalAttributes キー名 */
    filterKey: string;
    /** フィルタ選択肢のラベル（キー → 日本語） */
    options: Record<string, string>;
    /** フィルタ行ラベル */
    label: string;
  };

  /** verticalAttributes のランタイムバリデーション（optional） */
  validateMenuAttrs?(attrs: Record<string, unknown>): { valid: boolean; error?: string };

  /** Phase 13: リピート推奨周期（日数） */
  repeatCadence?: {
    /** デフォルト推奨間隔（日数） */
    defaultIntervalDays: number;
    /** カテゴリ別の推奨間隔（filterKey 値 → 日数） */
    categoryIntervals?: Record<string, number>;
    /** 休眠判定閾値（日数）— これ以上来店がなければ休眠扱い */
    dormantThresholdDays: number;
    /** 初回来店後フォローアップ遅延（日数） */
    firstVisitFollowupDays: number;
  };

  /** 業務特化機能（業種固有の拡張機能キー一覧） */
  specialFeatures?: SpecialFeatureKey[];

  /** Phase 13: AI接客のvertical固有設定 */
  aiConfig?: {
    /** system prompt に追加される業種固有の指示 */
    systemPromptHint: string;
    /** 推奨される応対トーン */
    recommendedVoice: string;
    /** 業種固有の接客注意事項 */
    safetyNotes?: string;
    /** 予約誘導時の強調ポイント */
    bookingEmphasis: string;
  };
}

// ── eyebrow plugin ──────────────────────────────────────────────────

const eyebrowPlugin: VerticalPlugin = {
  key: 'eyebrow',
  coreType: 'reservation',
  label: 'アイブロウサロン',

  defaultMenu() {
    return [
      { id: 'eyebrow-styling',  name: '眉毛スタイリング',  price: 4500, durationMin: 45, active: true, sortOrder: 1 },
      { id: 'eyebrow-wax',      name: '眉毛WAX',          price: 5500, durationMin: 60, active: true, sortOrder: 2 },
      { id: 'eyebrow-wax-trim', name: '眉毛WAX＋間引き',   price: 6500, durationMin: 75, active: true, sortOrder: 3 },
      { id: 'eyebrow-perm',     name: '眉毛パーマ',        price: 7000, durationMin: 60, active: true, sortOrder: 4 },
    ];
  },

  getDefaultSettingsPatch() {
    return {
      vertical: 'eyebrow',
      verticalConfig: {
        surveyEnabled: false,
        bedCount: 1,
      },
    };
  },

  getOnboardingChecks({ menuVerticalCount, repeatEnabled, templateSet }) {
    return [
      {
        key: 'menuEyebrow',
        label: '眉毛スタイル設定済みメニュー（1件以上）',
        done: menuVerticalCount > 0,
        action: '/admin/menu',
        detail: menuVerticalCount > 0 ? `${menuVerticalCount}件` : undefined,
      },
      {
        key: 'repeatConfig',
        label: 'リピート設定（有効化 + テンプレ設定）',
        done: repeatEnabled && templateSet,
        action: '/admin/settings',
      },
      {
        key: 'lineSetup',
        label: 'LINE連携設定',
        done: false,
        action: '/admin/settings',
        detail: 'Messaging APIの設定を完了してください',
      },
      {
        key: 'staffSetup',
        label: 'スタッフ登録（1名以上）',
        done: false,
        action: '/admin/staff',
        detail: 'シフト設定もお忘れなく',
      },
    ];
  },

  getRepeatTemplateFallback() {
    return '前回のご来店からそろそろ{interval}週が経ちます。眉毛のラインが崩れてくる頃かもしれません。リタッチで美しい眉をキープしませんか？\n\n▼ ご予約はこちら\n{bookingUrl}';
  },

  labels: {
    karteTab: '眉毛カルテ',
    menuFilterHeading: '眉毛メニュー絞り込み',
    kpiHeading: '眉毛サロン KPI',
    settingsHeading: '眉毛施術設定',
    menuSettingsHeading: '眉毛設定',
    staffSettingsHeading: '眉毛スキル',
    settingsDescription: '眉毛サロン特化の同意文・リピート施策を設定します',
  },

  flags: {
    hasKarte: true,
    hasMenuFilter: true,
    hasVerticalKpi: true,
    hasStaffAttributes: true,
    hasMenuAttributes: true,
    hasVerticalSettings: true,
  },

  menuFilterConfig: {
    filterKey: 'styleType',
    options: { natural: 'ナチュラル', sharp: 'シャープ', korean: '韓国風', custom: 'カスタム' },
    label: 'スタイル',
  },
  validateMenuAttrs(attrs) {
    const validStyles = ['natural', 'sharp', 'korean', 'custom'];
    if (attrs.styleType && typeof attrs.styleType === 'string' && !validStyles.includes(attrs.styleType)) {
      return { valid: false, error: `Invalid styleType: ${attrs.styleType}` };
    }
    return { valid: true };
  },
  repeatCadence: {
    defaultIntervalDays: 28,
    categoryIntervals: { natural: 28, sharp: 21, korean: 28, custom: 35 },
    dormantThresholdDays: 60,
    firstVisitFollowupDays: 1,
  },
  aiConfig: {
    systemPromptHint: 'このサロンは眉毛デザインの専門サロンです。スタイリング・WAX・パーマなどの施術を提供しています。お客様の顔型や好みに合わせたデザイン提案が強みです。',
    recommendedVoice: 'friendly',
    bookingEmphasis: 'デザインの相談は施術時にじっくりお伺いします。まずはご予約をお取りください。',
  },
  specialFeatures: ['beforeAfterPhoto', 'visitSummary'],
};

// ── generic plugin ──────────────────────────────────────────────────

const genericPlugin: VerticalPlugin = {
  key: 'generic',
  coreType: 'reservation',
  label: '汎用（業種を選択してください）',

  defaultMenu() {
    return [];
  },

  getDefaultSettingsPatch() {
    return {};
  },

  getOnboardingChecks() {
    return [];
  },

  getRepeatTemplateFallback() {
    return GENERIC_REPEAT_TEMPLATE;
  },

  labels: {
    karteTab: 'カルテ',
    menuFilterHeading: 'メニュー絞り込み',
    kpiHeading: 'サロン KPI',
    settingsHeading: '施術設定',
    menuSettingsHeading: '属性設定',
    staffSettingsHeading: 'スキル設定',
    settingsDescription: '業種固有の設定を管理します',
  },

  flags: {
    hasKarte: false,
    hasMenuFilter: false,
    hasVerticalKpi: false,
    hasStaffAttributes: false,
    hasMenuAttributes: false,
    hasVerticalSettings: false,
  },
};

// ── nail plugin ──────────────────────────────────────────────────────

const nailPlugin: VerticalPlugin = {
  key: 'nail',
  coreType: 'reservation',
  label: 'ネイルサロン',

  defaultMenu() {
    return [
      { id: 'nail-gel-simple', name: 'ジェルネイル（ワンカラー）', price: 5000, durationMin: 60, active: true, sortOrder: 1 },
      { id: 'nail-gel-art', name: 'ジェルネイル（アート）', price: 7500, durationMin: 90, active: true, sortOrder: 2 },
      { id: 'nail-care', name: 'ネイルケア', price: 3500, durationMin: 45, active: true, sortOrder: 3 },
      { id: 'nail-off', name: 'ジェルオフ', price: 2500, durationMin: 30, active: true, sortOrder: 4 },
    ];
  },

  getDefaultSettingsPatch() {
    return {
      vertical: 'nail',
      verticalConfig: {
        surveyEnabled: false,
        bedCount: 2,
        styleTypes: ['simple', 'art', 'gel', 'care', 'off'],
      },
    };
  },

  getOnboardingChecks({ menuVerticalCount, repeatEnabled, templateSet }) {
    return [
      {
        key: 'menuNail',
        label: 'デザイン設定済みメニュー（1件以上）',
        done: menuVerticalCount > 0,
        action: '/admin/menu',
        detail: menuVerticalCount > 0 ? `${menuVerticalCount}件` : undefined,
      },
      {
        key: 'repeatConfig',
        label: 'リピート設定（有効化 + テンプレ設定）',
        done: repeatEnabled && templateSet,
        action: '/admin/settings',
      },
      {
        key: 'lineSetup',
        label: 'LINE連携設定',
        done: false,
        action: '/admin/settings',
        detail: 'お客様がLINEから予約できるようにしましょう',
      },
      {
        key: 'staffSetup',
        label: 'ネイリスト登録（1名以上）',
        done: false,
        action: '/admin/staff',
        detail: '指名予約を受け付けるにはスタッフ登録が必要です',
      },
    ];
  },

  getRepeatTemplateFallback() {
    return NAIL_REPEAT_TEMPLATE;
  },

  labels: {
    karteTab: 'ネイルカルテ',
    menuFilterHeading: 'ネイルメニュー絞り込み',
    kpiHeading: 'ネイルサロン KPI',
    settingsHeading: 'ネイル施術設定',
    menuSettingsHeading: 'ネイル設定',
    staffSettingsHeading: 'ネイルスキル',
    settingsDescription: 'ネイルサロン特化の同意文・リピート施策を設定します',
  },

  flags: {
    hasKarte: true,
    hasMenuFilter: true,
    hasVerticalKpi: true,
    hasStaffAttributes: true,
    hasMenuAttributes: true,
    hasVerticalSettings: true,
  },

  menuFilterConfig: {
    filterKey: 'designType',
    options: { simple: 'シンプル', art: 'アート', gel: 'ジェル', care: 'ケア', off: 'オフ' },
    label: 'デザイン',
  },
  validateMenuAttrs(attrs) {
    const validTypes = ['simple', 'art', 'gel', 'care', 'off'];
    if (attrs.designType && typeof attrs.designType === 'string' && !validTypes.includes(attrs.designType)) {
      return { valid: false, error: `Invalid designType: ${attrs.designType}` };
    }
    return { valid: true };
  },
  repeatCadence: {
    defaultIntervalDays: 21,
    categoryIntervals: { simple: 21, art: 28, gel: 21, care: 14, off: 0 },
    dormantThresholdDays: 45,
    firstVisitFollowupDays: 1,
  },
  aiConfig: {
    systemPromptHint: 'このサロンはネイルサロンです。ジェルネイル・アート・ケア・オフなどの施術を提供しています。デザインの相談やケアのアドバイスが得意です。',
    recommendedVoice: 'casual',
    bookingEmphasis: '気になるデザインがあればお気軽にご相談ください。写真の持ち込みも大歓迎です。',
  },
  specialFeatures: ['colorFormula', 'beforeAfterPhoto', 'visitSummary'],
};

// ── dental plugin ────────────────────────────────────────────────────

const dentalPlugin: VerticalPlugin = {
  key: 'dental',
  coreType: 'reservation',
  label: '歯科・クリニック',

  defaultMenu() {
    return [
      { id: 'dental-consultation', name: '初診相談', price: 3000, durationMin: 30, active: true, sortOrder: 1 },
      { id: 'dental-cleaning', name: 'クリーニング', price: 5000, durationMin: 45, active: true, sortOrder: 2 },
      { id: 'dental-whitening', name: 'ホワイトニング', price: 15000, durationMin: 60, active: true, sortOrder: 3 },
      { id: 'dental-checkup', name: '定期検診', price: 3500, durationMin: 30, active: true, sortOrder: 4 },
      { id: 'dental-filling', name: '虫歯治療', price: 8000, durationMin: 60, active: true, sortOrder: 5 },
    ];
  },

  getDefaultSettingsPatch() {
    return {
      vertical: 'dental',
      verticalConfig: {
        surveyEnabled: true,
        bedCount: 3,
        styleTypes: ['checkup', 'cleaning', 'whitening', 'filling', 'extraction', 'orthodontics', 'consultation'],
        surveyQuestions: [
          { id: 'q_dental_1', label: '現在痛みや違和感のある箇所はありますか？', type: 'text' as const, enabled: true },
          { id: 'q_dental_2', label: 'アレルギー（薬剤・金属等）はありますか？', type: 'text' as const, enabled: true },
          { id: 'q_dental_3', label: '現在服用中のお薬はありますか？', type: 'text' as const, enabled: true },
        ],
      },
    };
  },

  getOnboardingChecks({ menuVerticalCount, repeatEnabled, templateSet }) {
    return [
      {
        key: 'menuDental',
        label: '診療メニュー登録（1件以上）',
        done: menuVerticalCount > 0,
        action: '/admin/menu',
        detail: menuVerticalCount > 0 ? `${menuVerticalCount}件` : undefined,
      },
      {
        key: 'repeatConfig',
        label: '定期検診リマインド設定',
        done: repeatEnabled && templateSet,
        action: '/admin/settings',
      },
      {
        key: 'surveySetup',
        label: '事前問診票の設定',
        done: false,
        action: '/admin/settings',
        detail: '問診テンプレートを確認・カスタマイズしてください',
      },
      {
        key: 'staffSetup',
        label: 'スタッフ登録（1名以上）',
        done: false,
        action: '/admin/staff',
        detail: '担当医・衛生士を登録してください',
      },
    ];
  },

  getRepeatTemplateFallback() {
    return DENTAL_REPEAT_TEMPLATE;
  },

  labels: {
    karteTab: '診療記録',
    menuFilterHeading: '診療メニュー絞り込み',
    kpiHeading: 'クリニック KPI',
    settingsHeading: '診療設定',
    menuSettingsHeading: '診療メニュー設定',
    staffSettingsHeading: 'スタッフ資格・専門',
    settingsDescription: '歯科クリニック特化の問診票・定期検診リマインドを設定します',
  },

  flags: {
    hasKarte: true,
    hasMenuFilter: true,
    hasVerticalKpi: true,
    hasStaffAttributes: true,
    hasMenuAttributes: true,
    hasVerticalSettings: true,
  },

  menuFilterConfig: {
    filterKey: 'treatmentType',
    options: { checkup: '定期検診', cleaning: 'クリーニング', whitening: 'ホワイトニング', filling: '虫歯治療', consultation: '初診相談' },
    label: '診療種別',
  },

  validateMenuAttrs(attrs) {
    const valid = ['checkup', 'cleaning', 'whitening', 'filling', 'extraction', 'orthodontics', 'consultation'];
    if (attrs.treatmentType && typeof attrs.treatmentType === 'string' && !valid.includes(attrs.treatmentType)) {
      return { valid: false, error: `Invalid treatmentType: ${attrs.treatmentType}` };
    }
    return { valid: true };
  },
  repeatCadence: {
    defaultIntervalDays: 180,
    categoryIntervals: { checkup: 180, cleaning: 90, whitening: 180, filling: 0, consultation: 0 },
    dormantThresholdDays: 365,
    firstVisitFollowupDays: 1,
  },
  aiConfig: {
    systemPromptHint: 'この施設は歯科クリニックです。定期検診・クリーニング・ホワイトニング・虫歯治療・初診相談などを行っています。',
    recommendedVoice: 'formal',
    safetyNotes: '医療行為に関する具体的な診断・治療方針のアドバイスは行わないでください。必ず「担当医にご相談ください」と案内してください。',
    bookingEmphasis: '症状やお悩みがある場合は、まず初診相談のご予約をお取りください。事前問診票にご記入いただけるとスムーズです。',
  },
  specialFeatures: ['treatmentBodyMap', 'allergyRecord', 'visitSummary'],
};

// ── hair plugin ──────────────────────────────────────────────────────

const hairPlugin: VerticalPlugin = {
  key: 'hair',
  coreType: 'reservation',
  label: 'ヘアサロン',

  defaultMenu() {
    return [
      { id: 'hair-cut', name: 'カット', price: 4500, durationMin: 45, active: true, sortOrder: 1 },
      { id: 'hair-color', name: 'カラー', price: 7000, durationMin: 90, active: true, sortOrder: 2 },
      { id: 'hair-perm', name: 'パーマ', price: 8000, durationMin: 120, active: true, sortOrder: 3 },
      { id: 'hair-treatment', name: 'トリートメント', price: 3500, durationMin: 30, active: true, sortOrder: 4 },
      { id: 'hair-cut-color', name: 'カット＋カラー', price: 10000, durationMin: 120, active: true, sortOrder: 5 },
    ];
  },

  getDefaultSettingsPatch() {
    return {
      vertical: 'hair',
      verticalConfig: {
        surveyEnabled: false,
        bedCount: 3,
        styleTypes: ['cut', 'color', 'perm', 'treatment', 'set', 'spa'],
      },
    };
  },

  getOnboardingChecks({ menuVerticalCount, repeatEnabled, templateSet }) {
    return [
      {
        key: 'menuHair',
        label: 'カテゴリ設定済みメニュー（1件以上）',
        done: menuVerticalCount > 0,
        action: '/admin/menu',
        detail: menuVerticalCount > 0 ? `${menuVerticalCount}件` : undefined,
      },
      {
        key: 'repeatConfig',
        label: 'リピート設定（有効化 + テンプレ設定）',
        done: repeatEnabled && templateSet,
        action: '/admin/settings',
      },
      {
        key: 'lineSetup',
        label: 'LINE連携設定',
        done: false,
        action: '/admin/settings',
        detail: 'お客様がLINEから指名予約できるようにしましょう',
      },
      {
        key: 'staffSetup',
        label: 'スタイリスト登録（1名以上）',
        done: false,
        action: '/admin/staff',
        detail: '各スタイリストのシフトも設定してください',
      },
    ];
  },

  getRepeatTemplateFallback() {
    return HAIR_REPEAT_TEMPLATE;
  },

  labels: {
    karteTab: '施術カルテ',
    menuFilterHeading: 'ヘアメニュー絞り込み',
    kpiHeading: 'ヘアサロン KPI',
    settingsHeading: 'ヘア施術設定',
    menuSettingsHeading: 'ヘアメニュー設定',
    staffSettingsHeading: 'ヘアスキル・ランク',
    settingsDescription: 'ヘアサロン特化の同意文・リピート施策を設定します',
  },

  flags: {
    hasKarte: true,
    hasMenuFilter: true,
    hasVerticalKpi: true,
    hasStaffAttributes: true,
    hasMenuAttributes: true,
    hasVerticalSettings: true,
  },

  menuFilterConfig: {
    filterKey: 'category',
    options: { cut: 'カット', color: 'カラー', perm: 'パーマ', treatment: 'トリートメント', set: 'セット', spa: 'ヘッドスパ' },
    label: 'カテゴリ',
  },
  validateMenuAttrs(attrs) {
    const validCats = ['cut', 'color', 'perm', 'treatment', 'set', 'spa'];
    if (attrs.category && typeof attrs.category === 'string' && !validCats.includes(attrs.category)) {
      return { valid: false, error: `Invalid category: ${attrs.category}` };
    }
    return { valid: true };
  },
  repeatCadence: {
    defaultIntervalDays: 35,
    categoryIntervals: { cut: 30, color: 28, perm: 60, treatment: 21, set: 0, spa: 14 },
    dormantThresholdDays: 90,
    firstVisitFollowupDays: 1,
  },
  aiConfig: {
    systemPromptHint: 'このサロンはヘアサロンです。カット・カラー・パーマ・トリートメントなどの施術を提供しています。スタイリストの指名予約も受け付けています。',
    recommendedVoice: 'professional',
    bookingEmphasis: 'スタイリストへのご要望は予約時のメモ欄にお書きください。カウンセリングで詳しくお伺いします。',
  },
  specialFeatures: ['colorFormula', 'beforeAfterPhoto', 'visitSummary'],
};

// ── esthetic plugin ──────────────────────────────────────────────────

const estheticPlugin: VerticalPlugin = {
  key: 'esthetic',
  coreType: 'reservation',
  label: 'エステ・リラクゼーション',

  defaultMenu() {
    return [
      { id: 'esthe-facial', name: 'フェイシャルエステ', price: 8000, durationMin: 60, active: true, sortOrder: 1 },
      { id: 'esthe-body', name: 'ボディトリートメント', price: 10000, durationMin: 90, active: true, sortOrder: 2 },
      { id: 'esthe-pore', name: '毛穴ケア', price: 6000, durationMin: 45, active: true, sortOrder: 3 },
      { id: 'esthe-relax', name: 'リラクゼーション', price: 7000, durationMin: 60, active: true, sortOrder: 4 },
      { id: 'esthe-counseling', name: '初回カウンセリング', price: 0, durationMin: 30, active: true, sortOrder: 5 },
    ];
  },

  getDefaultSettingsPatch() {
    return {
      vertical: 'esthetic',
      verticalConfig: {
        surveyEnabled: true,
        bedCount: 2,
        styleTypes: ['facial', 'body', 'pore', 'relaxation', 'slimming', 'depilation'],
        surveyQuestions: [
          { id: 'q_esthe_1', label: 'お肌で気になるお悩みはありますか？', type: 'text' as const, enabled: true },
          { id: 'q_esthe_2', label: 'アレルギーや敏感肌の既往はありますか？', type: 'text' as const, enabled: true },
        ],
      },
    };
  },

  getOnboardingChecks({ menuVerticalCount, repeatEnabled, templateSet }) {
    return [
      {
        key: 'menuEsthetic',
        label: '施術メニュー登録（1件以上）',
        done: menuVerticalCount > 0,
        action: '/admin/menu',
        detail: menuVerticalCount > 0 ? `${menuVerticalCount}件` : undefined,
      },
      {
        key: 'repeatConfig',
        label: 'リピート施策設定（有効化 + テンプレ設定）',
        done: repeatEnabled && templateSet,
        action: '/admin/settings',
      },
      {
        key: 'surveySetup',
        label: '事前カウンセリングシートの設定',
        done: false,
        action: '/admin/settings',
        detail: 'お肌の悩み・アレルギー等の質問を設定しましょう',
      },
      {
        key: 'staffSetup',
        label: 'エステティシャン登録（1名以上）',
        done: false,
        action: '/admin/staff',
        detail: '指名予約を受けるにはスタッフ登録が必要です',
      },
    ];
  },

  getRepeatTemplateFallback() {
    return ESTHETIC_REPEAT_TEMPLATE;
  },

  labels: {
    karteTab: '施術カルテ',
    menuFilterHeading: 'エステメニュー絞り込み',
    kpiHeading: 'エステサロン KPI',
    settingsHeading: 'エステ施術設定',
    menuSettingsHeading: '施術カテゴリ設定',
    staffSettingsHeading: 'エステスキル・資格',
    settingsDescription: 'エステサロン特化の同意文・リピート施策を設定します',
  },

  flags: {
    hasKarte: true,
    hasMenuFilter: true,
    hasVerticalKpi: true,
    hasStaffAttributes: true,
    hasMenuAttributes: true,
    hasVerticalSettings: true,
  },

  menuFilterConfig: {
    filterKey: 'treatmentCategory',
    options: { facial: 'フェイシャル', body: 'ボディ', pore: '毛穴ケア', relaxation: 'リラクゼーション', slimming: '痩身' },
    label: '施術カテゴリ',
  },

  validateMenuAttrs(attrs) {
    const valid = ['facial', 'body', 'pore', 'relaxation', 'slimming', 'depilation'];
    if (attrs.treatmentCategory && typeof attrs.treatmentCategory === 'string' && !valid.includes(attrs.treatmentCategory)) {
      return { valid: false, error: `Invalid treatmentCategory: ${attrs.treatmentCategory}` };
    }
    return { valid: true };
  },
  repeatCadence: {
    defaultIntervalDays: 28,
    categoryIntervals: { facial: 21, body: 28, pore: 14, relaxation: 14, slimming: 7, depilation: 28 },
    dormantThresholdDays: 60,
    firstVisitFollowupDays: 1,
  },
  aiConfig: {
    systemPromptHint: 'このサロンはエステ・リラクゼーションサロンです。フェイシャル・ボディ・毛穴ケア・リラクゼーション・痩身などの施術を提供しています。',
    recommendedVoice: 'friendly',
    safetyNotes: '医療行為に該当する施術や効果の断定的な表現は避けてください。「個人差があります」と付け加えてください。',
    bookingEmphasis: 'お肌のお悩みに合わせた施術をご提案します。初回はカウンセリング付きのメニューがおすすめです。',
  },
  specialFeatures: ['beforeAfterPhoto', 'treatmentBodyMap', 'allergyRecord'],
};

// ── cleaning plugin ─────────────────────────────────────────────────

const cleaningPlugin: VerticalPlugin = {
  key: 'cleaning',
  coreType: 'reservation',
  label: 'ハウスクリーニング',

  defaultMenu() {
    return [
      { id: 'cleaning-general-1r', name: '通常清掃 1R-1K', price: 15000, durationMin: 120, active: true, sortOrder: 1 },
      { id: 'cleaning-general-2ldk', name: '通常清掃 2LDK', price: 25000, durationMin: 180, active: true, sortOrder: 2 },
      { id: 'cleaning-aircon', name: 'エアコンクリーニング', price: 12000, durationMin: 90, active: true, sortOrder: 3 },
      { id: 'cleaning-moveout', name: '退去時クリーニング 1R', price: 25000, durationMin: 180, active: true, sortOrder: 4 },
      { id: 'cleaning-water', name: '水回りセット', price: 18000, durationMin: 120, active: true, sortOrder: 5 },
      { id: 'cleaning-rangehood', name: 'レンジフード', price: 12000, durationMin: 60, active: true, sortOrder: 6 },
    ];
  },

  getDefaultSettingsPatch() {
    return {
      vertical: 'cleaning',
      verticalConfig: {
        surveyEnabled: true,
        bedCount: 1,
        styleTypes: ['general', 'aircon', 'moveout', 'water', 'kitchen', 'floor'],
        surveyQuestions: [
          { id: 'q_cleaning_1', label: '作業場所の住所をご記入ください', type: 'text' as const, enabled: true },
          { id: 'q_cleaning_2', label: '特に気になる箇所や汚れの状態をお知らせください', type: 'textarea' as const, enabled: true },
          { id: 'q_cleaning_3', label: '駐車スペースはありますか？', type: 'checkbox' as const, enabled: true },
        ],
      },
    };
  },

  getOnboardingChecks({ menuVerticalCount, repeatEnabled, templateSet }) {
    return [
      {
        key: 'menuCleaning',
        label: '清掃メニュー登録（1件以上）',
        done: menuVerticalCount > 0,
        action: '/admin/menu',
        detail: menuVerticalCount > 0 ? `${menuVerticalCount}件` : undefined,
      },
      {
        key: 'repeatConfig',
        label: '定期クリーニングリマインド設定',
        done: repeatEnabled && templateSet,
        action: '/admin/settings',
      },
      {
        key: 'surveySetup',
        label: '事前アンケートの設定',
        done: false,
        action: '/admin/settings',
        detail: '作業場所・汚れ状況の質問を設定しましょう',
      },
      {
        key: 'staffSetup',
        label: '清掃スタッフ登録（1名以上）',
        done: false,
        action: '/admin/staff',
        detail: 'スタッフのスケジュールも設定してください',
      },
    ];
  },

  getRepeatTemplateFallback() {
    return CLEANING_REPEAT_TEMPLATE;
  },

  labels: {
    karteTab: '作業履歴',
    menuFilterHeading: '清掃メニュー絞り込み',
    kpiHeading: 'クリーニング KPI',
    settingsHeading: 'クリーニング設定',
    menuSettingsHeading: '清掃メニュー設定',
    staffSettingsHeading: 'スタッフ設定',
    settingsDescription: 'ハウスクリーニング特化のアンケート・リピート施策を設定します',
  },

  flags: {
    hasKarte: false,
    hasMenuFilter: true,
    hasVerticalKpi: true,
    hasStaffAttributes: true,
    hasMenuAttributes: true,
    hasVerticalSettings: true,
  },

  menuFilterConfig: {
    filterKey: 'serviceCategory',
    options: { general: '通常清掃', aircon: 'エアコン', moveout: '退去時', water: '水回り', kitchen: 'キッチン', floor: 'フロア' },
    label: 'カテゴリ',
  },

  validateMenuAttrs(attrs) {
    const valid = ['general', 'aircon', 'moveout', 'water', 'kitchen', 'floor'];
    if (attrs.serviceCategory && typeof attrs.serviceCategory === 'string' && !valid.includes(attrs.serviceCategory)) {
      return { valid: false, error: `Invalid serviceCategory: ${attrs.serviceCategory}` };
    }
    return { valid: true };
  },

  repeatCadence: {
    defaultIntervalDays: 90,
    categoryIntervals: { general: 90, aircon: 365, moveout: 0, water: 60, kitchen: 90, floor: 180 },
    dormantThresholdDays: 365,
    firstVisitFollowupDays: 3,
  },

  aiConfig: {
    systemPromptHint: 'このサービスはハウスクリーニング専門業者です。通常清掃・エアコン・水回り・退去時クリーニングなどを提供しています。',
    recommendedVoice: 'friendly',
    bookingEmphasis: 'お部屋の広さや汚れの程度によって料金が変わります。まずはお見積もりからお気軽にどうぞ。',
  },
  specialFeatures: ['equipmentCheck', 'beforeAfterPhoto'],
};

// ── handyman plugin ─────────────────────────────────────────────────

const handymanPlugin: VerticalPlugin = {
  key: 'handyman',
  coreType: 'reservation',
  label: '便利屋',

  defaultMenu() {
    return [
      { id: 'handyman-assembly', name: '家具組立', price: 5000, durationMin: 60, active: true, sortOrder: 1 },
      { id: 'handyman-repair', name: '水回り修理', price: 8000, durationMin: 60, active: true, sortOrder: 2 },
      { id: 'handyman-electrical', name: '電気工事', price: 8000, durationMin: 60, active: true, sortOrder: 3 },
      { id: 'handyman-garden', name: '庭木剪定', price: 10000, durationMin: 120, active: true, sortOrder: 4 },
      { id: 'handyman-disposal', name: '不用品回収', price: 5000, durationMin: 60, active: true, sortOrder: 5 },
      { id: 'handyman-moving', name: '引越し手伝い', price: 10000, durationMin: 120, active: true, sortOrder: 6 },
    ];
  },

  getDefaultSettingsPatch() {
    return {
      vertical: 'handyman',
      verticalConfig: {
        surveyEnabled: true,
        bedCount: 1,
        styleTypes: ['assembly', 'repair', 'electrical', 'garden', 'disposal', 'moving'],
        surveyQuestions: [
          { id: 'q_handyman_1', label: '作業場所の住所をご記入ください', type: 'text' as const, enabled: true },
          { id: 'q_handyman_2', label: '依頼内容の詳細をお聞かせください', type: 'textarea' as const, enabled: true },
        ],
      },
    };
  },

  getOnboardingChecks({ menuVerticalCount, repeatEnabled, templateSet }) {
    return [
      {
        key: 'menuHandyman',
        label: '作業メニュー登録（1件以上）',
        done: menuVerticalCount > 0,
        action: '/admin/menu',
        detail: menuVerticalCount > 0 ? `${menuVerticalCount}件` : undefined,
      },
      {
        key: 'repeatConfig',
        label: '定期メンテナンスリマインド設定',
        done: repeatEnabled && templateSet,
        action: '/admin/settings',
      },
      {
        key: 'surveySetup',
        label: '事前アンケートの設定',
        done: false,
        action: '/admin/settings',
        detail: '作業場所・依頼内容の質問を設定しましょう',
      },
      {
        key: 'staffSetup',
        label: '作業スタッフ登録（1名以上）',
        done: false,
        action: '/admin/staff',
        detail: 'スタッフのスケジュールも設定してください',
      },
    ];
  },

  getRepeatTemplateFallback() {
    return HANDYMAN_REPEAT_TEMPLATE;
  },

  labels: {
    karteTab: '作業履歴',
    menuFilterHeading: '作業メニュー絞り込み',
    kpiHeading: '便利屋 KPI',
    settingsHeading: '便利屋設定',
    menuSettingsHeading: '作業メニュー設定',
    staffSettingsHeading: 'スタッフスキル',
    settingsDescription: '便利屋特化のアンケート・リピート施策を設定します',
  },

  flags: {
    hasKarte: false,
    hasMenuFilter: true,
    hasVerticalKpi: true,
    hasStaffAttributes: true,
    hasMenuAttributes: true,
    hasVerticalSettings: true,
  },

  menuFilterConfig: {
    filterKey: 'taskCategory',
    options: { assembly: '組立', repair: '修理', electrical: '電気', garden: '庭', disposal: '回収', moving: '引越し' },
    label: 'カテゴリ',
  },

  validateMenuAttrs(attrs) {
    const valid = ['assembly', 'repair', 'electrical', 'garden', 'disposal', 'moving'];
    if (attrs.taskCategory && typeof attrs.taskCategory === 'string' && !valid.includes(attrs.taskCategory)) {
      return { valid: false, error: `Invalid taskCategory: ${attrs.taskCategory}` };
    }
    return { valid: true };
  },

  repeatCadence: {
    defaultIntervalDays: 180,
    categoryIntervals: { assembly: 0, repair: 180, electrical: 365, garden: 90, disposal: 0, moving: 0 },
    dormantThresholdDays: 365,
    firstVisitFollowupDays: 3,
  },

  aiConfig: {
    systemPromptHint: 'このサービスは便利屋です。家具組立・水回り修理・電気工事・庭木剪定・不用品回収・引越し手伝い等を提供しています。',
    recommendedVoice: 'friendly',
    bookingEmphasis: '作業内容や現場の状況によって料金が変わります。まずはお気軽にご相談ください。無料見積もりも承ります。',
  },
  specialFeatures: ['equipmentCheck', 'beforeAfterPhoto'],
};

// ── pet plugin ──────────────────────────────────────────────────────

const petPlugin: VerticalPlugin = {
  key: 'pet',
  coreType: 'reservation',
  label: 'ペットサロン',

  defaultMenu() {
    return [
      { id: 'pet-trim-small', name: 'トリミング 小型犬', price: 4000, durationMin: 60, active: true, sortOrder: 1 },
      { id: 'pet-trim-medium', name: 'トリミング 中型犬', price: 6000, durationMin: 90, active: true, sortOrder: 2 },
      { id: 'pet-trim-large', name: 'トリミング 大型犬', price: 8000, durationMin: 120, active: true, sortOrder: 3 },
      { id: 'pet-shampoo-small', name: 'シャンプーコース 小型犬', price: 3000, durationMin: 45, active: true, sortOrder: 4 },
      { id: 'pet-nail-ear', name: '爪切り・耳掃除セット', price: 1500, durationMin: 15, active: true, sortOrder: 5 },
      { id: 'pet-dental', name: 'デンタルケアセット', price: 2000, durationMin: 20, active: true, sortOrder: 6 },
    ];
  },

  getDefaultSettingsPatch() {
    return {
      vertical: 'pet',
      verticalConfig: {
        surveyEnabled: true,
        bedCount: 2,
        styleTypes: ['small', 'medium', 'large', 'cat', 'other'],
        surveyQuestions: [
          { id: 'q_pet_1', label: 'ペットのお名前を教えてください', type: 'text' as const, enabled: true },
          { id: 'q_pet_2', label: '犬種・猫種を教えてください', type: 'text' as const, enabled: true },
          { id: 'q_pet_3', label: '年齢（月齢）を教えてください', type: 'text' as const, enabled: true },
          { id: 'q_pet_4', label: 'アレルギーや皮膚トラブル、持病はありますか？', type: 'textarea' as const, enabled: true },
        ],
      },
    };
  },

  getOnboardingChecks({ menuVerticalCount, repeatEnabled, templateSet }) {
    return [
      {
        key: 'menuPet',
        label: 'トリミングメニュー登録（1件以上）',
        done: menuVerticalCount > 0,
        action: '/admin/menu',
        detail: menuVerticalCount > 0 ? `${menuVerticalCount}件` : undefined,
      },
      {
        key: 'repeatConfig',
        label: 'トリミングリマインド設定',
        done: repeatEnabled && templateSet,
        action: '/admin/settings',
      },
      {
        key: 'surveySetup',
        label: 'ペット情報アンケートの設定',
        done: false,
        action: '/admin/settings',
        detail: 'ペット名・犬種・アレルギー等の質問を設定しましょう',
      },
      {
        key: 'staffSetup',
        label: 'トリマー登録（1名以上）',
        done: false,
        action: '/admin/staff',
        detail: '指名予約を受けるにはトリマー登録が必要です',
      },
    ];
  },

  getRepeatTemplateFallback() {
    return PET_REPEAT_TEMPLATE;
  },

  labels: {
    karteTab: 'ペットカルテ',
    menuFilterHeading: 'メニュー絞り込み',
    kpiHeading: 'ペットサロン KPI',
    settingsHeading: 'ペットサロン設定',
    menuSettingsHeading: 'メニュー設定',
    staffSettingsHeading: 'トリマー設定',
    settingsDescription: 'ペットサロン特化のサイズ別料金・ワクチン管理を設定します',
  },

  flags: {
    hasKarte: true,
    hasMenuFilter: true,
    hasVerticalKpi: true,
    hasStaffAttributes: true,
    hasMenuAttributes: true,
    hasVerticalSettings: true,
  },

  menuFilterConfig: {
    filterKey: 'petSize',
    options: { small: '小型犬', medium: '中型犬', large: '大型犬', cat: '猫', other: 'その他' },
    label: 'サイズ',
  },

  validateMenuAttrs(attrs) {
    const valid = ['small', 'medium', 'large', 'cat', 'other'];
    if (attrs.petSize && typeof attrs.petSize === 'string' && !valid.includes(attrs.petSize)) {
      return { valid: false, error: `Invalid petSize: ${attrs.petSize}` };
    }
    return { valid: true };
  },

  repeatCadence: {
    defaultIntervalDays: 28,
    categoryIntervals: { small: 28, medium: 28, large: 35, cat: 42, other: 28 },
    dormantThresholdDays: 90,
    firstVisitFollowupDays: 1,
  },

  aiConfig: {
    systemPromptHint: 'このサロンはペットサロン・トリミングサロンです。小型犬〜大型犬のトリミング・シャンプー・デンタルケアなどを提供しています。',
    recommendedVoice: 'friendly',
    safetyNotes: '医療行為や獣医の判断が必要な相談については「かかりつけの獣医さんにご相談ください」と案内してください。',
    bookingEmphasis: 'ワクチン接種証明書のご持参をお忘れなく。初めてのわんちゃんは短時間メニューから始めることをおすすめします。',
  },
  specialFeatures: ['vaccineRecord', 'petProfile', 'beforeAfterPhoto'],
};

const seitaiPlugin: VerticalPlugin = {
  key: 'seitai',
  coreType: 'reservation',
  label: '整体院',

  defaultMenu() {
    return [
      { id: 'seitai-standard', name: '整体コース（60分）', price: 6000, durationMin: 60, active: true, sortOrder: 1 },
      { id: 'seitai-short', name: 'お手軽コース（30分）', price: 3500, durationMin: 30, active: true, sortOrder: 2 },
      { id: 'seitai-premium', name: 'じっくり全身コース（90分）', price: 9000, durationMin: 90, active: true, sortOrder: 3 },
      { id: 'seitai-headneck', name: 'ヘッド＆首肩集中', price: 5000, durationMin: 45, active: true, sortOrder: 4 },
    ];
  },

  getDefaultSettingsPatch() {
    return {
      vertical: 'seitai',
      verticalConfig: {
        surveyEnabled: false,
        bedCount: 2,
      },
    };
  },

  getOnboardingChecks({ menuVerticalCount, repeatEnabled, templateSet }) {
    return [
      {
        key: 'menuSeitai',
        label: '施術メニュー設定（1件以上）',
        done: menuVerticalCount > 0,
        action: '/admin/menu',
        detail: menuVerticalCount > 0 ? `${menuVerticalCount}件` : undefined,
      },
      {
        key: 'repeatConfig',
        label: 'リピート設定（有効化 + テンプレ設定）',
        done: repeatEnabled && templateSet,
        action: '/admin/settings',
      },
      {
        key: 'lineSetup',
        label: 'LINE連携設定',
        done: false,
        action: '/admin/settings',
        detail: 'お客様がLINEから予約できるようにしましょう',
      },
      {
        key: 'staffSetup',
        label: '施術者登録（1名以上）',
        done: false,
        action: '/admin/staff',
        detail: '指名予約を受け付けるにはスタッフ登録が必要です',
      },
    ];
  },

  getRepeatTemplateFallback() {
    return SEITAI_REPEAT_TEMPLATE;
  },

  labels: {
    karteTab: '施術カルテ',
    menuFilterHeading: '施術メニュー絞り込み',
    kpiHeading: '整体院 KPI',
    settingsHeading: '整体施術設定',
    menuSettingsHeading: '施術設定',
    staffSettingsHeading: '施術スキル',
    settingsDescription: '整体院特化の同意文・リピート施策を設定します',
  },

  flags: {
    hasKarte: true,
    hasMenuFilter: true,
    hasVerticalKpi: true,
    hasStaffAttributes: true,
    hasMenuAttributes: true,
    hasVerticalSettings: true,
  },

  menuFilterConfig: {
    filterKey: 'bodyArea',
    options: { neck: '首・肩', back: '背中・腰', leg: '脚・膝', full: '全身' },
    label: '施術部位',
  },
  validateMenuAttrs(attrs) {
    const validAreas = ['neck', 'back', 'leg', 'arm', 'head', 'full'];
    if (attrs.bodyArea && typeof attrs.bodyArea === 'string' && !validAreas.includes(attrs.bodyArea)) {
      return { valid: false, error: `Invalid bodyArea: ${attrs.bodyArea}` };
    }
    return { valid: true };
  },
  repeatCadence: {
    defaultIntervalDays: 14,
    categoryIntervals: { neck: 14, back: 14, leg: 21, full: 21 },
    dormantThresholdDays: 45,
    firstVisitFollowupDays: 1,
  },
  aiConfig: {
    systemPromptHint: 'この院は整体・カイロプラクティックの専門院です。肩こり・腰痛・姿勢改善など、お客様の身体の不調に寄り添った施術を提供しています。',
    recommendedVoice: 'professional',
    bookingEmphasis: 'お身体の状態を初回カウンセリングでしっかり確認します。まずはご予約をお取りください。',
  },
  specialFeatures: ['treatmentBodyMap', 'beforeAfterPhoto', 'visitSummary'],
};

// ── Registry ────────────────────────────────────────────────────────

const REGISTRY: Record<string, VerticalPlugin> = {
  eyebrow: eyebrowPlugin,
  generic: genericPlugin,
  nail: nailPlugin,
  dental: dentalPlugin,
  hair: hairPlugin,
  esthetic: estheticPlugin,
  cleaning: cleaningPlugin,
  handyman: handymanPlugin,
  pet: petPlugin,
  seitai: seitaiPlugin,
};

/**
 * vertical 識別子から plugin を取得する。
 * 未知の vertical は generic fallback を返す。
 */
export function getVerticalPlugin(vertical: string | undefined | null): VerticalPlugin {
  if (!vertical) return genericPlugin;
  return REGISTRY[vertical] ?? genericPlugin;
}

/** 登録済み全 vertical の一覧を返す */
export function getAllVerticalPlugins(): VerticalPlugin[] {
  return Object.values(REGISTRY);
}
