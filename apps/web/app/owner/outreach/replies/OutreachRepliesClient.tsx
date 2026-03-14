"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MessageSquare,
  RefreshCw,
  Settings,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
} from "lucide-react";
import type {
  OutreachReply,
  OutreachReplyLog,
  AutoReplySettings,
  AutoReplyStats,
  ReplyIntent,
  CloseSettings,
  CloseInsights,
  OutreachCloseLog,
} from "@/src/types/outreach";
import {
  REPLY_INTENT_LABELS,
  REPLY_INTENT_COLORS,
  DEFAULT_AUTO_REPLY_SETTINGS,
  CLOSE_INTENT_LABELS,
  CLOSE_INTENT_COLORS,
  DEAL_TEMPERATURE_LABELS,
  DEAL_TEMPERATURE_COLORS,
  DEFAULT_CLOSE_SETTINGS,
} from "@/src/types/outreach";
import type { CloseIntent, DealTemperature } from "@/src/types/outreach";
import {
  fetchAutoReplies,
  fetchUnhandledReplies,
  executeAutoReply,
  fetchReplyLogs,
  fetchAutoReplySettings,
  saveAutoReplySettings as saveSettingsApi,
  fetchAutoReplyStats,
  processAllUnhandledReplies,
  closeEvaluateReply,
  closeRespondToReply,
  fetchCloseSettings,
  saveCloseSettings as saveCloseSettingsApi,
  fetchCloseLogs,
  handoffReply,
  markReplyWon,
  markReplyLost,
  fetchCloseInsights,
} from "@/app/lib/outreachApi";

const TENANT_ID = "default";

