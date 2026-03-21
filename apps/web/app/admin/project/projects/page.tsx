'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface Project {
  id: string;
  name: string;
  customer_name: string;
  status: 'draft' | 'in_progress' | 'completed' | 'cancelled';
  start_date?: string | null;
  createdAt: string;
}

const STATUS_TABS = [
  { key: 'all', label: 'すべて' },
  { key: 'draft', label: '下書き' },
  { key: 'in_progress', label: '進行中' },
  { key: 'completed', label: '完了' },
  { key: 'cancelled', label: 'キャンセル' },
] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: '下書き',
  in_progress: '進行中',
  completed: '完了',
  cancelled: 'キャンセル',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const DEMO_PROJECTS: Project[] = [
  { id: 'p1', name: '山田邸 外壁塗装工事', customer_name: '山田太郎', status: 'in_progress', start_date: '2026-03-15', createdAt: '2026-03-10T10:00:00' },
  { id: 'p2', name: '佐藤ビル 防水工事', customer_name: '佐藤建設株式会社', status: 'draft', start_date: null, createdAt: '2026-03-18T14:30:00' },
  { id: 'p3', name: '田中邸 屋根修繕', customer_name: '田中花子', status: 'completed', start_date: '2026-02-01', createdAt: '2026-01-20T09:00:00' },
  { id: 'p4', name: '鈴木マンション 大規模修繕', customer_name: '鈴木管理組合', status: 'in_progress', start_date: '2026-03-01', createdAt: '2026-02-15T11:00:00' },
  { id: 'p5', name: '高橋邸 内装リフォーム', customer_name: '高橋一郎', status: 'cancelled', start_date: null, createdAt: '2026-03-05T16:00:00' },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function ProjectListPage() {
  const { tenantId, status } = useAdminTenantId();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [isDemo, setIsDemo] = useState(false);

  const fetchProjects = useCallback(() => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(
      `/api/proxy/admin/project/projects?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const list = json?.data ?? json?.projects ?? [];
        if (list.length > 0) {
          setProjects(list);
        } else {
          setProjects(DEMO_PROJECTS);
          setIsDemo(true);
        }
      })
      .catch(() => {
        setProjects(DEMO_PROJECTS);
        setIsDemo(true);
      })
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filtered = activeTab === 'all'
    ? projects
    : projects.filter(p => p.status === activeTab);

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="案件一覧" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="案件一覧"
        subtitle="案件の一覧・管理ができます。"
        right={
          <Link
            href={withTenant('/admin/project/projects/new', tenantId)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 transition-colors"
          >
            + 新規案件登録
          </Link>
        }
      />

      <div className="px-6 pb-8 space-y-6">
        {isDemo && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            デモデータ
          </div>
        )}

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-amber-300 hover:text-amber-600'
              }`}
            >
              {tab.label}
              {tab.key !== 'all' && (
                <span className="ml-1.5 text-xs opacity-75">
                  {projects.filter(p => p.status === tab.key).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Count */}
        <p className="text-sm text-gray-500">{filtered.length}件の案件</p>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-16 h-16 text-amber-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 font-medium">
              {activeTab === 'all' ? '案件はまだありません' : `${STATUS_LABELS[activeTab] || activeTab}の案件はありません`}
            </p>
            <Link
              href={withTenant('/admin/project/projects/new', tenantId)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 transition-colors"
            >
              + 最初の案件を登録する
            </Link>
          </div>
        )}

        {/* Project table */}
        {filtered.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3">案件名</th>
                    <th className="px-5 py-3">顧客名</th>
                    <th className="px-5 py-3">ステータス</th>
                    <th className="px-5 py-3">開始日</th>
                    <th className="px-5 py-3">作成日</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(project => (
                    <tr key={project.id} className="border-b border-gray-50 hover:bg-amber-50/40 transition-colors">
                      <td className="px-5 py-3">
                        <Link
                          href={withTenant(`/admin/project/projects/${project.id}`, tenantId)}
                          className="text-amber-600 hover:text-amber-700 font-medium"
                        >
                          {project.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-900">{project.customer_name}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_LABELS[project.status] || project.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{formatDate(project.start_date)}</td>
                      <td className="px-5 py-3 text-gray-500">{formatDate(project.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
