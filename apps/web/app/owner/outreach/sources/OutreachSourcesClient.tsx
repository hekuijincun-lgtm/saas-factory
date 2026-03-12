"use client";

import { useState, useCallback } from "react";
import { useOwnerTenantId } from "@/src/lib/useOwnerTenantId";
import {
  searchSources,
  fetchSourceRuns,
  fetchSourceRunDetail,
  importSourceCandidates,
  acceptSourceCandidate,
  rejectSourceCandidate,
  batchAcceptCandidates,
  batchRejectCandidates,
  batchResetCandidates,
  importAcceptedCandidates,
} from "@/app/lib/outreachApi";
import type {
  OutreachSourceRun,
  OutreachSourceCandidate,
  SourceSearchResult,
  SourceImportResult,
  AcceptedImportResult,
  AcceptanceStatus,
} from "@/src/types/outreach";
import {
  SOURCE_TYPE_LABELS,
  CANDIDATE_STATUS_LABELS,
  CANDIDATE_STATUS_COLORS,
  ACCEPTANCE_STATUS_LABELS,
  ACCEPTANCE_STATUS_COLORS,
  qualityLabel,
} from "@/src/types/outreach";

type AcceptanceFilter = "all" | AcceptanceStatus;

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
  const [acceptedImportResult, setAcceptedImportResult] = useState<AcceptedImportResult | null>(null);

  // Acceptance filter
  const [acceptanceFilter, setAcceptanceFilter] = useState<AcceptanceFilter>("all");

  // History
  const [runs, setRuns] = useState<OutreachSourceRun[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Selected historical run
  const [historyRun, setHistoryRun] = useState<OutreachSourceRun | null>(null);
  const [historyCandidates, setHistoryCandidates] = useState<OutreachSourceCandidate[]>([]);

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Batch actions
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchRejectReason, setBatchRejectReason] = useState("");
  const [showBatchReject, setShowBatchReject] = useState(false);

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
    setAcceptedImportResult(null);
    setSelectedIds(new Set());
    try {
      const result = await searchSources(tenantId, {
        source_type: sourceType,
        query: query.trim() || undefined,
        location: location.trim() || undefined,
        niche: niche.trim() || undefined,
      });
      setSearchResult(result);
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
      setToast({ type: "success", text: `${result.created}件のリードを作成しました` });
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

  const handleImportAccepted = async () => {
    const runId = searchResult?.runId ?? historyRun?.id;
    if (!runId) return;
    setImporting(true);
    setError("");
    try {
      const result = await importAcceptedCandidates(tenantId, runId);
      setAcceptedImportResult(result);
      setToast({ type: "success", text: `承認済み ${result.created}件をインポートしました` });
      // Update local candidates
      const updateImported = (c: OutreachSourceCandidate) =>
        c.acceptance_status === "accepted" && c.import_status === "new"
          ? { ...c, import_status: "imported" as const }
          : c;
      if (searchResult) {
        setSearchResult({ ...searchResult, candidates: searchResult.candidates.map(updateImported) });
      }
      setHistoryCandidates((prev) => prev.map(updateImported));
    } catch (err: any) {
      setError(err.message || "インポートに失敗しました");
    } finally {
      setImporting(false);
    }
  };

  const handleAccept = async (candidateId: string) => {
    try {
      await acceptSourceCandidate(tenantId, candidateId);
      updateCandidateLocally(candidateId, { acceptance_status: "accepted" as const });
      setToast({ type: "success", text: "承認しました" });
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "承認に失敗しました" });
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      await rejectSourceCandidate(tenantId, rejectTarget, rejectReason || undefined);
      updateCandidateLocally(rejectTarget, {
        acceptance_status: "rejected" as const,
        rejection_reason: rejectReason || null,
      });
      setToast({ type: "success", text: "却下しました" });
      setRejectTarget(null);
      setRejectReason("");
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "却下に失敗しました" });
    }
  };

  // Batch actions
  const handleBatchAccept = async () => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      const result = await batchAcceptCandidates(tenantId, Array.from(selectedIds));
      for (const id of selectedIds) {
        updateCandidateLocally(id, { acceptance_status: "accepted" as const });
      }
      setToast({ type: "success", text: `${result.updated}件を承認しました` });
      setSelectedIds(new Set());
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "一括承認に失敗しました" });
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchReject = async () => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      const result = await batchRejectCandidates(tenantId, Array.from(selectedIds), batchRejectReason || undefined);
      for (const id of selectedIds) {
        updateCandidateLocally(id, { acceptance_status: "rejected" as const, rejection_reason: batchRejectReason || null });
      }
      setToast({ type: "success", text: `${result.updated}件を却下しました` });
      setSelectedIds(new Set());
      setShowBatchReject(false);
      setBatchRejectReason("");
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "一括却下に失敗しました" });
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchReset = async () => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      const result = await batchResetCandidates(tenantId, Array.from(selectedIds));
      for (const id of selectedIds) {
        updateCandidateLocally(id, { acceptance_status: "pending" as const, rejection_reason: null });
      }
      setToast({ type: "success", text: `${result.updated}件を保留に戻しました` });
      setSelectedIds(new Set());
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "リセットに失敗しました" });
    } finally {
      setBatchLoading(false);
    }
  };

  const updateCandidateLocally = (id: string, updates: Partial<OutreachSourceCandidate>) => {
    if (searchResult) {
      setSearchResult({
        ...searchResult,
        candidates: searchResult.candidates.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      });
    }
    setHistoryCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
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
    const visible = getFilteredCandidates(searchResult.candidates);
    if (selectedIds.size === visible.length && visible.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visible.map((c) => c.id)));
    }
  }, [searchResult, selectedIds.size, acceptanceFilter]);

  const getFilteredCandidates = (candidates: OutreachSourceCandidate[]) => {
    if (acceptanceFilter === "all") return candidates;
    return candidates.filter((c) => (c.acceptance_status ?? "pending") === acceptanceFilter);
  };

  if (!tenantId || tenantLoading) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  const filteredCandidates = searchResult ? getFilteredCandidates(searchResult.candidates) : [];
  const acceptedNewCount = searchResult
    ? searchResult.candidates.filter((c) => c.acceptance_status === "accepted" && c.import_status === "new").length
    : 0;

  // Acceptance summary counts
  const acceptanceSummary = searchResult ? {
    all: searchResult.candidates.length,
    pending: searchResult.candidates.filter((c) => (c.acceptance_status ?? "pending") === "pending").length,
    accepted: searchResult.candidates.filter((c) => c.acceptance_status === "accepted").length,
    rejected: searchResult.candidates.filter((c) => c.acceptance_status === "rejected").length,
  } : null;

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

        {/* Import Result Banners */}
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
          </div>
        )}

        {acceptedImportResult && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-2">
            <h2 className="font-semibold text-sm text-green-700">承認済みインポート完了</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-white rounded-lg p-3">
                <div className="text-xs text-gray-500">承認済み対象</div>
                <div className="text-xl font-semibold text-blue-600">{acceptedImportResult.accepted}</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-xs text-gray-500">新規作成</div>
                <div className="text-xl font-semibold text-green-600">{acceptedImportResult.created}</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-xs text-gray-500">スキップ</div>
                <div className="text-xl font-semibold text-gray-600">{acceptedImportResult.skipped}</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-xs text-gray-500">無効</div>
                <div className="text-xl font-semibold text-red-600">{acceptedImportResult.invalid}</div>
              </div>
            </div>
          </div>
        )}

        {/* Search Results */}
        {searchResult && (
          <div className="space-y-4">
            {/* Summary + Acceptance Filter */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <span>全 <strong>{searchResult.summary.total}</strong> 件</span>
                <span className="text-green-600">新規: {searchResult.summary.new}</span>
                <span className="text-yellow-600">重複: {searchResult.summary.duplicate}</span>
              </div>
              <div className="flex gap-1 ml-auto">
                {(["all", "pending", "accepted", "rejected"] as AcceptanceFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setAcceptanceFilter(f)}
                    className={`px-2.5 py-1 text-[10px] rounded-full border ${
                      acceptanceFilter === f ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-white text-gray-500 border-gray-200"
                    }`}
                  >
                    {f === "all" ? "全て" : ACCEPTANCE_STATUS_LABELS[f]}
                    {acceptanceSummary && (
                      <span className="ml-1 opacity-60">
                        ({acceptanceSummary[f === "all" ? "all" : f]})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Batch Actions Bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-4 py-2">
                <span className="text-xs text-blue-700 font-medium">{selectedIds.size}件選択中</span>
                <div className="flex gap-1 ml-auto">
                  <button
                    onClick={handleBatchAccept}
                    disabled={batchLoading}
                    className="text-[10px] px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    一括承認
                  </button>
                  <button
                    onClick={() => setShowBatchReject(true)}
                    disabled={batchLoading}
                    className="text-[10px] px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    一括却下
                  </button>
                  <button
                    onClick={handleBatchReset}
                    disabled={batchLoading}
                    className="text-[10px] px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                  >
                    保留に戻す
                  </button>
                </div>
              </div>
            )}

            {/* Candidate Table */}
            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b">
                    <th className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={filteredCandidates.length > 0 && selectedIds.size === filteredCandidates.length}
                        onChange={toggleAll}
                        className="w-3.5 h-3.5"
                      />
                    </th>
                    <th className="py-2 px-3">状態</th>
                    <th className="py-2 px-3">品質</th>
                    <th className="py-2 px-3">店舗名</th>
                    <th className="py-2 px-3">カテゴリ</th>
                    <th className="py-2 px-3">エリア</th>
                    <th className="py-2 px-3">評価</th>
                    <th className="py-2 px-3">URL</th>
                    <th className="py-2 px-3">承認</th>
                    <th className="py-2 px-3">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map((cand) => {
                    const ql = qualityLabel(cand.quality_score);
                    const accStatus = cand.acceptance_status ?? "pending";
                    return (
                      <tr key={cand.id} className="border-b last:border-0">
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(cand.id)}
                            onChange={() => toggleSelect(cand.id)}
                            className="w-3.5 h-3.5"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${CANDIDATE_STATUS_COLORS[cand.import_status]}`}>
                            {CANDIDATE_STATUS_LABELS[cand.import_status]}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`text-xs font-medium ${ql.color}`}>
                            {ql.text}
                          </span>
                          {cand.quality_score != null && (
                            <span className="text-[10px] text-gray-400 ml-1">
                              {cand.quality_score.toFixed(1)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-medium">{cand.store_name}</td>
                        <td className="py-2 px-3 text-gray-500">{cand.category ?? "-"}</td>
                        <td className="py-2 px-3 text-gray-500">{cand.area ?? "-"}</td>
                        <td className="py-2 px-3 text-gray-500">{cand.rating ?? "-"}</td>
                        <td className="py-2 px-3 text-gray-500 truncate max-w-[120px]">{cand.website_url ?? "-"}</td>
                        <td className="py-2 px-3">
                          {accStatus === "pending" ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleAccept(cand.id)}
                                className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => { setRejectTarget(cand.id); setRejectReason(""); }}
                                className="text-[10px] px-2 py-0.5 bg-red-100 text-red-600 rounded hover:bg-red-200"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] ${ACCEPTANCE_STATUS_COLORS[accStatus]}`}>
                              {ACCEPTANCE_STATUS_LABELS[accStatus]}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {cand.dedup_reason && (
                            <span className="text-xs text-yellow-600">{cand.dedup_reason}</span>
                          )}
                          {cand.rejection_reason && (
                            <span className="text-xs text-red-500">{cand.rejection_reason}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Import Buttons */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs text-gray-500">
                {selectedIds.size}件 選択中
                {acceptedNewCount > 0 && (
                  <span className="ml-2 text-green-600">
                    (承認済み未取込: {acceptedNewCount}件)
                  </span>
                )}
              </span>
              <div className="flex gap-2">
                {acceptedNewCount > 0 && (
                  <button
                    onClick={handleImportAccepted}
                    disabled={importing}
                    className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {importing ? "インポート中..." : `承認済み ${acceptedNewCount}件をインポート`}
                  </button>
                )}
                <button
                  onClick={handleImport}
                  disabled={importing || selectedIds.size === 0}
                  className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {importing ? "インポート中..." : `選択 ${selectedIds.size}件を取込`}
                </button>
              </div>
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
              <div className="mt-4 border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium text-gray-600">
                    {historyRun.query || historyRun.niche || "-"} の候補 ({historyCandidates.length}件)
                  </h3>
                  {historyCandidates.some((c) => c.acceptance_status === "accepted" && c.import_status === "new") && (
                    <button
                      onClick={handleImportAccepted}
                      disabled={importing}
                      className="text-[11px] px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                    >
                      承認済みをインポート
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-1 px-2">状態</th>
                        <th className="py-1 px-2">品質</th>
                        <th className="py-1 px-2">店舗名</th>
                        <th className="py-1 px-2">エリア</th>
                        <th className="py-1 px-2">評価</th>
                        <th className="py-1 px-2">承認</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyCandidates.map((c) => {
                        const ql = qualityLabel(c.quality_score);
                        const accStatus = c.acceptance_status ?? "pending";
                        return (
                          <tr key={c.id} className="border-b last:border-0">
                            <td className="py-1 px-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${CANDIDATE_STATUS_COLORS[c.import_status]}`}>
                                {CANDIDATE_STATUS_LABELS[c.import_status]}
                              </span>
                            </td>
                            <td className="py-1 px-2">
                              <span className={`font-medium ${ql.color}`}>{ql.text}</span>
                            </td>
                            <td className="py-1 px-2">{c.store_name}</td>
                            <td className="py-1 px-2 text-gray-500">{c.area ?? "-"}</td>
                            <td className="py-1 px-2 text-gray-500">{c.rating ?? "-"}</td>
                            <td className="py-1 px-2">
                              {accStatus === "pending" ? (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleAccept(c.id)}
                                    className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    onClick={() => { setRejectTarget(c.id); setRejectReason(""); }}
                                    className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded hover:bg-red-200"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${ACCEPTANCE_STATUS_COLORS[accStatus]}`}>
                                  {ACCEPTANCE_STATUS_LABELS[accStatus]}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reject Reason Modal (single) */}
        {rejectTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl p-5 max-w-sm w-full shadow-xl space-y-3">
              <h3 className="text-sm font-semibold">却下理由</h3>
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="理由 (任意)"
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setRejectTarget(null)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleReject}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  却下
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Batch Reject Modal */}
        {showBatchReject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl p-5 max-w-sm w-full shadow-xl space-y-3">
              <h3 className="text-sm font-semibold">一括却下 ({selectedIds.size}件)</h3>
              <input
                value={batchRejectReason}
                onChange={(e) => setBatchRejectReason(e.target.value)}
                placeholder="却下理由 (任意)"
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowBatchReject(false); setBatchRejectReason(""); }}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleBatchReject}
                  disabled={batchLoading}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {batchLoading ? "処理中..." : "一括却下"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
