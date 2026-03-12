"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchOutreachSettings,
  saveOutreachSettings,
  fetchSendStats,
  fetchUnsubscribes,
  removeUnsubscribe,
  addUnsubscribe,
} from "@/app/lib/outreachApi";
import type { OutreachSettings, SendStats, UnsubscribedLead } from "@/src/types/outreach";

export default function OutreachSettingsClient() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId") ?? "";
  const [settings, setSettings] = useState<OutreachSettings | null>(null);
  const [stats, setStats] = useState<SendStats | null>(null);
  const [unsubs, setUnsubs] = useState<UnsubscribedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmReal, setConfirmReal] = useState(false);

  // Draft form state
  const [dailyCap, setDailyCap] = useState(50);
  const [hourlyCap, setHourlyCap] = useState(10);
  const [requireApproval, setRequireApproval] = useState(true);

  const loadAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [s, st, u] = await Promise.all([
        fetchOutreachSettings(tenantId),
        fetchSendStats(tenantId),
        fetchUnsubscribes(tenantId),
      ]);
      setSettings(s);
      setStats(st);
      setUnsubs(u);
      setDailyCap(s.dailyCap);
      setHourlyCap(s.hourlyCap);
      setRequireApproval(s.requireApproval);
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "読み込みに失敗しました" });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Auto-refresh stats every 30s
  useEffect(() => {
    if (!tenantId) return;
    const timer = setInterval(async () => {
      try {
        const st = await fetchSendStats(tenantId);
        setStats(st);
      } catch { /* silent */ }
    }, 30000);
    return () => clearInterval(timer);
  }, [tenantId]);

  const handleSave = async (patch: Partial<OutreachSettings>) => {
    setSaving(true);
    try {
      const updated = await saveOutreachSettings(tenantId, patch);
      setSettings(updated);
      setDailyCap(updated.dailyCap);
      setHourlyCap(updated.hourlyCap);
      setRequireApproval(updated.requireApproval);
      setToast({ type: "success", text: "設定を保存しました" });
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "保存に失敗しました" });
    } finally {
      setSaving(false);
    }
  };

  const handleModeSwitch = async (mode: "safe" | "real") => {
    if (mode === "real" && settings?.sendMode !== "real") {
      setConfirmReal(true);
      return;
    }
    await handleSave({ sendMode: mode });
  };

  const handleConfirmReal = async () => {
    setConfirmReal(false);
    await handleSave({ sendMode: "real" });
  };

  const handleResubscribe = async (leadId: string) => {
    try {
      await removeUnsubscribe(tenantId, leadId);
      setUnsubs((prev) => prev.filter((u) => u.id !== leadId));
      setToast({ type: "success", text: "配信停止を解除しました" });
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "解除に失敗しました" });
    }
  };

  if (!tenantId || loading) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  const pctDaily = stats ? Math.round((stats.dailyUsed / stats.dailyCap) * 100) : 0;
  const pctHourly = stats ? Math.round((stats.hourlyUsed / stats.hourlyCap) * 100) : 0;

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

        {/* Confirmation dialog */}
        {confirmReal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl space-y-4">
              <h3 className="text-lg font-semibold text-red-600">Real モードに切り替え</h3>
              <p className="text-sm text-gray-600">
                Real モードでは実際にメッセージが送信されます（現在はプレースホルダーのため動作は Safe と同じです）。
                切り替えますか？
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmReal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleConfirmReal}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Real モードに切り替え
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 1. 配信モード */}
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-sm">配信モード</h2>
          <div className="flex gap-3">
            <button
              onClick={() => handleModeSwitch("safe")}
              disabled={saving}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                settings?.sendMode === "safe"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Safe Mode
            </button>
            <button
              onClick={() => handleModeSwitch("real")}
              disabled={saving}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                settings?.sendMode === "real"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Real Mode
            </button>
          </div>
          {settings?.sendMode === "real" && (
            <p className="text-xs text-red-500">Real モードが有効です。送信が実行されます。</p>
          )}
        </div>

        {/* 2. 配信上限 + usage bars */}
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold text-sm">配信上限</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Daily */}
            <div className="space-y-2">
              <label className="text-xs text-gray-500">日次上限 (最大500)</label>
              <input
                type="number"
                min={1}
                max={500}
                value={dailyCap}
                onChange={(e) => setDailyCap(Math.min(500, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
              />
              {stats && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>本日: {stats.dailyUsed} / {stats.dailyCap}</span>
                    <span>{pctDaily}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${pctDaily >= 90 ? "bg-red-500" : pctDaily >= 70 ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(100, pctDaily)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            {/* Hourly */}
            <div className="space-y-2">
              <label className="text-xs text-gray-500">時間あたり上限 (最大100)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={hourlyCap}
                onChange={(e) => setHourlyCap(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
              />
              {stats && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>今時間: {stats.hourlyUsed} / {stats.hourlyCap}</span>
                    <span>{pctHourly}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${pctHourly >= 90 ? "bg-red-500" : pctHourly >= 70 ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(100, pctHourly)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => handleSave({ dailyCap, hourlyCap })}
            disabled={saving}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            上限を保存
          </button>
        </div>

        {/* 3. 承認設定 */}
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-sm">承認設定</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(e) => {
                setRequireApproval(e.target.checked);
                handleSave({ requireApproval: e.target.checked });
              }}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">送信前に承認を必須にする</span>
          </label>
          <p className="text-xs text-gray-400">
            無効にすると、レビュー待ちのメッセージも直接送信可能になります。
          </p>
        </div>

        {/* 4. フォローアップ自動化 */}
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-sm">フォローアップ自動化</h2>
          <p className="text-xs text-gray-400">
            初回送信後、自動でフォローアップをスケジュールします。
          </p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.followupDay3Enabled ?? true}
              onChange={(e) => handleSave({ followupDay3Enabled: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">3日後フォローアップ</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.followupDay7Enabled ?? true}
              onChange={(e) => handleSave({ followupDay7Enabled: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">7日後フォローアップ</span>
          </label>
          <div className="pt-2">
            <label className="text-xs text-gray-500">連絡クールダウン (日)</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={1}
                max={90}
                value={settings?.contactCooldownDays ?? 7}
                onChange={(e) => {
                  const v = Math.min(90, Math.max(1, parseInt(e.target.value) || 7));
                  handleSave({ contactCooldownDays: v });
                }}
                className="w-20 border rounded-lg px-3 py-1.5 text-sm"
              />
              <span className="text-xs text-gray-400">日以内の再送信をブロック</span>
            </div>
          </div>
        </div>

        {/* 5. ソースインポート自動化 */}
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-sm">ソースインポート自動化</h2>
          <p className="text-xs text-gray-400">
            ソース検索からリード取込時に、自動でウェブサイト解析・スコアリングを実行します。
          </p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.autoAnalyzeOnImport ?? false}
              onChange={(e) => handleSave({ autoAnalyzeOnImport: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">自動ウェブサイト解析</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.autoScoreOnImport ?? false}
              onChange={(e) => handleSave({ autoScoreOnImport: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">自動スコアリング</span>
          </label>
          <p className="text-xs text-gray-400">
            解析に失敗してもリード作成は成功扱いになります。
          </p>
        </div>

        {/* 6. 配信停止リスト */}
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-sm">配信停止リスト ({unsubs.length}件)</h2>
          {unsubs.length === 0 ? (
            <p className="text-sm text-gray-400">配信停止中のリードはありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="py-2 pr-4">店舗名</th>
                    <th className="py-2 pr-4">メール</th>
                    <th className="py-2 pr-4">エリア</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {unsubs.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{u.store_name}</td>
                      <td className="py-2 pr-4 text-gray-500">{u.contact_email || "-"}</td>
                      <td className="py-2 pr-4 text-gray-500">{u.area || "-"}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleResubscribe(u.id)}
                          className="text-xs px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                        >
                          配信再開
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
