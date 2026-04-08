'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../_components/ui/AdminTopBar';
import AgentChat from '@/components/AgentChat';

interface DashboardData {
  today: { count: number; revenue: number };
  week: { count: number; revenue: number };
  month: { count: number; revenue: number; cancelRate: number };
  prevMonth: { count: number; revenue: number };
  comparison: { countVsLastMonth: number | null; revenueVsLastMonth: number | null };
  customers: { total: number; newThisMonth: number; repeatRate: number };
  recentBookings: {
    id: string; date: string; time: string;
    customerName: string; menuName: string; staffId: string; durationMin: number;
  }[];
  topMenus: { name: string; count: number }[];
}

function TrendBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400">前月データなし</span>;
  const isUp = value > 0;
  const isFlat = value === 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium whitespace-nowrap ${isUp ? 'text-green-600' : isFlat ? 'text-gray-500' : 'text-red-500'}`}>
      {isUp ? '↑' : isFlat ? '→' : '↓'}
      {isFlat ? '前月同' : `${Math.abs(value)}% ${isUp ? '増' : '減'}`}
    </span>
  );
}

export default function PetDashboardPage() {
  const { tenantId, status } = useAdminTenantId();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiringVaccineCount, setExpiringVaccineCount] = useState(0);
  const [groomingDueCount, setGroomingDueCount] = useState(0);

  useEffect(() => {
    if (status !== 'ready') return;
    setLoading(true);

    fetch(`/api/proxy/admin/dashboard?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('fetch failed'); return r.json(); })
      .then((json: any) => {
        if (!json.ok) throw new Error(json.error || 'API error');
        setData(json);
        setError(null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));

    fetch(`/api/proxy/admin/pets/expiring-vaccines?tenantId=${encodeURIComponent(tenantId)}&days=30`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const raw = json?.data ?? json?.alerts ?? json?.vaccines ?? [];
        setExpiringVaccineCount(Array.isArray(raw) ? raw.length : 0);
      })
      .catch(() => {});

    fetch(`/api/proxy/admin/pets?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const pets: { lastGroomingDate?: string; createdAt?: string }[] = json?.data ?? json?.pets ?? [];
        const now = Date.now();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        setGroomingDueCount(pets.filter(p => {
          const d = p.lastGroomingDate || p.createdAt;
          return d && now - new Date(d).getTime() > thirtyDays;
        }).length);
      })
      .catch(() => {});
  }, [tenantId, status]);

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="ペットサロン ダッシュボード" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <AdminTopBar title="ペットサロン ダッシュボード" />
        <div className="px-6 py-8">
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            ダッシュボードの読み込みに失敗しました: {error || '不明なエラー'}
          </div>
        </div>
      </>
    );
  }

  const { today, week, month, comparison, customers, recentBookings, topMenus } = data;

  return (
    <>
      <AdminTopBar title="ペットサロン ダッシュボード" subtitle="予約・売上・顧客の状況をリアルタイムで確認" />

      <div className="px-6 pb-8 space-y-6">

        {/* === 今日・今週 KPI === */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">今日の予約</p>
            <p className="mt-2 text-3xl font-bold text-orange-600">{today.count}</p>
            <p className="mt-1 text-sm text-gray-500">¥{today.revenue.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">今週の予約</p>
            <p className="mt-2 text-3xl font-bold text-orange-600">{week.count}</p>
            <p className="mt-1 text-sm text-gray-500">¥{week.revenue.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">今月の予約</p>
            <p className="mt-2 text-3xl font-bold text-orange-600">{month.count}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-gray-500">¥{month.revenue.toLocaleString()}</span>
              <TrendBadge value={comparison.countVsLastMonth} />
            </div>
          </div>
          <div className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">キャンセル率</p>
            <p className="mt-2 text-3xl font-bold text-orange-600">{month.cancelRate}%</p>
            <p className="mt-1 text-sm text-gray-500">今月</p>
          </div>
        </div>

        {/* === 顧客 KPI === */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">累計顧客数</p>
            <p className="mt-2 text-3xl font-bold text-blue-600">{customers.total}</p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">今月の新規顧客</p>
            <p className="mt-2 text-3xl font-bold text-blue-600">{customers.newThisMonth}</p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">リピート率</p>
            <p className="mt-2 text-3xl font-bold text-blue-600">{customers.repeatRate}%</p>
            <p className="mt-1 text-xs text-gray-400">2回以上来店の顧客割合</p>
          </div>
        </div>

        {/* === 人気コース TOP3 === */}
        <div className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">人気コース TOP3（過去30日）</p>
          <ul className="space-y-2">
            {topMenus.length === 0 && <li className="text-sm text-gray-400">データなし</li>}
            {topMenus.map((m, i) => (
              <li key={m.name} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  <span className="font-semibold text-orange-600 mr-1">{i + 1}.</span>{m.name}
                </span>
                <span className="text-gray-400">{m.count}件</span>
              </li>
            ))}
          </ul>
        </div>

        {/* === 直近の予約 === */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">直近の予約</h2>
          </div>
          {recentBookings.length === 0 ? (
            <div className="p-5 text-sm text-gray-400 text-center">予約データがありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3 min-w-[90px]">日付</th>
                    <th className="px-5 py-3 min-w-[60px]">時間</th>
                    <th className="px-5 py-3 min-w-[80px]">お客様</th>
                    <th className="px-5 py-3 min-w-[80px]">コース</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-orange-50/40 transition-colors">
                      <td className="px-5 py-3 text-gray-700">{r.date}</td>
                      <td className="px-5 py-3 text-gray-700">{r.time}</td>
                      <td className="px-5 py-3 font-medium text-gray-900">{r.customerName}</td>
                      <td className="px-5 py-3 text-gray-700">{r.menuName || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* === アラート === */}
        {expiringVaccineCount > 0 && (
          <Link
            href={withTenant('/admin/pet/vaccines', tenantId)}
            className="block rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm hover:border-red-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-red-700">ワクチン期限アラート</p>
                <p className="text-xs text-red-600 mt-0.5">30日以内に期限を迎えるワクチンが <span className="font-bold">{expiringVaccineCount}件</span> あります</p>
              </div>
            </div>
          </Link>
        )}

        {groomingDueCount > 0 && (
          <Link
            href={withTenant('/admin/pet/profiles', tenantId)}
            className="block rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm hover:border-amber-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-amber-700">リピート促進アラート</p>
                <p className="text-xs text-amber-600 mt-0.5">前回の施術から30日以上経過したペットが <span className="font-bold">{groomingDueCount}件</span> あります</p>
              </div>
            </div>
          </Link>
        )}
        {/* === AIアシスタント === */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">AIアシスタント</h2>
          <AgentChat vertical="pet" />
        </div>
      </div>
    </>
  );
}
