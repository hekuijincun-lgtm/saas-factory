"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Loader2, Plus, Send, Wand2 } from "lucide-react";

const VERTICAL_LABELS: Record<string, string> = {
  eyebrow: "眉毛サロン", nail: "ネイルサロン", hair: "美容室", dental: "歯科医院",
  esthetic: "エステサロン", cleaning: "クリーニング", handyman: "便利屋", pet: "ペットサロン",
  seitai: "整体院", gym: "ジム", school: "スクール", food: "飲食店",
};

const CONTENT_TYPES = [
  { value: "case_study", label: "導入事例", desc: "実績データを使って改善効果をアピール" },
  { value: "feature_demo", label: "機能紹介", desc: "業種特化機能をピックアップ" },
  { value: "pain_point", label: "課題共感", desc: "オーナーの悩みに寄り添い解決策を提示" },
  { value: "tip", label: "経営Tips", desc: "役立つノウハウからSaaSに自然につなげる" },
] as const;

interface GeneratedContent {
  caption: string;
  hashtags: string[];
  imagePrompt: string;
  variant?: "A" | "B";
}

export default function GenerateClient() {
  const params = useParams();
  const router = useRouter();
  const vertical = params?.vertical as string;
  const label = VERTICAL_LABELS[vertical] || vertical;

  const [contentType, setContentType] = useState<string>("pain_point");
  const [abTest, setAbTest] = useState(false);
  const [useRealData, setUseRealData] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedContent[]>([]);
  const [variantGroup, setVariantGroup] = useState<string | undefined>();
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [queueing, setQueueing] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({});
  const [generatingImage, setGeneratingImage] = useState<Record<number, boolean>>({});

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setResults([]);
    try {
      const res = await fetch("/api/proxy/owner/marketing/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vertical, contentType, abTest, useRealData }),
      });
      const data = (await res.json()) as any;
      if (data?.ok) {
        setResults(data.results);
        setVariantGroup(data.variantGroup);
      } else {
        showToast(data?.error || "生成に失敗しました", "err");
      }
    } catch {
      showToast("生成に失敗しました", "err");
    } finally {
      setGenerating(false);
    }
  };

  const handleAddToQueue = async (content: GeneratedContent, idx: number) => {
    if (!scheduledAt) {
      showToast("投稿日時を指定してください", "err");
      return;
    }
    setQueueing(true);
    try {
      const res = await fetch(`/api/proxy/owner/marketing/queue/${vertical}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: content.caption,
          hashtags: content.hashtags,
          imagePrompt: content.imagePrompt,
          imageUrl: imageUrls[idx] || undefined,
          variantGroup,
          variant: content.variant,
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      });
      const data = (await res.json()) as any;
      if (data.ok) {
        showToast("キューに追加しました");
      } else {
        showToast(data.error || "追加に失敗しました", "err");
      }
    } catch {
      showToast("追加に失敗しました", "err");
    } finally {
      setQueueing(false);
    }
  };

  const handleImmediatePost = async (content: GeneratedContent, idx: number) => {
    const imageUrl = imageUrls[idx]?.trim();
    if (!imageUrl) {
      showToast("画像URLを入力してください（Instagram投稿には画像が必須です）", "err");
      return;
    }
    try {
      const res = await fetch(`/api/proxy/owner/marketing/post/${vertical}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: content.caption,
          hashtags: content.hashtags,
          imageUrl,
        }),
      });
      const data = (await res.json()) as any;
      if (data.ok) {
        showToast("投稿しました!");
      } else {
        showToast(data.error || "投稿に失敗しました", "err");
      }
    } catch {
      showToast("投稿に失敗しました", "err");
    }
  };

  const handleGenerateImage = async (imagePrompt: string, idx: number) => {
    if (!imagePrompt?.trim()) {
      showToast("画像プロンプトがありません", "err");
      return;
    }
    setGeneratingImage((prev) => ({ ...prev, [idx]: true }));
    try {
      const res = await fetch("/api/proxy/owner/marketing/generate-image", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: imagePrompt, vertical }),
      });
      const data = (await res.json()) as any;
      if (data?.ok && data.imageUrl) {
        setImageUrls((prev) => ({ ...prev, [idx]: data.imageUrl }));
        showToast("画像を生成しました");
      } else {
        showToast(data?.error || "画像生成に失敗しました", "err");
      }
    } catch {
      showToast("画像生成に失敗しました", "err");
    } finally {
      setGeneratingImage((prev) => ({ ...prev, [idx]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Link href={`/owner/marketing/${vertical}`} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{label} — コンテンツ生成</h1>
          <p className="text-sm text-gray-500 mt-0.5">AIがInstagram投稿キャプションを自動生成</p>
        </div>
      </div>

      {/* Generation Options */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h3 className="font-semibold text-gray-900">生成設定</h3>

        {/* Content Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">コンテンツタイプ</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CONTENT_TYPES.map((ct) => (
              <button
                key={ct.value}
                onClick={() => setContentType(ct.value)}
                className={`text-left p-3 rounded-lg border transition-all ${
                  contentType === ct.value
                    ? "border-amber-300 bg-amber-50 ring-1 ring-amber-300"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium text-sm text-gray-900">{ct.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{ct.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={abTest}
              onChange={(e) => setAbTest(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">A/Bテスト（2バリアント生成）</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useRealData}
              onChange={(e) => setUseRealData(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">実データを使用</span>
          </label>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              生成する
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">生成結果</h3>

          {/* Schedule Input */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">投稿日時（キュー追加用）</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className={`grid gap-4 ${results.length > 1 ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
            {results.map((r, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                {r.variant && (
                  <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded ${
                    r.variant === "A" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                  }`}>
                    バリアント {r.variant}
                  </span>
                )}

                {/* Caption */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">キャプション</label>
                  <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {r.caption}
                  </div>
                </div>

                {/* Hashtags */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ハッシュタグ ({r.hashtags.length}個)</label>
                  <div className="flex flex-wrap gap-1">
                    {r.hashtags.map((h, j) => (
                      <span key={j} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                        {h.startsWith("#") ? h : `#${h}`}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Image Prompt */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">画像プロンプト</label>
                  <div className="p-2 bg-gray-50 rounded text-xs text-gray-600 italic">{r.imagePrompt}</div>
                </div>

                {/* Image URL Input */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">画像URL（即時投稿に必須）</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={imageUrls[i] ?? ""}
                      onChange={(e) => setImageUrls((prev) => ({ ...prev, [i]: e.target.value }))}
                      placeholder="https://example.com/image.jpg"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => handleGenerateImage(r.imagePrompt, i)}
                      disabled={!!generatingImage[i]}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {generatingImage[i] ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          生成中...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3.5 h-3.5" />
                          AI生成
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">R2公開URLまたは外部画像URL。キュー追加時は任意。</p>
                  {imageUrls[i] && (
                    <div className="mt-2">
                      <img
                        src={imageUrls[i]}
                        alt="プレビュー"
                        className="w-40 h-40 object-cover rounded-lg border border-gray-200"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleAddToQueue(r, i)}
                    disabled={queueing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    キューに追加
                  </button>
                  <button
                    onClick={() => handleImmediatePost(r, i)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    即時投稿
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
