/**
 * Vertical Plugin: hair (ヘアサロン)
 *
 * ヘアサロン固有のビジネスロジック。
 *
 * verticalAttributes (menu):
 *   - category?: 'cut' | 'color' | 'perm' | 'treatment' | 'set' | 'spa'
 *   - genderTarget?: 'male' | 'female' | 'both'
 *   - firstTimeOnly?: boolean
 *
 * verticalAttributes (staff):
 *   - skillLevel?: 1 | 2 | 3 | 4 | 5
 *   - specialties?: string[]   e.g. ["カラー", "パーマ", "ヘッドスパ"]
 *   - rank?: 'junior' | 'stylist' | 'top_stylist' | 'director'
 *
 * verticalData (reservation):
 *   - category?: string
 *   - lengthBefore?: string
 */

import { GENERIC_REPEAT_TEMPLATE } from '../settings';

/** デフォルトリピートテンプレート（ヘアサロン専用） */
export const DEFAULT_REPEAT_TEMPLATE =
  '前回のご来店からそろそろ{interval}週が経ちます。そろそろヘアカットはいかがでしょうか？';

/** メニューカテゴリ → 日本語ラベル */
export const CATEGORY_LABELS: Record<string, string> = {
  cut: 'カット',
  color: 'カラー',
  perm: 'パーマ',
  treatment: 'トリートメント',
  set: 'セット・アレンジ',
  spa: 'ヘッドスパ',
};

/** meta からカテゴリを取得 */
export function getCategory(meta: any): string | null {
  return meta?.verticalData?.category || null;
}

/** カテゴリから日本語ラベルを返す */
export function getCategoryLabel(category: string | null): string {
  if (!category) return '';
  return CATEGORY_LABELS[category] ?? category;
}
