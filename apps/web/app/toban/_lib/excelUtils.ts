/**
 * Excel 読み書き — ExcelJS
 * - .xlsx 読み取り時: セル書式の strikethrough → cancelled
 * - .xlsx 出力: 罫線・列幅・日本語フォント設定済み
 */

import type { Row } from "./types";
import { calcWeekday } from "./dateUtils";

/** ExcelJS を動的 import（バンドルサイズ削減） */
async function getExcelJS() {
  const mod = await import("exceljs");
  return mod.default ?? mod;
}

/** .xlsx ファイルを読み取って Row[] に変換 */
export async function readXlsx(
  file: File,
  year: number
): Promise<Row[]> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  await wb.xlsx.load(buf);

  const ws = wb.worksheets[0];
  if (!ws) return [];

  const rows: Row[] = [];

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // ヘッダー行をスキップ（1行目）
    if (rowNumber === 1) return;

    const cells = [];
    for (let col = 1; col <= row.cellCount; col++) {
      cells.push(row.getCell(col));
    }

    // 空行チェック
    const allEmpty = cells.every(
      (c) => !c.value || String(c.value).trim() === ""
    );
    if (allEmpty) {
      rows.push({
        id: crypto.randomUUID(),
        date: "",
        weekday: "",
        place: "",
        members: [],
        cancelled: false,
        isBlank: true,
      });
      return;
    }

    // 取り消し線の検出: いずれかのセルに strike があれば cancelled
    const hasStrike = cells.some((c) => {
      const font = c.font;
      if (font?.strike) return true;
      // リッチテキストの場合
      if (c.value && typeof c.value === "object" && "richText" in (c.value as any)) {
        const rt = (c.value as any).richText as Array<{ font?: { strike?: boolean } }>;
        return rt.some((seg) => seg.font?.strike);
      }
      return false;
    });

    // 日付セル（1列目）
    const dateRaw = String(cells[0]?.value ?? "").trim();
    // 日付からM/D部分を抽出
    const dateMatch = dateRaw.match(/(\d{1,2})\/(\d{1,2})/);
    const date = dateMatch ? `${dateMatch[1]}/${dateMatch[2]}` : dateRaw;

    // 場所（2列目）
    const place = String(cells[1]?.value ?? "").trim();

    // 担当（3列目以降）
    const members: string[] = [];
    for (let i = 2; i < cells.length; i++) {
      const v = String(cells[i]?.value ?? "").trim();
      if (v) members.push(v);
    }

    const weekday = date ? calcWeekday(date, year) : "";

    rows.push({
      id: crypto.randomUUID(),
      date,
      weekday,
      place,
      members: members.length > 0 ? members : ["", "", ""],
      cancelled: hasStrike,
    });
  });

  return rows;
}

/** Row[] を .xlsx として出力 → Blob */
export async function writeXlsx(
  rows: Row[],
  title: string
): Promise<Blob> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("当番表");

  // 担当列数
  const maxMembers = Math.max(3, ...rows.map((r) => r.members.length));

  // 列定義
  const columns = [
    { header: "日付", key: "date", width: 12 },
    { header: "場所", key: "place", width: 15 },
    ...Array.from({ length: maxMembers }, (_, i) => ({
      header: `担当${i + 1}`,
      key: `member${i}`,
      width: 12,
    })),
  ];
  ws.columns = columns;

  // ヘッダー行のスタイル
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, name: "游ゴシック" };
  headerRow.fill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FF3C3C50" },
  };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "游ゴシック" };

  // データ行
  for (const row of rows) {
    if (row.isBlank) {
      ws.addRow({});
      continue;
    }

    const data: Record<string, string> = {
      date: row.date + (row.weekday ? `(${row.weekday})` : ""),
      place: row.place,
    };
    row.members.forEach((m, i) => {
      data[`member${i}`] = m;
    });

    const excelRow = ws.addRow(data);
    excelRow.font = { name: "游ゴシック" };

    if (row.cancelled) {
      excelRow.font = { name: "游ゴシック", strike: true, color: { argb: "FFA0A0A0" } };
      excelRow.fill = {
        type: "pattern" as const,
        pattern: "solid" as const,
        fgColor: { argb: "FFF0F0F0" },
      };
    }
  }

  // 罫線を全セルに適用
  const thin = { style: "thin" as const, color: { argb: "FFD0D0D0" } };
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = { top: thin, bottom: thin, left: thin, right: thin };
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
