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
    ];
  },

  getRepeatTemplateFallback() {
    return '前回のご来店からそろそろ{interval}週が経ちます。眉毛のリタッチはいかがでしょうか？';
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

// ── stub plugins (generic ベース) ───────────────────────────────────

function createStubPlugin(key: VerticalType, label: string): VerticalPlugin {
  return { ...genericPlugin, key, label };
}

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
};
const dentalPlugin = createStubPlugin('dental', '歯科・クリニック');
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
};
const estheticPlugin = createStubPlugin('esthetic', 'エステ・リラクゼーション');

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
