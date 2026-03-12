"use client";

import { useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { importPreview, importExecute } from "@/app/lib/outreachApi";
import type { ImportPreviewRow, ImportPreviewSummary, ImportResult } from "@/src/types/outreach";

const STATUS_COLORS: Record<string, string> = {
  valid: "bg-green-50 text-green-700",
  invalid: "bg-red-50 text-red-700",
  duplicate: "bg-yellow-50 text-yellow-700",
  merge: "bg-blue-50 text-blue-700",
};

const STATUS_LABELS: Record<string, string> = {
  valid: "新規",
  invalid: "無効",
  duplicate: "重複",
  merge: "マージ",
};

export default function OutreachImportClient() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId") ?? "";
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<ImportPreviewRow[] | null>(null);
  const [summary, setSummary] = useState<ImportPreviewSummary | null>(null);
  const [actions, setActions] = useState<Record<number, "create" | "merge" | "skip">>({});
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string ?? "");
      setPreview(null);
      setResult(null);
    };
    reader.readAsText(file);
  };

  const handlePreview = async () => {
    if (!csvText.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await importPreview(tenantId, csvText);
      setPreview(data.rows);
      setSummary(data.summary);
      // Set default actions: valid=create, duplicate=skip, invalid=skip
      const defaultActions: Record<number, "create" | "merge" | "skip"> = {};
      for (const row of data.rows) {
        if (row.status === "valid") defaultActions[row.rowIndex] = "create";
        else if (row.status === "duplicate") defaultActions[row.rowIndex] = "skip";
        else defaultActions[row.rowIndex] = "skip";
      }
      setActions(defaultActions);
    } catch (err: any) {
      setError(err.message || "プレビューに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setError("");
    try {
      const data = await importExecute(tenantId, csvText, actions);
      setResult(data);
      setPreview(null);
    } catch (err: any) {
      setError(err.message || "インポートに失敗しました");
    } finally {
      setImporting(false);
    }
  };

  if (!tenantId) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  return (
    <>
      <div className="px-6 space-y-6">
        {error && (
          <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm">
            {error}
            <button onClick={() => setError("")} className="ml-2">&times;</button>
          </div>
        )}

        {/* Upload section */}
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold text-sm">CSVファイルを選択</h2>
          <p className="text-xs text-gray-500">
            必須列: store_name / 任意: category, area, website_url, email, phone, rating, review_count
          </p>
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="text-sm"
            />
            <button
              onClick={handlePreview}
              disabled={!csvText.trim() || loading}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "解析中..." : "プレビュー"}
            </button>
          </div>
          {csvText && !preview && (
            <div className="text-xs text-gray-400">
              {csvText.split("\n").length - 1} 行読み込み済み
            </div>
          )}
        </div>

        {/* Import Result */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-2">
            <h2 className="font-semibold text-sm text-green-700">インポート完了</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-white rounded-lg p-3">
                <div className="text-xs text-gray-500">新規作成</div>
                <div className="text-xl font-semibold text-green-600">{result.created}</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-xs text-gray-500">マージ</div>
                <div className="text-xl font-semibold text-blue-600">{result.merged}</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-xs text-gray-500">スキップ</div>
                <div className="text-xl font-semibold text-gray-600">{result.skipped}</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-xs text-gray-500">無効</div>
                <div className="text-xl font-semibold text-red-600">{result.invalid}</div>
              </div>
            </div>
            <div className="text-xs text-gray-400">バッチID: {result.batchId}</div>
          </div>
        )}

        {/* Preview table */}
        {preview && summary && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center gap-4 text-xs text-gray-600 bg-gray-50 rounded-lg px-4 py-2">
              <span>全 <strong>{summary.total}</strong> 件</span>
              <span className="text-green-600">新規: {summary.valid}</span>
              <span className="text-yellow-600">重複: {summary.duplicate}</span>
              <span className="text-red-600">無効: {summary.invalid}</span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b">
                    <th className="py-2 px-3">行</th>
                    <th className="py-2 px-3">状態</th>
                    <th className="py-2 px-3">アクション</th>
                    <th className="py-2 px-3">店舗名</th>
                    <th className="py-2 px-3">カテゴリ</th>
                    <th className="py-2 px-3">エリア</th>
                    <th className="py-2 px-3">URL</th>
                    <th className="py-2 px-3">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.rowIndex} className="border-b last:border-0">
                      <td className="py-2 px-3 text-gray-400">{row.rowIndex}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[row.status]}`}>
                          {STATUS_LABELS[row.status]}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {row.status !== "invalid" && (
                          <select
                            value={actions[row.rowIndex] ?? "skip"}
                            onChange={(e) => setActions((prev) => ({
                              ...prev,
                              [row.rowIndex]: e.target.value as any,
                            }))}
                            className="text-xs border rounded px-2 py-1"
                          >
                            <option value="create">新規作成</option>
                            {row.status === "duplicate" && <option value="merge">マージ</option>}
                            <option value="skip">スキップ</option>
                          </select>
                        )}
                        {row.status === "invalid" && (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-medium">{row.store_name}</td>
                      <td className="py-2 px-3 text-gray-500">{row.category ?? "-"}</td>
                      <td className="py-2 px-3 text-gray-500">{row.area ?? "-"}</td>
                      <td className="py-2 px-3 text-gray-500 truncate max-w-[120px]">{row.website_url ?? "-"}</td>
                      <td className="py-2 px-3">
                        {row.errors.length > 0 && (
                          <span className="text-xs text-red-500">{row.errors.join(", ")}</span>
                        )}
                        {row.duplicateStoreName && (
                          <span className="text-xs text-yellow-600">既存: {row.duplicateStoreName}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Import button */}
            <div className="flex justify-end">
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {importing ? "インポート中..." : "インポート実行"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
