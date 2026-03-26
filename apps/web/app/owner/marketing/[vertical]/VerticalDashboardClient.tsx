"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  ListOrdered,
  BarChart3,
  TrendingUp,
  Heart,
  MessageCircle,
  Bookmark,
} from "lucide-react";

const VERTICAL_LABELS: Record<string, string> = {
  eyebrow: "眉毛サロン", nail: "ネイルサロン", hair: "美容室", dental: "歯科医院",
  esthetic: "エステサロン", cleaning: "クリーニング", handyman: "便利屋", pet: "ペットサロン",
  seitai: "整体院", gym: "ジム", school: "スクール", food: "飲食店",
};

interface Metrics {
  totalPosts: number;
  pendingPosts: number;
  metrics: { totalLikes: number; totalComments: number; totalReach: number; totalSaves: number };
  recentPosts: Array<{
    id: string;
    caption: string;
    postedAt?: string;
    status: string;
    metrics?: { likes: number; comments: number; reach: number; saves: number };
  }>;
}

export default function VerticalDashboardClient() {
  const params = useParams();
  const vertical = params?.vertical as string;
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/proxy/owner/marketing/metrics/${vertical}`, { credentials: "same-origin", cache: "no-store" });
      setData((await res.json()) as any);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [vertical]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const label = VERTICAL_LABELS[vertical] || vertical;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const m = data?.metrics;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/owner/marketing" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{label} — IG集客</h1>
          <p className="text-sm text-gray-500 mt-0.5">コンテンツ生成・投稿管理・メトリクス</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link
          href={`/owner/marketing/${vertical}/generate`}
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-amber-300 hover:shadow-sm transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="font-medium text-gray-900">コンテンツ生成</div>
            <div className="text-xs text-gray-500">AIで投稿キャプションを自動生成</div>
          </div>
        </Link>
        <Link
          href={`/owner/marketing/${vertical}/queue`}
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-amber-300 hover:shadow-sm transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <ListOrdered className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="font-medium text-gray-900">投稿キュー</div>
            <div className="text-xs text-gray-500">
              {data?.pendingPosts ?? 0}件の予定投稿
            </div>
          </div>
        </Link>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "総投稿数", value: data?.totalPosts ?? 0, icon: BarChart3, color: "text-blue-600" },
          { label: "総リーチ", value: (m?.totalReach ?? 0).toLocaleString(), icon: TrendingUp, color: "text-green-600" },
          { label: "いいね", value: (m?.totalLikes ?? 0).toLocaleString(), icon: Heart, color: "text-pink-600" },
          { label: "保存", value: (m?.totalSaves ?? 0).toLocaleString(), icon: Bookmark, color: "text-purple-600" },
        ].map(({ label: l, value, icon: Icon, color }) => (
          <div key={l} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-gray-500">{l}</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">{value}</span>
          </div>
        ))}
      </div>

      {/* Recent Posts */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">最近の投稿</h2>
        {(data?.recentPosts ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">まだ投稿がありません。</p>
        ) : (
          <div className="space-y-3">
            {data!.recentPosts.map((post) => (
              <div key={post.id} className="p-3 rounded-lg bg-gray-50 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-700 truncate">{post.caption.slice(0, 100)}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    {post.postedAt && <span>{new Date(post.postedAt).toLocaleDateString("ja-JP")}</span>}
                    <span className={post.status === "posted" ? "text-green-600" : post.status === "failed" ? "text-red-600" : "text-amber-600"}>
                      {post.status === "posted" ? "投稿済み" : post.status === "failed" ? "失敗" : "予定"}
                    </span>
                  </div>
                </div>
                {post.metrics && (
                  <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0 ml-4">
                    <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{post.metrics.likes}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{post.metrics.comments}</span>
                    <span className="flex items-center gap-1"><Bookmark className="w-3 h-3" />{post.metrics.saves}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
