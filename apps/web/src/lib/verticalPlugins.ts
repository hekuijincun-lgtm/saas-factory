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

/** 業務特化機能の識別子 — API registry.ts の SpecialFeatureKey と一致させること */
export type SpecialFeatureKey =
  | 'vaccineRecord' | 'progressRecord' | 'shootingManagement'
  | 'treatmentBodyMap' | 'colorFormula' | 'equipmentCheck'
  | 'beforeAfterPhoto' | 'courseCurriculum' | 'petProfile'
  | 'allergyRecord' | 'visitSummary';

export interface VerticalPluginUI {
  key: VerticalType;
  label: string;
  labels: VerticalPluginLabels;
  flags: VerticalPluginFlags;
  /** メニューフィルタ設定（booking 画面のフィルタ UI 用） */
  menuFilterConfig?: {
    filterKey: string;
    options: Record<string, string>;
    label: string;
  };
  /** 業務特化機能（業種固有の拡張機能キー一覧） */
  specialFeatures?: SpecialFeatureKey[];
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
  menuFilterConfig: {
    filterKey: 'styleType',
    options: { natural: 'ナチュラル', sharp: 'シャープ', korean: '韓国風', custom: 'カスタム' },
    label: 'スタイル',
  },
  specialFeatures: ['beforeAfterPhoto', 'visitSummary'],
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
  menuFilterConfig: {
    filterKey: 'designType',
    options: { simple: 'シンプル', art: 'アート', gel: 'ジェル', care: 'ケア', off: 'オフ' },
    label: 'デザイン',
  },
  specialFeatures: ['colorFormula', 'beforeAfterPhoto', 'visitSummary'],
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
  menuFilterConfig: {
    filterKey: 'category',
    options: { cut: 'カット', color: 'カラー', perm: 'パーマ', treatment: 'トリートメント', set: 'セット', spa: 'ヘッドスパ' },
    label: 'カテゴリ',
  },
  specialFeatures: ['colorFormula', 'beforeAfterPhoto', 'visitSummary'],
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

// ── dental ──────────────────────────────────────────────────────────

const dentalPlugin: VerticalPluginUI = {
  key: 'dental',
  label: '歯科・クリニック',
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
  specialFeatures: ['treatmentBodyMap', 'allergyRecord', 'visitSummary'],
};

// ── esthetic ────────────────────────────────────────────────────────

const estheticPlugin: VerticalPluginUI = {
  key: 'esthetic',
  label: 'エステ・リラクゼーション',
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
  specialFeatures: ['beforeAfterPhoto', 'treatmentBodyMap', 'allergyRecord'],
};

// ── pet ───────────────────────────────────────────────────────────────

const petPlugin: VerticalPluginUI = {
  key: 'pet',
  label: 'ペットサロン',
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
  specialFeatures: ['vaccineRecord', 'petProfile', 'beforeAfterPhoto'],
};

// ── cleaning ────────────────────────────────────────────────────────

const cleaningPlugin: VerticalPluginUI = {
  key: 'cleaning',
  label: 'ハウスクリーニング',
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
  specialFeatures: ['equipmentCheck', 'beforeAfterPhoto'],
};

// ── handyman ────────────────────────────────────────────────────────

const handymanPlugin: VerticalPluginUI = {
  key: 'handyman',
  label: '便利屋',
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
  specialFeatures: ['equipmentCheck', 'beforeAfterPhoto'],
};

const seitaiPlugin: VerticalPluginUI = {
  key: 'seitai',
  label: '整体院',
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
  specialFeatures: ['treatmentBodyMap', 'beforeAfterPhoto', 'visitSummary'],
};

// ── Registry ────────────────────────────────────────────────────────

const REGISTRY: Record<string, VerticalPluginUI> = {
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
 * vertical 識別子から UI plugin を取得する。
 * 未知の vertical は generic fallback を返す。
 */
export function getVerticalPluginUI(vertical: string | undefined | null): VerticalPluginUI {
  if (!vertical) return genericPlugin;
  return REGISTRY[vertical] ?? genericPlugin;
}
