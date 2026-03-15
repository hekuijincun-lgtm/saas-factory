/**
 * Vertical Plugin UI Template (Web-side)
 *
 * 新しい vertical の UI plugin を追加する際のテンプレート。
 * このファイルを参考に verticalPlugins.ts に新しい plugin 定義を追加してください。
 *
 * 追加手順:
 * 1. 下の定義を verticalPlugins.ts にコピー
 * 2. key / label / labels / flags を vertical 固有の値に変更
 * 3. REGISTRY に登録
 * 4. TypeScript check + build 確認
 *
 * labels ガイド:
 * - karteTab: 予約詳細のカルテタブ名（例: 'ネイルカルテ'）
 * - menuFilterHeading: 予約画面のメニューフィルタ見出し
 * - kpiHeading: ダッシュボードの KPI セクション見出し
 * - settingsHeading: 管理画面の業種設定セクション見出し
 * - menuSettingsHeading: メニュー管理の属性セクション見出し
 * - staffSettingsHeading: スタッフ管理の属性セクション見出し
 * - settingsDescription: 業種設定カードの副題
 *
 * flags ガイド:
 * - hasKarte: true → 予約詳細にカルテタブを表示
 * - hasMenuFilter: true → 予約画面にメニューフィルタ UI を表示
 * - hasVerticalKpi: true → ダッシュボードに業種 KPI セクションを表示
 * - hasStaffAttributes: true → スタッフ管理に業種属性 UI を表示
 * - hasMenuAttributes: true → メニュー管理に業種属性 UI を表示
 * - hasVerticalSettings: true → 管理画面に業種設定セクションを表示
 */

import type { VerticalPluginUI } from './verticalPlugins';

/** TODO: vertical key と label を変更 */
const _templatePlugin: VerticalPluginUI = {
  key: 'generic', // TODO: 'nail' | 'hair' | 'dental' | 'esthetic' | 新規追加
  label: 'TODO: 業種名',
  labels: {
    karteTab: 'TODO: カルテタブ名',
    menuFilterHeading: 'TODO: メニュー絞り込み見出し',
    kpiHeading: 'TODO: KPI 見出し',
    settingsHeading: 'TODO: 施術設定見出し',
    menuSettingsHeading: 'TODO: メニュー属性見出し',
    staffSettingsHeading: 'TODO: スタッフスキル見出し',
    settingsDescription: 'TODO: 施術設定の説明文',
  },
  flags: {
    hasKarte: false,       // true にするとカルテタブ表示
    hasMenuFilter: false,  // true にするとメニューフィルタ表示
    hasVerticalKpi: false,  // true にすると KPI セクション表示
    hasStaffAttributes: false, // true にするとスタッフ属性 UI 表示
    hasMenuAttributes: false,  // true にするとメニュー属性 UI 表示
    hasVerticalSettings: false, // true にすると業種設定セクション表示
  },
};

export default _templatePlugin;
