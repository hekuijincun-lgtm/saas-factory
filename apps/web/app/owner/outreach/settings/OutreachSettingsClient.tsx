"use client";

import { useState, useEffect, useCallback } from "react";
import { useOwnerTenantId } from "@/src/lib/useOwnerTenantId";
import {
  fetchOutreachSettings,
  saveOutreachSettings,
  fetchSendStats,
  fetchUnsubscribes,
  removeUnsubscribe,
  addUnsubscribe,
  fetchCloseSettings,
  saveCloseSettings,
} from "@/app/lib/outreachApi";
import type { OutreachSettings, SendStats, UnsubscribedLead, CloseSettings } from "@/src/types/outreach";

export default function OutreachSettingsClient() {
  const { tenantId, loading: tenantLoading } = useOwnerTenantId();
  const [settings, setSettings] = useState<OutreachSettings | null>(null);
  const [stats, setStats] = useState<SendStats | null>(null);
  const [unsubs, setUnsubs] = useState<UnsubscribedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmReal, setConfirmReal] = useState(false);
  const [closeSettings, setCloseSettings] = useState<CloseSettings | null>(null);

  // Draft form state
  const [dailyCap, setDailyCap] = useState(50);
  const [hourlyCap, setHourlyCap] = useState(10);
  const [requireApproval, setRequireApproval] = useState(true);

  const loadAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [s, st, u, cs] = await Promise.all([
        fetchOutreachSettings(tenantId),
        fetchSendStats(tenantId),
        fetchUnsubscribes(tenantId),
        fetchCloseSettings(tenantId).catch(() => null),
      ]);
      setSettings(s);
      setStats(st);
      setUnsubs(u);
      if (cs) setCloseSettings(cs);
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

  if (!tenantId || tenantLoading || loading) {
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
                Real モードでは <strong>emailチャネルのみ</strong> 実際にメッセージが送信されます（Resend API経由）。
                LINE・Instagram DMチャネルは未対応のため、送信エラーとなります。
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
            <p className="text-xs text-red-500">Real モードが有効です。emailチャネルは実際に送信されます（LINE/Instagram DMは未対応）。</p>
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

        {/* 5. LP URL設定 */}
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-sm">ランディングページURL</h2>
          <p className="text-xs text-gray-400">
            メッセージ内の {"{{lp_url}}"} トークンがこのURLに自動置換されます。キャンペーン毎に個別URLも設定可能です。
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={settings?.defaultLpUrl ?? ""}
              onChange={(e) => setSettings(settings ? { ...settings, defaultLpUrl: e.target.value } : null)}
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
              placeholder="https://example.com/lp"
            />
            <button
              onClick={() => handleSave({ defaultLpUrl: settings?.defaultLpUrl ?? "" })}
              disabled={saving}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              保存
            </button>
          </div>
          <div className="text-xs text-gray-400 space-y-1">
            <p>使い方: バリアントの件名やCTAテンプレートに <code className="bg-gray-100 px-1 rounded">{"{{lp_url}}"}</code> と記述</p>
            <p>例: <code className="bg-gray-100 px-1 rounded">詳細はこちら: {"{{lp_url}}"}</code></p>
          </div>
        </div>

        {/* 6. ソースインポート自動化 */}
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

        {/* 7. Guard Rails — Auto Pause */}
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-sm">ガードレール（自動一時停止）</h2>
          <p className="text-xs text-gray-400">
            異常検知時にキャンペーンを自動停止します。モニタリングページで状態を確認できます。
          </p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.autoPauseEnabled ?? false}
              onChange={(e) => handleSave({ autoPauseEnabled: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">自動一時停止を有効にする</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">送信失敗閾値 (24h)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={settings?.autoPauseFailureThreshold ?? 10}
                onChange={(e) => {
                  const v = Math.min(100, Math.max(1, parseInt(e.target.value) || 10));
                  handleSave({ autoPauseFailureThreshold: v });
                }}
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">バウンス閾値 (24h)</label>
              <input
                type="number"
                min={1}
                max={50}
                value={settings?.autoPauseBounceThreshold ?? 5}
                onChange={(e) => {
                  const v = Math.min(50, Math.max(1, parseInt(e.target.value) || 5));
                  handleSave({ autoPauseBounceThreshold: v });
                }}
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.monitoringAlertsEnabled ?? false}
              onChange={(e) => handleSave({ monitoringAlertsEnabled: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">モニタリングアラートを有効にする</span>
          </label>
        </div>

        {/* 8. Auto Lead Supply */}
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-sm">自動リード供給</h2>
          <p className="text-xs text-gray-400">
            スケジューラがリード不足時に自動でソース検索・インポートを実行します。
          </p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.autoLeadSupplyEnabled ?? false}
              onChange={(e) => handleSave({ autoLeadSupplyEnabled: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">自動リード供給を有効にする</span>
          </label>
        </div>

        {/* 9. Auto Close */}
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-sm">自動クロージング</h2>
          <p className="text-xs text-gray-400">
            返信のクロージング意図を自動判定し、テンプレートバリアントで応答します。
          </p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.autoCloseEnabled ?? false}
              onChange={(e) => handleSave({ autoCloseEnabled: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">自動クロージングを有効にする</span>
          </label>
          <p className="text-xs text-gray-400">
            詳細設定は「クロージング」ページで管理できます。
          </p>
        </div>

        {/* 10. Close URL Settings */}
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold text-sm">商談化・クロージング URL</h2>
          <p className="text-xs text-gray-400">
            返信の意図に応じて自動送信されるURL。未設定の場合、該当するclose返信は送信されずhandoffに回ります。
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">予約・商談URL (Calendly等)</label>
              <input
                type="url"
                value={closeSettings?.calendly_url ?? ""}
                onChange={(e) => setCloseSettings(cs => cs ? { ...cs, calendly_url: e.target.value } : cs)}
                onBlur={() => closeSettings && saveCloseSettings(tenantId, { calendly_url: closeSettings.calendly_url }).then(setCloseSettings)}
                placeholder="https://calendly.com/your-link"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">デモ予約URL</label>
              <input
                type="url"
                value={closeSettings?.demo_booking_url ?? ""}
                onChange={(e) => setCloseSettings(cs => cs ? { ...cs, demo_booking_url: e.target.value } : cs)}
                onBlur={() => closeSettings && saveCloseSettings(tenantId, { demo_booking_url: closeSettings.demo_booking_url }).then(setCloseSettings)}
                placeholder="https://demo.example.com/book"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">料金ページURL</label>
              <input
                type="url"
                value={closeSettings?.pricing_page_url ?? ""}
                onChange={(e) => setCloseSettings(cs => cs ? { ...cs, pricing_page_url: e.target.value } : cs)}
                onBlur={() => closeSettings && saveCloseSettings(tenantId, { pricing_page_url: closeSettings.pricing_page_url }).then(setCloseSettings)}
                placeholder="https://example.com/pricing"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">営業担当連絡先URL</label>
              <input
                type="url"
                value={closeSettings?.sales_contact_url ?? ""}
                onChange={(e) => setCloseSettings(cs => cs ? { ...cs, sales_contact_url: e.target.value } : cs)}
                onBlur={() => closeSettings && saveCloseSettings(tenantId, { sales_contact_url: closeSettings.sales_contact_url }).then(setCloseSettings)}
                placeholder="https://example.com/contact"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={closeSettings?.auto_send_pricing_enabled ?? false}
                  onChange={(e) => closeSettings && saveCloseSettings(tenantId, { auto_send_pricing_enabled: e.target.checked }).then(setCloseSettings)}
                  className="w-4 h-4 rounded" />
                <span className="text-sm text-gray-700">料金問い合わせに自動返信</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={closeSettings?.auto_send_demo_link_enabled ?? false}
                  onChange={(e) => closeSettings && saveCloseSettings(tenantId, { auto_send_demo_link_enabled: e.target.checked }).then(setCloseSettings)}
                  className="w-4 h-4 rounded" />
                <span className="text-sm text-gray-700">デモ希望に自動返信</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={closeSettings?.auto_send_booking_link_enabled ?? false}
                  onChange={(e) => closeSettings && saveCloseSettings(tenantId, { auto_send_booking_link_enabled: e.target.checked }).then(setCloseSettings)}
                  className="w-4 h-4 rounded" />
                <span className="text-sm text-gray-700">予約希望に自動返信</span>
              </label>
            </div>
          </div>
        </div>

        {/* 11. 配信停止リスト */}
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
