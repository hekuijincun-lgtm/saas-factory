/** 当番表データモデル — 全機能共通 */

export interface Row {
  id: string;
  date: string;       // "7/4"
  weekday: string;    // "土"
  place: string;      // "田島中"
  members: string[];  // ["出田","尾形","鈴木"]
  cancelled: boolean; // 取り消し線 = 中止
  isBlank?: boolean;  // 空行（区切り）
}

export interface Schedule {
  id: string;
  title: string;       // "2026年 練習試合 当番表"
  year: number;
  rows: Row[];
  members: string[];   // 名簿（登録済みメンバー）
  createdAt: number;
  updatedAt: number;
}

export interface PdfOptions {
  orientation: "portrait" | "landscape";
  showCancelled: boolean;       // 中止行を表示するか
  cancelledStyle: "strikethrough" | "exclude"; // 表示方法
  highlightWeekend: boolean;    // 土日を色分け
  title: string;
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  orientation: "portrait",
  showCancelled: true,
  cancelledStyle: "strikethrough",
  highlightWeekend: true,
  title: "",
};

export function createRow(partial?: Partial<Row>): Row {
  return {
    id: crypto.randomUUID(),
    date: "",
    weekday: "",
    place: "",
    members: ["", "", ""],
    cancelled: false,
    ...partial,
  };
}

export function createSchedule(partial?: Partial<Schedule>): Schedule {
  return {
    id: crypto.randomUUID(),
    title: "",
    year: new Date().getFullYear(),
    rows: [createRow()],
    members: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
}
