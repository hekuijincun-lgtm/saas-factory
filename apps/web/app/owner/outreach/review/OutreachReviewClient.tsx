"use client";

import { useState, useEffect, useCallback } from "react";
import { useOwnerTenantId } from "@/src/lib/useOwnerTenantId";
import {
  fetchReviewQueue,
  approveMessage,
  rejectMessage,
  sendCampaign,
  fetchSendStats,
} from "@/app/lib/outreachApi";
import type { OutreachMessage, MessageStatus, SendStats } from "@/src/types/outreach";
import { PIPELINE_LABELS, PIPELINE_COLORS } from "@/src/types/outreach";

const STATUS_LABELS: Record<MessageStatus, string> = {
  draft: "下書き",
  pending_review: "レビュー待ち",
  approved: "承認済",
  rejected: "却下",
  sent: "送信済",
};

const STATUS_TAB_ORDER: MessageStatus[] = ["pending_review", "approved", "rejected", "sent"];

export default function OutreachReviewClient() {
  const { tenantId, loading: tenantLoading } = useOwnerTenantId();
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MessageStatus>("pending_review");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sendStats, setSendStats] = useState<SendStats | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [data, stats] = await Promise.all([
        fetchReviewQueue(tenantId, activeTab),
        fetchSendStats(tenantId),
      ]);
      setMessages(data);
      setSendStats(stats);
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "読み込みに失敗しました" });
    } finally {
      setLoading(false);
    }
  }, [tenantId, activeTab]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (id: string) => {
    try {
      await approveMessage(tenantId, id);
      setToast({ type: "success", text: "承認しました" });
      load();
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "承認に失敗しました" });
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectMessage(tenantId, id);
      setToast({ type: "success", text: "却下しました" });
      load();
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "却下に失敗しました" });
    }
  };

  const handleSend = async (id: string) => {
    try {
      const result = await sendCampaign(tenantId, id);
      if (result.sent) {
        setToast({ type: "success", text: `送信完了 (provider: ${result.provider})` });
      } else {
        setToast({ type: "error", text: result.error || "送信に失敗しました" });
      }
      load();
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "送信に失敗しました" });
    }
  };

  if (!tenantId || tenantLoading) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  return (
    <>
      <div className="px-6 space-y-4">
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

        {/* Send Stats Banner */}
        {sendStats && (
          <div className="flex items-center gap-4 bg-gray-50 rounded-lg px-4 py-2 text-xs text-gray-600">
            <span>本日 <strong>{sendStats.dailyUsed}/{sendStats.dailyCap}</strong></span>
            <span>今時間 <strong>{sendStats.hourlyUsed}/{sendStats.hourlyCap}</strong></span>
            <span className={`px-2 py-0.5 rounded-full font-medium ${
              sendStats.sendMode === "safe" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}>
              {sendStats.sendMode === "safe" ? "Safe" : "Real"}
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {STATUS_TAB_ORDER.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-blue-500 text-blue-600 font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {STATUS_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Message list */}
        {loading ? (
          <div className="text-sm text-gray-500 py-8 text-center">読み込み中...</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center">
            {activeTab === "pending_review"
              ? "レビュー待ちのメッセージはありません"
              : `${STATUS_LABELS[activeTab]}のメッセージはありません`}
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const isExpanded = expandedId === msg.id;
              const painPoints = msg.pain_points_json ? JSON.parse(msg.pain_points_json) : [];

              return (
                <div
                  key={msg.id}
                  className="border rounded-lg overflow-hidden"
                >
                  {/* Header */}
                  <div
                    className="px-4 py-3 bg-gray-50 flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-sm">{msg.store_name || "不明"}</span>
                      {msg.pipeline_stage && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            PIPELINE_COLORS[msg.pipeline_stage] ?? ""
                          }`}
                        >
                          {PIPELINE_LABELS[msg.pipeline_stage] ?? msg.pipeline_stage}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{msg.kind}</span>
                      {msg.campaign_id && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-600">
                          キャンペーン
                        </span>
                      )}
                      {msg.variant_key && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500 font-mono">
                          {msg.variant_key}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {new Date(msg.created_at).toLocaleDateString("ja-JP")}
                      </span>
                      <span className="text-gray-400">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Body (expanded) */}
                  {isExpanded && (
                    <div className="px-4 py-3 space-y-3">
                      {msg.subject && (
                        <div className="text-sm">
                          <span className="text-gray-500">件名:</span> {msg.subject}
                        </div>
                      )}

                      <div className="text-sm whitespace-pre-wrap bg-white border rounded-lg p-3">
                        {msg.body}
                      </div>

                      {painPoints.length > 0 && (
                        <div className="text-xs text-gray-500">
                          <span className="font-medium">課題仮説:</span> {painPoints.join(", ")}
                        </div>
                      )}

                      {msg.reasoning_summary && (
                        <div className="text-xs text-gray-400 bg-gray-50 p-2 rounded">
                          内部推論: {msg.reasoning_summary}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2 pt-1">
                        {activeTab === "pending_review" && (
                          <>
                            <button
                              onClick={() => handleApprove(msg.id)}
                              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                            >
                              承認
                            </button>
                            <button
                              onClick={() => handleReject(msg.id)}
                              className="px-4 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                            >
                              却下
                            </button>
                          </>
                        )}
                        {activeTab === "approved" && (
                          <button
                            onClick={() => handleSend(msg.id)}
                            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            送信 ({sendStats?.sendMode === "real" ? "Real" : "Safe"})
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
