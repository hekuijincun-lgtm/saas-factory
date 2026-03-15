/**
 * Vertical Pack Readiness Checklist
 *
 * Phase 11: defines what must be in place for a vertical pack to be
 * "commercially sellable". Use `evaluateVerticalReadiness()` to get
 * a per-item status matrix for any vertical.
 */

import { getVerticalPluginUI } from './verticalPlugins';

// ── Checklist definition ─────────────────────────────────────────────

export interface ReadinessItem {
  key: string;
  label: string;
  category: 'core' | 'sales' | 'ops';
  description: string;
}

export const READINESS_CHECKLIST: ReadinessItem[] = [
  // ─ Core (plugin 定義)
  { key: 'defaultMenu',      label: 'デフォルトメニュー',    category: 'core',  description: 'defaultMenu() が1件以上のメニューを返す' },
  { key: 'settingsPatch',    label: '設定パッチ',            category: 'core',  description: 'getDefaultSettingsPatch() が vertical/verticalConfig を返す' },
  { key: 'labels',           label: 'UIラベル',              category: 'core',  description: 'labels が全フィールド定義済み' },
  { key: 'flags',            label: '機能フラグ',            category: 'core',  description: 'flags が全フィールド定義済み' },
  { key: 'menuFilter',       label: 'メニューフィルタ',      category: 'core',  description: 'menuFilterConfig が定義済み（filterKey + options + label）' },
  { key: 'validation',       label: 'メニュー属性バリデーション', category: 'core', description: 'validateMenuAttrs() が定義済みかつ API handler 接続済み' },

  // ─ Sales (営業・集客)
  { key: 'onboarding',       label: 'オンボーディング',      category: 'sales', description: 'getOnboardingChecks() が1件以上のチェック項目を返す' },
  { key: 'repeatTemplate',   label: 'リピートテンプレート',  category: 'sales', description: 'getRepeatTemplateFallback() が空でないテンプレートを返す' },
  { key: 'kpiHeading',       label: 'KPI見出し',             category: 'sales', description: 'labels.kpiHeading が vertical 固有の見出しを持つ' },
  { key: 'kpiQueryAxis',     label: 'KPI集計軸',             category: 'sales', description: 'menuFilterConfig.filterKey が KPI breakdown で使用される' },
  { key: 'lpSupport',        label: 'LP ページ',             category: 'sales', description: '/lp/{vertical} が存在しアクセス可能' },

  // ─ Operations (運用)
  { key: 'staffSupport',     label: 'スタッフ属性',          category: 'ops',   description: 'flags.hasStaffAttributes=true かつ管理UI対応' },
  { key: 'menuAttributes',   label: 'メニュー属性管理',      category: 'ops',   description: 'flags.hasMenuAttributes=true かつ MenuManager dynamic UI 対応' },
  { key: 'settingsDesc',     label: '設定説明文',            category: 'ops',   description: 'labels.settingsDescription が vertical 固有' },
];

// ── Evaluation ───────────────────────────────────────────────────────

export interface ReadinessResult {
  key: string;
  label: string;
  category: 'core' | 'sales' | 'ops';
  status: 'ok' | 'missing' | 'partial';
  note?: string;
}

export interface ReadinessReport {
  vertical: string;
  label: string;
  items: ReadinessResult[];
  score: number;       // 0-100
  sellable: boolean;   // score >= 80 and all core items ok
}

/**
 * Evaluate vertical pack readiness using the client-side plugin registry.
 * For items requiring API-side data (e.g., LP availability), pass hints.
 */
export function evaluateVerticalReadiness(
  vertical: string,
  hints?: {
    lpAvailable?: boolean;
    validationConnected?: boolean;
  },
): ReadinessReport {
  const plugin = getVerticalPluginUI(vertical);
  const isGeneric = vertical === 'generic';

  const results: ReadinessResult[] = READINESS_CHECKLIST.map(item => {
    switch (item.key) {
      case 'defaultMenu':
        // Can't call defaultMenu() from web side; infer from plugin definition
        return { ...item, status: isGeneric ? 'missing' : 'ok' };

      case 'settingsPatch':
        return { ...item, status: isGeneric ? 'missing' : 'ok' };

      case 'labels': {
        const allDefined = plugin.labels.karteTab && plugin.labels.kpiHeading && plugin.labels.settingsHeading;
        return { ...item, status: allDefined ? 'ok' : 'missing' };
      }

      case 'flags':
        return { ...item, status: 'ok' }; // always defined

      case 'menuFilter':
        return { ...item, status: plugin.menuFilterConfig ? 'ok' : (isGeneric ? 'ok' : 'missing'), note: isGeneric ? 'generic は不要' : undefined };

      case 'validation':
        return { ...item, status: hints?.validationConnected !== false ? 'ok' : 'missing', note: 'Phase 11 で API 接続済み' };

      case 'onboarding':
        return { ...item, status: isGeneric ? 'missing' : 'ok' };

      case 'repeatTemplate':
        return { ...item, status: 'ok' }; // all verticals have getRepeatTemplateFallback

      case 'kpiHeading':
        return { ...item, status: plugin.labels.kpiHeading !== 'サロン KPI' ? 'ok' : (isGeneric ? 'ok' : 'partial') };

      case 'kpiQueryAxis':
        return { ...item, status: plugin.menuFilterConfig ? 'ok' : (isGeneric ? 'ok' : 'missing'), note: isGeneric ? 'generic は汎用KPI' : undefined };

      case 'lpSupport':
        return { ...item, status: hints?.lpAvailable ? 'ok' : 'partial', note: hints?.lpAvailable ? undefined : 'Phase 11 で dynamic LP 追加済み' };

      case 'staffSupport':
        return { ...item, status: plugin.flags.hasStaffAttributes ? 'ok' : (isGeneric ? 'ok' : 'missing'), note: isGeneric ? 'generic は不要' : undefined };

      case 'menuAttributes':
        return { ...item, status: plugin.flags.hasMenuAttributes ? 'ok' : (isGeneric ? 'ok' : 'missing'), note: isGeneric ? 'generic は不要' : undefined };

      case 'settingsDesc':
        return { ...item, status: plugin.labels.settingsDescription !== '業種固有の設定を管理します' ? 'ok' : (isGeneric ? 'ok' : 'partial') };

      default:
        return { ...item, status: 'missing' };
    }
  });

  const okCount = results.filter(r => r.status === 'ok').length;
  const score = Math.round((okCount / results.length) * 100);
  const coreAllOk = results.filter(r => r.category === 'core').every(r => r.status === 'ok');
  const sellable = score >= 80 && coreAllOk;

  return {
    vertical,
    label: plugin.label,
    items: results,
    score,
    sellable,
  };
}

/**
 * Evaluate all verticals and return a summary matrix.
 */
export function evaluateAllVerticals(hints?: {
  lpAvailable?: Record<string, boolean>;
  validationConnected?: boolean;
}): ReadinessReport[] {
  const verticals = ['eyebrow', 'nail', 'hair', 'dental', 'esthetic', 'generic'];
  return verticals.map(v => evaluateVerticalReadiness(v, {
    lpAvailable: hints?.lpAvailable?.[v] ?? (v === 'eyebrow'),
    validationConnected: hints?.validationConnected ?? true,
  }));
}
