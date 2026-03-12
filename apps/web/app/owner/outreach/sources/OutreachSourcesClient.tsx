"use client";

import { useState, useCallback } from "react";
import { useOwnerTenantId } from "@/src/lib/useOwnerTenantId";
import {
  searchSources,
  fetchSourceRuns,
  fetchSourceRunDetail,
  importSourceCandidates,
} from "@/app/lib/outreachApi";
import type {
  OutreachSourceRun,
  OutreachSourceCandidate,
  SourceSearchResult,
  SourceImportResult,
} from "@/src/types/outreach";
import {
  SOURCE_TYPE_LABELS,
  CANDIDATE_STATUS_LABELS,
  CANDIDATE_STATUS_COLORS,
} from "@/src/types/outreach";

export default function OutreachSourcesClient() {
  const { tenantId, loading: tenantLoading } = useOwnerTenantId();

  // Search form
  const [sourceType, setSourceType] = useState("directory");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [niche, setNiche] = useState("");
  const [searching, setSearching] = useState(false);

  // Results
  const [searchResult, setSearchResult] = useState<SourceSearchResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<SourceImportResult | null>(null);

  // History
  const [runs, setRuns] = useState<OutreachSourceRun[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Selected historical run
  const [historyRun, setHistoryRun] = useState<OutreachSourceRun | null>(null);
  const [historyCandidates, setHistoryCandidates] = useState<OutreachSourceCandidate[]>([]);

  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!query.trim() && !location.trim() && !niche.trim()) {
      setError("検索条件を入力してください");
      return;
    }
    setSearching(true);
    setError("");
    setSearchResult(null);
    setImportResult(null);
    setSelectedIds(new Set());
    try {
      const result = await searchSources(tenantId, {
        source_type: sourceType,
        query: query.trim() || undefined,
        location: location.trim() || undefined,
        niche: niche.trim() || undefined,
      });
      setSearchResult(result);
      // Auto-select all "new" candidates
      const newIds = new Set(
        result.candidates
          .filter((c) => c.import_status === "new")
          .map((c) => c.id)
      );
      setSelectedIds(newIds);
    } catch (err: any) {
      setError(err.message || "検索に失敗しました");
    } finally {
      setSearching(false);
    }
  };

  const handleImport = async () => {
    if (!searchResult || selectedIds.size === 0) return;
    setImporting(true);
    setError("");
    try {
      const result = await importSourceCandidates(
        tenantId,
        searchResult.runId,
        Array.from(selectedIds)
      );
      setImportResult(result);
      setToast({
        type: "success",
        text: `${result.created}件のリードを作成しました`,
      });
      // Update candidate statuses locally
      if (searchResult) {
        setSearchResult({
          ...searchResult,
          candidates: searchResult.candidates.map((c) =>
            selectedIds.has(c.id) && c.import_status === "new"
              ? { ...c, import_status: "imported" as const }
              : c
          ),
        });
      }
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err.message || "インポートに失敗しました");
    } finally {
      setImporting(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await fetchSourceRuns(tenantId);
      setRuns(data);
      setShowHistory(true);
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "履歴の読み込みに失敗しました" });
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadRunDetail = async (runId: string) => {
    try {
      const data = await fetchSourceRunDetail(tenantId, runId);
      setHistoryRun(data.run);
      setHistoryCandidates(data.candidates);
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "詳細の読み込みに失敗しました" });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = useCallback(() => {
    if (!searchResult) return;
    const importable = searchResult.candidates.filter((c) => c.import_status === "new");
    if (selectedIds.size === importable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(importable.map((c) => c.id)));
    }
  }, [searchResult, selectedIds.size]);

  if (!tenantId || tenantLoading) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  const importableCount = searchResult
    ? searchResult.candidates.filter((c) => c.import_status === "new").length
    : 0;

  return (
    <>
      <div className="px-6 space-y-6">
        {toast && (
          <div className={`px-3 py-2 rounded text-sm ${toast.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {toast.text}
            <button onClick={() => setToast(null)} className="ml-2">&times;</button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm">
            {error}
            <button onClick={() => setError("")} className="ml-2">&times;</button>
          </div>
        )}

        {/* Search Form */}
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">検索条件</h2>
            <button
              onClick={loadHistory}
              disabled={historyLoading}
              className="text-xs text-blue-600 hover:underline"
            >
              {historyLoading ? "読み込み中..." : "検索履歴"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">ソースタイプ</label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="directory">ディレクトリ</option>
                <option value="map">マップ</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">キーワード</label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="例: 美容室"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">エリア</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="例: 表参道"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">業種</label>
              <input
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="例: 美容室"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {searching ? "検索中..." : "検索実行"}
          </button>
        </div>

        {/* Import Result Banner */}
        {importResult && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-2">
            <h2 className="font-semibold text-sm text-green-700">インポート完了</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-white rounded-lg p-3">
                <div className="text-xs text-gray-500">新規作成</div>
                <div className="text-xl font-semibold text-green-600">{importResult.created}</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-xs text-gray-500">スキップ</div>
                <div className="text-xl font-semibold text-gray-600">{importResult.skipped}</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-xs text-gray-500">無効</div>
                <div className="text-xl font-semibold text-red-600">{importResult.invalid}</div>
              </div>
            </div>
            {importResult.autoErrors.length > 0 && (
              <div className="text-xs text-yellow-600 mt-2">
                自動解析エラー: {importResult.autoErrors.length}件 (リード作成は成功)
              </div>
            )}
          </div>
        )}

        {/* Search Results / Candidate Preview */}
        {searchResult && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-4 text-xs text-gray-600 bg-gray-50 rounded-lg px-4 py-2">
              <span>全 <strong>{searchResult.summary.total}</strong> 件</span>
              <span className="text-green-600">新規: {searchResult.summary.new}</span>
              <span className="text-yellow-600">重複: {searchResult.summary.duplicate}</span>
              <span className="text-red-600">無効: {searchResult.summary.invalid}</span>
            </div>

            {/* Candidate Table */}
            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b">
                    <th className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={importableCount > 0 && selectedIds.size === importableCount}
                        onChange={toggleAll}
                        className="w-3.5 h-3.5"
                      />
                    </th>
                    <th className="py-2 px-3">状態</th>
                    <th className="py-2 px-3">店舗名</th>
                    <th className="py-2 px-3">カテゴリ</th>
                    <th className="py-2 px-3">エリア</th>
                    <th className="py-2 px-3">評価</th>
                    <th className="py-2 px-3">レビュー</th>
                    <th className="py-2 px-3">URL</th>
                    <th className="py-2 px-3">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResult.candidates.map((cand) => (
                    <tr key={cand.id} className="border-b last:border-0">
                      <td className="py-2 px-3">
                        {cand.import_status === "new" && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(cand.id)}
                            onChange={() => toggleSelect(cand.id)}
                            className="w-3.5 h-3.5"
                          />
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${CANDIDATE_STATUS_COLORS[cand.import_status]}`}>
                          {CANDIDATE_STATUS_LABELS[cand.import_status]}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-medium">{cand.store_name}</td>
                      <td className="py-2 px-3 text-gray-500">{cand.category ?? "-"}</td>
                      <td className="py-2 px-3 text-gray-500">{cand.area ?? "-"}</td>
                      <td className="py-2 px-3 text-gray-500">{cand.rating ?? "-"}</td>
                      <td className="py-2 px-3 text-gray-500">{cand.review_count ?? 0}</td>
                      <td className="py-2 px-3 text-gray-500 truncate max-w-[120px]">{cand.website_url ?? "-"}</td>
                      <td className="py-2 px-3">
                        {cand.dedup_reason && (
                          <span className="text-xs text-yellow-600">{cand.dedup_reason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Import Button */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {selectedIds.size}件 選択中
              </span>
              <button
                onClick={handleImport}
                disabled={importing || selectedIds.size === 0}
                className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {importing ? "インポート中..." : `${selectedIds.size}件をリードに取込`}
              </button>
            </div>
          </div>
        )}

        {/* Search History */}
        {showHistory && (
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">検索履歴</h2>
              <button onClick={() => { setShowHistory(false); setHistoryRun(null); }} className="text-xs text-gray-500 hover:underline">
                閉じる
              </button>
            </div>
            {runs.length === 0 ? (
              <p className="text-sm text-gray-400">検索履歴はありません</p>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <div
                    key={run.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer hover:bg-gray-50 ${historyRun?.id === run.id ? "border-blue-300 bg-blue-50" : ""}`}
                    onClick={() => loadRunDetail(run.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                        {SOURCE_TYPE_LABELS[run.source_type] ?? run.source_type}
                      </span>
                      <span className="text-sm">{run.query || run.niche || run.location || "-"}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>結果: {run.result_count}</span>
                      <span>取込: {run.imported_count}</span>
                      <span>{new Date(run.created_at).toLocaleDateString("ja-JP")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* History run detail */}
            {historyRun && historyCandidates.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <h3 className="text-xs font-medium text-gray-600 mb-2">
                  {historyRun.query || historyRun.niche || "-"} の候補 ({historyCandidates.length}件)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-1 px-2">状態</th>
                        <th className="py-1 px-2">店舗名</th>
                        <th className="py-1 px-2">エリア</th>
                        <th className="py-1 px-2">評価</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyCandidates.map((c) => (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="py-1 px-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${CANDIDATE_STATUS_COLORS[c.import_status]}`}>
                              {CANDIDATE_STATUS_LABELS[c.import_status]}
                            </span>
                          </td>
                          <td className="py-1 px-2">{c.store_name}</td>
                          <td className="py-1 px-2 text-gray-500">{c.area ?? "-"}</td>
                          <td className="py-1 px-2 text-gray-500">{c.rating ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
