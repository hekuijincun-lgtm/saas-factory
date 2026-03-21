'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../_components/ui/AdminTopBar';

interface ProjectStats {
  totalProjects: number;
  activeProjects: number;
  monthEstimates: number;
  monthInvoicePaid: number;
  pendingTasks: number;
}

const DEMO_STATS: ProjectStats = {
  totalProjects: 24,
  activeProjects: 8,
  monthEstimates: 1850000,
  monthInvoicePaid: 1240000,
  pendingTasks: 15,
};

export default function ProjectDashboardPage() {
  const { tenantId, status } = useAdminTenantId();
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== 'ready') return;
    setLoading(true);

    fetch(
      `/api/proxy/admin/project/stats?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const s = json?.data ?? json?.stats ?? null;
        if (s && typeof s.totalProjects === 'number') {
          setStats(s);
        } else {
          setStats(DEMO_STATS);
          setIsDemo(true);
        }
      })
      .catch(() => {
        setStats(DEMO_STATS);
        setIsDemo(true);
      })
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="案件管理 ダッシュボード" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="案件管理 ダッシュボード"
        subtitle="案件・見積・請求・タスクの状況を一覧で確認できます。"
      />

      <div className="px-6 pb-8 space-y-6">
        {isDemo && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            デモデータ
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">総案件数</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">{stats?.totalProjects ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">進行中</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">{stats?.activeProjects ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">今月見積</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">{'\u00A5'}{(stats?.monthEstimates ?? 0).toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">今月入金</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">{'\u00A5'}{(stats?.monthInvoicePaid ?? 0).toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">未完了タスク</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">{stats?.pendingTasks ?? 0}</p>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href={withTenant('/admin/project/projects', tenantId)}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-amber-300 hover:shadow-md transition-all group"
          >
            <p className="text-sm font-semibold text-gray-900 group-hover:text-amber-600 transition-colors">案件管理</p>
            <p className="text-xs text-gray-400 mt-1">案件の一覧・登録・編集</p>
          </Link>
          <Link
            href={withTenant('/admin/project/estimates', tenantId)}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-amber-300 hover:shadow-md transition-all group"
          >
            <p className="text-sm font-semibold text-gray-900 group-hover:text-amber-600 transition-colors">見積・請求</p>
            <p className="text-xs text-gray-400 mt-1">見積書・請求書の管理</p>
          </Link>
          <Link
            href={withTenant('/admin/project/partners', tenantId)}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-amber-300 hover:shadow-md transition-all group"
          >
            <p className="text-sm font-semibold text-gray-900 group-hover:text-amber-600 transition-colors">協力業者</p>
            <p className="text-xs text-gray-400 mt-1">協力業者の登録・管理</p>
          </Link>
        </div>
      </div>
    </>
  );
}
