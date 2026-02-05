/**
 * スタッフシフト設定の型定義
 */

export type TimeStr = string; // "HH:mm" 形式（例: "10:00"）
export type Dow = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=日曜, 1=月曜, ..., 6=土曜

export type ShiftDay = {
  enabled: boolean;
  start: TimeStr;
  end: TimeStr;
  breakStart?: TimeStr;
  breakEnd?: TimeStr;
};

export type StaffShiftWeekly = {
  dow: Dow;
} & ShiftDay;

export type StaffShiftException = {
  date: string; // YYYY-MM-DD
  type: 'off' | 'custom';
  start?: TimeStr;
  end?: TimeStr;
  breakStart?: TimeStr;
  breakEnd?: TimeStr;
};

export type StaffShift = {
  staffId: string;
  weekly: StaffShiftWeekly[];
  exceptions: StaffShiftException[];
};

