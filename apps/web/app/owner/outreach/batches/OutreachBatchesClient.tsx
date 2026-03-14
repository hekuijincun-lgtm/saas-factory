"use client";

import { useState, useEffect, useCallback } from "react";
import { useOwnerTenantId } from "@/src/lib/useOwnerTenantId";
import {
  createBatchJob,
  fetchBatchJobs,
  fetchBatchJobDetail,
  runBatchJob,
  cancelBatchJob,
} from "@/app/lib/outreachApi";
import type {
  OutreachBatchJob,
  OutreachBatchJobItem,
  BatchJobMode,
  BatchJobResult,
} from "@/src/types/outreach";
import {
  BATCH_STATUS_LABELS,
  BATCH_STATUS_COLORS,
  BATCH_MODE_LABELS,
} from "@/src/types/outreach";

export default function OutreachBatchesClient() {
  const { tenantId, loading: tenantLoading } = useOwnerTenantId();
  const [jobs, setJobs] = useState<OutreachBatchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [niche, setNiche] = useState("");
  const [areasText, setAreasText] = useState("");
  const [randomize, setRandomize] = useState(true);
  const [targetCount, setTargetCount] = useState("20");
  const [maxPerArea, setMaxPerArea] = useState("8");
  const [qualityThreshold, setQualityThreshold] = useState("0.4");
  const [mode, setMode] = useState<BatchJobMode>("review_only");
  const [creating, setCreating] = useState(false);

  // Detail / running
  const [selectedJob, setSelectedJob] = useState<OutreachBatchJob | null>(null);
  const [selectedItems, setSelectedItems] = useState<OutreachBatchJobItem[]>([]);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<BatchJobResult | null>(null);

  const loadJobs = useCallback(async () => {
    if (!tenantId) return;
    try {
      const data = await fetchBatchJobs(tenantId);
      setJobs(data);
    } catch {
      setToast({ type: "error", text: "バッチ一覧の取得に失敗しました" });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantLoading && tenantId) loadJobs();
  }, [tenantLoading, tenantId, loadJobs]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleCreate = async () => {
    if (!tenantId || !niche.trim() || !areasText.trim()) return;
    const areas = areasText
      .split(/[,\n]/)
      .map((a) => a.trim())
      .filter(Boolean);
    if (!areas.length) return;

    setCreating(true);
    try {
      const job = await createBatchJob(tenantId, {
        niche: niche.trim(),
        areas,
        randomize_areas: randomize,
        target_count: parseInt(targetCount, 10) || 20,
        max_per_area: parseInt(maxPerArea, 10) || 8,
        quality_threshold: parseFloat(qualityThreshold) || 0.4,
        mode,
      });
      setToast({ type: "success", text: "バッチジョブを作成しました" });
      setShowCreate(false);
      setNiche("");
      setAreasText("");
      await loadJobs();

      // Auto-select the new job
      setSelectedJob(job);
      setSelectedItems([]);
      setRunResult(null);
    } catch (err: any) {
      setToast({ type: "error", text: err.message ?? "作成に失敗しました" });
    } finally {
      setCreating(false);
    }
  };

  const handleRun = async (jobId: string) => {
    if (!tenantId) return;
    setRunning(true);
    setRunResult(null);
    try {
      const result = await runBatchJob(tenantId, jobId);
      setRunResult(result);
      setSelectedJob(result.job);
      setSelectedItems(result.items);
      setToast({ type: "success", text: `バッチ完了: ${result.summary.imported}件インポート, ${result.summary.drafted}件ドラフト作成` });
      await loadJobs();
    } catch (err: any) {
      setToast({ type: "error", text: err.message ?? "実行に失敗しました" });
      await loadJobs();
    } finally {
      setRunning(false);
    }
  };

  const handleViewDetail = async (jobId: string) => {
    if (!tenantId) return;
    try {
      const { job, items } = await fetchBatchJobDetail(tenantId, jobId);
      setSelectedJob(job);
      setSelectedItems(items);
      setRunResult(null);
    } catch {
      setToast({ type: "error", text: "詳細の取得に失敗しました" });
    }
  };

  const handleCancel = async (jobId: string) => {
    if (!tenantId) return;
    try {
      await cancelBatchJob(tenantId, jobId);
      setToast({ type: "success", text: "キャンセルしました" });
      await loadJobs();
      if (selectedJob?.id === jobId) setSelectedJob(null);
    } catch (err: any) {
      setToast({ type: "error", text: err.message ?? "キャンセルに失敗しました" });
    }
  };

  if (tenantLoading || loading) {
    return <div className="p-6 text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">自動営業バッチ</h1>
          <p className="text-sm text-gray-500 mt-1">
            ワンボタンで営業候補の検索・インポート・ドラフト作成を自動実行
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
        >
          + 新規バッチ作成
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">自動営業バッチ作成</h2>

            <div className="space-y-4">
              {/* Niche */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ニッチ / 業種</label>
                <input
                  type="text"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="例: 眉毛サロン"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>

              {/* Areas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  エリア（カンマ区切り or 改行）
                </label>
                <textarea
                  value={areasText}
                  onChange={(e) => setAreasText(e.target.value)}
                  placeholder={"渋谷\n新宿\n池袋\n大宮\n横浜"}
                  rows={4}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>

              {/* Settings row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">目標件数</label>
                  <input
                    type="number"
                    value={targetCount}
                    onChange={(e) => setTargetCount(e.target.value)}
                    min={1}
                    max={100}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">エリアあたり上限</label>
                  <input
                    type="number"
                    value={maxPerArea}
                    onChange={(e) => setMaxPerArea(e.target.value)}
                    min={1}
                    max={30}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">品質閾値 (0-1)</label>
                  <input
                    type="number"
                    value={qualityThreshold}
                    onChange={(e) => setQualityThreshold(e.target.value)}
                    min={0}
                    max={1}
                    step={0.1}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">モード</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as BatchJobMode)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="review_only">レビューのみ（安全）</option>
                    <option value="approved_send">承認済み送信</option>
                  </select>
                </div>
              </div>

              {/* Randomize toggle */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={randomize}
                  onChange={(e) => setRandomize(e.target.checked)}
                  className="rounded"
                />
                エリアをランダム順で検索
              </label>

              {mode === "approved_send" && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
                  承認済み送信モードでは、既にレビューで承認済みのアイテムのみが送信対象となります。
                  新規生成されたドラフトは自動送信されません。
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-gray-600 text-sm hover:bg-gray-100 rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !niche.trim() || !areasText.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
              >
                {creating ? "作成中..." : "作成"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job list */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-gray-700">バッチジョブ一覧</h2>
        </div>
        {jobs.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            バッチジョブはまだありません
          </div>
        ) : (
          <div className="divide-y">
            {jobs.map((job) => {
              const areas: string[] = (() => { try { return JSON.parse(job.areas_json); } catch { return []; } })();
              return (
                <div
                  key={job.id}
                  className={`px-4 py-3 flex items-center gap-4 hover:bg-gray-50 cursor-pointer ${
                    selectedJob?.id === job.id ? "bg-indigo-50" : ""
                  }`}
                  onClick={() => handleViewDetail(job.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900 truncate">
                        {job.niche}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${BATCH_STATUS_COLORS[job.status]}`}>
                        {BATCH_STATUS_LABELS[job.status]}
                      </span>
                      <span className="text-xs text-gray-400">
                        {BATCH_MODE_LABELS[job.mode]}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {areas.slice(0, 5).join(", ")}
                      {areas.length > 5 && ` +${areas.length - 5}`}
                      {" | "}
                      目標: {job.target_count}件
                      {job.status === "completed" && (
                        <>
                          {" | "}
                          インポート: {job.imported_count} / ドラフト: {job.draft_count}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(job.created_at).toLocaleDateString("ja-JP")}
                  </div>
                  <div className="flex gap-1">
                    {job.status === "pending" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRun(job.id); }}
                        disabled={running}
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                      >
                        {running && selectedJob?.id === job.id ? "実行中..." : "実行"}
                      </button>
                    )}
                    {(job.status === "pending" || job.status === "running") && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCancel(job.id); }}
                        className="px-3 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300"
                      >
                        取消
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail view */}
      {selectedJob && (
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              バッチ詳細: {selectedJob.niche}
            </h2>
            <button
              onClick={() => { setSelectedJob(null); setSelectedItems([]); setRunResult(null); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              閉じる
            </button>
          </div>
          <div className="p-4 space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard label="検索数" value={selectedJob.created_count} />
              <SummaryCard label="インポート" value={selectedJob.imported_count} />
              <SummaryCard label="ドラフト" value={selectedJob.draft_count} />
              <SummaryCard label="エラー" value={selectedJob.error_count} color={selectedJob.error_count > 0 ? "text-red-600" : undefined} />
            </div>

            {/* Config */}
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 grid grid-cols-2 gap-2">
              <div>モード: <span className="font-medium">{BATCH_MODE_LABELS[selectedJob.mode]}</span></div>
              <div>品質閾値: <span className="font-medium">{selectedJob.quality_threshold}</span></div>
              <div>目標件数: <span className="font-medium">{selectedJob.target_count}</span></div>
              <div>エリア上限: <span className="font-medium">{selectedJob.max_per_area}</span></div>
              <div>ランダム: <span className="font-medium">{selectedJob.randomize_areas ? "ON" : "OFF"}</span></div>
              <div>ステータス: <span className={`font-medium px-1 rounded ${BATCH_STATUS_COLORS[selectedJob.status]}`}>{BATCH_STATUS_LABELS[selectedJob.status]}</span></div>
            </div>

            {/* Error message */}
            {selectedJob.error_message && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                {selectedJob.error_message}
              </div>
            )}

            {/* Run result summary */}
            {runResult && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <h3 className="text-sm font-semibold text-green-800 mb-2">実行結果</h3>
                <div className="grid grid-cols-5 gap-2 text-xs">
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-700">{runResult.summary.searched}</div>
                    <div className="text-green-600">検索</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-700">{runResult.summary.accepted}</div>
                    <div className="text-green-600">承認</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-700">{runResult.summary.imported}</div>
                    <div className="text-green-600">インポート</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-700">{runResult.summary.drafted}</div>
                    <div className="text-green-600">ドラフト</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-lg font-bold ${runResult.summary.errors > 0 ? "text-red-600" : "text-green-700"}`}>{runResult.summary.errors}</div>
                    <div className="text-green-600">エラー</div>
                  </div>
                </div>
              </div>
            )}

            {/* Next-action guidance */}
            {selectedJob.status === "completed" && selectedJob.draft_count > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                <div className="text-sm font-medium text-blue-800">次のステップ</div>
                <div className="flex gap-2">
                  <a
                    href="/owner/outreach/review"
                    className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    レビューページでメッセージを確認
                  </a>
                  <a
                    href="/owner/outreach/campaigns"
                    className="px-4 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    キャンペーン一覧へ
                  </a>
                </div>
                <p className="text-[10px] text-blue-600">
                  生成された {selectedJob.draft_count} 件のドラフトはレビューページで確認・承認できます
                </p>
              </div>
            )}
            {selectedJob.status === "completed" && selectedJob.draft_count === 0 && selectedJob.imported_count > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <div className="text-sm font-medium text-amber-800">次のステップ</div>
                <p className="text-xs text-amber-700">
                  {selectedJob.imported_count} 件のリードがインポートされましたが、ドラフトは作成されませんでした。
                  キャンペーンを作成してメッセージを生成してください。
                </p>
                <a
                  href="/owner/outreach/campaigns"
                  className="inline-block px-4 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                >
                  キャンペーン作成へ
                </a>
              </div>
            )}

            {/* Items */}
            {selectedItems.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">処理アイテム ({selectedItems.length}件)</h3>
                <div className="max-h-64 overflow-y-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">ステータス</th>
                        <th className="px-3 py-2 text-left">リードID</th>
                        <th className="px-3 py-2 text-left">エラー</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedItems.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              item.status === "error" ? "bg-red-100 text-red-700" :
                              item.status === "drafted" ? "bg-green-100 text-green-700" :
                              item.status === "scored" ? "bg-blue-100 text-blue-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-gray-500 truncate max-w-[200px]">
                            {item.lead_id ?? "—"}
                          </td>
                          <td className="px-3 py-1.5 text-red-500 truncate max-w-[200px]">
                            {item.error_message ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Run button for pending jobs */}
            {selectedJob.status === "pending" && (
              <div className="flex justify-end">
                <button
                  onClick={() => handleRun(selectedJob.id)}
                  disabled={running}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50"
                >
                  {running ? "実行中..." : "バッチ実行開始"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold ${color ?? "text-gray-900"}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
