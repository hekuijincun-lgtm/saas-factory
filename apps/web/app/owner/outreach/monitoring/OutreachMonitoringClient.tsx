"use client";

import { useState, useEffect, useCallback } from "react";
import { useOwnerTenantId } from "@/src/lib/useOwnerTenantId";
import {
  fetchHealth,
  fetchMonitoring,
  emergencyPause,
  emergencyResume,
  fetchOutreachSettings,
} from "@/app/lib/outreachApi";
import type {
  HealthResult,
  MonitoringTimeSeries,
  OutreachSettings,
} from "@/src/types/outreach";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  healthy: { bg: "bg-green-100", text: "text-green-700", label: "正常" },
  degraded: { bg: "bg-yellow-100", text: "text-yellow-700", label: "注意" },
  unhealthy: { bg: "bg-red-100", text: "text-red-700", label: "異常" },
};

const FLAG_LABELS: Record<string, string> = {
  HIGH_FAILURE_RATE: "送信失敗率が高い",
  BOUNCE_SPIKE: "バウンス急増",
  ZERO_SENDS_WITH_CAMPAIGN_ON: "キャンペーン有効だが送信ゼロ",
  STALE_FOLLOWUPS: "フォローアップ滞留",
  HIGH_UNSUBSCRIBE_RATE: "配信停止率が高い",
  FOLLOWUP_BACKLOG: "フォローアップ蓄積",
};

