'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Card from '../ui/Card';
import { Scissors } from 'lucide-react';

interface ScheduleItem {
  time: string;
  reservationId: string;
  customerName: string;
  customerPhone: string | null;
  staffId: string;
  durationMin: number;
}

interface CustomerItem {
  id: string;
  name: string;
  phone: string | null;
  visitCount: number;
  lastVisitAt: string | null;
}

interface DashboardData {
  date: string;
  kpis: { reservationsToday: number; revenueExpectedToday: number };
  schedule: ScheduleItem[];
  customers: CustomerItem[];
}

interface StyleBreakdownEntry {
  reservationsCount: number;
  customersCount: number;
  repeatCustomersCount: number;
  repeatConversionRate: number | null;
}

interface EyebrowKpi {
  totalReservations: number;
  totalCustomers: number;
  repeatCustomers: number;
  repeatConversionRate: number | null;
  avgRepeatIntervalDays: number | null;
  missingCustomerKeyCount?: number;
  staffCounts: Record<string, number>;
  styleBreakdown?: Record<string, StyleBreakdownEntry>;
}

// J1: Onboarding status
interface OnboardingItem {
  key: string;
  label: string;
  done: boolean;
  action: string;
  detail?: string;
}
interface OnboardingStatus {
  completedCount: number;
  totalCount: number;
  completionRate: number;
  items: OnboardingItem[];
}

// J3: Repeat metrics
interface RepeatMetrics {
  sentCount: number;
  uniqueCustomersSent: number;
  reservationsAfterSend: number;
  convertedCustomers: number;
  conversionAfterSendRate: number | null;
}

