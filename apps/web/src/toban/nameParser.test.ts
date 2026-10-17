import { describe, it, expect } from "vitest";
import { splitNames, parseNaturalInput } from "@/app/toban/_lib/nameParser";

describe("splitNames", () => {
  const members = ["大成", "駒谷", "今村", "出田", "尾形", "鈴木"];

  it("最長一致で連結された名前を分割する", () => {
    const result = splitNames("大成駒谷今村", members);
    expect(result.matched).toEqual(["大成", "駒谷", "今村"]);
    expect(result.unmatched).toBe("");
  });

  it("マッチしない残りを unmatched に返す", () => {
    const result = splitNames("大成駒谷山田", members);
    expect(result.matched).toEqual(["大成", "駒谷"]);
    expect(result.unmatched).toBe("山田");
  });

  it("空文字列の場合は空を返す", () => {
    const result = splitNames("", members);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toBe("");
  });

  it("名簿が空の場合は全体が unmatched", () => {
    const result = splitNames("大成駒谷", []);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toBe("大成駒谷");
  });

  it("長い名前を先にマッチする（最長一致）", () => {
    const membersWithLong = ["大成", "大成田", "駒谷"];
    const result = splitNames("大成田駒谷", membersWithLong);
    expect(result.matched).toEqual(["大成田", "駒谷"]);
    expect(result.unmatched).toBe("");
  });

  it("1人だけの場合もマッチする", () => {
    const result = splitNames("鈴木", members);
    expect(result.matched).toEqual(["鈴木"]);
    expect(result.unmatched).toBe("");
  });
});

describe("parseNaturalInput", () => {
  it("日付+場所+担当を解析する", () => {
    const result = parseNaturalInput("9/21与野南担当大成駒谷今村");
    expect(result).not.toBeNull();
    expect(result!.date).toBe("9/21");
    expect(result!.place).toBe("与野南");
    expect(result!.membersText).toBe("大成駒谷今村");
  });

  it("空文字列は null を返す", () => {
    expect(parseNaturalInput("")).toBeNull();
    expect(parseNaturalInput("  ")).toBeNull();
  });

  it("日付がない場合は date が空", () => {
    const result = parseNaturalInput("与野南担当大成駒谷");
    expect(result!.date).toBe("");
    expect(result!.membersText).toBe("与野南担当大成駒谷");
  });

  it("担当キーワードがない場合はスペース区切りを試す", () => {
    const result = parseNaturalInput("9/21 与野南 大成駒谷今村");
    expect(result!.date).toBe("9/21");
    expect(result!.place).toBe("与野南");
    expect(result!.membersText).toBe("大成駒谷今村");
  });

  it("2桁月/2桁日も解析できる", () => {
    const result = parseNaturalInput("12/25田島中担当鈴木出田");
    expect(result!.date).toBe("12/25");
    expect(result!.place).toBe("田島中");
    expect(result!.membersText).toBe("鈴木出田");
  });
});

describe("splitNames + parseNaturalInput 統合", () => {
  const members = ["大成", "駒谷", "今村", "出田", "尾形", "鈴木"];

  it("受け入れ条件: 9/21与野南担当大成駒谷今村 → 正しい1行", () => {
    const parsed = parseNaturalInput("9/21与野南担当大成駒谷今村");
    expect(parsed).not.toBeNull();
    expect(parsed!.date).toBe("9/21");
    expect(parsed!.place).toBe("与野南");

    const { matched, unmatched } = splitNames(parsed!.membersText, members);
    expect(matched).toEqual(["大成", "駒谷", "今村"]);
    expect(unmatched).toBe("");
  });
});
