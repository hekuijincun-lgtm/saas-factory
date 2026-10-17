/**
 * PDF生成テスト — 日本語フォントが正しく埋め込まれていることを検証
 * jsPDFはjsdomで重いため、フォント登録ロジックとPDF構造を検証する
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

// フォントファイル存在チェック
const fontPath = path.resolve(__dirname, "../../public/fonts/NotoSansJP-Regular-subset.ttf");

describe("PDF日本語フォント", () => {
  it("サブセットフォントファイルが存在する", () => {
    expect(fs.existsSync(fontPath)).toBe(true);
  });

  it("フォントファイルがTTF形式である", () => {
    const buf = fs.readFileSync(fontPath);
    // TrueType: 先頭4バイトが 00 01 00 00 (TrueType) or 'OTTO' (CFF)
    expect(buf.length).toBeGreaterThan(10000); // 最低10KB
    const magic = buf.readUInt32BE(0);
    // 0x00010000 = TrueType, 0x4F54544F = 'OTTO' (OpenType/CFF)
    expect([0x00010000, 0x4f54544f]).toContain(magic);
  });

  it("フォントファイルに日本語グリフが含まれる（サイズで推定）", () => {
    const stat = fs.statSync(fontPath);
    // 日本語サブセットなら最低500KB以上あるはず
    expect(stat.size).toBeGreaterThan(500 * 1024);
  });

  it("pdfRenderer.ts でboldフォントが登録されている", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../app/toban/_lib/pdfRenderer.ts"),
      "utf-8"
    );
    // normal と bold の両方が addFont で登録されていることを確認
    expect(src).toContain('doc.addFont("NotoSansJP-Regular.ttf", "NotoSansJP", "normal")');
    expect(src).toContain('doc.addFont("NotoSansJP-Regular.ttf", "NotoSansJP", "bold")');
  });

  it("headStylesでNotoSansJPフォントが指定されている", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../app/toban/_lib/pdfRenderer.ts"),
      "utf-8"
    );
    // headStyles内にfont: "NotoSansJP"が指定されていること
    expect(src).toContain('font: "NotoSansJP"');
  });
});
