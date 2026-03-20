'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import { getMenu, type MenuItem } from '@/src/lib/bookingApi';
import AdminTopBar from '../../_components/ui/AdminTopBar';

interface Reservation {
  id: string;
  date: string;
  time: string;
  customerName: string;
  menuName: string;
  staffName?: string;
}

/** Match a reservation's menuName against menu items and return the price. */
function estimatePrice(menuName: string, menuItems: MenuItem[]): number {
  for (const item of menuItems) {
    if (menuName.includes(item.name)) {
      return item.price;
    }
  }
  return 0;
}

function estimateRevenue(reservations: Reservation[], menuItems: MenuItem[]): number {
  return reservations.reduce((sum, r) => sum + estimatePrice(r.menuName, menuItems), 0);
}

const DEMO_RESERVATIONS: Reservation[] = [
  { id: 'd1', date: '2026-03-19', time: '10:00', customerName: '田中太郎', menuName: 'トリミングコース（小型犬）', staffName: '佐藤' },
  { id: 'd2', date: '2026-03-19', time: '11:30', customerName: '山田花子', menuName: 'シャンプーコース（中型犬）', staffName: '鈴木' },
  { id: 'd3', date: '2026-03-19', time: '14:00', customerName: '佐々木一郎', menuName: 'トリミングコース（大型犬）', staffName: '佐藤' },
  { id: 'd4', date: '2026-03-20', time: '10:00', customerName: '高橋美咲', menuName: '部分カット（小型犬）', staffName: '鈴木' },
  { id: 'd5', date: '2026-03-20', time: '13:00', customerName: '渡辺健太', menuName: 'デンタルケア（中型犬）', staffName: '佐藤' },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekEnd() {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PetDashboardPage() {
  const { tenantId, status } = useAdminTenantId();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expiringVaccineCount, setExpiringVaccineCount] = useState(0);
  const [groomingDueCount, setGroomingDueCount] = useState(0);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  useEffect(() => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(`/api/proxy/admin/reservations?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const list: Reservation[] = json?.data ?? json?.reservations ?? [];
        if (list.length === 0) {
          setReservations(DEMO_RESERVATIONS);
          setIsDemo(true);
        } else {
          setReservations(list);
          setIsDemo(false);
        }
      })
      .catch(() => {
        setReservations(DEMO_RESERVATIONS);
        setIsDemo(true);
      })
      .finally(() => setLoading(false));

    // Fetch expiring vaccines count
    fetch(`/api/proxy/admin/pets/expiring-vaccines?tenantId=${encodeURIComponent(tenantId)}&days=30`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const raw = json?.data ?? json?.alerts ?? json?.vaccines ?? [];
        setExpiringVaccineCount(Array.isArray(raw) ? raw.length : 0);
      })
      .catch(() => {});

    // Fetch pets to count grooming reminders
    fetch(`/api/proxy/admin/pets?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const pets: { lastGroomingDate?: string; createdAt?: string }[] = json?.data ?? json?.pets ?? [];
        const now = Date.now();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        const dueCount = pets.filter(p => {
          if (p.lastGroomingDate) {
            return now - new Date(p.lastGroomingDate).getTime() > thirtyDays;
          }
          if (p.createdAt) {
            return now - new Date(p.createdAt).getTime() > thirtyDays;
          }
          return false;
        }).length;
        setGroomingDueCount(dueCount);
      })
      .catch(() => {});

    // Fetch menu items for revenue estimation
    getMenu(tenantId)
      .then(items => setMenuItems(Array.isArray(items) ? items.filter(i => i.active) : []))
      .catch(() => {});
  }, [tenantId, status]);

  const today = todayStr();
  const weekEndDate = weekEnd();
  const todayCount = reservations.filter(r => r.date === today).length;
  const weekCount = reservations.filter(r => r.date >= today && r.date <= weekEndDate).length;

  // Popular courses TOP3
  const courseCount: Record<string, number> = {};
  for (const r of reservations) {
    const name = r.menuName || '不明';
    courseCount[name] = (courseCount[name] || 0) + 1;
  }
  // Revenue estimates
  const todayReservations = reservations.filter(r => r.date === today);
  const weekReservations = reservations.filter(r => r.date >= today && r.date <= weekEndDate);
  const todayRevenue = menuItems.length > 0 ? estimateRevenue(todayReservations, menuItems) : null;
  const weekRevenue = menuItems.length > 0 ? estimateRevenue(weekReservations, menuItems) : null;

  const top3 = Object.entries(courseCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const recent5 = [...reservations]
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
    .slice(0, 5);

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

  return (
    <>
      <AdminTopBar title="ペットサロン ダッシュボード" subtitle="ペットサロンの予約・コース状況を一覧で確認できます。" />

      <div className="px-6 pb-8 space-y-6">
        {isDemo && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
            <span className="w-2 h-2 rounded-full bg-orange-400" />
            デモデータ
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">今日の予約数</p>
            <p className="mt-2 text-3xl font-bold text-orange-600">{todayCount}</p>
          </div>
          <div className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">今週の予約数</p>
            <p className="mt-2 text-3xl font-bold text-orange-600">{weekCount}</p>
          </div>
          <div className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">人気コース TOP3</p>
            <ul className="mt-2 space-y-1">
              {top3.length === 0 && <li className="text-sm text-gray-400">データなし</li>}
              {top3.map(([name, count], i) => (
                <li key={name} className="text-sm text-gray-700">
                  <span className="font-semibold text-orange-600">{i + 1}.</span> {name}
                  <span className="ml-1 text-gray-400">({count}件)</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">今日の売上見込み</p>
            <p className="mt-2 text-3xl font-bold text-orange-600">
              {todayRevenue !== null ? `¥${todayRevenue.toLocaleString()}` : '—'}
            </p>
            {todayRevenue !== null && (
              <p className="mt-1 text-xs text-gray-400">メニュー料金で概算</p>
            )}
          </div>
          <div className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">今週の売上見込み</p>
            <p className="mt-2 text-3xl font-bold text-orange-600">
              {weekRevenue !== null ? `¥${weekRevenue.toLocaleString()}` : '—'}
            </p>
            {weekRevenue !== null && (
              <p className="mt-1 text-xs text-gray-400">メニュー料金で概算</p>
            )}
          </div>
        </div>

        {/* Recent Reservations */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">直近の予約</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">日付</th>
                  <th className="px-5 py-3">時間</th>
                  <th className="px-5 py-3">お客様</th>
                  <th className="px-5 py-3">コース</th>
                  <th className="px-5 py-3">担当</th>
                </tr>
              </thead>
              <tbody>
                {recent5.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-orange-50/40 transition-colors">
                    <td className="px-5 py-3 text-gray-700">{r.date}</td>
                    <td className="px-5 py-3 text-gray-700">{r.time}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{r.customerName}</td>
                    <td className="px-5 py-3 text-gray-700">{r.menuName}</td>
                    <td className="px-5 py-3 text-gray-500">{r.staffName || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Vaccine Alert */}
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

        {/* Grooming Reminder Alert */}
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

      </div>
    </>
  );
}
