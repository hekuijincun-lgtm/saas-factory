"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Trash2,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  Heart,
  MessageCircle,
  Bookmark,
  Eye,
} from "lucide-react";

const VERTICAL_LABELS: Record<string, string> = {
  eyebrow: "眉毛サロン", nail: "ネイルサロン", hair: "美容室", dental: "歯科医院",
  esthetic: "エステサロン", cleaning: "クリーニング", handyman: "便利屋", pet: "ペットサロン",
  seitai: "整体院", gym: "ジム", school: "スクール", food: "飲食店",
};

interface QueueItem {
  id: string;
  vertical: string;
  caption: string;
  hashtags: string[];
  imagePrompt: string;
  variantGroup?: string;
  variant?: "A" | "B";
  scheduledAt: string;
  status: "pending" | "posted" | "failed";
  postedAt?: string;
  metrics?: { likes: number; comments: number; reach: number; saves: number };
}

export default function QueueClient() {
  const params = useParams();
  const vertical = params?.vertical as string;
  const label = VERTICAL_LABELS[vertical] || vertical;

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [postImageUrls, setPostImageUrls] = useState<Record<string, string>>({});

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch(`/api/proxy/owner/marketing/queue/${vertical}`, { credentials: "same-origin", cache: "no-store" });
      const data = (await res.json()) as any;
      setQueue(data.queue ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [vertical]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const handleDelete = async (id: string) => {
    if (!confirm("この投稿をキューから削除しますか？")) return;
    try {
      const res = await fetch(`/api/proxy/owner/marketing/queue/${vertical}/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = (await res.json()) as any;
      if (data.ok) {
        showToast("削除しました");
        fetchQueue();
      } else {
        showToast(data.error || "削除に失敗しました", "err");
      }
    } catch { showToast("削除に失敗しました", "err"); }
  };

  const handlePost = async (id: string) => {
    const imageUrl = postImageUrls[id]?.trim();
    if (!imageUrl) {
      showToast("画像URLを入力してください（Instagram投稿には画像が必須です）", "err");
      return;
    }
    try {
      const res = await fetch(`/api/proxy/owner/marketing/post/${vertical}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueItemId: id, imageUrl }),
      });
      const data = (await res.json()) as any;
      if (data.ok) {
        showToast("投稿しました!");
        fetchQueue();
      } else {
        const msg = data.detail ? `${data.error}: ${data.detail}` : (data.error || "投稿に失敗しました");
        showToast(msg, "err");
      }
    } catch { showToast("投稿に失敗しました", "err"); }
  };

  const pending = queue.filter((q) => q.status === "pending").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const posted = queue.filter((q) => q.status === "posted").sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  const failed = queue.filter((q) => q.status === "failed");

  // Group by variant group
  const groupVariants = (items: QueueItem[]) => {
    const groups: Array<QueueItem[]> = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) continue;
      if (item.variantGroup) {
        const pair = items.filter((i) => i.variantGroup === item.variantGroup);
        pair.forEach((p) => seen.add(p.id));
        groups.push(pair);
      } else {
        seen.add(item.id);
        groups.push([item]);
      }
    }
    return groups;
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "posted") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-red-500" />;
    return <Clock className="w-4 h-4 text-amber-500" />;
  };

  const statusLabel = (s: string) => s === "posted" ? "投稿済み" : s === "failed" ? "失敗" : "予定";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/owner/marketing/${vertical}`} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{label} — 投稿キュー</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {pending.length}件の予定 / {posted.length}件の投稿済み
            </p>
          </div>
        </div>
        <Link
          href={`/owner/marketing/${vertical}/generate`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          コンテンツ生成
        </Link>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">予定投稿</h2>
          {groupVariants(pending).map((group, gi) => (
            <div key={gi} className={`${group.length > 1 ? "bg-white rounded-xl border border-blue-200 p-4 space-y-3" : ""}`}>
              {group.length > 1 && (
                <span className="text-xs font-medium text-blue-600">A/Bテストペア</span>
              )}
              {group.map((item) => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusIcon status={item.status} />
                        <span className="text-xs text-gray-500">
                          {new Date(item.scheduledAt).toLocaleString("ja-JP")}
                        </span>
                        {item.variant && (
                          <span className={`px-1.5 py-0.5 text-xs font-bold rounded ${item.variant === "A" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                            {item.variant}
                          </span>
                        )}
                      </div>
                      <p
                        className="text-sm text-gray-700 cursor-pointer"
                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      >
                        {expandedId === item.id ? item.caption : item.caption.slice(0, 120) + (item.caption.length > 120 ? "..." : "")}
                      </p>
                      {expandedId === item.id && item.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {item.hashtags.map((h, j) => (
                            <span key={j} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                              {h.startsWith("#") ? h : `#${h}`}
                            </span>
                          ))}
                        </div>
                      )}
                      {expandedId === item.id && (
                        <div className="mt-2">
                          <input
                            type="url"
                            value={postImageUrls[item.id] ?? ""}
                            onChange={(e) => setPostImageUrls((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="画像URL（即時投稿に必須）"
                            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handlePost(item.id)}
                        className="p-2 hover:bg-green-50 rounded-lg transition-colors"
                        title="即時投稿"
                      >
                        <Send className="w-4 h-4 text-green-600" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Posted */}
      {posted.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">投稿済み</h2>
          {posted.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-xs text-gray-500">
                      {item.postedAt ? new Date(item.postedAt).toLocaleString("ja-JP") : ""}
                    </span>
                    {item.variant && (
                      <span className={`px-1.5 py-0.5 text-xs font-bold rounded ${item.variant === "A" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                        {item.variant}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 truncate">{item.caption.slice(0, 120)}</p>
                </div>
                {item.metrics && (
                  <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                    <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-pink-500" />{item.metrics.likes}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{item.metrics.comments}</span>
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{item.metrics.reach}</span>
                    <span className="flex items-center gap-1"><Bookmark className="w-3 h-3" />{item.metrics.saves}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Failed */}
      {failed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 text-red-600">失敗した投稿</h2>
          {failed.map((item) => (
            <div key={item.id} className="bg-red-50 rounded-xl border border-red-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-xs text-red-600">{statusLabel(item.status)}</span>
              </div>
              <p className="text-sm text-gray-700 truncate">{item.caption.slice(0, 120)}</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handlePost(item.id)}
                  className="text-xs px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  再投稿
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-xs px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {queue.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">キューは空です。</p>
          <Link
            href={`/owner/marketing/${vertical}/generate`}
            className="inline-block mt-3 text-sm text-amber-600 hover:underline"
          >
            コンテンツを生成する
          </Link>
        </div>
      )}
    </div>
  );
}