export default function OutreachMonitoringClient() {
  const { tenantId, loading: tenantLoading } = useOwnerTenantId();
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [timeSeries, setTimeSeries] = useState<MonitoringTimeSeries[]>([]);
  const [settings, setSettings] = useState<OutreachSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmPause, setConfirmPause] = useState(false);
  const [confirmResume, setConfirmResume] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [acting, setActing] = useState(false);

  const loadAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [h, ts, s] = await Promise.all([
        fetchHealth(tenantId),
        fetchMonitoring(tenantId, 14),
        fetchOutreachSettings(tenantId),
      ]);
      setHealth(h);
      setTimeSeries(ts);
      setSettings(s);
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "読み込みに失敗しました" });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!tenantId) return;
    const timer = setInterval(async () => {
      try {
        const h = await fetchHealth(tenantId);
        setHealth(h);
      } catch { /* silent */ }
    }, 30000);
    return () => clearInterval(timer);
  }, [tenantId]);

  const handlePause = async () => {
    setConfirmPause(false);
    setActing(true);
    try {
      await emergencyPause(tenantId, pauseReason || "手動緊急停止");
      setPauseReason("");
      setToast({ type: "success", text: "緊急停止を実行しました" });
      await loadAll();
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "緊急停止に失敗しました" });
    } finally {
      setActing(false);
    }
  };

  const handleResume = async () => {
    setConfirmResume(false);
    setActing(true);
    try {
      await emergencyResume(tenantId);
      setToast({ type: "success", text: "自動配信を再開しました" });
      await loadAll();
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "再開に失敗しました" });
    } finally {
      setActing(false);
    }
  };

  if (!tenantId || tenantLoading || loading) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  const statusStyle = STATUS_STYLES[health?.status ?? "healthy"];
  const maxSent = Math.max(1, ...timeSeries.map((d) => d.sent));

  return (
    <>
      <div className="px-6 space-y-6">
        {toast && (
          <div
            className={`px-3 py-2 rounded text-sm ${
              toast.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {toast.text}
            <button onClick={() => setToast(null)} className="ml-2">&times;</button>
          </div>
        )}

        {/* Confirmation dialogs */}
        {confirmPause && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl space-y-4">
              <h3 className="text-lg font-semibold text-red-600">緊急停止</h3>
              <p className="text-sm text-gray-600">
                全ての自動キャンペーン送信を停止します。手動で再開するまで配信は行われません。
              </p>
              <input
                type="text"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="停止理由（任意）"
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmPause(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  キャンセル
                </button>
                <button
                  onClick={handlePause}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  停止する
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmResume && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl space-y-4">
              <h3 className="text-lg font-semibold text-green-600">配信再開</h3>
              <p className="text-sm text-gray-600">
                自動キャンペーン送信を再開します。問題が解決されていることを確認してください。
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmResume(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleResume}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  再開する
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 1. Health Status */}
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">システムヘルス</h2>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
              {statusStyle.label}
            </span>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="送信 (24h)" value={health?.metrics.sent_last_24h ?? 0} />
            <MetricCard
              label="失敗 (24h)"
              value={health?.metrics.failed_last_24h ?? 0}
              warn={health?.metrics.failed_last_24h ? health.metrics.failed_last_24h > 0 : false}
            />
            <MetricCard label="返信 (24h)" value={health?.metrics.reply_count_last_24h ?? 0} />
            <MetricCard
              label="配信停止 (24h)"
              value={health?.metrics.unsubscribe_count_last_24h ?? 0}
              warn={health?.metrics.unsubscribe_count_last_24h ? health.metrics.unsubscribe_count_last_24h > 0 : false}
            />
          </div>

          {/* Cron status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <CronStatus label="Auto Campaign" ts={health?.metrics.last_auto_campaign_run_at} />
            <CronStatus label="Followup" ts={health?.metrics.last_followup_run_at} />
            <CronStatus label="Close Engine" ts={health?.metrics.last_close_engine_run_at} />
          </div>

          {/* Pending followups */}
          {(health?.metrics.pending_followups ?? 0) > 0 && (
            <div className="text-xs text-amber-600">
              未処理フォローアップ: {health?.metrics.pending_followups}件
              {(health?.metrics.stale_followups ?? 0) > 0 && (
                <span className="text-red-600 ml-2">
                  (滞留: {health?.metrics.stale_followups}件)
                </span>
              )}
            </div>
          )}
        </div>

        {/* 2. Flags / Alerts */}
        {health && health.flags.length > 0 && (
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h2 className="font-semibold text-sm">アラート</h2>
            <div className="space-y-2">
              {health.flags.map((flag, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 px-3 py-2 rounded-lg text-sm ${
                    flag.severity === "critical"
                      ? "bg-red-50 text-red-700"
                      : "bg-yellow-50 text-yellow-700"
                  }`}
                >
                  <span className="font-medium shrink-0">
                    {flag.severity === "critical" ? "!!" : "!"}
                  </span>
                  <div>
                    <span className="font-medium">{FLAG_LABELS[flag.code] || flag.code}</span>
                    <span className="text-xs ml-2 opacity-70">{flag.message}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Emergency Controls */}
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-sm">緊急コントロール</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">自動配信:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                health?.metrics.auto_campaign_paused
                  ? "bg-red-100 text-red-700"
                  : health?.metrics.auto_campaign_enabled
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
              }`}>
                {health?.metrics.auto_campaign_paused
                  ? "一時停止中"
                  : health?.metrics.auto_campaign_enabled
                    ? "稼働中"
                    : "無効"}
              </span>
            </div>
            {settings?.pauseReason && (
              <span className="text-xs text-red-500">理由: {settings.pauseReason}</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmPause(true)}
              disabled={acting || health?.metrics.auto_campaign_paused}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              緊急停止
            </button>
            <button
              onClick={() => setConfirmResume(true)}
              disabled={acting || !health?.metrics.auto_campaign_paused}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              再開
            </button>
          </div>
        </div>

        {/* 4. Time Series Chart (bar chart via divs) */}
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-sm">14日間推移</h2>
          {timeSeries.length === 0 ? (
            <p className="text-sm text-gray-400">データがありません</p>
          ) : (
            <div className="space-y-4">
              {/* Bar chart */}
              <div className="flex items-end gap-1 h-32">
                {timeSeries.map((d) => {
                  const sentH = (d.sent / maxSent) * 100;
                  const failedH = maxSent > 0 ? (d.failed / maxSent) * 100 : 0;
                  return (
                    <div key={d.period} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.period}: 送信${d.sent} 失敗${d.failed}`}>
                      <div className="w-full flex flex-col justify-end h-28">
                        {d.failed > 0 && (
                          <div
                            className="w-full bg-red-400 rounded-t"
                            style={{ height: `${failedH}%` }}
                          />
                        )}
                        <div
                          className="w-full bg-blue-400 rounded-t"
                          style={{ height: `${Math.max(2, sentH - failedH)}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-gray-400">{d.period.slice(5)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-400 rounded" />送信</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded" />失敗</span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-1 pr-3">日付</th>
                      <th className="py-1 pr-3">送信</th>
                      <th className="py-1 pr-3">失敗</th>
                      <th className="py-1 pr-3">返信</th>
                      <th className="py-1 pr-3">停止</th>
                      <th className="py-1 pr-3">商談</th>
                      <th className="py-1">成約</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeSeries.slice().reverse().map((d) => (
                      <tr key={d.period} className="border-b last:border-0">
                        <td className="py-1 pr-3">{d.period.slice(5)}</td>
                        <td className="py-1 pr-3">{d.sent}</td>
                        <td className={`py-1 pr-3 ${d.failed > 0 ? "text-red-600" : ""}`}>{d.failed}</td>
                        <td className="py-1 pr-3">{d.replies}</td>
                        <td className={`py-1 pr-3 ${d.unsubscribes > 0 ? "text-amber-600" : ""}`}>{d.unsubscribes}</td>
                        <td className="py-1 pr-3">{d.meetings}</td>
                        <td className="py-1">{d.closes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MetricCard({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${warn ? "text-red-600" : "text-gray-900"}`}>
        {value}
      </div>
    </div>
  );
}

function CronStatus({ label, ts }: { label: string; ts: string | null | undefined }) {
  const age = ts ? Math.round((Date.now() - new Date(ts).getTime()) / 60000) : null;
  const stale = age !== null && age > 30;
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="text-gray-500">{label}</div>
      <div className={stale ? "text-amber-600 font-medium" : "text-gray-700"}>
        {ts ? `${age}分前` : "未実行"}
      </div>
    </div>
  );
}
