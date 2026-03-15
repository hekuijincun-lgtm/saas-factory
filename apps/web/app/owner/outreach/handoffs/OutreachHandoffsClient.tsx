"use client";

import { useState, useEffect, useCallback } from "react";
import { useOwnerTenantId } from "@/src/lib/useOwnerTenantId";
import { fetchHandoffs, updateHandoff } from "@/app/lib/outreachApi";
import type { OutreachHandoff } from "@/src/types/outreach";
import {
  HANDOFF_PRIORITY_LABELS,
  HANDOFF_PRIORITY_COLORS,
  HANDOFF_STATUS_LABELS,
  HANDOFF_STATUS_COLORS,
} from "@/src/types/outreach";

type FilterStatus = "open" | "assigned" | "resolved" | "dismissed" | "all";

export default function OutreachHandoffsClient() {
  const { tenantId, loading: tenantLoading } = useOwnerTenantId();
  const [handoffs, setHandoffs] = useState<OutreachHandoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [acting, setActing] = useState(false);

  const loadHandoffs = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const status = filterStatus === "all" ? undefined : filterStatus;
      const data = await fetchHandoffs(tenantId, status);
      setHandoffs(data);
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "読み込みに失敗しました" });
    } finally {
      setLoading(false);
    }
  }, [tenantId, filterStatus]);

  useEffect(() => { loadHandoffs(); }, [loadHandoffs]);

  const selected = handoffs.find((h) => h.id === selectedId) || null;

  const handleUpdate = async (id: string, patch: { status?: string; assigned_to?: string; resolution_notes?: string }) => {
    setActing(true);
    try {
      await updateHandoff(tenantId, id, patch);
      setToast({ type: "success", text: "更新しました" });
      await loadHandoffs();
      if (patch.status === "resolved" || patch.status === "dismissed") {
        setSelectedId(null);
      }
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "更新に失敗しました" });
    } finally {
      setActing(false);
    }
  };

  if (!tenantId || tenantLoading) {
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

      {/* Header + filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-semibold text-lg">ハンドオフキュー</h1>
        <div className="flex gap-1">
          {(["open", "assigned", "resolved", "dismissed", "all"] as FilterStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                filterStatus === s
                  ? "bg-amber-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s === "all" ? "全て" : HANDOFF_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        {/* List */}
        <div className="flex-1 space-y-2">
          {loading ? (
            <div className="text-sm text-gray-500">読み込み中...</div>
          ) : handoffs.length === 0 ? (
            <div className="bg-white rounded-xl border p-8 text-center text-sm text-gray-400">
              ハンドオフはありません
            </div>
          ) : (
            handoffs.map((h) => (
              <div
                key={h.id}
                onClick={() => {
                  setSelectedId(h.id);
                  setNotes(h.resolution_notes || "");
                  setAssignTo(h.assigned_to || "");
                }}
                className={`bg-white rounded-xl border p-4 cursor-pointer transition-colors hover:border-amber-300 ${
                  selectedId === h.id ? "border-amber-500 ring-1 ring-amber-200" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${HANDOFF_PRIORITY_COLORS[h.priority]}`}>
                      {HANDOFF_PRIORITY_LABELS[h.priority]}
                    </span>
                    <span className="font-medium text-sm truncate">{h.store_name || h.lead_id}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${HANDOFF_STATUS_COLORS[h.status]}`}>
                    {HANDOFF_STATUS_LABELS[h.status]}
                  </span>
                </div>
                <div className="mt-2 text-xs text-gray-500 flex items-center gap-3">
                  <span>理由: {h.reason}</span>
                  <span>{new Date(h.created_at).toLocaleDateString("ja-JP")}</span>
                </div>
                {h.reply_text && (
                  <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-2 line-clamp-2">
                    {h.reply_text}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 shrink-0 bg-white rounded-xl border p-5 space-y-4 self-start sticky top-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">詳細</h3>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 text-sm">
                &times;
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div><span className="text-gray-500">店舗:</span> {selected.store_name || selected.lead_id}</div>
              <div><span className="text-gray-500">理由:</span> {selected.reason}</div>
              <div><span className="text-gray-500">優先度:</span> {HANDOFF_PRIORITY_LABELS[selected.priority]}</div>
              <div><span className="text-gray-500">作成:</span> {new Date(selected.created_at).toLocaleString("ja-JP")}</div>
              {selected.contact_email && (
                <div><span className="text-gray-500">メール:</span> {selected.contact_email}</div>
              )}
            </div>

            {selected.reply_text && (
              <div className="text-xs bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
                {selected.reply_text}
              </div>
            )}

            {/* Assign */}
            <div className="space-y-1">
              <label className="text-xs text-gray-500">担当者</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={assignTo}
                  onChange={(e) => setAssignTo(e.target.value)}
                  className="flex-1 border rounded-lg px-2 py-1 text-sm"
                  placeholder="担当者名"
                />
                <button
                  onClick={() => handleUpdate(selected.id, { assigned_to: assignTo, status: "assigned" })}
                  disabled={acting || !assignTo}
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  アサイン
                </button>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-xs text-gray-500">対応メモ</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full border rounded-lg px-2 py-1 text-sm resize-none"
                placeholder="対応内容を記入..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => handleUpdate(selected.id, { status: "resolved", resolution_notes: notes })}
                disabled={acting}
                className="flex-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                解決済み
              </button>
              <button
                onClick={() => handleUpdate(selected.id, { status: "dismissed", resolution_notes: notes })}
                disabled={acting}
                className="flex-1 px-3 py-1.5 text-xs bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50"
              >
                却下
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
