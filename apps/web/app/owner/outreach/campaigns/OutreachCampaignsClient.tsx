"use client";

import { useState, useEffect, useCallback } from "react";
import { useOwnerTenantId } from "@/src/lib/useOwnerTenantId";
import {
  fetchCampaigns,
  createCampaign,
  updateCampaign,
  fetchCampaignVariants,
  createCampaignVariant,
  fetchCampaignPreview,
  generateReviewItems,
  generateCampaignDraft,
  fetchOutreachSettings,
} from "@/app/lib/outreachApi";
import type {
  OutreachCampaign,
  OutreachCampaignVariant,
  CampaignPreview,
  CampaignStatus,
  CampaignDraftResult,
  OutreachSettings,
} from "@/src/types/outreach";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_COLORS,
} from "@/src/types/outreach";

// ── Step Guide ────────────────────────────────────────────────────────────
const STEPS = [
  { num: 1, label: "リード取込", desc: "ソース検索やCSVからリードを取込みます", link: "/owner/outreach/sources" },
  { num: 2, label: "キャンペーン作成", desc: "ニッチ・エリアを設定してキャンペーンを作成", link: null },
  { num: 3, label: "バリアント追加", desc: "ABテスト用のメッセージバリアントを追加", link: null },
  { num: 4, label: "レビュー&送信", desc: "生成したメッセージをレビューして送信", link: "/owner/outreach/review" },
];

