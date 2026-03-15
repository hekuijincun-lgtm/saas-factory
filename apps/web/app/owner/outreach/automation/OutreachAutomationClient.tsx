"use client";

import { useState, useEffect, useCallback } from "react";
import { useOwnerTenantId } from "@/src/lib/useOwnerTenantId";
import {
  fetchSchedules,
  createSchedule,
  updateSchedule,
  enableSchedule,
  disableSchedule,
  runScheduleNow,
  fetchScheduleRuns,
} from "@/app/lib/outreachApi";
import type {
  OutreachSchedule,
  OutreachScheduleRun,
  ScheduleFrequency,
  ScheduleMode,
  ScheduleAreaMode,
  ScheduleRunStatus,
} from "@/src/types/outreach";
import {
  SCHEDULE_FREQUENCY_LABELS,
  SCHEDULE_MODE_LABELS,
  SCHEDULE_AREA_MODE_LABELS,
  SCHEDULE_RUN_STATUS_LABELS,
  SCHEDULE_RUN_STATUS_COLORS,
} from "@/src/types/outreach";

export default function OutreachAutomationClient() {
  const { tenantId, loading: tenantLoading } = useOwnerTenantId();
  const [schedules, setSchedules] = useState<OutreachSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState("");
  const [formNiche, setFormNiche] = useState("");
  const [formAreas, setFormAreas] = useState("");
  const [formFrequency, setFormFrequency] = useState<ScheduleFrequency>("daily");
  const [formHour, setFormHour] = useState("9");
  const [formMinute, setFormMinute] = useState("0");
  const [formTargetCount, setFormTargetCount] = useState("20");
  const [formMaxPerArea, setFormMaxPerArea] = useState("8");
  const [formQualityThreshold, setFormQualityThreshold] = useState("0.4");
  const [formMode, setFormMode] = useState<ScheduleMode>("review_only");
  const [formAreaMode, setFormAreaMode] = useState<ScheduleAreaMode>("manual");
  const [formDailySendLimit, setFormDailySendLimit] = useState("0");
  const [formMinScore, setFormMinScore] = useState("40");
  const [creating, setCreating] = useState(false);

  // Detail / runs
  const [selectedSchedule, setSelectedSchedule] = useState<OutreachSchedule | null>(null);
  const [runs, setRuns] = useState<OutreachScheduleRun[]>([]);
  const [running, setRunning] = useState(false);

  const loadSchedules = useCallback(async () => {
    if (!tenantId) return;
    try {
      const data = await fetchSchedules(tenantId);
      setSchedules(data);
    } catch {
      setToast({ type: "error", text: "スケジュール一覧の取得に失敗しました" });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantLoading && tenantId) loadSchedules();
  }, [tenantLoading, tenantId, loadSchedules]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleCreate = async () => {
    if (!tenantId || !formNiche.trim() || !formAreas.trim()) return;
    const areas = formAreas.split(/[,\n]/).map(a => a.trim()).filter(Boolean);
    if (!areas.length) return;

    setCreating(true);
    try {
      await createSchedule(tenantId, {
        name: formName.trim() || undefined,
        niche: formNiche.trim(),
        areas,
        frequency: formFrequency,
        run_hour: parseInt(formHour, 10) || 9,
        run_minute: parseInt(formMinute, 10) || 0,
        max_target_count: parseInt(formTargetCount, 10) || 20,
        max_per_area: parseInt(formMaxPerArea, 10) || 8,
        quality_threshold: parseFloat(formQualityThreshold) || 0.4,
        mode: formMode,
        area_mode: formAreaMode,
        daily_send_limit: parseInt(formDailySendLimit, 10) || 0,
        min_score_for_auto_send: parseInt(formMinScore, 10) || 40,
      });
      setToast({ type: "success", text: "スケジュールを作成しました" });
      setShowCreate(false);
      resetForm();
      await loadSchedules();
    } catch (err: any) {
      setToast({ type: "error", text: err.message ?? "作成に失敗しました" });
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setFormName(""); setFormNiche(""); setFormAreas("");
    setFormFrequency("daily"); setFormHour("9"); setFormMinute("0");
    setFormTargetCount("20"); setFormMaxPerArea("8"); setFormQualityThreshold("0.4");
    setFormMode("review_only");
    setFormAreaMode("manual");
    setFormDailySendLimit("0");
    setFormMinScore("40");
  };

  const handleToggle = async (schedule: OutreachSchedule) => {
    if (!tenantId) return;
    try {
      if (schedule.enabled) {
        await disableSchedule(tenantId, schedule.id);
        setToast({ type: "success", text: "スケジュールを無効にしました" });
      } else {
        await enableSchedule(tenantId, schedule.id);
        setToast({ type: "success", text: "スケジュールを有効にしました" });
      }
      await loadSchedules();
    } catch (err: any) {
      setToast({ type: "error", text: err.message ?? "切替に失敗しました" });
    }
  };

  const handleRunNow = async (scheduleId: string) => {
    if (!tenantId) return;
    setRunning(true);
    try {
      const run = await runScheduleNow(tenantId, scheduleId);
      const parts = [`インポート ${run.imported_count}件`, `ドラフト ${run.drafted_count}件`];
      if (run.sent_count > 0) parts.push(`送信 ${run.sent_count}件`);
      if (run.review_count > 0) parts.push(`レビュー待ち ${run.review_count}件`);
      setToast({ type: "success", text: `実行完了: ${parts.join(", ")}` });
      await loadSchedules();
      if (selectedSchedule?.id === scheduleId) {
        await loadRuns(scheduleId);
      }
    } catch (err: any) {
      setToast({ type: "error", text: err.message ?? "実行に失敗しました" });
    } finally {
      setRunning(false);
    }
  };

  const loadRuns = async (scheduleId: string) => {
    if (!tenantId) return;
    try {
      const data = await fetchScheduleRuns(tenantId, scheduleId);
      setRuns(data);
    } catch {
      setRuns([]);
    }
  };

  const handleSelectSchedule = async (schedule: OutreachSchedule) => {
    setSelectedSchedule(schedule);
    await loadRuns(schedule.id);
  };

  if (tenantLoading || loading) {
    return <div className="p-6 text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Auto Outreach Scheduler</h1>
          <p className="text-sm text-gray-500 mt-1">
            定期的に営業候補を自動収集・インポート・ドラフト作成
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
        >
          + 新規スケジュール
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">自動営業スケジュール作成</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">スケジュール名（任意）</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                  placeholder="例: 眉毛サロン 東京エリア" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ニッチ / 業種</label>
                <input type="text" value={formNiche} onChange={e => setFormNiche(e.target.value)}
                  placeholder="例: 眉毛サロン" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* Area selection mode — radio buttons above area input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">エリア選定モード</label>
                <div className="flex gap-4 mb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="areaMode" value="manual"
                      checked={formAreaMode === "manual"}
                      onChange={() => setFormAreaMode("manual")}
                      className="text-indigo-600" />
                    <span className="text-sm text-gray-700">手動</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="areaMode" value="rotation"
                      checked={formAreaMode === "rotation"}
                      onChange={() => setFormAreaMode("rotation")}
                      className="text-indigo-600" />
                    <span className="text-sm text-gray-700">ローテーション（おすすめ）</span>
                  </label>
                </div>
                {formAreaMode === "rotation" && (
                  <div className="p-3 mb-3 rounded-lg bg-indigo-50 border border-indigo-200 text-sm text-indigo-800">
                    入力したエリアを実行ごとに1つずつ順番に使用します。
                    <span className="block text-xs text-indigo-600 mt-1">例: 新宿 → 渋谷 → 池袋 → (最初に戻る)</span>
                    {(() => {
                      const previewAreas = formAreas.split(/[,\n]/).map(a => a.trim()).filter(Boolean);
                      if (previewAreas.length >= 2) {
                        return (
                          <p className="text-xs text-indigo-700 mt-1.5 font-medium">
                            実行順: {previewAreas.map((a, i) => (
                              <span key={i}>{i > 0 && " → "}{a}</span>
                            ))} → (先頭に戻る)
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">エリア（カンマ区切り or 改行）</label>
                <textarea value={formAreas} onChange={e => setFormAreas(e.target.value)}
                  placeholder={"渋谷\n新宿\n池袋\n大宮"} rows={3}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">頻度</label>
                  <select value={formFrequency} onChange={e => setFormFrequency(e.target.value as ScheduleFrequency)}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="daily">毎日</option>
                    <option value="weekdays">平日のみ</option>
                    <option value="weekly">毎週月曜</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">実行時刻(時)</label>
                  <input type="number" value={formHour} onChange={e => setFormHour(e.target.value)}
                    min={0} max={23} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">実行時刻(分)</label>
                  <select value={formMinute} onChange={e => setFormMinute(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    {[0,5,10,15,20,25,30,35,40,45,50,55].map(m => (
                      <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">目標件数</label>
                  <input type="number" value={formTargetCount} onChange={e => setFormTargetCount(e.target.value)}
                    min={1} max={100} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">エリアあたり上限</label>
                  <input type="number" value={formMaxPerArea} onChange={e => setFormMaxPerArea(e.target.value)}
                    min={1} max={30} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">品質閾値 (0-1)</label>
                  <input type="number" value={formQualityThreshold} onChange={e => setFormQualityThreshold(e.target.value)}
                    min={0} max={1} step={0.1} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">モード</label>
                  <select value={formMode} onChange={e => setFormMode(e.target.value as ScheduleMode)}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="review_only">レビューのみ（安全）</option>
                    <option value="approved_send_existing_only">承認済み送信</option>
                    <option value="hybrid">ハイブリッド</option>
                    <option value="auto_send">自動送信</option>
                  </select>
                </div>
              </div>
              {formMode === "approved_send_existing_only" && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
                  承認済み送信モードでは、既にレビューで承認済みのアイテムのみが送信対象です。
                  新規生成されたドラフトは自動送信されません。
                </div>
              )}
              {formMode === "hybrid" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                  ハイブリッドモード: スコアが閾値以上のリードは自動送信、それ以下はレビュー待ちになります。
                </div>
              )}
              {formMode === "auto_send" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">
                  自動送信モード: 安全チェックを通過した全てのドラフトが自動的に送信されます。
                  十分なテスト後にのみ有効化してください。
                </div>
              )}
              {/* Auto-send settings (visible for hybrid/auto_send) */}
              {(formMode === "hybrid" || formMode === "auto_send") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">1日の送信上限</label>
                    <input type="number" value={formDailySendLimit} onChange={e => setFormDailySendLimit(e.target.value)}
                      min={0} max={200} className="w-full border rounded-lg px-3 py-2 text-sm" />
                    <p className="text-xs text-gray-400 mt-0.5">0 = 無制限（レートリミットのみ）</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">自動送信スコア閾値</label>
                    <input type="number" value={formMinScore} onChange={e => setFormMinScore(e.target.value)}
                      min={0} max={100} className="w-full border rounded-lg px-3 py-2 text-sm" />
                    <p className="text-xs text-gray-400 mt-0.5">このスコア以上で自動送信対象</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowCreate(false); resetForm(); }}
                className="px-4 py-2 text-gray-600 text-sm hover:bg-gray-100 rounded-lg">キャンセル</button>
              <button onClick={handleCreate}
                disabled={creating || !formNiche.trim() || !formAreas.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50">
                {creating ? "作成中..." : "作成"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule List */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-gray-700">スケジュール一覧</h2>
        </div>
        {schedules.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">スケジュールはまだありません</div>
        ) : (
          <div className="divide-y">
            {schedules.map(s => {
              const areas: string[] = (() => { try { return JSON.parse(s.areas_json); } catch { return []; } })();
              return (
                <div key={s.id}
                  className={`px-4 py-3 flex items-center gap-4 hover:bg-gray-50 cursor-pointer ${
                    selectedSchedule?.id === s.id ? "bg-indigo-50" : ""
                  }`}
                  onClick={() => handleSelectSchedule(s)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900 truncate">{s.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        s.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {s.enabled ? "有効" : "無効"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {SCHEDULE_FREQUENCY_LABELS[s.frequency]} {String(s.run_hour).padStart(2, "0")}:{String(s.run_minute).padStart(2, "0")} JST
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {s.niche} | {areas.slice(0, 4).join(", ")}{areas.length > 4 && ` +${areas.length - 4}`}
                      {" | "}{SCHEDULE_MODE_LABELS[s.mode]}
                      {s.area_mode === "auto" && " | エリア自動"}
                      {s.area_mode === "rotation" && areas.length > 0 && (
                        <span className="text-indigo-600">
                          {" | "} ローテ {((s.rotation_index ?? 0) % areas.length) + 1}/{areas.length}
                          {" 次回: "}{areas[(s.rotation_index ?? 0) % areas.length]}
                        </span>
                      )}
                      {s.last_run_at && <> | 最終実行: {new Date(s.last_run_at).toLocaleDateString("ja-JP")}</>}
                      {s.last_executed_area && s.area_mode === "rotation" && (
                        <span className="text-gray-400"> (前回: {s.last_executed_area})</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); handleToggle(s); }}
                      className={`px-3 py-1 rounded text-xs ${
                        s.enabled ? "bg-gray-200 text-gray-600 hover:bg-gray-300" : "bg-green-100 text-green-700 hover:bg-green-200"
                      }`}>
                      {s.enabled ? "無効化" : "有効化"}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleRunNow(s.id); }}
                      disabled={running}
                      className="px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 disabled:opacity-50">
                      {running ? "実行中..." : "今すぐ実行"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail + Runs */}
      {selectedSchedule && (
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              {selectedSchedule.name} — 詳細 / 実行履歴
            </h2>
            <button onClick={() => { setSelectedSchedule(null); setRuns([]); }}
              className="text-xs text-gray-400 hover:text-gray-600">閉じる</button>
          </div>
          <div className="p-4 space-y-4">
            {/* Config summary */}
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>ニッチ: <span className="font-medium">{selectedSchedule.niche}</span></div>
              <div>頻度: <span className="font-medium">{SCHEDULE_FREQUENCY_LABELS[selectedSchedule.frequency]}</span></div>
              <div>時刻: <span className="font-medium">{String(selectedSchedule.run_hour).padStart(2,"0")}:{String(selectedSchedule.run_minute).padStart(2,"0")} JST</span></div>
              <div>目標: <span className="font-medium">{selectedSchedule.max_target_count}件</span></div>
              <div>品質閾値: <span className="font-medium">{selectedSchedule.quality_threshold}</span></div>
              <div>モード: <span className="font-medium">{SCHEDULE_MODE_LABELS[selectedSchedule.mode]}</span></div>
              <div>エリア選定: <span className="font-medium">{SCHEDULE_AREA_MODE_LABELS[selectedSchedule.area_mode] ?? "手動固定"}</span></div>
              {selectedSchedule.area_mode === "rotation" && (() => {
                const detailAreas: string[] = (() => { try { return JSON.parse(selectedSchedule.areas_json); } catch { return []; } })();
                if (detailAreas.length === 0) return null;
                const idx = (selectedSchedule.rotation_index ?? 0) % detailAreas.length;
                return (
                  <div className="col-span-2 sm:col-span-3 bg-indigo-50 rounded p-2">
                    <span className="text-indigo-700">ローテーション位置: <span className="font-medium">{idx + 1}/{detailAreas.length}</span></span>
                    <span className="text-indigo-600 ml-2">次回エリア: <span className="font-medium">{detailAreas[idx]}</span></span>
                    {selectedSchedule.last_executed_area && (
                      <span className="text-gray-500 ml-2">前回: {selectedSchedule.last_executed_area}</span>
                    )}
                  </div>
                );
              })()}
              {(selectedSchedule.mode === "hybrid" || selectedSchedule.mode === "auto_send") && (
                <>
                  <div>送信上限/日: <span className="font-medium">{selectedSchedule.daily_send_limit || "無制限"}</span></div>
                  <div>スコア閾値: <span className="font-medium">{selectedSchedule.min_score_for_auto_send}</span></div>
                </>
              )}
              {selectedSchedule.next_run_at && (
                <div className="col-span-2 sm:col-span-3">
                  次回実行予定: <span className="font-medium">{new Date(selectedSchedule.next_run_at).toLocaleString("ja-JP")}</span>
                </div>
              )}
            </div>

            {/* Pipeline toggles */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: "自動承認", val: selectedSchedule.auto_accept_enabled },
                { label: "自動インポート", val: selectedSchedule.auto_import_enabled },
                { label: "自動分析", val: selectedSchedule.auto_analyze_enabled },
                { label: "自動スコア", val: selectedSchedule.auto_score_enabled },
                { label: "自動ドラフト", val: selectedSchedule.auto_draft_enabled },
              ].map(({ label, val }) => (
                <span key={label} className={`text-xs px-2 py-1 rounded ${
                  val ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
                }`}>
                  {label}: {val ? "ON" : "OFF"}
                </span>
              ))}
            </div>

            {/* Run history */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">実行履歴 ({runs.length}件)</h3>
              {runs.length === 0 ? (
                <div className="text-xs text-gray-400 py-4 text-center">まだ実行履歴がありません</div>
              ) : (
                <div className="max-h-64 overflow-y-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">日時</th>
                        <th className="px-3 py-2 text-left">ステータス</th>
                        <th className="px-3 py-2 text-right">検索</th>
                        <th className="px-3 py-2 text-right">インポート</th>
                        <th className="px-3 py-2 text-right">ドラフト</th>
                        <th className="px-3 py-2 text-right">送信</th>
                        <th className="px-3 py-2 text-right">エラー</th>
                        <th className="px-3 py-2 text-left">エリア</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {runs.map(run => (
                        <tr key={run.id} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            {run.started_at ? new Date(run.started_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${SCHEDULE_RUN_STATUS_COLORS[run.status]}`}>
                              {SCHEDULE_RUN_STATUS_LABELS[run.status]}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right">{run.searched_count}</td>
                          <td className="px-3 py-1.5 text-right">{run.imported_count}</td>
                          <td className="px-3 py-1.5 text-right">{run.drafted_count}</td>
                          <td className="px-3 py-1.5 text-right">
                            {run.sent_count > 0 ? (
                              <span className="text-green-700 font-medium">{run.sent_count}</span>
                            ) : run.review_count > 0 ? (
                              <span className="text-gray-500" title={`レビュー待ち: ${run.review_count}件`}>R:{run.review_count}</span>
                            ) : "—"}
                            {run.skipped_count > 0 && (
                              <span className="text-gray-400 ml-1" title={`スキップ: ${run.skipped_count}件`}>(-{run.skipped_count})</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <span className={run.error_count > 0 ? "text-red-600" : ""}>{run.error_count}</span>
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            {run.chosen_area ? (
                              <span className="text-xs" title={run.selection_reason ?? ""}>
                                {run.chosen_area}
                                {run.area_mode === "auto" && <span className="text-blue-500 ml-0.5" title="AI自動選定">*</span>}
                              </span>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