export default function OutreachRepliesClient() {
  const [replies, setReplies] = useState<OutreachReply[]>([]);
  const [unhandled, setUnhandled] = useState<OutreachReply[]>([]);
  const [logs, setLogs] = useState<OutreachReplyLog[]>([]);
  const [stats, setStats] = useState<AutoReplyStats | null>(null);
  const [settings, setSettings] = useState<AutoReplySettings>(DEFAULT_AUTO_REPLY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "unhandled" | "logs" | "settings" | "close-logs" | "close-settings">("all");
  const [toast, setToast] = useState("");
  const [intentFilter, setIntentFilter] = useState<string>("");
  const [processing, setProcessing] = useState<string | null>(null);
  const [closeSettings, setCloseSettingsState] = useState<CloseSettings>(DEFAULT_CLOSE_SETTINGS);
  const [closeLogs, setCloseLogs] = useState<OutreachCloseLog[]>([]);
  const [closeInsights, setCloseInsights] = useState<CloseInsights | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u, l, s, st] = await Promise.all([
        fetchAutoReplies(TENANT_ID, { intent: intentFilter || undefined, limit: 50 }),
        fetchUnhandledReplies(TENANT_ID),
        fetchReplyLogs(TENANT_ID, 30),
        fetchAutoReplySettings(TENANT_ID),
        fetchAutoReplyStats(TENANT_ID),
      ]);
      setReplies(r);
      setUnhandled(u);
      setLogs(l);
      setSettings(s);
      setStats(st);
      // Phase 15: fetch close data (non-blocking)
      fetchCloseSettings(TENANT_ID).then(setCloseSettingsState).catch(() => {});
      fetchCloseLogs(TENANT_ID, 30).then(setCloseLogs).catch(() => {});
      fetchCloseInsights(TENANT_ID).then(setCloseInsights).catch(() => {});
    } catch (err: any) {
      console.error("Failed to fetch replies:", err);
    } finally {
      setLoading(false);
    }
  }, [intentFilter]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleExecute = async (replyId: string) => {
    setProcessing(replyId);
    try {
      await executeAutoReply(TENANT_ID, replyId);
      showToast("AI返信を実行しました");
      await fetchAll();
    } catch (err: any) {
      showToast("エラー: " + (err.message || "実行失敗"));
    } finally {
      setProcessing(null);
    }
  };

  const handleProcessAll = async () => {
    setProcessing("all");
    try {
      const result = await processAllUnhandledReplies(TENANT_ID);
      showToast(`処理完了: ${result.sent}件送信 / ${result.skipped}件スキップ / ${result.errors}件エラー`);
      await fetchAll();
    } catch (err: any) {
      showToast("エラー: " + (err.message || "処理失敗"));
    } finally {
      setProcessing(null);
    }
  };

  const handleSaveSettings = async (updates: Partial<AutoReplySettings>) => {
    try {
      const saved = await saveSettingsApi(TENANT_ID, updates);
      setSettings(saved);
      showToast("設定を保存しました");
    } catch (err: any) {
      showToast("エラー: " + (err.message || "保存失敗"));
    }
  };

  const handleCloseEvaluate = async (replyId: string) => {
    setProcessing(replyId);
    try {
      const result = await closeEvaluateReply(TENANT_ID, replyId);
      showToast(`Close評価完了: ${result.close_intent} (${result.deal_temperature})`);
      await fetchAll();
    } catch (err: any) {
      showToast("エラー: " + (err.message || "評価失敗"));
    } finally {
      setProcessing(null);
    }
  };

  const handleCloseRespond = async (replyId: string) => {
    setProcessing(replyId);
    try {
      const result = await closeRespondToReply(TENANT_ID, replyId);
      showToast(`Close返信生成: ${result.response_type}`);
      await fetchAll();
    } catch (err: any) {
      showToast("エラー: " + (err.message || "生成失敗"));
    } finally {
      setProcessing(null);
    }
  };

  const handleHandoff = async (replyId: string) => {
    try {
      await handoffReply(TENANT_ID, replyId);
      showToast("人間にエスカレーションしました");
      await fetchAll();
    } catch (err: any) {
      showToast("エラー: " + (err.message || "失敗"));
    }
  };

  const handleMarkWon = async (replyId: string) => {
    try {
      await markReplyWon(TENANT_ID, replyId);
      showToast("成約としてマークしました");
      await fetchAll();
    } catch (err: any) {
      showToast("エラー: " + (err.message || "失敗"));
    }
  };

  const handleMarkLost = async (replyId: string) => {
    try {
      await markReplyLost(TENANT_ID, replyId);
      showToast("失注としてマークしました");
      await fetchAll();
    } catch (err: any) {
      showToast("エラー: " + (err.message || "失敗"));
    }
  };

  const handleSaveCloseSettings = async (updates: Partial<CloseSettings>) => {
    try {
      const saved = await saveCloseSettingsApi(TENANT_ID, updates);
      setCloseSettingsState(saved);
      showToast("Close設定を保存しました");
    } catch (err: any) {
      showToast("エラー: " + (err.message || "保存失敗"));
    }
  };

  const TABS = [
    { key: "all" as const, label: "全件", icon: MessageSquare },
    { key: "unhandled" as const, label: `未処理 (${unhandled.length})`, icon: AlertTriangle },
    { key: "logs" as const, label: "ログ", icon: Clock },
    { key: "close-logs" as const, label: "Close ログ", icon: Zap },
    { key: "settings" as const, label: "Reply 設定", icon: Settings },
    { key: "close-settings" as const, label: "Close 設定", icon: Settings },
  ];

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Auto Reply AI</h1>
          <p className="text-sm text-gray-500">返信の自動分類・AI返信・CRM更新</p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          更新
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="今日の返信" value={stats.todayReplies} icon={<MessageSquare className="w-5 h-5 text-blue-500" />} />
          <StatCard label="AI返信成功" value={stats.aiReplied} icon={<CheckCircle2 className="w-5 h-5 text-green-500" />} />
          <StatCard label="成功率" value={`${stats.aiSuccessRate}%`} icon={<Zap className="w-5 h-5 text-amber-500" />} />
          <StatCard label="要対応" value={stats.needsHumanCount} icon={<AlertTriangle className="w-5 h-5 text-red-500" />} />
        </div>
      )}

      {/* Close Insights Cards (Phase 15) */}
      {closeInsights && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="料金問合せ（今日）" value={closeInsights.pricingRequestsToday} icon={<Zap className="w-5 h-5 text-purple-500" />} />
          <StatCard label="デモ希望（今日）" value={closeInsights.demoRequestsToday} icon={<Zap className="w-5 h-5 text-emerald-500" />} />
          <StatCard label="商談待ち" value={closeInsights.meetingRequestedCount} icon={<Zap className="w-5 h-5 text-teal-500" />} />
          <StatCard label="ホットリード" value={closeInsights.hotLeadsCount} icon={<Zap className="w-5 h-5 text-red-500" />} />
          <StatCard label="要対応" value={closeInsights.handoffRequiredCount} icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "all" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <select
              value={intentFilter}
              onChange={(e) => setIntentFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5"
            >
              <option value="">全Intent</option>
              {(Object.keys(REPLY_INTENT_LABELS) as ReplyIntent[]).map((k) => (
                <option key={k} value={k}>{REPLY_INTENT_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <ReplyList
            replies={replies} onExecute={handleExecute} processing={processing}
            onCloseEvaluate={handleCloseEvaluate} onCloseRespond={handleCloseRespond}
            onHandoff={handleHandoff} onMarkWon={handleMarkWon} onMarkLost={handleMarkLost}
          />
        </div>
      )}

      {tab === "unhandled" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={handleProcessAll}
              disabled={processing === "all" || unhandled.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              {processing === "all" ? "処理中..." : "全件処理"}
            </button>
          </div>
          <ReplyList
            replies={unhandled} onExecute={handleExecute} processing={processing}
            onCloseEvaluate={handleCloseEvaluate} onCloseRespond={handleCloseRespond}
            onHandoff={handleHandoff}
          />
        </div>
      )}

      {tab === "logs" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">日時</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">判断</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">ステータス</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">エラー</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{new Date(log.created_at).toLocaleString("ja-JP")}</td>
                  <td className="px-4 py-2">{log.ai_decision}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      log.execution_status === "sent" ? "bg-green-100 text-green-700" :
                      log.execution_status === "failed" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {log.execution_status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-red-500 text-xs">{log.error_message || "—"}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">ログなし</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "close-logs" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">日時</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Close Intent</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">温度</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">確信度</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">推奨アクション</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">ステータス</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">要対応</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {closeLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500 text-xs">{new Date(log.created_at).toLocaleString("ja-JP")}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${CLOSE_INTENT_COLORS[log.close_intent as CloseIntent] || "bg-gray-100"}`}>
                      {CLOSE_INTENT_LABELS[log.close_intent as CloseIntent] || log.close_intent}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${DEAL_TEMPERATURE_COLORS[log.deal_temperature as DealTemperature] || "bg-gray-100"}`}>
                      {DEAL_TEMPERATURE_LABELS[log.deal_temperature as DealTemperature] || log.deal_temperature}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{Math.round(log.close_confidence * 100)}%</td>
                  <td className="px-4 py-2 text-gray-600 text-xs">{log.suggested_action || "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      log.execution_status === "auto_sent" ? "bg-green-100 text-green-700" :
                      log.execution_status === "escalated" ? "bg-amber-100 text-amber-700" :
                      log.execution_status === "suggested" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {log.execution_status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {log.handoff_required ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">要対応</span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
              {closeLogs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Close ログなし</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "settings" && (
        <SettingsPanel settings={settings} onSave={handleSaveSettings} />
      )}

      {tab === "close-settings" && (
        <CloseSettingsPanel settings={closeSettings} onSave={handleSaveCloseSettings} />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function ReplyList({
  replies,
  onExecute,
  processing,
  onCloseEvaluate,
  onCloseRespond,
  onHandoff,
  onMarkWon,
  onMarkLost,
}: {
  replies: OutreachReply[];
  onExecute: (id: string) => void;
  processing: string | null;
  onCloseEvaluate?: (id: string) => void;
  onCloseRespond?: (id: string) => void;
  onHandoff?: (id: string) => void;
  onMarkWon?: (id: string) => void;
  onMarkLost?: (id: string) => void;
}) {
  if (replies.length === 0) {
    return <div className="text-center py-12 text-gray-400">返信データなし</div>;
  }
  return (
    <div className="space-y-2">
      {replies.map((r) => {
        return (
        <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-medium text-gray-900">{r.store_name || "—"}</span>
                {r.intent && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${REPLY_INTENT_COLORS[r.intent] || "bg-gray-100"}`}>
                    {REPLY_INTENT_LABELS[r.intent] || r.intent}
                  </span>
                )}
                {/* Phase 15: Close intent badge */}
                {r.close_intent && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${CLOSE_INTENT_COLORS[r.close_intent as CloseIntent] || "bg-gray-100"}`}>
                    {CLOSE_INTENT_LABELS[r.close_intent as CloseIntent] || r.close_intent}
                  </span>
                )}
                {r.deal_temperature && r.deal_temperature !== "cold" && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${DEAL_TEMPERATURE_COLORS[r.deal_temperature as DealTemperature] || "bg-gray-100"}`}>
                    {DEAL_TEMPERATURE_LABELS[r.deal_temperature as DealTemperature] || r.deal_temperature}
                  </span>
                )}
                {r.handoff_required === 1 && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">要対応</span>
                )}
                <span className="text-xs text-gray-400">{r.reply_source}</span>
                {r.ai_response_sent ? (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">AI返信済</span>
                ) : r.ai_handled ? (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">処理済(未送信)</span>
                ) : null}
              </div>
              <p className="text-sm text-gray-700 line-clamp-2">{r.reply_text}</p>
              {r.ai_response && (
                <div className="mt-2 p-2 bg-blue-50 rounded-lg text-sm text-blue-800">
                  <span className="text-xs font-medium text-blue-500">AI返信: </span>
                  {r.ai_response}
                </div>
              )}
              {/* Phase 15: recommended next step */}
              {r.recommended_next_step && r.recommended_next_step !== "none" && (
                <div className="mt-1 text-xs text-gray-500">
                  推奨: <span className="font-medium">{r.recommended_next_step}</span>
                </div>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                <span>{new Date(r.created_at).toLocaleString("ja-JP")}</span>
                {r.intent_confidence != null && (
                  <span>確信度: {Math.round(r.intent_confidence * 100)}%</span>
                )}
                {r.close_confidence != null && r.close_confidence > 0 && (
                  <span>Close確信度: {Math.round(r.close_confidence * 100)}%</span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0">
              {!r.ai_response_sent && !r.ai_handled && (
                <button
                  onClick={() => onExecute(r.id)}
                  disabled={processing === r.id}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {processing === r.id ? "処理中..." : "AI返信"}
                </button>
              )}
              {/* Phase 15: Close action buttons */}
              {!r.close_intent && r.intent && onCloseEvaluate && (
                <button
                  onClick={() => onCloseEvaluate(r.id)}
                  disabled={processing === r.id}
                  className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  Close評価
                </button>
              )}
              {r.close_intent && r.close_intent !== "not_close_relevant" && onCloseRespond && (
                <button
                  onClick={() => onCloseRespond(r.id)}
                  disabled={processing === r.id}
                  className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  Close返信
                </button>
              )}
              {onHandoff && (
                <button
                  onClick={() => onHandoff(r.id)}
                  className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                >
                  引継ぎ
                </button>
              )}
              {onMarkWon && (
                <button
                  onClick={() => onMarkWon(r.id)}
                  className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  成約
                </button>
              )}
              {onMarkLost && (
                <button
                  onClick={() => onMarkLost(r.id)}
                  className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  失注
                </button>
              )}
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}

function SettingsPanel({
  settings,
  onSave,
}: {
  settings: AutoReplySettings;
  onSave: (s: Partial<AutoReplySettings>) => void;
}) {
  const [local, setLocal] = useState(settings);
  useEffect(() => setLocal(settings), [settings]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 max-w-lg">
      <h3 className="font-semibold text-gray-900">Auto Reply 設定</h3>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={local.autoReplyEnabled}
          onChange={(e) => setLocal({ ...local, autoReplyEnabled: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300"
        />
        <span className="text-sm">自動返信を有効にする</span>
      </label>

      <div>
        <label className="block text-sm text-gray-600 mb-1">1リードあたりの最大返信数</label>
        <input
          type="number"
          min={1}
          max={10}
          value={local.maxRepliesPerLead}
          onChange={(e) => setLocal({ ...local, maxRepliesPerLead: Number(e.target.value) })}
          className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">クールダウン (分)</label>
        <input
          type="number"
          min={10}
          max={1440}
          value={local.cooldownMinutes}
          onChange={(e) => setLocal({ ...local, cooldownMinutes: Number(e.target.value) })}
          className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">確信度閾値</label>
        <input
          type="number"
          min={0.1}
          max={1.0}
          step={0.1}
          value={local.confidenceThreshold}
          onChange={(e) => setLocal({ ...local, confidenceThreshold: Number(e.target.value) })}
          className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
      </div>

      <button
        onClick={() => onSave(local)}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
      >
        保存
      </button>
    </div>
  );
}

function CloseSettingsPanel({
  settings,
  onSave,
}: {
  settings: CloseSettings;
  onSave: (s: Partial<CloseSettings>) => void;
}) {
  const [local, setLocal] = useState(settings);
  useEffect(() => setLocal(settings), [settings]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 max-w-lg">
      <h3 className="font-semibold text-gray-900">Auto Close AI 設定</h3>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={local.auto_close_enabled}
          onChange={(e) => setLocal({ ...local, auto_close_enabled: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300"
        />
        <span className="text-sm">Auto Close を有効にする</span>
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={local.auto_send_pricing_enabled}
          onChange={(e) => setLocal({ ...local, auto_send_pricing_enabled: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300"
        />
        <span className="text-sm">料金情報の自動送信</span>
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={local.auto_send_demo_link_enabled}
          onChange={(e) => setLocal({ ...local, auto_send_demo_link_enabled: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300"
        />
        <span className="text-sm">デモリンクの自動送信</span>
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={local.auto_send_booking_link_enabled}
          onChange={(e) => setLocal({ ...local, auto_send_booking_link_enabled: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300"
        />
        <span className="text-sm">予約リンクの自動送信</span>
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={local.auto_escalate_complex_replies}
          onChange={(e) => setLocal({ ...local, auto_escalate_complex_replies: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300"
        />
        <span className="text-sm">複雑な返信を自動エスカレーション</span>
      </label>

      <div>
        <label className="block text-sm text-gray-600 mb-1">Close 確信度閾値</label>
        <input
          type="number"
          min={0.1}
          max={1.0}
          step={0.05}
          value={local.close_confidence_threshold}
          onChange={(e) => setLocal({ ...local, close_confidence_threshold: Number(e.target.value) })}
          className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
      </div>

      <hr className="border-gray-200" />
      <h4 className="font-medium text-gray-700 text-sm">リンク設定</h4>

      <div>
        <label className="block text-sm text-gray-600 mb-1">デモ予約 URL</label>
        <input
          type="url"
          value={local.demo_booking_url}
          onChange={(e) => setLocal({ ...local, demo_booking_url: e.target.value })}
          placeholder="https://..."
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">料金ページ URL</label>
        <input
          type="url"
          value={local.pricing_page_url}
          onChange={(e) => setLocal({ ...local, pricing_page_url: e.target.value })}
          placeholder="https://..."
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">予約リンク (Calendly等)</label>
        <input
          type="url"
          value={local.calendly_url}
          onChange={(e) => setLocal({ ...local, calendly_url: e.target.value })}
          placeholder="https://calendly.com/..."
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">営業連絡先 URL</label>
        <input
          type="url"
          value={local.sales_contact_url}
          onChange={(e) => setLocal({ ...local, sales_contact_url: e.target.value })}
          placeholder="https://..."
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">引き継ぎ先メールアドレス</label>
        <input
          type="email"
          value={local.human_handoff_email}
          onChange={(e) => setLocal({ ...local, human_handoff_email: e.target.value })}
          placeholder="sales@example.com"
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
      </div>

      <button
        onClick={() => onSave(local)}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
      >
        保存
      </button>
    </div>
  );
}
