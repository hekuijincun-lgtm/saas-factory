'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface Member {
  id: string;
  name: string;
  planName: string;
  planType?: string;
  status: 'active' | 'paused' | 'cancelled';
  remainingCount?: number | null;
  startDate?: string;
}

interface Plan {
  id: string;
  name: string;
}

type StatusFilter = 'all' | 'active' | 'paused' | 'cancelled';

const STATUS_LABELS: Record<string, string> = {
  active: 'アクティブ',
  paused: '休会中',
  cancelled: '解約済',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

export default function MemberListPage() {
  const { tenantId, status } = useAdminTenantId();
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPlanId, setFormPlanId] = useState('');
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const fetchMembers = useCallback(() => {
    if (status !== 'ready') return;
    setLoading(true);
    const qs = filter !== 'all' ? `&status=${filter}` : '';
    fetch(
      `/api/proxy/admin/subscription/members?tenantId=${encodeURIComponent(tenantId)}${qs}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        setMembers(json?.data ?? json?.members ?? []);
      })
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [tenantId, status, filter]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    if (status !== 'ready') return;
    fetch(
      `/api/proxy/admin/subscription/plans?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        setPlans(json?.data ?? json?.plans ?? []);
      })
      .catch(() => {});
  }, [tenantId, status]);

  const filtered = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.trim().toLowerCase();
    return members.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.planName.toLowerCase().includes(q),
    );
  }, [members, search]);

  const handleCreate = async () => {
    if (!formName.trim() || !formPlanId) return;
    setCreating(true);
    try {
      const res = await fetch(
        `/api/proxy/admin/subscription/members?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_id: formName.trim(), plan_id: formPlanId, start_date: new Date().toISOString().slice(0, 10) }),
        },
      );
      if (!res.ok) throw new Error('create failed');
      showToast('会員を登録しました');
      setFormName('');
      setFormPlanId('');
      setShowForm(false);
      fetchMembers();
    } catch {
      showToast('登録に失敗しました');
    } finally {
      setCreating(false);
    }
  };

  const TABS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'すべて' },
    { key: 'active', label: 'アクティブ' },
    { key: 'paused', label: '休会中' },
    { key: 'cancelled', label: '解約済' },
  ];

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="会員一覧" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="会員一覧"
        subtitle="会員のステータス管理・新規登録ができます。"
        right={
          <button
            onClick={() => setShowForm(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-600 transition-colors"
          >
            + 新規会員登録
          </button>
        }
      />

      <div className="px-6 pb-8 space-y-6">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        )}

        {/* Inline create form */}
        {showForm && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">新規会員登録</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">会員名</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="氏名を入力"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">プラン</label>
                <select
                  value={formPlanId}
                  onChange={e => setFormPlanId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                >
                  <option value="">プランを選択</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCreate}
                disabled={creating || !formName.trim() || !formPlanId}
                className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? '登録中...' : '登録する'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === t.key
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="会員名・プラン名で検索..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
          />
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-16 h-16 text-blue-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-gray-500 font-medium">会員が登録されていません</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-600 transition-colors"
            >
              + 最初の会員を登録する
            </button>
          </div>
        )}

        {/* Member cards grid */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(member => (
              <Link
                key={member.id}
                href={withTenant(`/admin/subscription/members/${member.id}`, tenantId)}
                className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                      {member.name}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">{member.planName}</p>
                    {member.startDate && (
                      <p className="text-xs text-gray-400 mt-1">開始: {member.startDate}</p>
                    )}
                    {member.remainingCount != null && (
                      <p className="text-xs text-blue-600 font-medium mt-1">
                        残り {member.remainingCount}回
                      </p>
                    )}
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[member.status] || 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABELS[member.status] || member.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
