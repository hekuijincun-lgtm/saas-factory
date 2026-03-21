/**
 * 整体院 (Seitai / Chiropractic & Bodywork) vertical helpers
 */

export const DEFAULT_REPEAT_TEMPLATE =
  '前回のご来院からそろそろ{interval}週が経ちます。お身体の調子はいかがですか？定期メンテナンスで辛くなる前にケアしませんか？\n\n▼ ご予約はこちら\n{bookingUrl}';

/** 施術部位ラベル */
export const AREA_LABELS: Record<string, string> = {
  neck: '首・肩', back: '背中・腰', leg: '脚・膝', arm: '腕・肘', head: '頭部', full: '全身',
};

export function getAreaLabel(area: string): string {
  return AREA_LABELS[area] ?? area;
}
