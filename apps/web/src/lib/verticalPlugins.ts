/**
 * Vertical Plugin Registry (Web-side)
 *
 * Phase 4: UI 用の labels / flags を vertical ごとに管理する。
 * API 側の verticals/registry.ts と labels / flags は同一定義。
 *
 * 責務: vertical ごとの UI 文言・表示制御
 * ※ legacy data bridge (normalize / dual-write) は bookingApi.ts が担当
 * ※ settings read adapter は types/settings.ts が担当
 */

import type { VerticalType } from '@/src/types/settings';

// ── Plugin interface (UI subset) ────────────────────────────────────

export interface VerticalPluginUI {
  key: VerticalType;
  label: string;
  labels: {
    karteTab: string;
    menuFilterHeading: string;
    kpiHeading: string;
    settingsHeading: string;
  };
  flags: {
    hasKarte: boolean;
    hasMenuFilter: boolean;
    hasVerticalKpi: boolean;
    hasStaffAttributes: boolean;
  };
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
  },
  flags: {
    hasKarte: true,
    hasMenuFilter: true,
    hasVerticalKpi: true,
    hasStaffAttributes: true,
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
  },
  flags: {
    hasKarte: false,
    hasMenuFilter: false,
    hasVerticalKpi: false,
    hasStaffAttributes: false,
  },
};

// ── stub plugins ────────────────────────────────────────────────────

function createStub(key: VerticalType, label: string): VerticalPluginUI {
  return { ...genericPlugin, key, label };
}

const nailPlugin = createStub('nail', 'ネイルサロン');
const dentalPlugin = createStub('dental', '歯科・クリニック');
const hairPlugin = createStub('hair', 'ヘアサロン');
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
