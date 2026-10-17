import { describe, it, expect } from "vitest";
import { calcWeekday, isWeekend, isSaturday, isSunday } from "@/app/toban/_lib/dateUtils";

describe("calcWeekday", () => {
  it("正しい曜日を返す（2026年）", () => {
    // 2026-07-04 = 土曜日
    expect(calcWeekday("7/4", 2026)).toBe("土");
    // 2026-09-21 = 月曜日
    expect(calcWeekday("9/21", 2026)).toBe("月");
    // 2026-01-01 = 木曜日
    expect(calcWeekday("1/1", 2026)).toBe("木");
    // 2026-12-25 = 金曜日
    expect(calcWeekday("12/25", 2026)).toBe("金");
  });

  it("日曜日を正しく判定する", () => {
    // 2026-07-05 = 日曜日
    expect(calcWeekday("7/5", 2026)).toBe("日");
  });

  it("無効な日付は空文字列を返す", () => {
    expect(calcWeekday("", 2026)).toBe("");
    expect(calcWeekday("abc", 2026)).toBe("");
    expect(calcWeekday("13/1", 2026)).toBe("");
    expect(calcWeekday("2/30", 2026)).toBe("");
    expect(calcWeekday("0/1", 2026)).toBe("");
  });

  it("閏年の2/29を正しく処理する", () => {
    // 2024は閏年
    expect(calcWeekday("2/29", 2024)).toBe("木");
    // 2026は閏年ではない
    expect(calcWeekday("2/29", 2026)).toBe("");
  });
});

describe("isWeekend / isSaturday / isSunday", () => {
  it("土日をweekendとして判定する", () => {
    expect(isWeekend("土")).toBe(true);
    expect(isWeekend("日")).toBe(true);
    expect(isWeekend("月")).toBe(false);
    expect(isWeekend("")).toBe(false);
  });

  it("土曜のみ", () => {
    expect(isSaturday("土")).toBe(true);
    expect(isSaturday("日")).toBe(false);
  });

  it("日曜のみ", () => {
    expect(isSunday("日")).toBe(true);
    expect(isSunday("土")).toBe(false);
  });
});