function StepGuide({ campaignCount, hasVariants }: { campaignCount: number; hasVariants: boolean }) {
  const currentStep = campaignCount === 0 ? 1 : !hasVariants ? 3 : 4;
  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-4">
      <h3 className="text-sm font-semibold text-blue-800 mb-3">セールスの流れ</h3>
      <div className="flex gap-2">
        {STEPS.map((s) => {
          const done = s.num < currentStep;
          const active = s.num === currentStep;
          return (
            <div key={s.num} className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
                  ${done ? "bg-green-500 text-white" : active ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}>
                  {done ? "\u2713" : s.num}
                </span>
                <span className={`text-xs font-medium truncate ${active ? "text-blue-700" : "text-gray-500"}`}>{s.label}</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-tight">{s.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Quick Start ───────────────────────────────────────────────────────────
function QuickStartCard({ onStartDraft }: { onStartDraft: () => void }) {
  return (
    <div className="border-2 border-dashed border-amber-300 rounded-xl p-6 text-center space-y-3 bg-amber-50/50">
      <div className="text-3xl">&#x1F680;</div>
      <h3 className="text-base font-semibold text-gray-800">かんたん開始</h3>
      <p className="text-sm text-gray-500 max-w-md mx-auto">
        ニッチとエリアを入力するだけで、AIがキャンペーン・バリアント・メッセージを自動生成します。
      </p>
      <button
        onClick={onStartDraft}
        className="px-6 py-2.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium"
      >
        AI自動生成で始める
      </button>
      <p className="text-[10px] text-gray-400">リードが0件の場合は先にソース検索からリードを取込んでください</p>
    </div>
  );
}

// ── Readiness Panel ───────────────────────────────────────────────────────
function ReadinessPanel({
  campaign, variants, preview, settings,
}: {
  campaign: OutreachCampaign;
  variants: OutreachCampaignVariant[];
  preview: CampaignPreview | null;
  settings: OutreachSettings | null;
}) {
  // Detect if any variant uses {{lp_url}}
  const usesLpToken = variants.some(
    (v) =>
      (v.subject_template ?? "").includes("{{lp_url}}") ||
      (v.opener_template ?? "").includes("{{lp_url}}") ||
      (v.cta_template ?? "").includes("{{lp_url}}")
  );
  const lpUrlResolved = !!(campaign.landing_page_url || settings?.defaultLpUrl);
  // If {{lp_url}} is used but LP URL is not resolved, send is blocked
  const lpBlocked = usesLpToken && !lpUrlResolved;

  type Check = { ok: boolean; label: string; warn?: boolean; blocked?: boolean };
  const checks: Check[] = [
    { ok: variants.length > 0, label: "バリアントが1つ以上ある" },
    { ok: (preview?.matchingLeads ?? 0) > 0, label: "対象リードが1件以上ある" },
  ];

  if (usesLpToken) {
    checks.push({
      ok: lpUrlResolved,
      label: lpUrlResolved
        ? `LP URL 解決済み（${campaign.landing_page_url ? "キャンペーン設定" : "デフォルト設定"}）`
        : "LP URL 未設定 — {{lp_url}} を使用中のため送信不可",
      blocked: !lpUrlResolved,
    });
  } else {
    checks.push({
      ok: lpUrlResolved,
      label: "LP URLが設定済み（{{lp_url}} 未使用のため任意）",
      warn: true,
    });
  }

  const requiredFailed = checks.some(c => !c.ok && !c.warn);
  const allOk = !requiredFailed;

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${
      lpBlocked ? "border-red-200 bg-red-50/50" :
      allOk ? "border-green-200 bg-green-50/50" :
      "border-amber-200 bg-amber-50/50"
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">送信準備チェック</span>
        {lpBlocked && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">送信不可</span>
        )}
        {!lpBlocked && allOk && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">送信可能</span>
        )}
      </div>
      {checks.map((c, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className={c.ok ? "text-green-600" : c.blocked ? "text-red-600" : c.warn ? "text-amber-500" : "text-red-500"}>
            {c.ok ? "\u2713" : c.blocked ? "\u26D4" : c.warn ? "!" : "\u2717"}
          </span>
          <span className={c.ok ? "text-gray-600" : c.blocked ? "text-red-700 font-medium" : "text-gray-800"}>{c.label}</span>
        </div>
      ))}
      <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-100">
        LP URL 解決優先順位: 1. キャンペーンLP URL → 2. 設定ページのデフォルトLP URL
      </p>
    </div>
  );
}

export default function OutreachCampaignsClient() {
  const { tenantId, loading: tenantLoading } = useOwnerTenantId();
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [settings, setSettings] = useState<OutreachSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNiche, setNewNiche] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newMinScore, setNewMinScore] = useState("");
  const [newLpUrl, setNewLpUrl] = useState("");

  // Detail view
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variants, setVariants] = useState<OutreachCampaignVariant[]>([]);
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [generating, setGenerating] = useState(false);

  // AI Draft Generator
  const [showDraftGen, setShowDraftGen] = useState(false);
  const [draftNiche, setDraftNiche] = useState("");
  const [draftArea, setDraftArea] = useState("");
  const [draftMinScore, setDraftMinScore] = useState("");
  const [draftTone, setDraftTone] = useState<"" | "formal" | "friendly" | "casual">("");
  const [draftGenerating, setDraftGenerating] = useState(false);
  const [draftResult, setDraftResult] = useState<CampaignDraftResult | null>(null);

  // Variant form
  const [variantKey, setVariantKey] = useState("A");
  const [variantSubject, setVariantSubject] = useState("");
  const [variantOpener, setVariantOpener] = useState("");
  const [variantCta, setVariantCta] = useState("");
  const [variantTone, setVariantTone] = useState("friendly");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        fetchCampaigns(tenantId),
        fetchOutreachSettings(tenantId),
      ]);
      setCampaigns(c);
      setSettings(s);
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "読み込み失敗" });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createCampaign(tenantId, {
        name: newName.trim(),
        niche: newNiche || undefined,
        area: newArea || undefined,
        min_score: newMinScore ? parseInt(newMinScore, 10) : undefined,
        landing_page_url: newLpUrl || undefined,
      });
      setShowCreate(false);
      setNewName("");
      setNewNiche("");
      setNewArea("");
      setNewMinScore("");
      setNewLpUrl("");
      setToast({ type: "success", text: "キャンペーンを作成しました" });
      load();
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "作成失敗" });
    }
  };

  const loadDetail = async (id: string) => {
    setSelectedId(id);
    try {
      const [v, p] = await Promise.all([
        fetchCampaignVariants(tenantId, id),
        fetchCampaignPreview(tenantId, id),
      ]);
      setVariants(v);
      setPreview(p);
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "詳細読み込み失敗" });
    }
  };

  const handleAddVariant = async () => {
    if (!selectedId || !variantKey.trim()) return;
    try {
      await createCampaignVariant(tenantId, selectedId, {
        variant_key: variantKey.trim(),
        subject_template: variantSubject || undefined,
        opener_template: variantOpener || undefined,
        cta_template: variantCta || undefined,
        tone: variantTone,
      });
      setVariantKey(String.fromCharCode(65 + variants.length + 1));
      setVariantSubject("");
      setVariantOpener("");
      setVariantCta("");
      setToast({ type: "success", text: "バリアントを追加しました" });
      loadDetail(selectedId);
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "バリアント追加失敗" });
    }
  };

  const handleGenerate = async () => {
    if (!selectedId) return;
    setGenerating(true);
    try {
      const result = await generateReviewItems(tenantId, selectedId);
      setToast({
        type: "success",
        text: `レビューキューに ${result.generated} 件生成しました (重複スキップ: ${result.skippedDup}, 配信停止: ${result.skippedUnsub})`,
      });
      load();
      loadDetail(selectedId);
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "生成失敗" });
    } finally {
      setGenerating(false);
    }
  };

  const handleDraftGenerate = async () => {
    if (!draftNiche.trim()) return;
    setDraftGenerating(true);
    setDraftResult(null);
    try {
      const result = await generateCampaignDraft(tenantId, {
        niche: draftNiche.trim(),
        area: draftArea || undefined,
        min_score: draftMinScore ? parseInt(draftMinScore, 10) : undefined,
        tone: (draftTone || undefined) as any,
        auto_variants: true,
      });
      setDraftResult(result);
      setToast({
        type: "success",
        text: `キャンペーン「${result.campaign.name}」を自動生成しました (${result.variants.length}バリアント, ${result.matchingLeads}件の対象リード)`,
      });
      load();
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "AI生成に失敗しました" });
    } finally {
      setDraftGenerating(false);
    }
  };

  const handleStatusChange = async (id: string, status: CampaignStatus) => {
    try {
      await updateCampaign(tenantId, id, { status });
      load();
      if (selectedId === id) loadDetail(id);
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "ステータス変更失敗" });
    }
  };

  const handleLpUrlSave = async (campaignId: string, url: string) => {
    try {
      await updateCampaign(tenantId, campaignId, { landing_page_url: url || null } as any);
      setToast({ type: "success", text: "LP URLを保存しました" });
      load();
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "LP URL保存失敗" });
    }
  };

  if (!tenantId || tenantLoading) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  const selectedCampaign = campaigns.find((c) => c.id === selectedId);
  const hasAnyVariants = variants.length > 0;

  return (
    <>
      <div className="px-6 space-y-6">
        {toast && (
          <div className={`px-3 py-2 rounded text-sm ${
            toast.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}>
            {toast.text}
            <button onClick={() => setToast(null)} className="ml-2">&times;</button>
          </div>
        )}

        {/* Step guide */}
        {!loading && (
          <StepGuide campaignCount={campaigns.length} hasVariants={hasAnyVariants || campaigns.length === 0} />
        )}

        {/* Campaign list header */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">キャンペーン一覧</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDraftGen(true)}
              className="px-4 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600"
            >
              AI自動生成
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              新規作成
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500 py-8 text-center">読み込み中...</div>
        ) : campaigns.length === 0 ? (
          /* Empty state with quick start */
          <QuickStartCard onStartDraft={() => setShowDraftGen(true)} />
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div
                key={c.id}
                onClick={() => loadDetail(c.id)}
                className={`border rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedId === c.id ? "border-blue-300 bg-blue-50/30" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-sm">{c.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${CAMPAIGN_STATUS_COLORS[c.status]}`}>
                      {CAMPAIGN_STATUS_LABELS[c.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {c.niche && <span>{c.niche}</span>}
                    {c.area && <span>{c.area}</span>}
                    {c.min_score != null && <span>スコア{c.min_score}+</span>}
                    {c.landing_page_url && <span className="text-blue-400">LP設定済</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detail panel */}
        {selectedId && selectedCampaign && (
          <div className="border rounded-xl p-5 space-y-5 bg-white">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{selectedCampaign.name}</h3>
              <div className="flex gap-2">
                {selectedCampaign.status !== "archived" && (
                  <select
                    value={selectedCampaign.status}
                    onChange={(e) => handleStatusChange(selectedId, e.target.value as CampaignStatus)}
                    className="text-xs border rounded-lg px-2 py-1"
                  >
                    <option value="draft">下書き</option>
                    <option value="ready">準備完了</option>
                    <option value="running">実行中</option>
                    <option value="paused">一時停止</option>
                    <option value="archived">アーカイブ</option>
                  </select>
                )}
              </div>
            </div>

            {/* Readiness panel */}
            <ReadinessPanel campaign={selectedCampaign} variants={variants} preview={preview} settings={settings} />

            {/* Preview stats */}
            {preview && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-semibold text-blue-700">{preview.matchingLeads}</div>
                  <div className="text-xs text-gray-500">対象リード</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-semibold text-gray-600">{preview.unsubscribedExcluded}</div>
                  <div className="text-xs text-gray-500">配信停止除外</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-semibold text-purple-700">{preview.variants.length}</div>
                  <div className="text-xs text-gray-500">バリアント</div>
                </div>
              </div>
            )}

            {/* LP URL for this campaign */}
            <CampaignLpUrl
              campaign={selectedCampaign}
              defaultLpUrl={settings?.defaultLpUrl || ""}
              onSave={(url) => handleLpUrlSave(selectedId, url)}
            />

            {/* Variants */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">ABテストバリアント</h4>
              {variants.length === 0 ? (
                <div className="text-xs text-gray-400">バリアントがありません。追加してください。</div>
              ) : (
                <div className="space-y-2">
                  {variants.map((v) => (
                    <div key={v.id} className="border rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                          {v.variant_key}
                        </span>
                        <span className="text-xs text-gray-400">{v.tone}</span>
                        {!v.is_active && <span className="text-xs text-red-400">無効</span>}
                      </div>
                      {v.subject_template && (
                        <div className="text-xs text-gray-500">件名: {v.subject_template}</div>
                      )}
                      {v.cta_template && (
                        <div className="text-xs text-gray-500">CTA: {v.cta_template}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add variant form */}
              <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="text-xs font-medium text-gray-600">バリアント追加</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">キー</label>
                    <input
                      value={variantKey}
                      onChange={(e) => setVariantKey(e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                      placeholder="A"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">トーン</label>
                    <select
                      value={variantTone}
                      onChange={(e) => setVariantTone(e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                    >
                      <option value="friendly">フレンドリー</option>
                      <option value="formal">フォーマル</option>
                      <option value="casual">カジュアル</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">
                    件名テンプレート (任意, {"{store_name}"} {"{{lp_url}}"} 使用可)
                  </label>
                  <input
                    value={variantSubject}
                    onChange={(e) => setVariantSubject(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                    placeholder="{store_name}様へのご提案"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">CTAテンプレート (任意, {"{{lp_url}}"} でLP自動挿入)</label>
                  <input
                    value={variantCta}
                    onChange={(e) => setVariantCta(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                    placeholder="詳細はこちら: {{lp_url}}"
                  />
                </div>
                <button
                  onClick={handleAddVariant}
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  追加
                </button>
              </div>
            </div>

            {/* Generate button */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={handleGenerate}
                disabled={generating || variants.length === 0}
                className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {generating ? "生成中..." : "レビューキューに生成"}
              </button>
            </div>

            {/* Sample leads */}
            {preview && preview.sampleLeads.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-600 mb-2">対象リードサンプル (最大50件)</h4>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b">
                        <th className="py-1.5 px-2 text-left">店舗名</th>
                        <th className="py-1.5 px-2 text-left">エリア</th>
                        <th className="py-1.5 px-2 text-left">カテゴリ</th>
                        <th className="py-1.5 px-2 text-right">スコア</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sampleLeads.map((l: any) => (
                        <tr key={l.id} className="border-b last:border-0">
                          <td className="py-1.5 px-2">{l.store_name}</td>
                          <td className="py-1.5 px-2 text-gray-500">{l.area ?? "-"}</td>
                          <td className="py-1.5 px-2 text-gray-500">{l.category ?? "-"}</td>
                          <td className="py-1.5 px-2 text-right">{l.score ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
              <h3 className="text-lg font-semibold">キャンペーン作成</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">キャンペーン名 *</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1"
                    placeholder="例: 渋谷エリア美容院向け"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">ニッチ/カテゴリ</label>
                    <input
                      value={newNiche}
                      onChange={(e) => setNewNiche(e.target.value)}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1"
                      placeholder="美容院"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">エリア</label>
                    <input
                      value={newArea}
                      onChange={(e) => setNewArea(e.target.value)}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1"
                      placeholder="渋谷"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">最低スコア</label>
                  <input
                    type="number"
                    value={newMinScore}
                    onChange={(e) => setNewMinScore(e.target.value)}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1"
                    placeholder="40"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">LP URL (任意 — メッセージ内の {"{{lp_url}}"} を置換)</label>
                  <input
                    value={newLpUrl}
                    onChange={(e) => setNewLpUrl(e.target.value)}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1"
                    placeholder="https://example.com/lp"
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
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  作成
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI Draft Generator modal */}
        {showDraftGen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl p-6 max-w-lg w-full shadow-xl space-y-4">
              <h3 className="text-lg font-semibold">AI キャンペーン自動生成</h3>
              <p className="text-xs text-gray-500">
                学習データとニッチテンプレートを活用して、最適なキャンペーンとバリアントを自動生成します。
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">ニッチ/カテゴリ *</label>
                  <input
                    value={draftNiche}
                    onChange={(e) => setDraftNiche(e.target.value)}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1"
                    placeholder="例: 美容院、整体院、ネイルサロン"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">エリア</label>
                    <input
                      value={draftArea}
                      onChange={(e) => setDraftArea(e.target.value)}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1"
                      placeholder="渋谷"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">最低スコア</label>
                    <input
                      type="number"
                      value={draftMinScore}
                      onChange={(e) => setDraftMinScore(e.target.value)}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1"
                      placeholder="40"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">トーン (空欄で学習データから自動選択)</label>
                  <select
                    value={draftTone}
                    onChange={(e) => setDraftTone(e.target.value as any)}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1"
                  >
                    <option value="">自動選択</option>
                    <option value="friendly">フレンドリー</option>
                    <option value="formal">フォーマル</option>
                    <option value="casual">カジュアル</option>
                  </select>
                </div>
              </div>

              {/* Draft result */}
              {draftResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                  <div className="text-sm font-medium text-green-700">生成完了</div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>キャンペーン: <strong>{draftResult.campaign.name}</strong></div>
                    <div>バリアント数: {draftResult.variants.length}</div>
                    <div>対象リード: {draftResult.matchingLeads}件</div>
                    {draftResult.learningContext.topTone && (
                      <div>勝ちトーン: {draftResult.learningContext.topTone}</div>
                    )}
                    {draftResult.learningContext.topHypothesis && (
                      <div>勝ち課題: {draftResult.learningContext.topHypothesis}</div>
                    )}
                    {draftResult.learningContext.nicheTemplate && (
                      <div>テンプレート: {draftResult.learningContext.nicheTemplate}</div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowDraftGen(false); setDraftResult(null); }}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  {draftResult ? "閉じる" : "キャンセル"}
                </button>
                {!draftResult && (
                  <button
                    onClick={handleDraftGenerate}
                    disabled={draftGenerating || !draftNiche.trim()}
                    className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                  >
                    {draftGenerating ? "生成中..." : "自動生成"}
                  </button>
                )}
                {draftResult && (
                  <button
                    onClick={() => {
                      loadDetail(draftResult.campaign.id);
                      setShowDraftGen(false);
                      setDraftResult(null);
                    }}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    詳細を見る
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Campaign LP URL inline editor ────────────────────────────────────────
function CampaignLpUrl({
  campaign,
  defaultLpUrl,
  onSave,
}: {
  campaign: OutreachCampaign;
  defaultLpUrl: string;
  onSave: (url: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(campaign.landing_page_url || "");
  const effectiveUrl = campaign.landing_page_url || defaultLpUrl;
  const source = campaign.landing_page_url ? "キャンペーン設定" : defaultLpUrl ? "デフォルト設定" : null;

  return (
    <div className="border rounded-lg p-3 space-y-1.5 bg-gray-50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">LP URL（メッセージ内 {"{{lp_url}}"} の展開先）</span>
        <button onClick={() => setEditing(!editing)} className="text-xs text-blue-600 hover:underline">
          {editing ? "閉じる" : "編集"}
        </button>
      </div>
      {editing ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 border rounded px-2 py-1 text-sm"
              placeholder={defaultLpUrl || "https://example.com/lp"}
            />
            <button
              onClick={() => { onSave(url); setEditing(false); }}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              保存
            </button>
          </div>
          {defaultLpUrl && (
            <p className="text-[10px] text-gray-400">空にするとデフォルトLP URL ({defaultLpUrl}) が使われます</p>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-500 space-y-1">
          {effectiveUrl ? (
            <div className="flex items-center gap-1.5">
              <span className="text-green-600">{"\u2713"}</span>
              <span>{effectiveUrl}</span>
              <span className="text-gray-400">({source})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-amber-500">!</span>
              <span className="text-gray-500">未設定 — {"{{lp_url}}"} を使用するバリアントがある場合、送信がブロックされます</span>
            </div>
          )}
        </div>
      )}
      <p className="text-[10px] text-gray-400">解決優先順位: 1. このキャンペーンのLP URL → 2. 設定ページのデフォルトLP URL</p>
    </div>
  );
}
