"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchOutreachLeads,
  createOutreachLead,
  updateOutreachLead,
  scoreOutreachLead,
  rescoreOutreachLead,
  analyzeOutreachLead,
  generateMessage,
  fetchLeadDetail,
  type CreateLeadInput,
} from "@/app/lib/outreachApi";
import type {
  OutreachLead,
  PipelineStage,
  ScoreResult,
  GeneratedMessageResult,
  OutreachLeadFeatureRow,
  OutreachPainHypothesisRow,
  AnalyzeResult,
} from "@/src/types/outreach";
import {
  PIPELINE_LABELS,
  PIPELINE_COLORS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  FEATURE_LABELS,
} from "@/src/types/outreach";

// ── Score badge ────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-gray-400">未算出</span>;
  const color =
    score >= 70 ? "bg-green-100 text-green-700" :
    score >= 40 ? "bg-yellow-100 text-yellow-700" :
    "bg-red-100 text-red-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {score}点
    </span>
  );
}

function StageBadge({ stage }: { stage: PipelineStage }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PIPELINE_COLORS[stage]}`}>
      {PIPELINE_LABELS[stage]}
    </span>
  );
}

// ── Feature display ────────────────────────────────────────────────────────

function FeatureCheckItem({ label, value }: { label: string; value: boolean | number }) {
  const isBoolean = typeof value === "boolean" || (typeof value === "number" && (value === 0 || value === 1));
  const boolVal = typeof value === "boolean" ? value : value === 1;

  if (isBoolean) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <span className={boolVal ? "text-green-600" : "text-gray-400"}>
          {boolVal ? "●" : "○"}
        </span>
        <span className={boolVal ? "text-gray-700" : "text-gray-400"}>{label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-blue-600 font-medium">{value}</span>
      <span className="text-gray-600">{label}</span>
    </div>
  );
}

function FeaturesPanel({ features }: { features: OutreachLeadFeatureRow }) {
  const boolFeatures: Array<[string, number]> = [
    ["ウェブサイト", features.has_website],
    ["Instagram", features.has_instagram],
    ["LINE", features.has_line_link],
    ["予約リンク", features.has_booking_link],
    ["メール検出", features.contact_email_found],
    ["電話番号検出", features.phone_found],
    ["料金情報", features.price_info_found],
    ["ページタイトル", features.title_found],
    ["メタ説明", features.meta_description_found],
  ];

  const numFeatures: Array<[string, number]> = [
    ["メニュー数推定", features.menu_count_guess],
    ["予約CTA数", features.booking_cta_count],
    ["CTA深さ推定", features.booking_cta_depth_guess],
  ];

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">サイト解析結果</span>
        <span className="text-xs text-gray-400">
          {new Date(features.analyzed_at).toLocaleDateString("ja-JP")}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {boolFeatures.map(([label, val]) => (
          <FeatureCheckItem key={label} label={label} value={val} />
        ))}
      </div>
      <div className="flex gap-4 pt-1 border-t border-gray-200">
        {numFeatures.map(([label, val]) => (
          <FeatureCheckItem key={label} label={label} value={val} />
        ))}
      </div>
    </div>
  );
}

// ── Pain hypothesis badges ─────────────────────────────────────────────────

function PainHypothesisBadges({ hypotheses }: { hypotheses: OutreachPainHypothesisRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (hypotheses.length === 0) return null;

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-gray-700">課題仮説</span>
      <div className="space-y-1.5">
        {hypotheses.map((h) => (
          <div key={h.id}>
            <button
              onClick={() => setExpanded(expanded === h.id ? null : h.id)}
              className="w-full text-left"
            >
              <div className="flex items-start gap-2">
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${
                    SEVERITY_COLORS[h.severity] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {SEVERITY_LABELS[h.severity] ?? h.severity}
                </span>
                <span className="text-xs text-gray-700">{h.label}</span>
              </div>
            </button>
            {expanded === h.id && (
              <div className="ml-12 mt-1 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                {h.reason}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Score breakdown component ──────────────────────────────────────────────

const SCORE_LABELS: Record<string, string> = {
  reviewCount: "レビュー数",
  rating: "評価",
  hasWebsite: "ウェブサイト",
  hasInstagram: "Instagram",
  hasBookingLink: "予約リンク",
  hasLineLink: "LINE",
  contactability: "連絡手段",
  nicheFit: "ニッチ適合",
  painDepth: "課題深度",
  conversionReadiness: "転換準備度",
};

function ScoreBreakdownPanel({ components }: { components: Record<string, number> }) {
  return (
    <div className="text-xs bg-gray-50 p-3 rounded-lg space-y-1">
      <div className="font-medium text-gray-700">スコア内訳:</div>
      {Object.entries(components).map(([k, v]) => (
        <div key={k} className="flex justify-between">
          <span className="text-gray-600">{SCORE_LABELS[k] ?? k}</span>
          <span className="font-medium">{(v * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Create modal ───────────────────────────────────────────────────────────

function CreateLeadModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: CreateLeadInput) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateLeadInput>({ store_name: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.store_name.trim()) return;
    setSaving(true);
    try {
      await onCreate(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof CreateLeadInput, val: any) =>
    setForm((p) => ({ ...p, [key]: val }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-lg font-semibold">リード追加</h2>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">店舗名 *</span>
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={form.store_name}
            onChange={(e) => set("store_name", e.target.value)}
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">カテゴリ</span>
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={form.category ?? ""}
              onChange={(e) => set("category", e.target.value)}
              placeholder="例: 美容室"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">エリア</span>
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={form.area ?? ""}
              onChange={(e) => set("area", e.target.value)}
              placeholder="例: 表参道"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">ウェブサイトURL</span>
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={form.website_url ?? ""}
            onChange={(e) => set("website_url", e.target.value)}
            placeholder="https://..."
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Instagram URL</span>
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={form.instagram_url ?? ""}
              onChange={(e) => set("instagram_url", e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">LINE URL</span>
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={form.line_url ?? ""}
              onChange={(e) => set("line_url", e.target.value)}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">メールアドレス</span>
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={form.contact_email ?? ""}
              onChange={(e) => set("contact_email", e.target.value)}
              type="email"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">業種</span>
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={form.industry ?? ""}
              onChange={(e) => set("industry", e.target.value)}
              placeholder="例: beauty"
            />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">評価</span>
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={form.rating ?? ""}
              onChange={(e) => set("rating", e.target.value ? Number(e.target.value) : undefined)}
              type="number"
              step="0.1"
              min="1"
              max="5"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">レビュー数</span>
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={form.review_count ?? ""}
              onChange={(e) => set("review_count", e.target.value ? Number(e.target.value) : undefined)}
              type="number"
              min="0"
            />
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              checked={!!form.has_booking_link}
              onChange={(e) => set("has_booking_link", e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700">予約リンクあり</span>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">メモ</span>
          <textarea
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
          />
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={saving || !form.store_name.trim()}
            className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
          >
            {saving ? "保存中..." : "追加"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Lead detail drawer ─────────────────────────────────────────────────────

function LeadDrawer({
  lead,
  tenantId,
  onClose,
  onUpdated,
}: {
  lead: OutreachLead;
  tenantId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [genResult, setGenResult] = useState<GeneratedMessageResult | null>(null);
  const [features, setFeatures] = useState<OutreachLeadFeatureRow | null>(null);
  const [hypotheses, setHypotheses] = useState<OutreachPainHypothesisRow[]>([]);
  const [toast, setToast] = useState("");

  // Load detail (features + hypotheses) on open
  useEffect(() => {
    setLoadingDetail(true);
    fetchLeadDetail(tenantId, lead.id)
      .then((detail) => {
        setFeatures(detail.features);
        setHypotheses(detail.hypotheses);
      })
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }, [tenantId, lead.id]);

  const handleAnalyze = async () => {
    if (!lead.website_url) {
      setToast("ウェブサイトURLが未設定です");
      return;
    }
    setAnalyzing(true);
    setToast("");
    try {
      const result = await analyzeOutreachLead(tenantId, lead.id);
      setFeatures(result.features);
      setHypotheses(result.hypotheses);
      setScoreResult(result.score);
      setToast("サイト解析が完了しました");
      onUpdated();
    } catch (err: any) {
      setToast(err.message || "サイト解析に失敗しました");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRescore = async () => {
    setScoring(true);
    try {
      const result = await rescoreOutreachLead(tenantId, lead.id);
      setScoreResult(result);
      setToast(result.hasFeatures ? "V2スコアを再算出しました" : "V1スコアを再算出しました");
      onUpdated();
    } catch (err: any) {
      setToast(err.message || "スコア算出に失敗");
    } finally {
      setScoring(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateMessage(tenantId, lead.id, { tone: "friendly" });
      setGenResult(result);
      setToast("文面を生成しました（レビューキューに追加済み）");
    } catch (err: any) {
      setToast(err.message || "文面生成に失敗");
    } finally {
      setGenerating(false);
    }
  };

  const handleStageChange = async (stage: PipelineStage) => {
    try {
      await updateOutreachLead(tenantId, lead.id, { pipeline_stage: stage });
      onUpdated();
    } catch (err: any) {
      setToast(err.message || "ステージ変更に失敗");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-end z-50">
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{lead.store_name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {toast && (
          <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded text-sm">
            {toast}
            <button onClick={() => setToast("")} className="ml-2">&times;</button>
          </div>
        )}

        {/* Basic info */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-gray-500">カテゴリ:</span> {lead.category || "—"}</div>
          <div><span className="text-gray-500">エリア:</span> {lead.area || lead.region || "—"}</div>
          <div><span className="text-gray-500">評価:</span> {lead.rating != null ? `${lead.rating}★` : "—"}</div>
          <div><span className="text-gray-500">レビュー:</span> {lead.review_count}件</div>
          <div><span className="text-gray-500">スコア:</span> <ScoreBadge score={scoreResult?.score ?? lead.score} /></div>
          <div><span className="text-gray-500">ステージ:</span> <StageBadge stage={lead.pipeline_stage} /></div>
        </div>

        {/* Links */}
        <div className="space-y-1 text-sm">
          {lead.website_url && (
            <div><span className="text-gray-500">Web:</span>{" "}
              <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline truncate">{lead.website_url}</a>
            </div>
          )}
          {lead.instagram_url && (
            <div><span className="text-gray-500">Instagram:</span>{" "}
              <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{lead.instagram_url}</a>
            </div>
          )}
          {lead.contact_email && (
            <div><span className="text-gray-500">Email:</span> {lead.contact_email}</div>
          )}
        </div>

        {lead.notes && (
          <div className="text-sm"><span className="text-gray-500">メモ:</span> {lead.notes}</div>
        )}

        {/* Phase 2: Features display */}
        {loadingDetail ? (
          <div className="text-xs text-gray-400 py-2">解析データ読み込み中...</div>
        ) : (
          <>
            {features && <FeaturesPanel features={features} />}
            {hypotheses.length > 0 && <PainHypothesisBadges hypotheses={hypotheses} />}
          </>
        )}

        {/* Actions */}
        <div className="space-y-3 pt-2">
          {/* Phase 2: Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !lead.website_url}
            className="w-full py-2 text-sm bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg disabled:opacity-50"
          >
            {analyzing ? "解析中..." : features ? "サイト再解析" : "サイト解析"}
          </button>

          <button
            onClick={handleRescore}
            disabled={scoring}
            className="w-full py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
          >
            {scoring ? "算出中..." : features ? "V2スコア再算出" : "スコア再算出"}
          </button>

          {scoreResult && <ScoreBreakdownPanel components={scoreResult.components} />}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full py-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg disabled:opacity-50"
          >
            {generating ? "生成中..." : "AI文面を生成"}
          </button>

          {genResult && (
            <div className="text-sm bg-blue-50 p-3 rounded-lg space-y-2">
              <div className="font-medium">{genResult.generated.subject}</div>
              <div className="whitespace-pre-wrap text-gray-700 text-xs">
                {genResult.generated.opener}
                {"\n\n"}
                {genResult.generated.body}
                {"\n\n"}
                {genResult.generated.cta}
              </div>
              {genResult.generated.reasoningSummary && (
                <div className="text-xs text-gray-500 border-t pt-2 mt-2">
                  推論: {genResult.generated.reasoningSummary}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pipeline stage change */}
        <div className="pt-2">
          <div className="text-sm font-medium text-gray-700 mb-2">ステージ変更</div>
          <div className="flex flex-wrap gap-1.5">
            {(["new", "approved", "contacted", "replied", "meeting", "customer", "lost"] as PipelineStage[]).map(
              (stage) => (
                <button
                  key={stage}
                  onClick={() => handleStageChange(stage)}
                  className={`px-2 py-1 text-xs rounded-full border ${
                    lead.pipeline_stage === stage
                      ? "border-blue-500 bg-blue-50 font-medium"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {PIPELINE_LABELS[stage]}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function OutreachLeadsClient() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId") ?? "";
  const [leads, setLeads] = useState<OutreachLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);
  const [sortBy, setSortBy] = useState("score");
  const [filterStage, setFilterStage] = useState<string>("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await fetchOutreachLeads(tenantId, {
        sort: sortBy,
        order: "desc",
        pipeline_stage: filterStage || undefined,
        limit: 100,
      });
      setLeads(data.leads);
      setTotal(data.total);
    } catch (err: any) {
      setToast(err.message || "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [tenantId, sortBy, filterStage]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (input: CreateLeadInput) => {
    await createOutreachLead(tenantId, input);
    setToast("リードを追加しました");
    load();
  };

  if (!tenantId) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  return (
    <>
      <div className="px-6 space-y-4">
        {toast && (
          <div className="bg-green-50 text-green-700 px-3 py-2 rounded text-sm">
            {toast}
            <button onClick={() => setToast("")} className="ml-2 text-green-500">&times;</button>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 flex-wrap items-center">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
          >
            <option value="score">スコア順</option>
            <option value="created_at">作成日順</option>
            <option value="rating">評価順</option>
            <option value="review_count">レビュー数順</option>
            <option value="store_name">名前順</option>
          </select>

          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
          >
            <option value="">全ステージ</option>
            {(["new", "approved", "contacted", "replied", "meeting", "customer", "lost"] as const).map(
              (s) => (
                <option key={s} value={s}>{PIPELINE_LABELS[s]}</option>
              )
            )}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-sm text-gray-500 py-8 text-center">読み込み中...</div>
        ) : leads.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center">
            リードがありません。「リード追加」から始めましょう。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4">店舗名</th>
                  <th className="py-2 pr-4">カテゴリ</th>
                  <th className="py-2 pr-4">エリア</th>
                  <th className="py-2 pr-4">評価</th>
                  <th className="py-2 pr-4">スコア</th>
                  <th className="py-2 pr-4">ステージ</th>
                  <th className="py-2 pr-4">連絡先</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="py-2.5 pr-4 font-medium">{lead.store_name}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{lead.category || lead.industry || "—"}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{lead.area || lead.region || "—"}</td>
                    <td className="py-2.5 pr-4">
                      {lead.rating != null ? `${lead.rating}★ (${lead.review_count})` : "—"}
                    </td>
                    <td className="py-2.5 pr-4">
                      <ScoreBadge score={lead.score} />
                    </td>
                    <td className="py-2.5 pr-4">
                      <StageBadge stage={lead.pipeline_stage} />
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500">
                      {[
                        lead.contact_email ? "Email" : null,
                        lead.website_url ? "Web" : null,
                        lead.line_url ? "LINE" : null,
                        lead.instagram_url ? "IG" : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateLeadModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}

      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          tenantId={tenantId}
          onClose={() => setSelectedLead(null)}
          onUpdated={() => {
            load();
            setSelectedLead(null);
          }}
        />
      )}
    </>
  );
}
