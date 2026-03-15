/**
 * Vertical Plugin Registry
 *
 * Phase 4: vertical 依存ロジックを plugin interface + registry で管理する。
 *
 * 責務: vertical ごとの差分定義（defaultMenu / onboarding / repeat / labels / flags）
 * ※ legacy data bridge (normalize / dual-write) は vertical-bridge.ts が担当
 *
 * 使い方:
 *   import { getVerticalPlugin } from './verticals/registry';
 *   const plugin = getVerticalPlugin('eyebrow');
 *   const menu = plugin.defaultMenu();
 */

import type { VerticalType } from '../settings';
import { GENERIC_REPEAT_TEMPLATE } from '../settings';

// ── VerticalPlugin interface ────────────────────────────────────────

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
  labels: {
    /** カルテタブ名（例: '眉毛カルテ'） */
    karteTab: string;
    /** メニューフィルタ見出し（例: '眉毛メニュー絞り込み'） */
    menuFilterHeading: string;
    /** KPI セクション見出し（例: '眉毛サロン KPI'） */
    kpiHeading: string;
    /** 施術設定セクション見出し（例: '眉毛施術設定'） */
    settingsHeading: string;
  };

  /** 表示制御フラグ */
  flags: {
    /** カルテタブを表示するか */
    hasKarte: boolean;
    /** vertical 固有の menu 属性フィルタを表示するか */
    hasMenuFilter: boolean;
    /** vertical 固有の KPI セクションを表示するか */
    hasVerticalKpi: boolean;
    /** vertical 固有のスタッフ属性 UI を表示するか */
    hasStaffAttributes: boolean;
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
  },

  flags: {
    hasKarte: true,
    hasMenuFilter: true,
    hasVerticalKpi: true,
    hasStaffAttributes: true,
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
  },

  flags: {
    hasKarte: false,
    hasMenuFilter: false,
    hasVerticalKpi: false,
    hasStaffAttributes: false,
  },
};

// ── stub plugins (generic ベース) ───────────────────────────────────

function createStubPlugin(key: VerticalType, label: string): VerticalPlugin {
  return { ...genericPlugin, key, label };
}

const nailPlugin = createStubPlugin('nail', 'ネイルサロン');
const dentalPlugin = createStubPlugin('dental', '歯科・クリニック');
const hairPlugin = createStubPlugin('hair', 'ヘアサロン');
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
