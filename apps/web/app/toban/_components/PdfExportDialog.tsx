"use client";

import { useState } from "react";
import { FileText, Download, Loader2, ImageIcon, Share2, MessageCircle } from "lucide-react";
import type { Row, PdfOptions } from "../_lib/types";
import { DEFAULT_PDF_OPTIONS } from "../_lib/types";

interface Props {
  rows: Row[];
  defaultTitle: string;
  onClose: () => void;
}

/** 当番表をテキスト形式に変換 */
function rowsToText(rows: Row[], title: string): string {
  const lines: string[] = [];
  if (title) lines.push(title, "");
  for (const r of rows) {
    if (r.isBlank || r.cancelled) continue;
    const members = r.members.filter((m) => m.trim()).join(" ");
    lines.push(`${r.date}(${r.weekday}) ${r.place} ${members}`);
  }
  return lines.join("\n");
}

export default function PdfExportDialog({ rows, defaultTitle, onClose }: Props) {
  const [options, setOptions] = useState<PdfOptions>({
    ...DEFAULT_PDF_OPTIONS,
    title: defaultTitle,
  });
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState("");
  const [showFallback, setShowFallback] = useState(false);

  const generatePdfBlob = async (): Promise<Blob> => {
    const { renderPdf } = await import("../_lib/pdfRenderer");
    return renderPdf(rows, options);
  };

  const handlePdfDownload = async () => {
    setLoading(true);
    setLoadingAction("PDF作成中...");
    try {
      const blob = await generatePdfBlob();
      downloadBlob(blob, `${options.title || "当番表"}.pdf`);
      onClose();
    } catch (err) {
      console.error("PDF生成エラー:", err);
      alert("PDFの作成に失敗しました。");
    } finally {
      setLoading(false);
      setLoadingAction("");
    }
  };

  const handlePngDownload = async () => {
    setLoading(true);
    setLoadingAction("画像を作成中...");
    try {
      const blob = await generatePngBlob(rows, options);
      downloadBlob(blob, `${options.title || "当番表"}.png`);
      onClose();
    } catch (err) {
      console.error("PNG生成エラー:", err);
      alert("画像の作成に失敗しました。");
    } finally {
      setLoading(false);
      setLoadingAction("");
    }
  };

  /** ファイル名を生成（日本語で分かりやすく） */
  const makeFileName = (ext: string) => {
    const title = options.title || "当番表";
    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月`;
    return `${title}_${dateStr}.${ext}`;
  };

  const handleShare = async () => {
    setLoading(true);
    setLoadingAction("PDFを作成しています...");
    try {
      const pdfBlob = await generatePdfBlob();
      const pdfFile = new File([pdfBlob], makeFileName("pdf"), { type: "application/pdf" });

      // Web Share API でPDFファイルを共有
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        setLoadingAction("共有シートを開いています...");
        await navigator.share({
          title: options.title || "当番表",
          files: [pdfFile],
        });
        onClose();
        return;
      }

      // ファイル共有非対応 → フォールバックUI表示
      setShowFallback(true);
      // PDFは自動ダウンロード
      downloadBlob(pdfBlob, makeFileName("pdf"));
    } catch (err: any) {
      if (err?.name === "AbortError") return; // ユーザーキャンセル
      console.error("共有エラー:", err);
      // エラー時もフォールバック表示
      setShowFallback(true);
    } finally {
      setLoading(false);
      setLoadingAction("");
    }
  };

  const handleLineText = () => {
    const text = rowsToText(rows, options.title);
    const lineUrl = `https://line.me/R/share?text=${encodeURIComponent(text)}`;
    window.open(lineUrl, "_blank");
  };

  const handlePngShare = async () => {
    setLoading(true);
    setLoadingAction("画像を作成しています...");
    try {
      const pngBlob = await generatePngBlob(rows, options);
      const pngFile = new File([pngBlob], makeFileName("png"), { type: "image/png" });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [pngFile] })) {
        await navigator.share({ title: options.title || "当番表", files: [pngFile] });
        onClose();
        return;
      }

      // ファイル共有非対応→ダウンロード
      downloadBlob(pngBlob, makeFileName("png"));
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("画像共有エラー:", err);
      const pngBlob = await generatePngBlob(rows, options);
      downloadBlob(pngBlob, makeFileName("png"));
    } finally {
      setLoading(false);
      setLoadingAction("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
      <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full sm:max-w-md sm:mx-4 p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2 text-lg font-semibold text-gray-800">
          <FileText size={20} />
          保存・共有
        </div>

        <div className="space-y-4">
          {/* タイトル */}
          <label className="block">
            <span className="text-sm font-medium text-gray-700">タイトル</span>
            <input
              type="text"
              value={options.title}
              onChange={(e) => setOptions({ ...options, title: e.target.value })}
              placeholder="2026年 練習試合 当番表"
              className="mt-1 w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>

          {/* 向き */}
          <label className="block">
            <span className="text-sm font-medium text-gray-700">用紙の向き</span>
            <select
              value={options.orientation}
              onChange={(e) =>
                setOptions({
                  ...options,
                  orientation: e.target.value as "portrait" | "landscape",
                })
              }
              className="mt-1 w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="portrait">縦（ポートレート）</option>
              <option value="landscape">横（ランドスケープ）</option>
            </select>
          </label>

          {/* 中止行 */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-700">中止行の扱い</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="cancelled"
                checked={options.showCancelled && options.cancelledStyle === "strikethrough"}
                onChange={() =>
                  setOptions({
                    ...options,
                    showCancelled: true,
                    cancelledStyle: "strikethrough",
                  })
                }
              />
              取り消し線+グレーで表示
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="cancelled"
                checked={!options.showCancelled || options.cancelledStyle === "exclude"}
                onChange={() =>
                  setOptions({
                    ...options,
                    showCancelled: false,
                    cancelledStyle: "exclude",
                  })
                }
              />
              中止行を除外する
            </label>
          </fieldset>

          {/* 土日色分け */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={options.highlightWeekend}
              onChange={(e) =>
                setOptions({ ...options, highlightWeekend: e.target.checked })
              }
            />
            <span className="text-gray-700">土日の行を色分けする</span>
          </label>
        </div>

        {/* 読み込み中 */}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Loader2 size={16} className="animate-spin" />
            {loadingAction}
          </div>
        )}

        {/* 注意書き */}
        <p className="text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded-lg">
          個人名が含まれます。送り先を確認してください。
        </p>

        {/* アクション */}
        {!showFallback ? (
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={handleShare}
              disabled={loading}
              className="w-full px-4 py-4 text-base font-medium text-white bg-green-500 rounded-xl hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Share2 size={20} />
              LINEで送る
            </button>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handlePdfDownload}
                disabled={loading}
                className="px-3 py-3 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex flex-col items-center justify-center gap-1"
              >
                <Download size={16} />
                <span>PDF</span>
              </button>
              <button
                onClick={handlePngDownload}
                disabled={loading}
                className="px-3 py-3 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex flex-col items-center justify-center gap-1"
              >
                <ImageIcon size={16} />
                <span>画像</span>
              </button>
              <button
                onClick={handlePngShare}
                disabled={loading}
                className="px-3 py-3 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex flex-col items-center justify-center gap-1"
              >
                <Share2 size={16} />
                <span>画像共有</span>
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700"
            >
              閉じる
            </button>
          </div>
        ) : (
          /* フォールバック: 共有シートが使えない環境 */
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-green-800">
                PDFをダウンロードしました
              </p>
              <div className="text-sm text-green-700 space-y-2">
                <p className="font-medium">LINEで送る手順：</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>LINEアプリで送りたいトークを開く</li>
                  <li>メッセージ入力欄の左の「＋」をタップ</li>
                  <li>「ファイル」を選んで、ダウンロードしたPDFを選択</li>
                </ol>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={handleLineText}
                className="w-full px-4 py-3 text-sm font-medium text-white bg-green-500 rounded-lg hover:bg-green-600 flex items-center justify-center gap-2"
              >
                <MessageCircle size={16} />
                文章でLINEに送る
              </button>
              <button
                onClick={handlePngShare}
                disabled={loading}
                className="w-full px-4 py-3 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <ImageIcon size={16} />
                画像で送る（LINEで見やすい）
              </button>
              <button
                onClick={() => { setShowFallback(false); }}
                className="w-full px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700"
              >
                戻る
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** PDF→Canvas→PNG変換 */
async function generatePngBlob(rows: Row[], options: PdfOptions): Promise<Blob> {
  const { renderPdf } = await import("../_lib/pdfRenderer");
  const pdfBlob = await renderPdf(rows, options);

  // pdf.jsを使わずにjsPDFの内部APIでページ画像を取得
  // 代わりにCanvasで表を直接描画する
  return renderTableAsPng(rows, options);
}

/** 表をCanvasに描画してPNGに変換 */
async function renderTableAsPng(rows: Row[], options: PdfOptions): Promise<Blob> {
  const displayRows = options.showCancelled
    ? rows.filter((r) => !r.isBlank)
    : rows.filter((r) => !r.isBlank && !r.cancelled);

  const maxMembers = Math.max(3, ...displayRows.map((r) => r.members.length));

  const fontSize = 14;
  const headerHeight = 36;
  const rowHeight = 32;
  const titleHeight = options.title ? 44 : 0;
  const padding = 16;
  const colWidths = [90, 100, ...Array(maxMembers).fill(90)]; // date, place, members
  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + padding * 2;
  const totalHeight = titleHeight + headerHeight + rowHeight * displayRows.length + padding * 2;

  const canvas = document.createElement("canvas");
  const dpr = 2; // retina
  canvas.width = totalWidth * dpr;
  canvas.height = totalHeight * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  // 背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  ctx.font = `${fontSize}px sans-serif`;
  ctx.textBaseline = "middle";

  let y = padding;

  // タイトル
  if (options.title) {
    ctx.font = `bold 18px sans-serif`;
    ctx.fillStyle = "#1f2937";
    ctx.textAlign = "center";
    ctx.fillText(options.title, totalWidth / 2, y + 22);
    ctx.textAlign = "left";
    ctx.font = `${fontSize}px sans-serif`;
    y += titleHeight;
  }

  // ヘッダー
  ctx.fillStyle = "#3c3c50";
  ctx.fillRect(padding, y, totalWidth - padding * 2, headerHeight);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${fontSize}px sans-serif`;
  let x = padding;
  const headers = ["日付", "場所", ...Array.from({ length: maxMembers }, (_, i) => `担当${i + 1}`)];
  headers.forEach((h, i) => {
    ctx.fillText(h, x + 8, y + headerHeight / 2);
    x += colWidths[i];
  });
  y += headerHeight;

  // 行
  ctx.font = `${fontSize}px sans-serif`;
  displayRows.forEach((row, ri) => {
    // 背景
    if (row.cancelled) {
      ctx.fillStyle = "#f0f0f0";
    } else if (row.weekday === "土" && options.highlightWeekend) {
      ctx.fillStyle = "#e6f0ff";
    } else if (row.weekday === "日" && options.highlightWeekend) {
      ctx.fillStyle = "#ffe6e6";
    } else {
      ctx.fillStyle = ri % 2 === 0 ? "#ffffff" : "#f9fafb";
    }
    ctx.fillRect(padding, y, totalWidth - padding * 2, rowHeight);

    // 罫線
    ctx.strokeStyle = "#e5e7eb";
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(totalWidth - padding, y);
    ctx.stroke();

    ctx.fillStyle = row.cancelled ? "#a0a0a0" : "#1f2937";
    x = padding;
    const dateText = row.date + (row.weekday ? `(${row.weekday})` : "");
    const cells = [dateText, row.place, ...Array.from({ length: maxMembers }, (_, i) => row.members[i] || "")];
    cells.forEach((cell, ci) => {
      ctx.fillText(cell, x + 8, y + rowHeight / 2);
      x += colWidths[ci];
    });

    // 取り消し線
    if (row.cancelled && options.cancelledStyle === "strikethrough") {
      ctx.strokeStyle = "#a0a0a0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding + 4, y + rowHeight / 2);
      ctx.lineTo(totalWidth - padding - 4, y + rowHeight / 2);
      ctx.stroke();
    }

    y += rowHeight;
  });

  // 下罫線
  ctx.strokeStyle = "#e5e7eb";
  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(totalWidth - padding, y);
  ctx.stroke();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG生成に失敗しました"));
    }, "image/png");
  });
}
