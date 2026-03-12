"use client";

import { useState, useEffect } from "react";
import { useOwnerTenantId } from "@/src/lib/useOwnerTenantId";
import { fetchOutreachAnalytics, fetchLearningAnalytics, fetchCampaignAnalytics, fetchSourceAnalytics, fetchWinningPatterns, refreshWinningPatterns, fetchCampaignInsights, fetchSourceQuality, fetchTopSources, fetchSourceTrends, fetchSourceBreakdown } from "@/app/lib/outreachApi";
import type { OutreachAnalytics, LearningAnalytics, CampaignAnalytics, SourceAnalytics, WinningPatternsData, CampaignInsightsData, SourceQualityRow, SourceQualitySummary, TopSourceRow, SourceTrendPoint, SourceTrendBreakdown } from "@/src/types/outreach";
import { SOURCE_TYPE_LABELS, PATTERN_TYPE_LABELS } from "@/src/types/outreach";
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
  const { tenantId, loading: tenantLoading } = useOwnerTenantId();
  const [analytics, setAnalytics] = useState<OutreachAnalytics | null>(null);
  const [learning, setLearning] = useState<LearningAnalytics | null>(null);
  const [campaignAnalytics, setCampaignAnalytics] = useState<CampaignAnalytics | null>(null);
  const [sourceAnalytics, setSourceAnalytics] = useState<SourceAnalytics | null>(null);
  const [winningPatterns, setWinningPatterns] = useState<WinningPatternsData | null>(null);
  const [campaignInsights, setCampaignInsights] = useState<CampaignInsightsData | null>(null);
  const [sourceQuality, setSourceQuality] = useState<SourceQualityRow[]>([]);
  const [sourceQualitySummary, setSourceQualitySummary] = useState<SourceQualitySummary | null>(null);
  const [topSources, setTopSources] = useState<TopSourceRow[]>([]);
  const [sourceTrends, setSourceTrends] = useState<SourceTrendPoint[]>([]);
  const [sourceBreakdown, setSourceBreakdown] = useState<SourceTrendBreakdown[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      fetchOutreachAnalytics(tenantId),
      fetchLearningAnalytics(tenantId),
      fetchCampaignAnalytics(tenantId).catch(() => null),
      fetchSourceAnalytics(tenantId).catch(() => null),
      fetchWinningPatterns(tenantId).catch(() => null),
      fetchCampaignInsights(tenantId).catch(() => null),
      fetchSourceQuality(tenantId).catch(() => ({ data: [], summary: null })),
      fetchTopSources(tenantId).catch(() => []),
      fetchSourceTrends(tenantId, { days: 30 }).catch(() => []),
      fetchSourceBreakdown(tenantId, 30).catch(() => []),
    ])
      .then(([a, l, c, s, w, ci, sq, ts, trends, breakdown]) => {
        setAnalytics(a);
        setLearning(l);
        setCampaignAnalytics(c);
        setSourceAnalytics(s);
        setWinningPatterns(w);
        setCampaignInsights(ci);
        if (sq && typeof sq === "object" && "data" in sq) {
          setSourceQuality((sq as any).data ?? []);
          setSourceQualitySummary((sq as any).summary ?? null);
        }
        setTopSources(Array.isArray(ts) ? ts : []);
        setSourceTrends(Array.isArray(trends) ? trends : []);
        setSourceBreakdown(Array.isArray(breakdown) ? breakdown : []);
      })
      .catch((err) => setError(err.message || "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (!tenantId || tenantLoading) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  return (
    <>
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

            {/* Phase 8.1: Source Quality */}
            {(sourceQuality.length > 0 || topSources.length > 0) && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700">ソース品質分析</h3>

                {/* Summary cards */}
                {sourceQualitySummary && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-white border rounded-xl p-3">
                      <div className="text-xs text-gray-500">ソース数</div>
                      <div className="text-lg font-semibold">{sourceQualitySummary.totalSources}</div>
                    </div>
                    <div className="bg-white border rounded-xl p-3">
                      <div className="text-xs text-gray-500">取込数</div>
                      <div className="text-lg font-semibold">{sourceQualitySummary.totalImported}</div>
                    </div>
                    <div className="bg-white border rounded-xl p-3">
                      <div className="text-xs text-gray-500">返信</div>
                      <div className="text-lg font-semibold text-blue-600">{sourceQualitySummary.totalReplies}</div>
                    </div>
                    <div className="bg-white border rounded-xl p-3">
                      <div className="text-xs text-gray-500">商談</div>
                      <div className="text-lg font-semibold text-purple-600">{sourceQualitySummary.totalMeetings}</div>
                    </div>
                    <div className="bg-white border rounded-xl p-3">
                      <div className="text-xs text-gray-500">成約</div>
                      <div className="text-lg font-semibold text-emerald-600">{sourceQualitySummary.totalWon}</div>
                    </div>
                    <div className="bg-white border rounded-xl p-3">
                      <div className="text-xs text-gray-500">平均品質</div>
                      <div className="text-lg font-semibold">{sourceQualitySummary.avgQuality.toFixed(2)}</div>
                    </div>
                  </div>
                )}

                {/* Top sources */}
                {topSources.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-600 mb-2">トップソース</h4>
                    <div className="overflow-x-auto border rounded-xl">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b">
                            <th className="py-2 px-3">ソース</th>
                            <th className="py-2 px-3">ニッチ</th>
                            <th className="py-2 px-3">エリア</th>
                            <th className="py-2 px-3 text-right">取込</th>
                            <th className="py-2 px-3 text-right">返信</th>
                            <th className="py-2 px-3 text-right">商談</th>
                            <th className="py-2 px-3 text-right">成約</th>
                            <th className="py-2 px-3 text-right">品質</th>
                            <th className="py-2 px-3 text-right">総合</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topSources.map((s, i) => (
                            <tr key={`${s.source_type}-${s.niche}-${s.area}-${i}`} className="border-b last:border-0">
                              <td className="py-2 px-3 font-medium">
                                {SOURCE_TYPE_LABELS[s.source_type] ?? s.source_type}
                              </td>
                              <td className="py-2 px-3 text-gray-500">{s.niche ?? "-"}</td>
                              <td className="py-2 px-3 text-gray-500">{s.area ?? "-"}</td>
                              <td className="py-2 px-3 text-right">{s.leads_imported}</td>
                              <td className="py-2 px-3 text-right">{s.reply_count}</td>
                              <td className="py-2 px-3 text-right">{s.meeting_count}</td>
                              <td className="py-2 px-3 text-right">{s.won_count}</td>
                              <td className="py-2 px-3 text-right">{s.quality_score.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right font-semibold">{s.composite_score.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {sourceQuality.length === 0 && topSources.length === 0 && (
                  <div className="text-sm text-gray-400 py-4 text-center">
                    ソース品質データがありません。リードを取り込むとデータが蓄積されます。
                  </div>
                )}
              </div>
            )}

            {/* Phase 8.2: Source Quality Trends */}
            {(sourceTrends.length > 0 || sourceBreakdown.length > 0) && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700">ソース品質トレンド (30日)</h3>

                {/* Daily trend table */}
                {sourceTrends.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-600 mb-2">日次推移</h4>
                    <div className="overflow-x-auto border rounded-xl">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b">
                            <th className="py-2 px-3">日付</th>
                            <th className="py-2 px-3 text-right">候補数</th>
                            <th className="py-2 px-3 text-right">承認数</th>
                            <th className="py-2 px-3 text-right">取込数</th>
                            <th className="py-2 px-3 text-right">品質</th>
                            <th className="py-2 px-3 text-right">返信率</th>
                            <th className="py-2 px-3 text-right">商談率</th>
                            <th className="py-2 px-3 text-right">成約率</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sourceTrends.map((t) => (
                            <tr key={t.day} className="border-b last:border-0">
                              <td className="py-1.5 px-3 text-gray-600">{t.day}</td>
                              <td className="py-1.5 px-3 text-right">{t.candidate_count}</td>
                              <td className="py-1.5 px-3 text-right text-green-600">{t.accepted_count}</td>
                              <td className="py-1.5 px-3 text-right text-blue-600">{t.imported_count}</td>
                              <td className="py-1.5 px-3 text-right">{t.avg_quality_score.toFixed(2)}</td>
                              <td className="py-1.5 px-3 text-right">{(t.reply_rate * 100).toFixed(1)}%</td>
                              <td className="py-1.5 px-3 text-right">{(t.meeting_rate * 100).toFixed(1)}%</td>
                              <td className="py-1.5 px-3 text-right">{(t.won_rate * 100).toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Source breakdown */}
                {sourceBreakdown.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-600 mb-2">ソース別サマリー</h4>
                    <div className="overflow-x-auto border rounded-xl">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b">
                            <th className="py-2 px-3">ソース</th>
                            <th className="py-2 px-3">キー</th>
                            <th className="py-2 px-3">ニッチ</th>
                            <th className="py-2 px-3">エリア</th>
                            <th className="py-2 px-3 text-right">候補</th>
                            <th className="py-2 px-3 text-right">承認</th>
                            <th className="py-2 px-3 text-right">取込</th>
                            <th className="py-2 px-3 text-right">品質</th>
                            <th className="py-2 px-3 text-right">返信率</th>
                            <th className="py-2 px-3 text-right">商談率</th>
                            <th className="py-2 px-3 text-right">サンプル</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sourceBreakdown.map((b, i) => (
                            <tr key={`${b.source_key}-${i}`} className="border-b last:border-0">
                              <td className="py-1.5 px-3">{SOURCE_TYPE_LABELS[b.source_type] ?? b.source_type}</td>
                              <td className="py-1.5 px-3 text-gray-500 text-xs truncate max-w-[100px]" title={b.source_key}>
                                {b.source_key}
                              </td>
                              <td className="py-1.5 px-3 text-gray-500">{b.niche ?? "-"}</td>
                              <td className="py-1.5 px-3 text-gray-500">{b.area ?? "-"}</td>
                              <td className="py-1.5 px-3 text-right">{b.total_candidates}</td>
                              <td className="py-1.5 px-3 text-right text-green-600">{b.total_accepted}</td>
                              <td className="py-1.5 px-3 text-right text-blue-600">{b.total_imported}</td>
                              <td className="py-1.5 px-3 text-right">{b.avg_quality.toFixed(2)}</td>
                              <td className="py-1.5 px-3 text-right">{(b.avg_reply_rate * 100).toFixed(1)}%</td>
                              <td className="py-1.5 px-3 text-right">{(b.avg_meeting_rate * 100).toFixed(1)}%</td>
                              <td className="py-1.5 px-3 text-right text-gray-400">
                                {b.sample_size}
                                {b.sample_size < 5 && <span className="ml-1 text-[10px] text-amber-500">参考値</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Phase 7: Campaign Insights */}
            {campaignInsights && campaignInsights.campaigns.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700">キャンペーンインサイト</h3>

                <div className="overflow-x-auto border rounded-xl">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b">
                        <th className="py-2 px-3">キャンペーン</th>
                        <th className="py-2 px-3">ニッチ</th>
                        <th className="py-2 px-3 text-right">送信</th>
                        <th className="py-2 px-3 text-right">返信率</th>
                        <th className="py-2 px-3 text-right">商談率</th>
                        <th className="py-2 px-3">ステータス</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignInsights.campaigns.map((c) => (
                        <tr key={c.campaign_id} className="border-b last:border-0">
                          <td className="py-2 px-3 font-medium">{c.campaign_name}</td>
                          <td className="py-2 px-3 text-xs text-gray-500">{c.niche ?? "-"}</td>
                          <td className="py-2 px-3 text-right">{c.total_sent}</td>
                          <td className="py-2 px-3 text-right font-medium">
                            {c.reply_rate}%
                            {c.total_sent > 0 && <span className="text-[10px] text-gray-400 ml-1">({c.total_replied}/{c.total_sent})</span>}
                          </td>
                          <td className="py-2 px-3 text-right">{c.meeting_rate}%</td>
                          <td className="py-2 px-3">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{c.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Niche template stats */}
                {campaignInsights.templateStats.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-600 mb-2">ニッチテンプレート</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {campaignInsights.templateStats.map((t) => (
                        <div key={t.niche} className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                          <div className="text-xs font-medium">{t.niche}</div>
                          <div className="text-[10px] text-gray-500">
                            {t.count}テンプレート / スコア{t.best_score} / n={t.total_samples}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Learning refresh history */}
                {campaignInsights.refreshHistory.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-600 mb-2">学習更新履歴</h4>
                    <div className="space-y-1">
                      {campaignInsights.refreshHistory.slice(0, 5).map((r) => (
                        <div key={r.id} className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="text-gray-400">{new Date(r.created_at).toLocaleString("ja-JP")}</span>
                          <span>{r.triggered_by}</span>
                          <span>パターン: {r.patterns_updated}件</span>
                          <span>テンプレート: {r.templates_generated}件</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Phase 6: Winning Patterns */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">勝ちパターン</h3>
                <button
                  onClick={async () => {
                    if (!tenantId || refreshing) return;
                    setRefreshing(true);
                    try {
                      await refreshWinningPatterns(tenantId);
                      const fresh = await fetchWinningPatterns(tenantId);
                      setWinningPatterns(fresh);
                    } catch {}
                    setRefreshing(false);
                  }}
                  disabled={refreshing}
                  className="text-xs px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg disabled:opacity-50"
                >
                  {refreshing ? "更新中..." : "パターン更新"}
                </button>
              </div>

              {winningPatterns ? (
                <>
                  {/* Top performers summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {winningPatterns.topTone && (
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                        <div className="text-[10px] text-purple-600 font-medium">最強トーン</div>
                        <div className="text-sm font-semibold mt-0.5">{winningPatterns.topTone.key}</div>
                        <div className="text-[10px] text-gray-500">
                          返信率 {winningPatterns.topTone.replyRate}%
                          <span className="text-gray-400 ml-1">n={winningPatterns.topTone.sampleSize}</span>
                        </div>
                      </div>
                    )}
                    {winningPatterns.topHypothesis && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <div className="text-[10px] text-blue-600 font-medium">最強課題仮説</div>
                        <div className="text-sm font-semibold mt-0.5">{winningPatterns.topHypothesis.label}</div>
                        <div className="text-[10px] text-gray-500">
                          返信率 {winningPatterns.topHypothesis.replyRate}%
                          <span className="text-gray-400 ml-1">n={winningPatterns.topHypothesis.sampleSize}</span>
                        </div>
                      </div>
                    )}
                    {winningPatterns.topCta && (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                        <div className="text-[10px] text-green-600 font-medium">最強バリアント</div>
                        <div className="text-sm font-semibold mt-0.5">{winningPatterns.topCta.key}</div>
                        <div className="text-[10px] text-gray-500">
                          返信率 {winningPatterns.topCta.replyRate}%
                          <span className="text-gray-400 ml-1">n={winningPatterns.topCta.sampleSize}</span>
                        </div>
                      </div>
                    )}
                    {winningPatterns.topSource && (
                      <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                        <div className="text-[10px] text-orange-600 font-medium">最強ソース</div>
                        <div className="text-sm font-semibold mt-0.5">
                          {SOURCE_TYPE_LABELS[winningPatterns.topSource.key] ?? winningPatterns.topSource.key}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          商談率 {winningPatterns.topSource.meetingRate}%
                          <span className="text-gray-400 ml-1">n={winningPatterns.topSource.sampleSize}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* All patterns table */}
                  {winningPatterns.patterns.length > 0 && (
                    <div className="overflow-x-auto border rounded-xl">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b">
                            <th className="py-2 px-3">タイプ</th>
                            <th className="py-2 px-3">パターン</th>
                            <th className="py-2 px-3 text-right">返信率</th>
                            <th className="py-2 px-3 text-right">商談率</th>
                            <th className="py-2 px-3 text-right">スコア</th>
                            <th className="py-2 px-3 text-right">サンプル</th>
                          </tr>
                        </thead>
                        <tbody>
                          {winningPatterns.patterns.map((p) => (
                            <tr key={p.id} className="border-b last:border-0">
                              <td className="py-2 px-3">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                  {PATTERN_TYPE_LABELS[p.pattern_type as keyof typeof PATTERN_TYPE_LABELS] ?? p.pattern_type}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-medium">{p.label}</td>
                              <td className="py-2 px-3 text-right">{p.reply_rate}%</td>
                              <td className="py-2 px-3 text-right">{p.meeting_rate}%</td>
                              <td className="py-2 px-3 text-right font-semibold">{p.win_score}</td>
                              <td className="py-2 px-3 text-right text-gray-400">
                                n={p.sample_size}
                                {p.sample_size < 5 && <span className="text-[10px] text-amber-500 ml-1">参考値</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {winningPatterns.patterns.length === 0 && (
                    <div className="text-sm text-gray-400 py-4 text-center">
                      パターンデータがありません。「パターン更新」を実行してください。
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-gray-400 py-4 text-center">
                  勝ちパターンを表示するには「パターン更新」を実行してください。
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
