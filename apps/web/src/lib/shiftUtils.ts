/**
 * シフト設定用のユーティリティ関数
 */

import type { TimeStr, Dow, ShiftDay, StaffShiftWeekly } from '@/src/types/shift';

/**
 * 時刻文字列を分に変換
 */
export function timeToMinutes(time: TimeStr): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 分を時刻文字列に変換
 */
export function minutesToTime(minutes: number): TimeStr {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}` as TimeStr;
}

/**
 * 時刻オプションを生成（open〜close を interval 分刻みで返す）
 * デフォルト: 10:00〜20:00 を 30 分刻み（後方互換）
 */
export function generateTimeOptions(
  open: string = '10:00',
  close: string = '20:00',
  interval: number = 30,
): TimeStr[] {
  const options: TimeStr[] = [];
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  const openMin  = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  const step = interval > 0 ? interval : 30;
  for (let min = openMin; min <= closeMin; min += step) {
    options.push(minutesToTime(min));
  }
  return options;
}

/**
 * 開始時刻より後の時刻オプションを生成
 * open/close/interval を渡すと generateTimeOptions と同じ範囲・刻みで絞り込む
 */
export function generateEndTimeOptions(
  startTime: TimeStr,
  open?: string,
  close?: string,
  interval?: number,
): TimeStr[] {
  const allOptions = generateTimeOptions(open, close, interval);
  const startMinutes = timeToMinutes(startTime);
  return allOptions.filter((time) => timeToMinutes(time) > startMinutes);
}

/**
 * バリデーション: start < end
 */
export function validateTimeRange(start: TimeStr, end: TimeStr): boolean {
  return timeToMinutes(start) < timeToMinutes(end);
}

/**
 * バリデーション: breakが範囲内にあるか
 */
export function validateBreakRange(
  start: TimeStr,
  end: TimeStr,
  breakStart?: TimeStr,
  breakEnd?: TimeStr
): boolean {
  if (!breakStart || !breakEnd) {
    return true; // 休憩が設定されていない場合はOK
  }
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  const breakStartMin = timeToMinutes(breakStart);
  const breakEndMin = timeToMinutes(breakEnd);

  return (
    startMin < breakStartMin &&
    breakStartMin < breakEndMin &&
    breakEndMin < endMin
  );
}

/**
 * ShiftDayのバリデーション
 */
export function validateShiftDay(day: ShiftDay): { valid: boolean; error?: string } {
  if (!day.enabled) {
    return { valid: true }; // enabled=falseの場合は検証不要
  }

  // start < end チェック
  if (!validateTimeRange(day.start, day.end)) {
    return { valid: false, error: '終了時刻は開始時刻より後である必要があります' };
  }

  // break範囲チェック
  if (day.breakStart || day.breakEnd) {
    if (!day.breakStart || !day.breakEnd) {
      return { valid: false, error: '休憩開始時刻と終了時刻の両方を入力してください' };
    }
    if (!validateBreakRange(day.start, day.end, day.breakStart, day.breakEnd)) {
      return { valid: false, error: '休憩時間は勤務時間の範囲内である必要があります' };
    }
  }

  return { valid: true };
}

/**
 * デフォルトの週次シフトを生成
 * @param open  営業開始時間（デフォルト: '10:00'）
 * @param close 営業終了時間（デフォルト: '19:00'）
 */
export function generateDefaultWeekly(open: string = '10:00', close: string = '19:00'): StaffShiftWeekly[] {
  const startTime = open  as TimeStr;
  const endTime   = close as TimeStr;
  const days: { dow: Dow; enabled: boolean }[] = [
    { dow: 0, enabled: false }, // 日
    { dow: 1, enabled: true  }, // 月
    { dow: 2, enabled: true  }, // 火
    { dow: 3, enabled: true  }, // 水
    { dow: 4, enabled: true  }, // 木
    { dow: 5, enabled: true  }, // 金
    { dow: 6, enabled: true  }, // 土
  ];
  return days.map((day) => ({
    dow: day.dow,
    enabled: day.enabled,
    start: startTime,
    end: endTime,
  }));
}

/**
 * 曜日名を取得
 */
export function getDayLabel(dow: Dow): string {
  const labels = ['日', '月', '火', '水', '木', '金', '土'];
  return labels[dow];
}

/**
 * 日付文字列から曜日を取得（0=日曜, 1=月曜, ..., 6=土曜）
 */
export function getDayOfWeek(dateStr: string): Dow {
  const date = new Date(dateStr);
  return date.getDay() as Dow;
}

/**
 * 指定日時がスタッフの勤務時間内かどうかを判定
 * @param dateStr YYYY-MM-DD形式の日付
 * @param timeStr HH:mm形式の時刻
 * @param shift スタッフのシフト設定
 * @returns 勤務時間内ならtrue
 */
export function isWorkingTime(dateStr: string, timeStr: TimeStr, shift: import('@/src/types/shift').StaffShift | null): boolean {
  if (!shift) {
    // シフトが設定されていない場合は全て有効とする
    return true;
  }

  const dow = getDayOfWeek(dateStr);
  const timeMinutes = timeToMinutes(timeStr);

  // 例外日をチェック
  const exception = shift.exceptions.find((ex) => ex.date === dateStr);
  if (exception) {
    if (exception.type === 'off') {
      return false; // 休み
    }
    if (exception.type === 'custom' && exception.start && exception.end) {
      const startMin = timeToMinutes(exception.start);
      const endMin = timeToMinutes(exception.end);
      // 休憩時間をチェック
      if (exception.breakStart && exception.breakEnd) {
        const breakStartMin = timeToMinutes(exception.breakStart);
        const breakEndMin = timeToMinutes(exception.breakEnd);
        if (timeMinutes >= breakStartMin && timeMinutes < breakEndMin) {
          return false; // 休憩時間
        }
      }
      return timeMinutes >= startMin && timeMinutes < endMin;
    }
  }

  // 週次シフトをチェック
  const weekly = shift.weekly.find((w) => w.dow === dow);
  if (!weekly || !weekly.enabled) {
    return false; // その曜日は勤務なし
  }

  const startMin = timeToMinutes(weekly.start);
  const endMin = timeToMinutes(weekly.end);

  // 休憩時間をチェック
  if (weekly.breakStart && weekly.breakEnd) {
    const breakStartMin = timeToMinutes(weekly.breakStart);
    const breakEndMin = timeToMinutes(weekly.breakEnd);
    if (timeMinutes >= breakStartMin && timeMinutes < breakEndMin) {
      return false; // 休憩時間
    }
  }

  return timeMinutes >= startMin && timeMinutes < endMin;
}

