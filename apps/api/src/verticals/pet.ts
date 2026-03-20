/**
 * Vertical Plugin: pet (ペットサロン)
 */

import { GENERIC_REPEAT_TEMPLATE } from '../settings';

/** デフォルトリピートテンプレート（ペットサロン専用） */
export const DEFAULT_REPEAT_TEMPLATE =
  '前回のトリミングからそろそろ{interval}週が経ちます。わんちゃんの毛が伸びてきた頃ではないでしょうか？\n\n▼ ご予約はこちら\n{bookingUrl}';

/** ペットサイズ → 日本語ラベル */
export const SIZE_LABELS: Record<string, string> = {
  small: '小型犬',
  medium: '中型犬',
  large: '大型犬',
  cat: '猫',
  other: 'その他',
};

/** meta オブジェクトからペットサイズを取得 */
export function getPetSize(meta: any): string | null {
  return meta?.verticalData?.petSize || null;
}

/** ペットサイズから日本語ラベルを返す */
export function getSizeLabel(size: string | null): string {
  if (!size) return '';
  return SIZE_LABELS[size] ?? size;
}
