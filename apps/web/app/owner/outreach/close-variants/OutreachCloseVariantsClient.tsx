"use client";

import { useState, useEffect, useCallback } from "react";
import { useOwnerTenantId } from "@/src/lib/useOwnerTenantId";
import {
  fetchCloseVariants,
  createCloseVariant,
  fetchCloseAnalytics,
} from "@/app/lib/outreachApi";
import type { OutreachCloseVariant, CloseAnalytics } from "@/src/types/outreach";

const CLOSE_TYPES = [
  { value: "pricing", label: "料金案内" },
  { value: "demo_invite", label: "デモ招待" },
  { value: "booking_invite", label: "予約招待" },
  { value: "faq_answer", label: "FAQ回答" },
  { value: "objection_response", label: "反論対応" },
];

export default function OutreachCloseVariantsClient() {
  const { tenantId, loading: tenantLoading } = useOwnerTenantId();
  const [variants, setVariants] = useState<OutreachCloseVariant[]>([]);
  const [analytics, setAnalytics] = useState<CloseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filterType, setFilterType] = useState<string>("");

  // Create form state
  const [newCloseType, setNewCloseType] = useState("pricing");
  const [newVariantKey, setNewVariantKey] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

  const loadAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [v, a] = await Promise.all([
        fetchCloseVariants(tenantId, filterType || undefined),
        fetchCloseAnalytics(tenantId),
      ]);
      setVariants(v);
      setAnalytics(a);
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "読み込みに失敗しました" });
    } finally {
      setLoading(false);
    }
  }, [tenantId, filterType]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleCreate = async () => {
    if (!newVariantKey || !newBody) {
      setToast({ type: "error", text: "バリアントキーと本文は必須です" });
      return;
    }
    setCreating(true);
    try {
      await createCloseVariant(tenantId, {
        close_type: newCloseType,
        variant_key: newVariantKey,
        subject_template: newSubject || undefined,
        body_template: newBody,
      });
      setToast({ type: "success", text: "バリアントを作成しました" });
      setShowCreate(false);
      setNewVariantKey("");
      setNewSubject("");
      setNewBody("");
      await loadAll();
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "作成に失敗しました" });
    } finally {
      setCreating(false);
    }
  };

  if (!tenantId || tenantLoading || loading) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  return (
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

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-semibold text-lg">クロージングバリアント</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700"
        >
          + 新規作成
        </button>
      </div>

      {/* Analytics summary */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="text-xs text-gray-500">評価総数</div>
            <div className="text-xl font-bold">{analytics.total_close_evaluations}</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="text-xs text-gray-500">ハンドオフ</div>
            <div className="text-xl font-bold">{analytics.handoffs_created}</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="text-xs text-gray-500">予約リンク送信</div>
            <div className="text-xl font-bold">{analytics.booking_funnel?.links_sent ?? 0}</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="text-xs text-gray-500">予約成立</div>
            <div className="text-xl font-bold text-green-600">{analytics.booking_funnel?.booked ?? 0}</div>
          </div>
        </div>
      )}

      {/* Variant performance */}
      {analytics?.variant_performance && analytics.variant_performance.length > 0 && (
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-sm">バリアント成果比較</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2 pr-3">バリアント</th>
                  <th className="py-2 pr-3">送信</th>
                  <th className="py-2 pr-3">商談</th>
                  <th className="py-2 pr-3">成約</th>
                  <th className="py-2">商談率</th>
                </tr>
              </thead>
              <tbody>
                {analytics.variant_performance.map((vp) => (
                  <tr key={vp.variant} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{vp.variant}</td>
                    <td className="py-2 pr-3">{vp.sent}</td>
                    <td className="py-2 pr-3">{vp.meetings}</td>
                    <td className="py-2 pr-3">{vp.closes}</td>
                    <td className="py-2">
                      <span className={`font-medium ${vp.meeting_rate > 0.1 ? "text-green-600" : "text-gray-600"}`}>
                        {(vp.meeting_rate * 100).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => setFilterType("")}
          className={`px-3 py-1 text-xs rounded-lg transition-colors ${
            !filterType ? "bg-amber-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          全て
        </button>
        {CLOSE_TYPES.map((ct) => (
          <button
            key={ct.value}
            onClick={() => setFilterType(ct.value)}
            className={`px-3 py-1 text-xs rounded-lg transition-colors ${
              filterType === ct.value ? "bg-amber-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {ct.label}
          </button>
        ))}
      </div>

      {/* Variant list */}
      {variants.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-sm text-gray-400">
          バリアントがありません。「+ 新規作成」から追加してください。
        </div>
      ) : (
        <div className="space-y-3">
          {variants.map((v) => {
            const typeLabel = CLOSE_TYPES.find((ct) => ct.value === v.close_type)?.label || v.close_type;
            const meetingRate = v.sent_count > 0 ? (v.meeting_count / v.sent_count * 100).toFixed(1) : "—";
            return (
              <div key={v.id} className="bg-white rounded-xl border p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                      {typeLabel}
                    </span>
                    <span className="font-medium text-sm">{v.variant_key}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>送信: {v.sent_count}</span>
                    <span>商談: {v.meeting_count}</span>
                    <span>成約: {v.close_count}</span>
                    <span className={`font-medium ${Number(meetingRate) > 10 ? "text-green-600" : ""}`}>
                      商談率: {meetingRate}%
                    </span>
                  </div>
                </div>
                {v.subject_template && (
                  <div className="text-xs text-gray-500">件名: {v.subject_template}</div>
                )}
                <div className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap max-h-24 overflow-y-auto">
                  {v.body_template}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full shadow-xl space-y-4">
            <h3 className="text-lg font-semibold">バリアント新規作成</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">クロージングタイプ</label>
                <select
                  value={newCloseType}
                  onChange={(e) => setNewCloseType(e.target.value)}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1"
                >
                  {CLOSE_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500">バリアントキー</label>
                <input
                  type="text"
                  value={newVariantKey}
                  onChange={(e) => setNewVariantKey(e.target.value)}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1"
                  placeholder="例: pricing_v2_friendly"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500">件名テンプレート（任意）</label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1"
                  placeholder="例: {{store_name}}様 料金のご案内"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500">本文テンプレート</label>
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  rows={6}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1 resize-none"
                  placeholder="テンプレート本文を入力..."
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newVariantKey || !newBody}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                作成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
