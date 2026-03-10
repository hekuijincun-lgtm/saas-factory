"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Brain,
  FileText,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  X,
  Copy,
  Target,
} from "lucide-react";
import {
  fetchLeads,
  createLead,
  fetchLead,
  analyzeLeadApi,
  generateDraftsApi,
  classifyReplyApi,
  updateLeadStatus,
  type SalesLead,
  type LeadDraft,
  type LeadClassification,
} from "../../lib/adminApi";

// ── Constants ───────────────────────────────────────────────────────────────

const INDUSTRIES = [
  { value: "eyebrow", label: "眉毛サロン" },
  { value: "hair", label: "美容室" },
  { value: "nail", label: "ネイルサロン" },
  { value: "esthetic", label: "エステサロン" },
  { value: "dental", label: "歯科医院" },
  { value: "shared", label: "その他" },
];

const STATUSES = [
  { value: "new", label: "新規", color: "bg-gray-100 text-gray-700" },
  { value: "contacted", label: "連絡済", color: "bg-blue-100 text-blue-700" },
  { value: "replied", label: "返信あり", color: "bg-cyan-100 text-cyan-700" },
  { value: "interested", label: "興味あり", color: "bg-amber-100 text-amber-700" },
  { value: "meeting", label: "商談中", color: "bg-purple-100 text-purple-700" },
  { value: "proposal", label: "提案中", color: "bg-indigo-100 text-indigo-700" },
  { value: "won", label: "成約", color: "bg-green-100 text-green-700" },
  { value: "lost", label: "失注", color: "bg-red-100 text-red-700" },
];

const CLASSIFICATION_LABELS: Record<string, string> = {
  interested: "興味あり",
  not_interested: "興味なし",
  needs_info: "情報希望",
  meeting_request: "商談希望",
  price_inquiry: "料金問い合わせ",
  already_using: "競合利用中",
  wrong_person: "担当違い",
  auto_reply: "自動返信",
};

