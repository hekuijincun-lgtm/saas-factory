"use client";

import { useState } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import type { Row, PdfOptions } from "../_lib/types";
import { DEFAULT_PDF_OPTIONS } from "../_lib/types";

interface Props {
  rows: Row[];
  defaultTitle: string;
  onClose: () => void;
}

export default function PdfExportDialog({ rows, defaultTitle, onClose }: Props) {
  const [options, setOptions] = useState<PdfOptions>({
    ...DEFAULT_PDF_OPTIONS,
    title: defaultTitle,
  });
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      // 動的 import でバンドル分割
      const { renderPdf } = await import("../_lib/pdfRenderer");
      const blob = await renderPdf(rows, options);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${options.title || "当番表"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      console.error("PDF生成エラー:", err);
      alert("PDF生成に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
        <div className="flex items-center gap-2 text-lg font-semibold text-gray-800">
          <FileText size={20} />
          PDF出力設定
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
              className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
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
              className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
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
            <span className="text-xs text-gray-400">
              （<span className="text-blue-500">土=青</span>
              ・<span className="text-red-400">日=赤</span>）
            </span>
          </label>
        </div>

        {/* アクション */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            キャンセル
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            PDF出力
          </button>
        </div>
      </div>
    </div>
  );
}
