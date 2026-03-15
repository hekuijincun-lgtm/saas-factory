/**
 * Vertical Plugin Template
 *
 * 新しい vertical を追加する際のテンプレート。
 * このファイルをコピーして {vertical}.ts にリネームし、各値を埋めてください。
 *
 * 追加手順:
 * 1. このファイルをコピー → apps/api/src/verticals/{vertical}.ts
 * 2. 下の TODO を埋める
 * 3. apps/api/src/verticals/registry.ts に plugin を追加:
 *    - import { DEFAULT_REPEAT_TEMPLATE as XXX_REPEAT_TEMPLATE } from './{vertical}';
 *    - const xxxPlugin: VerticalPlugin = { ... };
 *    - REGISTRY に追加
 * 4. apps/web/src/lib/verticalPlugins.ts に UI plugin を追加
 * 5. apps/api/src/settings.ts の VerticalType union に '{vertical}' を追加
 * 6. apps/web/src/types/settings.ts の VerticalType union に '{vertical}' を追加
 * 7. TypeScript check: tsc --noEmit
 * 8. Workers deploy: wrangler deploy --env production
 *
 * verticalAttributes 設計ガイド:
 * - menu: designType / category / serviceType など、メニュー分類に使うフィールド
 * - staff: skillLevel / specialties / rank など、スタッフスキルに使うフィールド
 * - 全フィールドは optional（?）で定義すること
 * - 既存の vertical の schema を参照しつつ、業種固有のフィールドを追加する
 *
 * verticalData 設計ガイド:
 * - reservation meta に保存する業種固有データ
 * - designType / category / styleType など、予約時に記録したい属性
 * - KPI 集計やリピート分析の軸に使うフィールドを定義する
 */

import { GENERIC_REPEAT_TEMPLATE } from '../settings';

// TODO: vertical 固有のリピートテンプレートを定義
export const DEFAULT_REPEAT_TEMPLATE =
  '前回のご来店からそろそろ{interval}週が経ちます。またのご来店をお待ちしております。';

// TODO: vertical 固有のスタイル/カテゴリラベルを定義
export const STYLE_LABELS: Record<string, string> = {
  // example: 'カット',
};

// TODO: meta から分類キーを取得する関数
export function getStyleType(meta: any): string | null {
  return meta?.verticalData?.styleType || null;
}

// TODO: 分類キーから日本語ラベルを返す関数
export function getStyleLabel(styleType: string | null): string {
  if (!styleType) return '';
  return STYLE_LABELS[styleType] ?? styleType;
}
