"use client";

import { useState, useEffect, useCallback } from "react";
import { useOwnerTenantId } from "@/src/lib/useOwnerTenantId";
import { fetchOutreachLeads, updateOutreachLead, recordReply } from "@/app/lib/outreachApi";
import type { OutreachLead, PipelineStage } from "@/src/types/outreach";
import {
  PIPELINE_STAGES,
  PIPELINE_LABELS,
  PIPELINE_COLORS,
  REPLY_CLASSIFICATION_LABELS,
  REPLY_CLASSIFICATION_COLORS,
} from "@/src/types/outreach";
import type { ReplyClassification } from "@/src/types/outreach";

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const color =
    score >= 70 ? "text-green-600" :
    score >= 40 ? "text-yellow-600" :
    "text-red-600";
  return <span className={`text-xs font-medium ${color}`}>{score}pt</span>;
}

export default function OutreachCrmClient() {
  const { tenantId, loading: tenantLoading } = useOwnerTenantId();
  const [leadsByStage, setLeadsByStage] = useState<Record<PipelineStage, OutreachLead[]>>(
    {} as Record<PipelineStage, OutreachLead[]>
  );
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [replyModal, setReplyModal] = useState<{ leadId: string; storeName: string } | null>(null);
  const [replyChannel, setReplyChannel] = useState("email");
  const [replyBody, setReplyBody] = useState("");
  const [replySaving, setReplySaving] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await fetchOutreachLeads(tenantId, { limit: 200, sort: "score", order: "desc" });
      const grouped: Record<PipelineStage, OutreachLead[]> = {
        new: [], approved: [], contacted: [], replied: [], meeting: [], customer: [], lost: [],
      };
      for (const lead of data.leads) {
        const stage = lead.pipeline_stage as PipelineStage;
        if (grouped[stage]) {
          grouped[stage].push(lead);
        } else {
          grouped.new.push(lead);
        }
      }
      setLeadsByStage(grouped);
    } catch (err: any) {
      setToast(err.message || "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRecordReply = async () => {
    if (!replyModal) return;
    setReplySaving(true);
    try {
      const result = await recordReply(tenantId, replyModal.leadId, {
        channel: replyChannel,
        replyBody,
      });
      const classLabel = result.classification ? REPLY_CLASSIFICATION_LABELS[result.classification as ReplyClassification] ?? result.classification : "";
      const stageMsg = result.newStage ? ` → ${PIPELINE_LABELS[result.newStage as PipelineStage] ?? result.newStage}` : "";
      const lowConf = result.highConfidence === false && result.classification && result.classification !== "other" ? " [低確信度: 自動遷移なし]" : "";
      setToast(`返信を記録しました${classLabel ? ` (分類: ${classLabel}${stageMsg}${lowConf})` : ""}`);
      setReplyModal(null);
      setReplyBody("");
      setReplyChannel("email");
      load();
    } catch (err: any) {
      setToast(err.message || "返信記録に失敗しました");
    } finally {
      setReplySaving(false);
    }
  };

  const handleMoveStage = async (leadId: string, newStage: PipelineStage) => {
    try {
      await updateOutreachLead(tenantId, leadId, { pipeline_stage: newStage });
      load();
    } catch (err: any) {
      setToast(err.message || "ステージ変更に失敗しました");
    }
  };

  if (!tenantId || tenantLoading) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  return (
    <>
      <div className="px-6 space-y-4">
        {toast && (
          <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm">
            {toast}
            <button onClick={() => setToast("")} className="ml-2">&times;</button>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-gray-500 py-8 text-center">読み込み中...</div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {PIPELINE_STAGES.map((stage) => {
              const stageLeads = leadsByStage[stage] ?? [];
              return (
                <div
                  key={stage}
                  className="flex-shrink-0 w-56 bg-gray-50 rounded-xl p-3 space-y-2"
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${PIPELINE_COLORS[stage]}`}
                    >
                      {PIPELINE_LABELS[stage]}
                    </span>
                    <span className="text-xs text-gray-400">{stageLeads.length}</span>
                  </div>

                  {/* Cards */}
                  {stageLeads.length === 0 ? (
                    <div className="text-xs text-gray-400 text-center py-4">なし</div>
                  ) : (
                    stageLeads.map((lead) => (
                      <div
                        key={lead.id}
                        className="bg-white rounded-lg p-2.5 shadow-sm border border-gray-100 space-y-1.5"
                      >
                        <div className="font-medium text-sm truncate">{lead.store_name}</div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          {lead.category && <span>{lead.category}</span>}
                          {lead.area && <span>{lead.area}</span>}
                        </div>
                        <div className="flex items-center justify-between">
                          <ScoreBadge score={lead.score} />
                          {lead.rating != null && (
                            <span className="text-xs text-gray-400">{lead.rating}★</span>
                          )}
                        </div>
                        {lead.last_contacted_at && (
                          <div className="text-[10px] text-gray-400">
                            最終連絡: {new Date(lead.last_contacted_at).toLocaleDateString("ja-JP")}
                          </div>
                        )}
                        {(lead.send_attempt_count ?? 0) > 0 && (
                          <div className="text-[10px] text-gray-400">
                            送信試行: {lead.send_attempt_count}回
                            {lead.last_send_error && (
                              <span className="text-red-400 ml-1" title={lead.last_send_error}>エラーあり</span>
                            )}
                          </div>
                        )}

                        {/* Move buttons */}
                        <div className="flex gap-1 pt-1 flex-wrap">
                          {stage !== "new" && (
                            <button
                              onClick={() => {
                                const idx = PIPELINE_STAGES.indexOf(stage);
                                if (idx > 0) handleMoveStage(lead.id, PIPELINE_STAGES[idx - 1]);
                              }}
                              className="text-xs px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded"
                              title="前のステージへ"
                            >
                              ←
                            </button>
                          )}
                          {stage !== "lost" && stage !== "customer" && (
                            <button
                              onClick={() => {
                                const idx = PIPELINE_STAGES.indexOf(stage);
                                if (idx < PIPELINE_STAGES.length - 1) handleMoveStage(lead.id, PIPELINE_STAGES[idx + 1]);
                              }}
                              className="text-xs px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded"
                              title="次のステージへ"
                            >
                              →
                            </button>
                          )}
                          {stage === "contacted" && (
                            <button
                              onClick={() => setReplyModal({ leadId: lead.id, storeName: lead.store_name })}
                              className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 hover:bg-green-100 rounded"
                              title="返信記録"
                            >
                              返信記録
                            </button>
                          )}
                          {stage !== "lost" && (
                            <button
                              onClick={() => handleMoveStage(lead.id, "lost")}
                              className="text-xs px-1.5 py-0.5 text-red-500 hover:bg-red-50 rounded ml-auto"
                              title="失注"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reply Modal */}
      {replyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-lg font-semibold">返信記録: {replyModal.storeName}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">チャネル</label>
                <select
                  value={replyChannel}
                  onChange={(e) => setReplyChannel(e.target.value)}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1"
                >
                  <option value="email">メール</option>
                  <option value="line">LINE</option>
                  <option value="instagram_dm">Instagram DM</option>
                  <option value="phone">電話</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">返信内容 (任意)</label>
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  rows={3}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1"
                  placeholder="返信の概要をメモ..."
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setReplyModal(null); setReplyBody(""); }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={handleRecordReply}
                disabled={replySaving}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {replySaving ? "保存中..." : "返信を記録"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
