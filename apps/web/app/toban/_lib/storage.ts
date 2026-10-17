/** localStorage CRUD for Schedule data */

import { Schedule, createSchedule } from "./types";

const STORAGE_KEY = "toban_schedules";
const ACTIVE_KEY = "toban_active_id";

export function loadSchedules(): Schedule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Schedule[];
  } catch {
    return [];
  }
}

export function saveSchedules(schedules: Schedule[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
}

export function getActiveId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_KEY, id);
}

/** 全スケジュール取得。なければ初期データを作成 */
export function loadOrCreate(): { schedules: Schedule[]; activeId: string } {
  let schedules = loadSchedules();
  let activeId = getActiveId();

  if (schedules.length === 0) {
    const s = createSchedule({ title: "新しい当番表" });
    schedules = [s];
    activeId = s.id;
    saveSchedules(schedules);
    setActiveId(activeId);
  } else if (!activeId || !schedules.find((s) => s.id === activeId)) {
    activeId = schedules[0].id;
    setActiveId(activeId);
  }

  return { schedules, activeId };
}

/** スケジュール1件を更新 */
export function updateSchedule(
  schedules: Schedule[],
  updated: Schedule
): Schedule[] {
  updated.updatedAt = Date.now();
  return schedules.map((s) => (s.id === updated.id ? updated : s));
}

/** スケジュール削除 */
export function deleteSchedule(
  schedules: Schedule[],
  id: string
): Schedule[] {
  return schedules.filter((s) => s.id !== id);
}
