"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Instagram,
  TrendingUp,
  Clock,
  BarChart3,
  Plus,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";

interface IgAccount {
  vertical: string;
  igUserId: string;
  autoPost: boolean;
  tokenExpiresAt: number;
  postTimes: string[];
}

interface QueueItem {
  id: string;
  vertical: string;
  caption: string;
  scheduledAt: string;
  status: "pending" | "posted" | "failed";
}

interface Metrics {
  totalPosts: number;
  pendingPosts: number;
  metrics: { totalLikes: number; totalComments: number; totalReach: number; totalSaves: number };
}

const VERTICAL_LABELS: Record<string, string> = {
  eyebrow: "眉毛サロン", nail: "ネイルサロン", hair: "美容室", dental: "歯科医院",
  esthetic: "エステサロン", cleaning: "クリーニング", handyman: "便利屋", pet: "ペットサロン",
  seitai: "整体院", gym: "ジム", school: "スクール", shop: "ショップ",
  food: "飲食店", handmade: "ハンドメイド", construction: "建設", reform: "リフォーム",
};

export default function MarketingDashboard() {
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [allQueue, setAllQueue] = useState<QueueItem[]>([]);
  const [metricsMap, setMetricsMap] = useState<Record<string, Metrics>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy/owner/marketing/accounts", { credentials: "same-origin", cache: "no-store" });
      const data = (await res.json()) as any;
      const accs: IgAccount[] = data.accounts ?? [];
      setAccounts(accs);

      const queueAll: QueueItem[] = [];
      const mMap: Record<string, Metrics> = {};

      await Promise.all(
        accs.map(async (acc) => {
          const [qRes, mRes] = await Promise.all([
            fetch(`/api/proxy/owner/marketing/queue/${acc.vertical}`, { credentials: "same-origin", cache: "no-store" }),
            fetch(`/api/proxy/owner/marketing/metrics/${acc.vertical}`, { credentials: "same-origin", cache: "no-store" }),
          ]);
          const qData = (await qRes.json()) as any;
          const mData = (await mRes.json()) as any;
          queueAll.push(...(qData.queue ?? []));
          mMap[acc.vertical] = mData;
        }),
      );

      setAllQueue(queueAll);
      setMetricsMap(mMap);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayPending = allQueue.filter(
    (q) => q.status === "pending" && q.scheduledAt.startsWith(todayStr),
  );
  const totalPosts = Object.values(metricsMap).reduce((s, m) => s + (m.totalPosts ?? 0), 0);
  const totalReach = Object.values(metricsMap).reduce((s, m) => s + (m.metrics?.totalReach ?? 0), 0);
  const totalEngagement = Object.values(metricsMap).reduce(
    (s, m) => s + (m.metrics?.totalLikes ?? 0) + (m.metrics?.totalComments ?? 0) + (m.metrics?.totalSaves ?? 0),
    0,
  );
  const totalPending = allQueue.filter((q) => q.status === "pending").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Instagram集客ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-1">バーティカル別IGアカウントの自動運用管理</p>
        </div>
        <Link
          href="/owner/marketing/accounts"
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          アカウント管理
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "登録アカウント", value: accounts.length, icon: Instagram, color: "text-pink-600" },
          { label: "総投稿数", value: totalPosts, icon: BarChart3, color: "text-blue-600" },
          { label: "総リーチ", value: totalReach.toLocaleString(), icon: TrendingUp, color: "text-green-600" },
          { label: "キュー残数", value: totalPending, icon: Clock, color: "text-amber-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">{value}</span>
          </div>
        ))}
      </div>

      {/* Account Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">アカウント状況</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-gray-500">
            まだアカウントが登録されていません。
            <Link href="/owner/marketing/accounts" className="text-amber-600 hover:underline ml-1">
              アカウントを追加
            </Link>
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {accounts.map((acc) => {
              const tokenOk = acc.tokenExpiresAt > Date.now();
              const m = metricsMap[acc.vertical];
              return (
                <Link
                  key={acc.vertical}
                  href={`/owner/marketing/${acc.vertical}`}
                  className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-amber-300 hover:shadow-sm transition-all"
                >
                  <div>
                    <span className="font-medium text-gray-900">
                      {VERTICAL_LABELS[acc.vertical] || acc.vertical}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      {tokenOk ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="w-3 h-3" /> 有効
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600">
                          <XCircle className="w-3 h-3" /> トークン切れ
                        </span>
                      )}
                      {acc.autoPost && (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                          <RefreshCw className="w-3 h-3" /> 自動投稿
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <div>{m?.totalPosts ?? 0}投稿</div>
                    <div>{(m?.metrics?.totalReach ?? 0).toLocaleString()}リーチ</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Today's Schedule */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">今日の予定投稿</h2>
        {todayPending.length === 0 ? (
          <p className="text-sm text-gray-500">今日の予定投稿はありません。</p>
        ) : (
          <div className="space-y-2">
            {todayPending.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                      {VERTICAL_LABELS[item.vertical] || item.vertical}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(item.scheduledAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 truncate mt-0.5">{item.caption.slice(0, 80)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
