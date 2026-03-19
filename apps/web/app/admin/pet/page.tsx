'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../_components/ui/AdminTopBar';

interface Reservation {
  id: string;
  date: string;
  time: string;
  customerName: string;
  menuName: string;
  staffName?: string;
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
  const top3 = Object.entries(courseCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const recent5 = [...reservations]
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
    .slice(0, 5);

  const subPages = [
    { href: '/admin/pet/inquiries', label: '履歴', desc: '問い合わせ・見積もり履歴を確認' },
    { href: '/admin/pet/pricing', label: '料金設定', desc: 'コース・オプション料金を管理' },
    { href: '/admin/pet/ai-config', label: 'AI設定', desc: 'AI自動応答の設定を管理' },
  ];

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

        {/* Sub-page links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {subPages.map(({ href, label, desc }) => (
            <Link
              key={href}
              href={withTenant(href, tenantId)}
              className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-orange-300 hover:shadow-md transition-all"
            >
              <p className="font-semibold text-gray-900 group-hover:text-orange-600 transition-colors">{label}</p>
              <p className="mt-1 text-xs text-gray-500">{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
