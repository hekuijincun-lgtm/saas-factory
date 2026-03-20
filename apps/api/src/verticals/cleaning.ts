/**
 * Vertical Plugin: cleaning (ハウスクリーニング)
 */

import { GENERIC_REPEAT_TEMPLATE } from '../settings';

/** デフォルトリピートテンプレート（クリーニング専用） */
export const DEFAULT_REPEAT_TEMPLATE =
  '前回のご利用からそろそろ{interval}週が経ちます。エアコンや水回りの汚れが溜まる前に、定期クリーニングはいかがでしょうか？\n\n▼ ご予約はこちら\n{bookingUrl}';

/** サービスカテゴリ → 日本語ラベル */
export const CATEGORY_LABELS: Record<string, string> = {
  general: '通常清掃',
  aircon: 'エアコン',
  moveout: '退去時',
  water: '水回り',
  kitchen: 'キッチン',
  floor: 'フロア',
};

/** meta オブジェクトからサービスカテゴリを取得 */
export function getServiceCategory(meta: any): string | null {
  return meta?.verticalData?.serviceCategory || null;
}

/** サービスカテゴリから日本語ラベルを返す */
export function getCategoryLabel(category: string | null): string {
  if (!category) return '';
  return CATEGORY_LABELS[category] ?? category;
}
