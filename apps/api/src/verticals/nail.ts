/**
 * Vertical Plugin: nail (ネイルサロン)
 *
 * ネイルサロン固有のビジネスロジック。
 * eyebrow.ts と同構造で、KPI / repeat / onboarding / style labels を提供する。
 *
 * verticalAttributes (menu):
 *   - designType?: 'simple' | 'art' | 'gel' | 'care' | 'off'
 *   - handFoot?: 'hand' | 'foot' | 'both'
 *   - firstTimeOnly?: boolean
 *
 * verticalAttributes (staff):
 *   - skillLevel?: 1 | 2 | 3 | 4 | 5
 *   - specialties?: string[]   e.g. ["ジェル", "スカルプ", "フットケア"]
 *
 * verticalData (reservation):
 *   - designType?: string
 *   - colorPreference?: string
 */

import { GENERIC_REPEAT_TEMPLATE } from '../settings';

/** デフォルトリピートテンプレート（ネイル専用） */
export const DEFAULT_REPEAT_TEMPLATE = '前回のご来店からそろそろ{interval}週が経ちます。ジェルネイルの付け替え時期ではありませんか？爪への負担を防ぐためにも、早めのオフ＆付け替えがおすすめです。\n\n▼ ご予約はこちら\n{bookingUrl}';

/** デザインタイプ → 日本語ラベル */
export const DESIGN_LABELS: Record<string, string> = {
  simple: 'シンプル・ワンカラー',
  art: 'アートデザイン',
  gel: 'ジェルネイル',
  care: 'ケア・リペア',
  off: 'オフのみ',
};

/** meta から designType を取得 */
export function getDesignType(meta: any): string | null {
  return meta?.verticalData?.designType || null;
}

/** designType から日本語ラベルを返す */
export function getDesignLabel(designType: string | null): string {
  if (!designType) return '';
  return DESIGN_LABELS[designType] ?? designType;
}
