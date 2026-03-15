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

import type { VerticalType } from '../settings';
import { GENERIC_REPEAT_TEMPLATE } from '../settings';
import { DEFAULT_REPEAT_TEMPLATE as NAIL_REPEAT_TEMPLATE } from './nail';
import { DEFAULT_REPEAT_TEMPLATE as HAIR_REPEAT_TEMPLATE } from './hair';
import { DEFAULT_REPEAT_TEMPLATE as DENTAL_REPEAT_TEMPLATE } from './dental';
import { DEFAULT_REPEAT_TEMPLATE as ESTHETIC_REPEAT_TEMPLATE } from './esthetic';

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
};

// ── generic plugin ──────────────────────────────────────────────────

const genericPlugin: VerticalPlugin = {
  key: 'generic',
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
};

// ── dental plugin ────────────────────────────────────────────────────

const dentalPlugin: VerticalPlugin = {
  key: 'dental',
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
};

// ── hair plugin ──────────────────────────────────────────────────────

const hairPlugin: VerticalPlugin = {
  key: 'hair',
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
};

// ── esthetic plugin ──────────────────────────────────────────────────

const estheticPlugin: VerticalPlugin = {
  key: 'esthetic',
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
};

// ── Registry ────────────────────────────────────────────────────────

const REGISTRY: Record<string, VerticalPlugin> = {
  eyebrow: eyebrowPlugin,
  generic: genericPlugin,
  nail: nailPlugin,
  dental: dentalPlugin,
  hair: hairPlugin,
  esthetic: estheticPlugin,
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
