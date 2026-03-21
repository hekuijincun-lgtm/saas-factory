'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../_components/ui/AdminTopBar';

interface Stats {
  totalMembers: number;
  activeMembers: number;
  newThisMonth: number;
  churnRate: number;
}

interface CheckinEntry {
  id: string;
  memberName: string;
  planName: string;
  checkedInAt: string;
}

const DEMO_STATS: Stats = {
  totalMembers: 128,
  activeMembers: 102,
  newThisMonth: 14,
  churnRate: 3.2,
};

const DEMO_CHECKINS: CheckinEntry[] = [
  { id: 'c1', memberName: '田中太郎', planName: 'スタンダード月額', checkedInAt: '2026-03-21T09:05:00' },
  { id: 'c2', memberName: '山田花子', planName: 'プレミアム月額', checkedInAt: '2026-03-21T09:22:00' },
  { id: 'c3', memberName: '佐藤健一', planName: '回数券10回', checkedInAt: '2026-03-21T10:01:00' },
  { id: 'c4', memberName: '鈴木美咲', planName: 'スタンダード月額', checkedInAt: '2026-03-21T10:30:00' },
  { id: 'c5', memberName: '高橋一郎', planName: 'プレミアム月額', checkedInAt: '2026-03-21T11:15:00' },
  { id: 'c6', memberName: '渡辺恵子', planName: 'スタンダード月額', checkedInAt: '2026-03-21T12:00:00' },
  { id: 'c7', memberName: '伊藤大輔', planName: '回数券10回', checkedInAt: '2026-03-21T13:20:00' },
  { id: 'c8', memberName: '小林由美', planName: 'プレミアム月額', checkedInAt: '2026-03-21T14:05:00' },
  { id: 'c9', memberName: '加藤翔太', planName: 'スタンダード月額', checkedInAt: '2026-03-21T15:10:00' },
  { id: 'c10', memberName: '吉田真理', planName: '年額プラン', checkedInAt: '2026-03-21T15:45:00' },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function SubscriptionDashboardPage() {
  const { tenantId, status } = useAdminTenantId();
  const [stats, setStats] = useState<Stats | null>(null);
  const [checkins, setCheckins] = useState<CheckinEntry[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== 'ready') return;
    setLoading(true);

    const fetchStats = fetch(
      `/api/proxy/admin/subscription/stats?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const s = json?.data ?? json?.stats ?? null;
        if (s && typeof s.totalMembers === 'number') {
          setStats(s);
          return true;
        }
        return false;
      })
      .catch(() => false);

    const fetchCheckins = fetch(
      `/api/proxy/admin/subscription/checkins?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const list: CheckinEntry[] = json?.data ?? json?.checkins ?? [];
        if (list.length > 0) {
          setCheckins(list.slice(0, 10));
          return true;
        }
        return false;
      })
      .catch(() => false);

    Promise.all([fetchStats, fetchCheckins]).then(([statsOk, checkinsOk]) => {
      if (!statsOk) {
        setStats(DEMO_STATS);
        setIsDemo(true);
      }
      if (!checkinsOk) {
        setCheckins(DEMO_CHECKINS);
        if (!statsOk) setIsDemo(true);
      }
      setLoading(false);
    });
  }, [tenantId, status]);

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="会員管理 ダッシュボード" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="会員管理 ダッシュボード"
        subtitle="会員数・チェックイン状況を一覧で確認できます。"
      />

      <div className="px-6 pb-8 space-y-6">
        {isDemo && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            デモデータ
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">総会員数</p>
            <p className="mt-2 text-3xl font-bold text-blue-600">{stats?.totalMembers ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">アクティブ会員</p>
            <p className="mt-2 text-3xl font-bold text-blue-600">{stats?.activeMembers ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">今月新規</p>
            <p className="mt-2 text-3xl font-bold text-blue-600">{stats?.newThisMonth ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">解約率</p>
            <p className="mt-2 text-3xl font-bold text-blue-600">{stats?.churnRate ?? 0}%</p>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href={withTenant('/admin/subscription/members', tenantId)}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group"
          >
            <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">会員一覧</p>
            <p className="text-xs text-gray-400 mt-1">会員の検索・管理</p>
          </Link>
          <Link
            href={withTenant('/admin/subscription/plans', tenantId)}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group"
          >
            <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">プラン管理</p>
            <p className="text-xs text-gray-400 mt-1">料金プランの設定</p>
          </Link>
          <Link
            href={withTenant('/admin/subscription/checkin', tenantId)}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group"
          >
            <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">チェックイン</p>
            <p className="text-xs text-gray-400 mt-1">来店受付・QR読取</p>
          </Link>
        </div>

        {/* Today's Check-ins */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">本日のチェックイン</h2>
            <span className="text-sm text-blue-600 font-medium">{checkins.length}件</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">時間</th>
                  <th className="px-5 py-3">会員名</th>
                  <th className="px-5 py-3">プラン</th>
                </tr>
              </thead>
              <tbody>
                {checkins.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-5 py-3 text-gray-700">{formatTime(c.checkedInAt)}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{c.memberName}</td>
                    <td className="px-5 py-3 text-gray-500">{c.planName}</td>
                  </tr>
                ))}
                {checkins.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-gray-400">
                      本日のチェックインはまだありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
