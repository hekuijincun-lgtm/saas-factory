/**
 * PDF生成 — jsPDF + jspdf-autotable
 * 取り消し線は didDrawCell コールバックで自前描画
 * 日本語フォントはサブセット化済み TTF をランタイムロード
 */

import jsPDF from "jspdf";
import autoTable, { type CellDef } from "jspdf-autotable";
import type { Row, PdfOptions } from "./types";
import { isWeekend, isSaturday, isSunday } from "./dateUtils";

let fontLoaded = false;
let fontLoadPromise: Promise<void> | null = null;

/** サブセット済み Noto Sans JP を jsPDF に登録 */
async function ensureFont(doc: jsPDF): Promise<void> {
  if (fontLoaded) {
    doc.setFont("NotoSansJP");
    return;
  }
  if (!fontLoadPromise) {
    fontLoadPromise = (async () => {
      const res = await fetch("/fonts/NotoSansJP-Regular-subset.ttf");
      const buf = await res.arrayBuffer();
      // ArrayBuffer → base64
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      // jsPDF にフォント登録（normal + bold 両方を同じTTFで登録）
      doc.addFileToVFS("NotoSansJP-Regular.ttf", base64);
      doc.addFont("NotoSansJP-Regular.ttf", "NotoSansJP", "normal");
      doc.addFont("NotoSansJP-Regular.ttf", "NotoSansJP", "bold");
      fontLoaded = true;
    })();
  }
  await fontLoadPromise;
  doc.setFont("NotoSansJP");
}

// 土曜の背景色（薄い青）
const SAT_BG: [number, number, number] = [230, 240, 255];
// 日曜の背景色（薄い赤）
const SUN_BG: [number, number, number] = [255, 230, 230];
// 中止行の背景色（グレー）
const CANCELLED_BG: [number, number, number] = [240, 240, 240];
// 中止行のテキスト色
const CANCELLED_TEXT: [number, number, number] = [160, 160, 160];

/** 表データ → PDF Blob */
export async function renderPdf(
  rows: Row[],
  options: PdfOptions
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: options.orientation,
    unit: "mm",
    format: "a4",
  });

  await ensureFont(doc);
  doc.setFont("NotoSansJP");

  // タイトル
  if (options.title) {
    doc.setFontSize(16);
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.text(options.title, pageWidth / 2, 18, { align: "center" });
  }

  const startY = options.title ? 26 : 14;

  // 表示する行をフィルタ
  const displayRows = options.showCancelled
    ? rows.filter((r) => !r.isBlank)
    : rows.filter((r) => !r.isBlank && !r.cancelled);

  // 担当列の最大数を計算
  const maxMembers = Math.max(3, ...displayRows.map((r) => r.members.length));

  // ヘッダー
  const head = [
    ["日付", "場所", ...Array.from({ length: maxMembers }, (_, i) => `担当${i + 1}`)],
  ];

  // ボディ
  const body = displayRows.map((row) => {
    const dateCell = row.date + (row.weekday ? `(${row.weekday})` : "");
    const memberCells = Array.from({ length: maxMembers }, (_, i) => row.members[i] || "");
    return [dateCell, row.place, ...memberCells];
  });

  // 行ごとのメタ情報（中止・週末）を保持
  const rowMeta = displayRows.map((row) => ({
    cancelled: row.cancelled,
    weekend: isWeekend(row.weekday),
    saturday: isSaturday(row.weekday),
    sunday: isSunday(row.weekday),
  }));

  autoTable(doc, {
    head,
    body,
    startY,
    styles: {
      font: "NotoSansJP",
      fontSize: 10,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [60, 60, 80],
      textColor: [255, 255, 255],
      fontStyle: "bold" as const,
      font: "NotoSansJP",
    },
    // 行ごとのスタイル
    didParseCell(data) {
      if (data.section !== "body") return;
      const meta = rowMeta[data.row.index];
      if (!meta) return;

      if (meta.cancelled && options.cancelledStyle === "strikethrough") {
        data.cell.styles.textColor = CANCELLED_TEXT;
        data.cell.styles.fillColor = CANCELLED_BG;
      } else if (options.highlightWeekend && meta.saturday) {
        data.cell.styles.fillColor = SAT_BG;
      } else if (options.highlightWeekend && meta.sunday) {
        data.cell.styles.fillColor = SUN_BG;
      }
    },
    // 取り消し線の描画
    didDrawCell(data) {
      if (data.section !== "body") return;
      const meta = rowMeta[data.row.index];
      if (!meta?.cancelled || options.cancelledStyle !== "strikethrough") return;

      // セルの中央を横切る線を引く
      const { x, y, width, height } = data.cell;
      const lineY = y + height / 2;
      doc.setDrawColor(160, 160, 160);
      doc.setLineWidth(0.4);
      doc.line(x + 2, lineY, x + width - 2, lineY);
    },
  });

  return doc.output("blob");
}
