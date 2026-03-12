"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchCampaigns,
  createCampaign,
  updateCampaign,
  fetchCampaignVariants,
  createCampaignVariant,
  fetchCampaignPreview,
  generateReviewItems,
} from "@/app/lib/outreachApi";
import type {
  OutreachCampaign,
  OutreachCampaignVariant,
  CampaignPreview,
  CampaignStatus,
} from "@/src/types/outreach";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_COLORS,
} from "@/src/types/outreach";

export default function OutreachCampaignsClient() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId") ?? "";
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNiche, setNewNiche] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newMinScore, setNewMinScore] = useState("");

  // Detail view
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variants, setVariants] = useState<OutreachCampaignVariant[]>([]);
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [generating, setGenerating] = useState(false);

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
      setCampaigns(await fetchCampaigns(tenantId));
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
      });
      setShowCreate(false);
      setNewName("");
      setNewNiche("");
      setNewArea("");
      setNewMinScore("");
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
      setVariantKey(String.fromCharCode(65 + variants.length + 1)); // Next letter
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

  const handleStatusChange = async (id: string, status: CampaignStatus) => {
    try {
      await updateCampaign(tenantId, id, { status });
      load();
      if (selectedId === id) loadDetail(id);
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "ステータス変更失敗" });
    }
  };

  if (!tenantId) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  const selectedCampaign = campaigns.find((c) => c.id === selectedId);

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

        {/* Campaign list */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">キャンペーン一覧</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            新規作成
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500 py-8 text-center">読み込み中...</div>
        ) : campaigns.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center">キャンペーンがありません</div>
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
                      <option value="friendly">friendly</option>
                      <option value="formal">formal</option>
                      <option value="casual">casual</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">件名テンプレート (任意, {"{store_name}"} 使用可)</label>
                  <input
                    value={variantSubject}
                    onChange={(e) => setVariantSubject(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                    placeholder="{store_name}様へのご提案"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">CTAテンプレート (任意)</label>
                  <input
                    value={variantCta}
                    onChange={(e) => setVariantCta(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                    placeholder="無料相談のご案内"
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
      </div>
    </>
  );
}
