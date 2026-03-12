"use client";

import { useState, useEffect } from "react";
import { useAdminTenantId } from "@/src/lib/useAdminTenantId";
import AdminTopBar from "@/app/_components/ui/AdminTopBar";
import { fetchOutreachAnalytics, fetchLearningAnalytics, fetchCampaignAnalytics, fetchSourceAnalytics } from "@/app/lib/outreachApi";
import type { OutreachAnalytics, LearningAnalytics, CampaignAnalytics, SourceAnalytics } from "@/src/types/outreach";
import { SOURCE_TYPE_LABELS } from "@/src/types/outreach";
import { PIPELINE_LABELS } from "@/src/types/outreach";

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function OutreachAnalyticsClient() {
  const { tenantId, status: tenantStatus } = useAdminTenantId();
  const [analytics, setAnalytics] = useState<OutreachAnalytics | null>(null);
  const [learning, setLearning] = useState<LearningAnalytics | null>(null);
  const [campaignAnalytics, setCampaignAnalytics] = useState<CampaignAnalytics | null>(null);
  const [sourceAnalytics, setSourceAnalytics] = useState<SourceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tenantStatus !== "ready") return;
    setLoading(true);
    Promise.all([
      fetchOutreachAnalytics(tenantId),
      fetchLearningAnalytics(tenantId),
      fetchCampaignAnalytics(tenantId).catch(() => null),
      fetchSourceAnalytics(tenantId).catch(() => null),
    ])
      .then(([a, l, c, s]) => {
        setAnalytics(a);
        setLearning(l);
        setCampaignAnalytics(c);
        setSourceAnalytics(s);
      })
      .catch((err) => setError(err.message || "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [tenantId, tenantStatus]);

  if (tenantStatus === "loading") {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  return (
    <>
      <AdminTopBar title="営業分析" subtitle="アウトリーチ活動の概況" />

      <div className="px-6 space-y-6">
        {error && (
          <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-sm text-gray-500 py-8 text-center">読み込み中...</div>
        ) : analytics ? (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="総リード数" value={analytics.totalLeads} />
              <KpiCard label="送信済" value={analytics.totalMessagesSent} />
              <KpiCard label="返信あり" value={analytics.totalReplied} />
              <KpiCard label="商談" value={analytics.totalMeetings} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KpiCard
                label="承認済メッセージ"
                value={analytics.totalApproved}
              />
              <KpiCard
                label="平均スコア"
                value={analytics.avgScore != null ? `${analytics.avgScore}点` : "—"}
              />
              <KpiCard
                label="コンバージョン率"
                value={
                  analytics.totalLeads > 0
                    ? `${Math.round(
                        ((analytics.totalMeetings + (analytics.byPipelineStage["customer"] ?? 0)) /
                          analytics.totalLeads) *
                          100
                      )}%`
                    : "—"
                }
                sub="商談+成約 / 全リード"
              />
            </div>

            {/* Pipeline funnel */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">パイプラインファネル</h3>
              <div className="space-y-2">
                {(
                  ["new", "approved", "contacted", "replied", "meeting", "customer", "lost"] as const
                ).map((stage) => {
                  const count = analytics.byPipelineStage[stage] ?? 0;
                  const maxCount = Math.max(
                    1,
                    ...Object.values(analytics.byPipelineStage).map(Number)
                  );
                  const pct = (count / maxCount) * 100;
                  return (
                    <div key={stage} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-16 text-right">
                        {PIPELINE_LABELS[stage]}
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full flex items-center justify-end pr-2 transition-all"
                          style={{ width: `${Math.max(pct, count > 0 ? 8 : 0)}%` }}
                        >
                          {count > 0 && (
                            <span className="text-xs text-white font-medium">{count}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Phase 5: Campaign / AB Test Performance */}
            {campaignAnalytics && campaignAnalytics.variantPerformance.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700">キャンペーン / ABテスト実績</h3>
                <div className="flex gap-4 text-xs text-gray-500 mb-2">
                  <span>インポート済リード: <strong>{campaignAnalytics.importedLeadsCount}</strong></span>
                  <span>インポートバッチ: <strong>{campaignAnalytics.importBatchCount}</strong></span>
                </div>
                <div className="overflow-x-auto border rounded-xl">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b">
                        <th className="py-2 px-3">キャンペーン</th>
                        <th className="py-2 px-3">バリアント</th>
                        <th className="py-2 px-3 text-right">送信</th>
                        <th className="py-2 px-3 text-right">返信</th>
                        <th className="py-2 px-3 text-right">商談</th>
                        <th className="py-2 px-3 text-right">返信率</th>
                        <th className="py-2 px-3 text-right">商談率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignAnalytics.variantPerformance.map((v) => (
                        <tr key={`${v.campaignId}-${v.variantKey}`} className="border-b last:border-0">
                          <td className="py-2 px-3 font-medium">{v.campaignName}</td>
                          <td className="py-2 px-3 font-mono text-xs">{v.variantKey}</td>
                          <td className="py-2 px-3 text-right">{v.totalSent}</td>
                          <td className="py-2 px-3 text-right">{v.replied}</td>
                          <td className="py-2 px-3 text-right">{v.meetings}</td>
                          <td className="py-2 px-3 text-right font-medium">
                            {v.replyRate}%
                            <span className="text-[10px] text-gray-400 ml-1">n={v.sampleSize}</span>
                          </td>
                          <td className="py-2 px-3 text-right">{v.meetingRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Phase 4: Learning Insights */}
            {learning && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700">AI Learning Insights</h3>

                {/* Top performers */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {learning.topHypothesis && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <div className="text-xs text-blue-600 font-medium mb-1">最も効果的な課題仮説</div>
                      <div className="text-sm font-semibold">{learning.topHypothesis.label}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        返信率: {learning.topHypothesis.replyRate}% ({learning.topHypothesis.totalReplied}/{learning.topHypothesis.totalSent})
                        {learning.topHypothesis.sampleSize != null && <span className="ml-1 text-gray-400">n={learning.topHypothesis.sampleSize}</span>}
                      </div>
                    </div>
                  )}
                  {learning.topTone && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                      <div className="text-xs text-purple-600 font-medium mb-1">最も効果的なトーン</div>
                      <div className="text-sm font-semibold">{learning.topTone.label}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        返信率: {learning.topTone.replyRate}% ({learning.topTone.totalReplied}/{learning.topTone.totalSent})
                        {learning.topTone.sampleSize != null && <span className="ml-1 text-gray-400">n={learning.topTone.sampleSize}</span>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Reply rate by score */}
                {learning.replyRateByScore.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-600 mb-2">スコア帯別返信率</h4>
                    <div className="space-y-1.5">
                      {learning.replyRateByScore.map((r) => (
                        <div key={r.scoreBucket} className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 w-14 text-right">{r.scoreBucket}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full flex items-center justify-end pr-2"
                              style={{ width: `${Math.max(r.rate, r.replied > 0 ? 8 : 0)}%` }}
                            >
                              {r.rate > 0 && <span className="text-[10px] text-white">{r.rate}%</span>}
                            </div>
                          </div>
                          <span className="text-[10px] text-gray-400 w-16">{r.replied}/{r.sent}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reply rate by hypothesis */}
                {learning.replyRateByHypothesis.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-600 mb-2">課題仮説別返信率</h4>
                    <div className="space-y-1.5">
                      {learning.replyRateByHypothesis.map((r) => (
                        <div key={r.key} className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 w-28 truncate text-right" title={r.label}>{r.label}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full flex items-center justify-end pr-2"
                              style={{ width: `${Math.max(r.replyRate, r.totalReplied > 0 ? 8 : 0)}%` }}
                            >
                              {r.replyRate > 0 && <span className="text-[10px] text-white">{r.replyRate}%</span>}
                            </div>
                          </div>
                          <span className="text-[10px] text-gray-400 w-16">{r.totalReplied}/{r.totalSent}</span>
                          {r.sampleSize != null && <span className="text-[10px] text-gray-300 w-10">n={r.sampleSize}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Phase 6: Source Analytics */}
            {sourceAnalytics && sourceAnalytics.leadsBySourceType.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700">ソース別パフォーマンス</h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {sourceAnalytics.leadsBySourceType.map((s) => (
                    <div key={s.source_type} className="bg-white border rounded-xl p-3">
                      <div className="text-xs text-gray-500">{SOURCE_TYPE_LABELS[s.source_type] ?? s.source_type}</div>
                      <div className="text-xl font-semibold">{s.count}</div>
                      <div className="text-[10px] text-gray-400">リード数</div>
                    </div>
                  ))}
                </div>

                {sourceAnalytics.avgScoreBySource.length > 0 && (
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b">
                          <th className="py-2 px-3">ソース</th>
                          <th className="py-2 px-3 text-right">平均スコア</th>
                          <th className="py-2 px-3 text-right">商談率</th>
                          <th className="py-2 px-3 text-right">重複率</th>
                          <th className="py-2 px-3 text-right">サンプル</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sourceAnalytics.avgScoreBySource.map((s) => {
                          const meeting = sourceAnalytics.meetingRateBySource.find((m) => m.source_type === s.source_type);
                          const dup = sourceAnalytics.duplicateRateBySource.find((d) => d.source_type === s.source_type);
                          return (
                            <tr key={s.source_type} className="border-b last:border-0">
                              <td className="py-2 px-3 font-medium">{SOURCE_TYPE_LABELS[s.source_type] ?? s.source_type}</td>
                              <td className="py-2 px-3 text-right">{s.avg_score}点</td>
                              <td className="py-2 px-3 text-right">{meeting ? `${meeting.rate}%` : "-"}</td>
                              <td className="py-2 px-3 text-right">{dup ? `${dup.rate}%` : "-"}</td>
                              <td className="py-2 px-3 text-right text-gray-400">n={s.sample_size}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {sourceAnalytics.runsBySource.length > 0 && (
                  <div className="text-xs text-gray-500 flex gap-4">
                    {sourceAnalytics.runsBySource.map((r) => (
                      <span key={r.source_type}>
                        {SOURCE_TYPE_LABELS[r.source_type] ?? r.source_type}: {r.runs}回検索 / {r.total_results}件取得 / {r.total_imported}件取込
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}
