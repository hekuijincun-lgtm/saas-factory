/**
 * Vertical Plugin: handyman (便利屋)
 */

import { GENERIC_REPEAT_TEMPLATE } from '../settings';

/** デフォルトリピートテンプレート（便利屋専用） */
export const DEFAULT_REPEAT_TEMPLATE =
  '前回のご利用からそろそろ{interval}週が経ちます。お家のお困りごとはございませんか？お気軽にご相談ください。\n\n▼ ご予約はこちら\n{bookingUrl}';

/** 作業カテゴリ → 日本語ラベル */
export const CATEGORY_LABELS: Record<string, string> = {
  assembly: '組立',
  repair: '修理',
  electrical: '電気',
  garden: '庭',
  disposal: '回収',
  moving: '引越し',
};

/** meta オブジェクトから作業カテゴリを取得 */
export function getTaskCategory(meta: any): string | null {
  return meta?.verticalData?.taskCategory || null;
}

/** 作業カテゴリから日本語ラベルを返す */
export function getCategoryLabel(category: string | null): string {
  if (!category) return '';
  return CATEGORY_LABELS[category] ?? category;
}