export default function AdminDashboard() {
  const searchParams = useSearchParams();
  const tenantId = searchParams?.get('tenantId') || 'default';

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eyebrowKpi, setEyebrowKpi] = useState<EyebrowKpi | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  // J1
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  // J3
  const [repeatMetrics, setRepeatMetrics] = useState<RepeatMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    fetch(
      `/api/proxy/admin/dashboard?tenantId=${encodeURIComponent(tenantId)}&date=${today}`,
      { cache: 'no-store' }
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((json: any) => {
        if (json?.ok) {
          setData(json as DashboardData);
        } else {
          setError('データ取得に失敗しました');
        }
      })
      .catch(() => setError('ダッシュボードの取得に失敗しました'))
      .finally(() => setLoading(false));

    // Eyebrow KPI fetch
    setKpiLoading(true);
    fetch(`/api/proxy/admin/kpi?tenantId=${encodeURIComponent(tenantId)}&days=90`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => { if (json?.ok) setEyebrowKpi(json.kpi); })
      .catch(() => {})
      .finally(() => setKpiLoading(false));

    // J1: Onboarding status fetch
    fetch(`/api/proxy/admin/onboarding-status?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => { if (json?.ok) setOnboarding(json as OnboardingStatus); })
      .catch(() => {});

    // J3: Repeat metrics fetch
    setMetricsLoading(true);
    fetch(`/api/proxy/admin/repeat-metrics?tenantId=${encodeURIComponent(tenantId)}&days=90&windowDays=14`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => { if (json?.ok) setRepeatMetrics(json.metrics); })
      .catch(() => {})
      .finally(() => setMetricsLoading(false));
  }, [tenantId]);

  if (loading) {
    return <div className="px-6 py-12 text-center text-sm text-gray-400">読み込み中...</div>;
  }

  if (error || !data) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-red-500">{error ?? 'エラーが発生しました'}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 text-xs text-gray-500 underline"
        >
          再読み込み
        </button>
      </div>
    );
  }

  const { kpis, schedule, customers, date } = data;

  return (
    <div className="px-6 pb-8 space-y-6">
      {/* J1: オンボーディング進捗カード（未完了がある場合のみ表示） */}
      {onboarding && onboarding.completionRate < 100 && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-indigo-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🚀</span>
              <h2 className="text-sm font-semibold text-gray-700">導入チェックリスト</h2>
            </div>
            <span className="text-xs font-semibold text-indigo-600">{onboarding.completionRate}% 完了</span>
          </div>
          <div className="px-5 pt-3 pb-2">
            {/* 進捗バー */}
            <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all"
                style={{ width: `${onboarding.completionRate}%` }}
              />
            </div>
            <ul className="space-y-2">
              {onboarding.items.map(item => (
                <li key={item.key} className="flex items-center gap-3 text-sm">
                  <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${item.done ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {item.done ? '✓' : '○'}
                  </span>
                  <span className={item.done ? 'text-gray-400 line-through' : 'text-gray-700'}>
                    {item.label}
                    {item.detail && <span className="ml-1 text-xs text-gray-400">({item.detail})</span>}
                  </span>
                  {!item.done && (
                    <a href={item.action} className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 underline whitespace-nowrap">
                      設定する →
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="px-5 py-3 bg-indigo-50 text-xs text-indigo-600">
            {onboarding.completedCount}/{onboarding.totalCount} 項目完了
          </div>
        </div>
      )}

      {/* KPI カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 本日の予約数 */}
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-2xl">📅</span>
            </div>
            <div>
              <p className="text-sm text-brand-muted mb-1">本日の予約数</p>
              <p className="text-2xl font-semibold text-brand-text">{kpis.reservationsToday}</p>
            </div>
          </div>
        </Card>

        {/* 売上見込み */}
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-2xl">💰</span>
            </div>
            <div>
              <p className="text-sm text-brand-muted mb-1">売上見込み</p>
              <p className="text-2xl font-semibold text-brand-text">
                {kpis.revenueExpectedToday > 0
                  ? `¥${kpis.revenueExpectedToday.toLocaleString()}`
                  : '—'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* 眉毛 KPI カード */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Scissors className="w-4 h-4 text-pink-500" />
          <h2 className="text-sm font-semibold text-gray-700">眉毛サロン KPI <span className="font-normal text-gray-400">（直近90日）</span></h2>
        </div>
        {kpiLoading ? (
          <div className="py-6 text-center text-sm text-gray-400">集計中...</div>
        ) : !eyebrowKpi ? (
          <div className="py-6 text-center text-sm text-gray-400">KPIデータなし（予約データが蓄積されると表示されます）</div>
        ) : (
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-pink-50 rounded-xl">
                <div className="text-2xl font-bold text-pink-600">
                  {eyebrowKpi.repeatConversionRate !== null ? `${eyebrowKpi.repeatConversionRate}%` : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">初回→2回目<br/>転換率</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-xl">
                <div className="text-2xl font-bold text-purple-600">
                  {eyebrowKpi.avgRepeatIntervalDays !== null ? `${eyebrowKpi.avgRepeatIntervalDays}日` : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">平均リピート<br/>間隔</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-xl">
                <div className="text-2xl font-bold text-blue-600">
                  {eyebrowKpi.repeatCustomers}
                  <span className="text-sm font-normal text-gray-400"> / {eyebrowKpi.totalCustomers}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">リピート顧客<br/>/ 総顧客数</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-xl">
                <div className="text-2xl font-bold text-green-600">{eyebrowKpi.totalReservations}</div>
                <div className="text-xs text-gray-500 mt-1">総予約数<br/>（90日）</div>
              </div>
            </div>
            {/* 顧客キー未設定件数（精度注記） */}
            {(eyebrowKpi.missingCustomerKeyCount ?? 0) > 0 && (
              <div className="mt-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
                ⚠ 顧客キー未設定の予約が <strong>{eyebrowKpi.missingCustomerKeyCount}件</strong> あります。バックフィルを実行するとKPI精度が向上します。
              </div>
            )}
            {/* スタッフ別件数 */}
            {Object.keys(eyebrowKpi.staffCounts).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs font-medium text-gray-500 mb-2">スタッフ別件数</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(eyebrowKpi.staffCounts).map(([staffId, cnt]) => (
                    <span key={staffId} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                      {staffId === 'any' ? '指名なし' : staffId}: <strong>{cnt}件</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* スタイル別内訳 */}
            {eyebrowKpi.styleBreakdown && Object.keys(eyebrowKpi.styleBreakdown).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs font-medium text-gray-500 mb-2">スタイル別内訳</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-400">
                        <th className="text-left py-1.5 pr-4 font-medium">スタイル</th>
                        <th className="text-right py-1.5 px-2 font-medium">予約数</th>
                        <th className="text-right py-1.5 px-2 font-medium">顧客数</th>
                        <th className="text-right py-1.5 px-2 font-medium">リピート顧客</th>
                        <th className="text-right py-1.5 pl-2 font-medium">転換率</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {Object.entries(eyebrowKpi.styleBreakdown)
                        .sort(([, a], [, b]) => b.reservationsCount - a.reservationsCount)
                        .map(([style, d]) => (
                          <tr key={style} className="hover:bg-gray-50">
                            <td className="py-1.5 pr-4 text-gray-700 font-medium">{style}</td>
                            <td className="py-1.5 px-2 text-right text-gray-600 tabular-nums">{d.reservationsCount}</td>
                            <td className="py-1.5 px-2 text-right text-gray-600 tabular-nums">{d.customersCount}</td>
                            <td className="py-1.5 px-2 text-right text-gray-600 tabular-nums">{d.repeatCustomersCount}</td>
                            <td className="py-1.5 pl-2 text-right font-medium tabular-nums">
                              {d.repeatConversionRate !== null
                                ? <span className={d.repeatConversionRate >= 30 ? 'text-green-600' : 'text-gray-500'}>{d.repeatConversionRate}%</span>
                                : <span className="text-gray-300">—</span>}
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
      </div>

      {/* J3: リピート施策効果カード */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <span className="text-base">📣</span>
          <h2 className="text-sm font-semibold text-gray-700">リピート施策効果 <span className="font-normal text-gray-400">（直近90日 / 送信後14日以内）</span></h2>
        </div>
        {metricsLoading ? (
          <div className="py-6 text-center text-sm text-gray-400">集計中...</div>
        ) : !repeatMetrics || repeatMetrics.sentCount === 0 ? (
          <div className="py-6 text-center text-sm text-gray-400">
            送信データなし（リピート促進メッセージを送信すると効果が表示されます）
          </div>
        ) : (
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-pink-50 rounded-xl">
                <div className="text-2xl font-bold text-pink-600">
                  {repeatMetrics.conversionAfterSendRate !== null ? `${repeatMetrics.conversionAfterSendRate}%` : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">予約転換率<br/><span className="text-gray-400">（送信後14日）</span></div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-xl">
                <div className="text-2xl font-bold text-green-600">{repeatMetrics.convertedCustomers}</div>
                <div className="text-xs text-gray-500 mt-1">予約に繋がった<br/>顧客数</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-xl">
                <div className="text-2xl font-bold text-blue-600">{repeatMetrics.uniqueCustomersSent}</div>
                <div className="text-xs text-gray-500 mt-1">ユニーク<br/>送信顧客数</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-xl">
                <div className="text-2xl font-bold text-purple-600">{repeatMetrics.sentCount}</div>
                <div className="text-xs text-gray-500 mt-1">総送信数<br/>（90日）</div>
              </div>
            </div>
            {repeatMetrics.reservationsAfterSend > 0 && (
              <div className="mt-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                送信後14日以内に <strong>{repeatMetrics.reservationsAfterSend}件</strong> の予約が入りました
              </div>
            )}
          </div>
        )}
      </div>

      {/* 本日の施術予定 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">本日の施術予定</h2>
          <p className="text-xs text-gray-400 mt-0.5">{date}</p>
        </div>
        {schedule.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-gray-400">本日の施術予定はありません</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    時刻
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    顧客名
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    電話番号
                  </th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    所要時間
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {schedule.map((s) => (
                  <tr key={s.reservationId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900 tabular-nums">{s.time}</td>
                    <td className="px-5 py-3.5 text-gray-900">{s.customerName || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-600 tabular-nums">{s.customerPhone || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-500 text-right tabular-nums">{s.durationMin}分</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 顧客情報 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">顧客情報</h2>
          <p className="text-xs text-gray-400 mt-0.5">直近の顧客一覧（最大50件）</p>
        </div>
        {customers.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-gray-400">顧客データがありません</p>
            <p className="text-xs text-gray-400 mt-1">予約が完了すると顧客が登録されます</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    名前
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    電話番号
                  </th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    来店回数
                  </th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    最終来店日
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{c.name || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-600 tabular-nums">{c.phone || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-600 text-right tabular-nums">{c.visitCount}</td>
                    <td className="px-5 py-3.5 text-gray-500 text-right tabular-nums">{c.lastVisitAt ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
