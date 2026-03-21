'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface Plan {
  id: string;
  name: string;
  planType: 'monthly' | 'count' | 'yearly';
  price: number;
  count?: number | null;
  description?: string;
  memberCount?: number;
}

const PLAN_TYPE_LABELS: Record<string, string> = {
  monthly: '月額',
  count: '回数券',
  yearly: '年額',
};

const PLAN_TYPE_COLORS: Record<string, string> = {
  monthly: 'bg-blue-100 text-blue-700',
  count: 'bg-purple-100 text-purple-700',
  yearly: 'bg-green-100 text-green-700',
};

const EMPTY_FORM = {
  name: '',
  planType: 'monthly' as 'monthly' | 'count' | 'yearly',
  price: '',
  count: '',
  description: '',
};

export default function PlanManagementPage() {
  const { tenantId, status } = useAdminTenantId();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const fetchPlans = useCallback(() => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(
      `/api/proxy/admin/subscription/plans?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        setPlans(json?.data ?? json?.plans ?? []);
      })
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const openEdit = (plan: Plan) => {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      planType: plan.planType,
      price: String(plan.price),
      count: plan.count != null ? String(plan.count) : '',
      description: plan.description || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price) return;
    setSaving(true);
    const body: any = {
      name: form.name.trim(),
      planType: form.planType,
      price: Number(form.price),
      description: form.description.trim(),
    };
    if (form.planType === 'count' && form.count) {
      body.count = Number(form.count);
    }

    try {
      const url = editingId
        ? `/api/proxy/admin/subscription/plans/${editingId}?tenantId=${encodeURIComponent(tenantId)}`
        : `/api/proxy/admin/subscription/plans?tenantId=${encodeURIComponent(tenantId)}`;
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('save failed');
      showToast(editingId ? 'プランを更新しました' : 'プランを作成しました');
      setShowForm(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      fetchPlans();
    } catch {
      showToast('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (planId: string, planName: string) => {
    if (!confirm(`「${planName}」を削除しますか？この操作は元に戻せません。`)) return;
    try {
      const res = await fetch(
        `/api/proxy/admin/subscription/plans/${planId}?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('delete failed');
      showToast('プランを削除しました');
      fetchPlans();
    } catch {
      showToast('削除に失敗しました');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="プラン管理" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="プラン管理"
        subtitle="料金プランの作成・編集・削除ができます。"
        right={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-600 transition-colors"
          >
            + 新規プラン作成
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

        {/* Plan form */}
        {showForm && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">
              {editingId ? 'プランを編集' : '新規プラン作成'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">プラン名</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例: スタンダード月額"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">タイプ</label>
                <select
                  value={form.planType}
                  onChange={e => setForm(f => ({ ...f, planType: e.target.value as any }))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                >
                  <option value="monthly">月額</option>
                  <option value="count">回数券</option>
                  <option value="yearly">年額</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">料金 (円)</label>
                <input
                  type="number"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="5000"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                />
              </div>
              {form.planType === 'count' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">回数</label>
                  <input
                    type="number"
                    value={form.count}
                    onChange={e => setForm(f => ({ ...f, count: e.target.value }))}
                    placeholder="10"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                  />
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">説明 (任意)</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="プランの説明を入力..."
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 resize-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.price}
                className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '保存中...' : editingId ? '更新する' : '作成する'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {plans.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-16 h-16 text-blue-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 font-medium">プランが登録されていません</p>
            <button
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-600 transition-colors"
            >
              + 最初のプランを作成する
            </button>
          </div>
        )}

        {/* Plan cards grid */}
        {plans.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map(plan => (
              <div
                key={plan.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_TYPE_COLORS[plan.planType] || 'bg-gray-100 text-gray-700'}`}>
                        {PLAN_TYPE_LABELS[plan.planType] || plan.planType}
                      </span>
                    </div>
                    <p className="mt-1 text-2xl font-bold text-blue-600">
                      ¥{plan.price.toLocaleString()}
                      <span className="text-sm font-normal text-gray-400">
                        {plan.planType === 'monthly' ? '/月' : plan.planType === 'yearly' ? '/年' : ''}
                      </span>
                    </p>
                  </div>
                </div>
                {plan.planType === 'count' && plan.count != null && (
                  <p className="text-sm text-gray-500 mb-2">{plan.count}回分</p>
                )}
                {plan.description && (
                  <p className="text-sm text-gray-500 mb-3">{plan.description}</p>
                )}
                {plan.memberCount != null && (
                  <p className="text-xs text-gray-400 mb-3">会員数: {plan.memberCount}名</p>
                )}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => openEdit(plan)}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    編集
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => handleDelete(plan.id, plan.name)}
                    className="text-sm text-red-500 hover:text-red-700 font-medium"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
