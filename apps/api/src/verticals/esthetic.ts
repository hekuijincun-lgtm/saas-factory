/**
 * Vertical Plugin: esthetic (エステ・リラクゼーション)
 *
 * verticalAttributes (menu):
 *   - treatmentCategory?: 'facial' | 'body' | 'pore' | 'relaxation' | 'slimming' | 'depilation'
 *   - bodyArea?: 'face' | 'upper_body' | 'lower_body' | 'full_body'
 *   - firstTimeOnly?: boolean
 *
 * verticalAttributes (staff):
 *   - skillLevel?: 1 | 2 | 3 | 4 | 5
 *   - specialties?: string[]   e.g. ["フェイシャル", "痩身", "脱毛"]
 *   - certifications?: string[]
 *
 * verticalData (reservation):
 *   - treatmentCategory?: string
 *   - bodyArea?: string
 *   - skinCondition?: string
 */

import { GENERIC_REPEAT_TEMPLATE } from '../settings';

export const DEFAULT_REPEAT_TEMPLATE =
  '前回のご来店からそろそろ{interval}週が経ちます。お肌のメンテナンスはいかがでしょうか？';

export const CATEGORY_LABELS: Record<string, string> = {
  facial: 'フェイシャル',
  body: 'ボディトリートメント',
  pore: '毛穴ケア',
  relaxation: 'リラクゼーション',
  slimming: '痩身・引き締め',
  depilation: '脱毛',
};

export function getTreatmentCategory(meta: any): string | null {
  return meta?.verticalData?.treatmentCategory || null;
}

export function getCategoryLabel(category: string | null): string {
  if (!category) return '';
  return CATEGORY_LABELS[category] ?? category;
}
