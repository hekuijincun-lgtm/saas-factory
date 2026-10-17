/** 日付・曜日計算ユーティリティ */

const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"] as const;

/**
 * "7/4" + year → 曜日を返す
 * 無効な日付の場合は "" を返す
 */
export function calcWeekday(dateStr: string, year: number): string {
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return "";
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const d = new Date(year, month - 1, day);
  // 日付の妥当性チェック（2/30 などを弾く）
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return "";
  return WEEKDAY_NAMES[d.getDay()];
}

/**
 * 曜日が土日かどうか
 */
export function isWeekend(weekday: string): boolean {
  return weekday === "土" || weekday === "日";
}

/**
 * 曜日が土曜かどうか
 */
export function isSaturday(weekday: string): boolean {
  return weekday === "土";
}

/**
 * 曜日が日曜かどうか
 */
export function isSunday(weekday: string): boolean {
  return weekday === "日";
}
