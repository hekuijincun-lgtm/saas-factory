/**
 * Vertical Plugin Registry (Web-side)
 *
 * UI 用の labels / flags を vertical ごとに管理する。
 * API 側の verticals/registry.ts と labels / flags は同一定義を維持すること。
 *
 * 新 vertical 追加手順:
 * 1. API 側: apps/api/src/verticals/{vertical}.ts を作成
 * 2. API 側: apps/api/src/verticals/registry.ts に plugin 追加
 * 3. ここ (verticalPlugins.ts) に VerticalPluginUI を追加
 * 4. apps/api/src/settings.ts の VerticalType union に追加
 * 5. apps/web/src/types/settings.ts の VerticalType union に追加
 * ※ テンプレート: apps/web/src/lib/_verticalPluginTemplate.ts
 */

import type { VerticalType } from '@/src/types/settings';

// ── Plugin interface (UI subset) ────────────────────────────────────

/** Plugin UI labels shape — must match API registry.ts VerticalPluginLabels */
export interface VerticalPluginLabels {
  karteTab: string;
  menuFilterHeading: string;
  kpiHeading: string;
  settingsHeading: string;
  menuSettingsHeading: string;
  staffSettingsHeading: string;
  settingsDescription: string;
}

/** Plugin feature flags shape — must match API registry.ts VerticalPluginFlags */
export interface VerticalPluginFlags {
  hasKarte: boolean;
  hasMenuFilter: boolean;
  hasVerticalKpi: boolean;
  hasStaffAttributes: boolean;
  hasMenuAttributes: boolean;
  hasVerticalSettings: boolean;
}

export interface VerticalPluginUI {
  key: VerticalType;
  label: string;
  labels: VerticalPluginLabels;
  flags: VerticalPluginFlags;
}

// ── eyebrow ─────────────────────────────────────────────────────────

const eyebrowPlugin: VerticalPluginUI = {
  key: 'eyebrow',
  label: 'アイブロウサロン',
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

// ── nail ─────────────────────────────────────────────────────────────

const nailPlugin: VerticalPluginUI = {
  key: 'nail',
  label: 'ネイルサロン',
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

// ── hair ─────────────────────────────────────────────────────────────

const hairPlugin: VerticalPluginUI = {
  key: 'hair',
  label: 'ヘアサロン',
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

// ── generic ─────────────────────────────────────────────────────────

const genericPlugin: VerticalPluginUI = {
  key: 'generic',
  label: '汎用（業種を選択してください）',
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

// ── stub plugins ────────────────────────────────────────────────────

function createStub(key: VerticalType, label: string): VerticalPluginUI {
  return { ...genericPlugin, key, label };
}

const dentalPlugin = createStub('dental', '歯科・クリニック');
const estheticPlugin = createStub('esthetic', 'エステ・リラクゼーション');

// ── Registry ────────────────────────────────────────────────────────

const REGISTRY: Record<string, VerticalPluginUI> = {
  eyebrow: eyebrowPlugin,
  generic: genericPlugin,
  nail: nailPlugin,
  dental: dentalPlugin,
  hair: hairPlugin,
  esthetic: estheticPlugin,
};

/**
 * vertical 識別子から UI plugin を取得する。
 * 未知の vertical は generic fallback を返す。
 */
export function getVerticalPluginUI(vertical: string | undefined | null): VerticalPluginUI {
  if (!vertical) return genericPlugin;
  return REGISTRY[vertical] ?? genericPlugin;
}
