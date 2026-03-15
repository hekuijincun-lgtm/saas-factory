/**
 * Vertical Plugin: dental (歯科・クリニック)
 *
 * verticalAttributes (menu):
 *   - treatmentType?: 'checkup' | 'cleaning' | 'whitening' | 'filling' | 'extraction' | 'orthodontics' | 'consultation'
 *   - isFirstVisitOnly?: boolean
 *   - insuranceCovered?: boolean
 *
 * verticalAttributes (staff):
 *   - skillLevel?: 1 | 2 | 3 | 4 | 5
 *   - specialties?: string[]   e.g. ["矯正", "インプラント", "小児歯科"]
 *   - qualification?: 'dentist' | 'hygienist' | 'assistant'
 *
 * verticalData (reservation):
 *   - treatmentType?: string
 *   - toothArea?: string
 */

import { GENERIC_REPEAT_TEMPLATE } from '../settings';

export const DEFAULT_REPEAT_TEMPLATE = '前回のご来院からそろそろ{interval}週が経ちます。お口の健康を保つために、定期検診・クリーニングをおすすめします。症状が出る前の予防が大切です。\n\n▼ ご予約はこちら\n{bookingUrl}';

export const TREATMENT_LABELS: Record<string, string> = {
  checkup: '定期検診',
  cleaning: 'クリーニング',
  whitening: 'ホワイトニング',
  filling: '虫歯治療',
  extraction: '抜歯',
  orthodontics: '矯正相談',
  consultation: '初診相談',
};

export function getTreatmentType(meta: any): string | null {
  return meta?.verticalData?.treatmentType || null;
}

export function getTreatmentLabel(treatmentType: string | null): string {
  if (!treatmentType) return '';
  return TREATMENT_LABELS[treatmentType] ?? treatmentType;
}