function statusBadge(status: string) {
  const s = STATUSES.find((st) => st.value === status);
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s?.color ?? "bg-gray-100 text-gray-700"}`}>
      {s?.label ?? status}
    </span>
  );
}

function industryLabel(industry: string) {
  return INDUSTRIES.find((i) => i.value === industry)?.label ?? industry;
}

// ── Toast ───────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
      {message}
    </div>
  );
}

// ── Create Modal ────────────────────────────────────────────────────────────

function CreateLeadModal({ onClose, onCreate }: { onClose: () => void; onCreate: (data: any) => Promise<void> }) {
  const [form, setForm] = useState({
    storeName: "",
    industry: "shared",
    websiteUrl: "",
    instagramUrl: "",
    lineUrl: "",
    region: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.storeName.trim()) return;
    setSaving(true);
    try {
      await onCreate(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">リード追加</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">店舗名 *</label>
            <input
              type="text"
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              placeholder="例: ビューティーサロン渋谷"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">業種</label>
            <select
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            >
              {INDUSTRIES.map((i) => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ウェブサイトURL</label>
            <input
              type="url"
              value={form.websiteUrl}
              onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instagram URL</label>
            <input
              type="url"
              value={form.instagramUrl}
              onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              placeholder="https://instagram.com/..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">LINE URL</label>
            <input
              type="url"
              value={form.lineUrl}
              onChange={(e) => setForm({ ...form, lineUrl: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              placeholder="https://line.me/..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">地域</label>
            <input
              type="text"
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              placeholder="例: 東京都渋谷区"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              rows={3}
              placeholder="補足情報..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving || !form.storeName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50"
            >
              {saving ? "保存中..." : "追加"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Reply Classification Modal ──────────────────────────────────────────────

function ClassifyReplyModal({
  leadId,
  onClose,
  onClassify,
}: {
  leadId: string;
  onClose: () => void;
  onClassify: (id: string, rawReply: string) => Promise<void>;
}) {
  const [rawReply, setRawReply] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawReply.trim()) return;
    setLoading(true);
    try {
      await onClassify(leadId, rawReply);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">返信分類</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">返信内容</label>
            <textarea
              value={rawReply}
              onChange={(e) => setRawReply(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              rows={6}
              placeholder="返信メッセージを貼り付けてください..."
              required
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading || !rawReply.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "分類中..." : "分類する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Lead Detail Panel ───────────────────────────────────────────────────────

function LeadDetail({
  lead,
  drafts,
  classifications,
  onAnalyze,
  onGenerateDrafts,
  onClassifyReply,
  analyzing,
  generating,
}: {
  lead: SalesLead;
  drafts: LeadDraft[];
  classifications: LeadClassification[];
  onAnalyze: () => void;
  onGenerateDrafts: () => void;
  onClassifyReply: () => void;
  analyzing: boolean;
  generating: boolean;
}) {
  const [draftTab, setDraftTab] = useState<"email" | "line_initial" | "line_followup">("email");
  const latestDrafts = {
    email: drafts.filter((d) => d.kind === "email")[0],
    line_initial: drafts.filter((d) => d.kind === "line_initial")[0],
    line_followup: drafts.filter((d) => d.kind === "line_followup")[0],
  };
  const currentDraft = latestDrafts[draftTab];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="space-y-4">
      {/* AI Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg disabled:opacity-50 border border-amber-200"
        >
          {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          AI採点
        </button>
        <button
          onClick={onGenerateDrafts}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg disabled:opacity-50 border border-indigo-200"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          営業文生成
        </button>
        <button
          onClick={onClassifyReply}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 rounded-lg border border-cyan-200"
        >
          <MessageSquare className="w-4 h-4" />
          返信分類
        </button>
      </div>

      {/* AI Summary */}
      {lead.aiSummary && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-amber-800 mb-1">AI分析サマリー</h4>
          <p className="text-sm text-amber-900">{lead.aiSummary}</p>
          {lead.score != null && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-amber-700">スコア:</span>
              <span className={`text-lg font-bold ${lead.score >= 70 ? "text-green-600" : lead.score >= 40 ? "text-amber-600" : "text-gray-500"}`}>
                {lead.score}
              </span>
              <span className="text-xs text-amber-700">/ 100</span>
            </div>
          )}
        </div>
      )}

      {/* Pain Points + Offer */}
      {lead.painPoints && lead.painPoints.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">課題</h4>
          <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
            {lead.painPoints.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
          {lead.bestOffer && (
            <div className="mt-3 pt-3 border-t">
              <span className="text-xs font-medium text-gray-500">最適な提案:</span>
              <p className="text-sm text-gray-800 mt-0.5">{lead.bestOffer}</p>
            </div>
          )}
          {lead.recommendedChannel && (
            <div className="mt-2">
              <span className="text-xs font-medium text-gray-500">推奨チャネル:</span>
              <span className="ml-1 text-sm text-gray-800">{lead.recommendedChannel}</span>
            </div>
          )}
          {lead.nextAction && (
            <div className="mt-2">
              <span className="text-xs font-medium text-gray-500">次のアクション:</span>
              <p className="text-sm text-gray-800 mt-0.5">{lead.nextAction}</p>
            </div>
          )}
        </div>
      )}

      {/* Drafts */}
      {drafts.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">営業文ドラフト</h4>
          <div className="flex gap-1 mb-3">
            {(["email", "line_initial", "line_followup"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setDraftTab(tab)}
                className={`px-3 py-1 text-xs font-medium rounded-lg ${draftTab === tab ? "bg-amber-100 text-amber-800" : "text-gray-500 hover:bg-gray-100"}`}
              >
                {tab === "email" ? "メール" : tab === "line_initial" ? "LINE初回" : "LINEフォロー"}
              </button>
            ))}
          </div>
          {currentDraft ? (
            <div className="relative">
              {currentDraft.subject && (
                <div className="mb-2">
                  <span className="text-xs text-gray-500">件名:</span>
                  <p className="text-sm font-medium text-gray-800">{currentDraft.subject}</p>
                </div>
              )}
              <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                {currentDraft.body}
              </pre>
              <button
                onClick={() => copyToClipboard([currentDraft.subject, currentDraft.body].filter(Boolean).join("\n\n"))}
                className="absolute top-2 right-2 p-1.5 hover:bg-gray-200 rounded-lg"
                title="コピー"
              >
                <Copy className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-400">このタブのドラフトはまだありません</p>
          )}
        </div>
      )}

      {/* Classifications */}
      {classifications.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">返信分類履歴</h4>
          <div className="space-y-3">
            {classifications.slice(0, 5).map((cl) => (
              <div key={cl.id} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-700">
                    {CLASSIFICATION_LABELS[cl.label] ?? cl.label}
                  </span>
                  {cl.confidence != null && (
                    <span className="text-xs text-gray-400">
                      確信度: {Math.round(cl.confidence * 100)}%
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 mb-1">{cl.rawReply}</p>
                {cl.suggestedNextAction && (
                  <p className="text-xs text-gray-600">
                    <span className="font-medium">次のアクション:</span> {cl.suggestedNextAction}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Links */}
      <div className="flex flex-wrap gap-2">
        {lead.websiteUrl && (
          <a href={lead.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <ExternalLink className="w-3 h-3" /> ウェブサイト
          </a>
        )}
        {lead.instagramUrl && (
          <a href={lead.instagramUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-pink-600 hover:underline">
            <ExternalLink className="w-3 h-3" /> Instagram
          </a>
        )}
        {lead.lineUrl && (
          <a href={lead.lineUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-green-600 hover:underline">
            <ExternalLink className="w-3 h-3" /> LINE
          </a>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function OwnerLeadsClient() {
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<{
    lead: SalesLead;
    drafts: LeadDraft[];
    classifications: LeadClassification[];
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [classifyLeadId, setClassifyLeadId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
  }, []);

  const loadLeads = useCallback(async () => {
    try {
      const res = await fetchLeads();
      setLeads(res.leads ?? []);
    } catch (e: any) {
      showToast(e.message ?? "リード取得に失敗しました", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const handleCreate = async (data: any) => {
    try {
      await createLead(data);
      showToast("リードを追加しました", "success");
      await loadLeads();
    } catch (e: any) {
      showToast(e.message ?? "リード追加に失敗しました", "error");
    }
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetailData(null);
      return;
    }
    setExpandedId(id);
    try {
      const res = await fetchLead(id);
      setDetailData({
        lead: res.lead,
        drafts: res.drafts,
        classifications: res.classifications,
      });
    } catch (e: any) {
      showToast(e.message ?? "詳細取得に失敗しました", "error");
    }
  };

  const handleAnalyze = async () => {
    if (!expandedId) return;
    setAnalyzing(true);
    try {
      await analyzeLeadApi(expandedId);
      showToast("AI採点が完了しました", "success");
      const res = await fetchLead(expandedId);
      setDetailData({ lead: res.lead, drafts: res.drafts, classifications: res.classifications });
      await loadLeads();
    } catch (e: any) {
      showToast(e.message ?? "AI採点に失敗しました", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerateDrafts = async () => {
    if (!expandedId) return;
    setGenerating(true);
    try {
      await generateDraftsApi(expandedId);
      showToast("営業文を生成しました", "success");
      const res = await fetchLead(expandedId);
      setDetailData({ lead: res.lead, drafts: res.drafts, classifications: res.classifications });
    } catch (e: any) {
      showToast(e.message ?? "営業文生成に失敗しました", "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleClassifyReply = async (id: string, rawReply: string) => {
    try {
      await classifyReplyApi(id, rawReply);
      showToast("返信を分類しました", "success");
      if (expandedId === id) {
        const res = await fetchLead(id);
        setDetailData({ lead: res.lead, drafts: res.drafts, classifications: res.classifications });
      }
    } catch (e: any) {
      showToast(e.message ?? "返信分類に失敗しました", "error");
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateLeadStatus(id, newStatus);
      showToast("ステータスを更新しました", "success");
      await loadLeads();
      if (expandedId === id && detailData) {
        setDetailData({ ...detailData, lead: { ...detailData.lead, status: newStatus } });
      }
    } catch (e: any) {
      showToast(e.message ?? "ステータス更新に失敗しました", "error");
    }
  };

  const filteredLeads = statusFilter ? leads.filter((l) => l.status === statusFilter) : leads;

  return (
    <div className="max-w-6xl mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">営業リード管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI採点・営業文生成・返信分類</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm"
        >
          <Plus className="w-4 h-4" />
          リード追加
        </button>
      </div>

      {/* Status Filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          onClick={() => setStatusFilter("")}
          className={`px-3 py-1 text-xs font-medium rounded-full ${!statusFilter ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          すべて ({leads.length})
        </button>
        {STATUSES.map((s) => {
          const count = leads.filter((l) => l.status === s.value).length;
          if (count === 0) return null;
          return (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full ${statusFilter === s.value ? "bg-gray-800 text-white" : `${s.color} hover:opacity-80`}`}
            >
              {s.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
        </div>
      )}

      {/* Empty state */}
      {!loading && leads.length === 0 && (
        <div className="text-center py-20 bg-white rounded-xl border">
          <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">まだリードがありません</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium"
          >
            最初のリードを追加
          </button>
        </div>
      )}

      {/* Lead Table */}
      {!loading && filteredLeads.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">店舗名</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">業種</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ステータス</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">スコア</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">次のアクション</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">更新日</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredLeads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    isExpanded={expandedId === lead.id}
                    detailData={expandedId === lead.id ? detailData : null}
                    onToggle={() => toggleExpand(lead.id)}
                    onStatusChange={(status) => handleStatusChange(lead.id, status)}
                    onAnalyze={handleAnalyze}
                    onGenerateDrafts={handleGenerateDrafts}
                    onClassifyReply={() => setClassifyLeadId(lead.id)}
                    analyzing={analyzing && expandedId === lead.id}
                    generating={generating && expandedId === lead.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateLeadModal onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />
      )}
      {classifyLeadId && (
        <ClassifyReplyModal
          leadId={classifyLeadId}
          onClose={() => setClassifyLeadId(null)}
          onClassify={handleClassifyReply}
        />
      )}
    </div>
  );
}

// ── Lead Row ────────────────────────────────────────────────────────────────

function LeadRow({
  lead,
  isExpanded,
  detailData,
  onToggle,
  onStatusChange,
  onAnalyze,
  onGenerateDrafts,
  onClassifyReply,
  analyzing,
  generating,
}: {
  lead: SalesLead;
  isExpanded: boolean;
  detailData: { lead: SalesLead; drafts: LeadDraft[]; classifications: LeadClassification[] } | null;
  onToggle: () => void;
  onStatusChange: (status: string) => void;
  onAnalyze: () => void;
  onGenerateDrafts: () => void;
  onClassifyReply: () => void;
  analyzing: boolean;
  generating: boolean;
}) {
  const updatedDate = lead.updatedAt
    ? new Date(lead.updatedAt).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })
    : "-";

  return (
    <>
      <tr className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? "bg-amber-50/50" : ""}`} onClick={onToggle}>
        <td className="px-4 py-3 text-sm font-medium text-gray-900">{lead.storeName}</td>
        <td className="px-4 py-3 text-sm text-gray-600">{industryLabel(lead.industry)}</td>
        <td className="px-4 py-3">
          <select
            value={lead.status}
            onChange={(e) => {
              e.stopPropagation();
              onStatusChange(e.target.value);
            }}
            onClick={(e) => e.stopPropagation()}
            className="text-xs border rounded-lg px-2 py-1 focus:ring-1 focus:ring-amber-500"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3">
          {lead.score != null ? (
            <span className={`text-sm font-semibold ${lead.score >= 70 ? "text-green-600" : lead.score >= 40 ? "text-amber-600" : "text-gray-400"}`}>
              {lead.score}
            </span>
          ) : (
            <span className="text-xs text-gray-400">-</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">{lead.nextAction ?? "-"}</td>
        <td className="px-4 py-3 text-xs text-gray-500">{updatedDate}</td>
        <td className="px-4 py-3 text-right">
          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 inline" /> : <ChevronDown className="w-4 h-4 text-gray-400 inline" />}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="px-4 py-4 bg-gray-50/80 border-t">
            {detailData ? (
              <LeadDetail
                lead={detailData.lead}
                drafts={detailData.drafts}
                classifications={detailData.classifications}
                onAnalyze={onAnalyze}
                onGenerateDrafts={onGenerateDrafts}
                onClassifyReply={onClassifyReply}
                analyzing={analyzing}
                generating={generating}
              />
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

