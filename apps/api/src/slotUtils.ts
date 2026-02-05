/**
 * スロット生成用のユーティリティ
 */

import type { AdminSettings, BusinessException } from './settings';
import type { StaffShift } from './shift';

/**
 * 時刻文字列を分に変換
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 分を時刻文字列に変換
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * JST基準で今日の日付文字列を取得（YYYY-MM-DD）
 */
export function getTodayJST(): string {
  const now = new Date();
  // JST (UTC+9) に変換
  const jstOffset = 9 * 60; // 分単位
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const jst = new Date(utc + (jstOffset * 60000));
  
  const year = jst.getFullYear();
  const month = String(jst.getMonth() + 1).padStart(2, '0');
  const day = String(jst.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * JST基準で現在時刻を分に変換
 */
export function getNowMinutesJST(): number {
  const now = new Date();
  const jstOffset = 9 * 60;
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const jst = new Date(utc + (jstOffset * 60000));
  
  return jst.getHours() * 60 + jst.getMinutes();
}

/**
 * 日付文字列から曜日を取得（0=日曜, 1=月曜, ..., 6=土曜）
 */
export function getDayOfWeek(dateStr: string): number {
  const date = new Date(dateStr + 'T00:00:00+09:00'); // JSTとして解釈
  return date.getDay();
}

/**
 * 指定日の営業時間を取得（例外日を考慮）
 */
export function getBusinessHoursForDate(dateStr: string, settings: AdminSettings): { openTime: string; closeTime: string } | null {
  // 例外日をチェック
  const exception = settings.exceptions.find((ex) => ex.date === dateStr);
  if (exception) {
    if (exception.type === 'closed') {
      return null; // 休業日
    }
    if (exception.type === 'short' || exception.type === 'special') {
      if (exception.openTime && exception.closeTime) {
        return { openTime: exception.openTime, closeTime: exception.closeTime };
      }
    }
  }
  
  // 定休日をチェック
  const dow = getDayOfWeek(dateStr);
  if (settings.closedWeekdays.includes(dow)) {
    return null; // 定休日
  }
  
  // 通常の営業時間
  return {
    openTime: settings.businessHours.openTime,
    closeTime: settings.businessHours.closeTime,
  };
}

/**
 * スロットを生成
 */
export function generateSlots(
  openTime: string,
  closeTime: string,
  slotIntervalMin: number
): string[] {
  const slots: string[] = [];
  const openMin = timeToMinutes(openTime);
  const closeMin = timeToMinutes(closeTime);
  
  for (let min = openMin; min < closeMin; min += slotIntervalMin) {
    slots.push(minutesToTime(min));
  }
  
  return slots;
}

/**
 * cutoffMinutesを適用してスロットのavailableを判定
 */
export function isSlotAvailable(
  dateStr: string,
  timeStr: string,
  cutoffMinutes: number,
  isReserved: boolean
): boolean {
  if (isReserved) {
    return false;
  }
  
  // 当日の場合のみcutoffMinutesをチェック
  const today = getTodayJST();
  if (dateStr !== today) {
    return true; // 当日以外は常に利用可能（予約済みでなければ）
  }
  
  const nowMin = getNowMinutesJST();
  const slotMin = timeToMinutes(timeStr);
  const diffMinutes = slotMin - nowMin;
  
  return diffMinutes >= cutoffMinutes;
}

/**
 * 指定された日時がスタッフの勤務時間内であるかを判定
 */
export function isWorkingTime(dateStr: string, timeStr: string, staffShift: StaffShift | null): boolean {
  if (!staffShift) {
    return true; // シフトが設定されていない場合は常に勤務中とみなす
  }

  const targetMinutes = timeToMinutes(timeStr);
  const dow = getDayOfWeek(dateStr);

  // 1. 例外日をチェック
  const exception = staffShift.exceptions.find((ex) => ex.date === dateStr);
  if (exception) {
    if (exception.type === 'off') {
      return false; // 終日休み
    }
    if (exception.type === 'custom' && exception.start && exception.end) {
      const startMin = timeToMinutes(exception.start);
      const endMin = timeToMinutes(exception.end);
      const breakStartMin = exception.breakStart ? timeToMinutes(exception.breakStart) : -1;
      const breakEndMin = exception.breakEnd ? timeToMinutes(exception.breakEnd) : -1;

      return (
        targetMinutes >= startMin &&
        targetMinutes < endMin &&
        !(targetMinutes >= breakStartMin && targetMinutes < breakEndMin)
      );
    }
  }

  // 2. 週次シフトをチェック
  const weeklyShift = staffShift.weekly.find((ws) => ws.dow === dow);
  if (weeklyShift && weeklyShift.enabled) {
    const startMin = timeToMinutes(weeklyShift.start);
    const endMin = timeToMinutes(weeklyShift.end);
    const breakStartMin = weeklyShift.breakStart ? timeToMinutes(weeklyShift.breakStart) : -1;
    const breakEndMin = weeklyShift.breakEnd ? timeToMinutes(weeklyShift.breakEnd) : -1;

    return (
      targetMinutes >= startMin &&
      targetMinutes < endMin &&
      !(targetMinutes >= breakStartMin && targetMinutes < breakEndMin)
    );
  }

  return false; // 週次シフトが無効または見つからない
}


