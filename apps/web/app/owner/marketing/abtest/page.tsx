"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Trophy, BarChart3 } from "lucide-react";

interface IgAccount {
  vertical: string;
}

interface QueueItem {
  id: string;
  variantGroup?: string;
  variant?: "A" | "B";
  caption: string;
  status: string;
  metrics?: { likes: number; comments: number; reach: number; saves: number };
}

interface ABTestResult {
  groupId: string;
  vertical: string;
  variantA: { caption: string; score: number; metrics?: QueueItem["metrics"] } | null;
  variantB: { caption: string; score: number; metrics?: QueueItem["metrics"] } | null;
  winner: "A" | "B";
}

export default function ABTestPage() {
  const [results, setResults] = useState<ABTestResult[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const accRes = await fetch("/api/proxy/owner/marketing/accounts", { credentials: "same-origin", cache: "no-store" });
      const accData = (await accRes.json()) as any;
      const accounts: IgAccount[] = accData.accounts ?? [];

      const allResults: ABTestResult[] = [];
      const seenGroups = new Set<string>();

      for (const acc of accounts) {
        const qRes = await fetch(`/api/proxy/owner/marketing/queue/${acc.vertical}`, { credentials: "same-origin", cache: "no-store" });
        const qData = (await qRes.json()) as any;
        const queue: QueueItem[] = qData.queue ?? [];

        for (const item of queue) {
          if (!item.variantGroup || seenGroups.has(item.variantGroup)) continue;
          seenGroups.add(item.variantGroup);

          const pair = queue.filter((q) => q.variantGroup === item.variantGroup);
          const a = pair.find((p) => p.variant === "A");
          const b = pair.find((p) => p.variant === "B");

          const score = (q?: QueueItem) => {
            if (!q?.metrics) return 0;
            return q.metrics.likes + q.metrics.comments * 2 + q.metrics.saves * 3;
          };

          allResults.push({
            groupId: item.variantGroup,
            vertical: acc.vertical,
            variantA: a ? { caption: a.caption, score: score(a), metrics: a.metrics } : null,
            variantB: b ? { caption: b.caption, score: score(b), metrics: b.metrics } : null,
            winner: score(a) >= score(b) ? "A" : "B",
          });
        }
      }

      setResults(allResults);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/owner/marketing" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">A/Bテスト結果</h1>
          <p className="text-sm text-gray-500 mt-0.5">投稿バリアントの成果比較</p>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">A/Bテストの結果はまだありません。</p>
          <p className="text-gray-400 text-xs mt-1">コンテンツ生成時にA/Bテストを有効にして投稿してください。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((r) => (
            <div key={r.groupId} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-gray-900">
                  グループ: {r.groupId.slice(0, 12)}...
                </span>
                <span className="text-xs text-gray-400">({r.vertical})</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {(["A", "B"] as const).map((v) => {
                  const data = v === "A" ? r.variantA : r.variantB;
                  const isWinner = r.winner === v;
                  return (
                    <div
                      key={v}
                      className={`p-4 rounded-lg border ${isWinner ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded ${v === "A" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                          {v}
                        </span>
                        {isWinner && (
                          <span className="px-2 py-0.5 text-xs font-bold rounded bg-amber-200 text-amber-800">
                            Winner
                          </span>
                        )}
                        {data && <span className="text-xs text-gray-500">スコア: {data.score}</span>}
                      </div>
                      {data ? (
                        <>
                          <p className="text-sm text-gray-700 line-clamp-3">{data.caption.slice(0, 200)}</p>
                          {data.metrics && (
                            <div className="flex gap-3 mt-2 text-xs text-gray-500">
                              <span>Likes: {data.metrics.likes}</span>
                              <span>Comments: {data.metrics.comments}</span>
                              <span>Reach: {data.metrics.reach}</span>
                              <span>Saves: {data.metrics.saves}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-gray-400">データなし</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
