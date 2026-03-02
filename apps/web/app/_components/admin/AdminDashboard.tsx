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

interface EyebrowKpi {
  totalReservations: number;
  totalCustomers: number;
  repeatCustomers: number;
  repeatConversionRate: number | null;
  avgRepeatIntervalDays: number | null;
  missingCustomerKeyCount?: number;
  staffCounts: Record<string, number>;
}

export default function AdminDashboard() {
  const searchParams = useSearchParams();
  const tenantId = searchParams?.get('tenantId') || 'default';

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eyebrowKpi, setEyebrowKpi] = useState<EyebrowKpi | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);

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
