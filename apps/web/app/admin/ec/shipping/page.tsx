'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface ShippingRule {
  id: string;
  name: string;
  fee: number;
  freeThreshold?: number | null;
  isDefault: boolean;
}

const EMPTY_FORM = {
  name: '',
  fee: '',
  freeThreshold: '',
  isDefault: false,
};

export default function ShippingPage() {
  const { tenantId, status } = useAdminTenantId();
  const [rules, setRules] = useState<ShippingRule[]>([]);
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

  const fetchRules = useCallback(() => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(
      `/api/proxy/admin/ec/shipping?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        setRules(json?.data ?? json?.rules ?? []);
      })
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const openEdit = (rule: ShippingRule) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      fee: String(rule.fee),
      freeThreshold: rule.freeThreshold != null ? String(rule.freeThreshold) : '',
      isDefault: rule.isDefault,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || form.fee === '') return;
    setSaving(true);
    const body: any = {
      name: form.name.trim(),
      fee: Number(form.fee),
      isDefault: form.isDefault,
    };
    if (form.freeThreshold) {
      body.freeThreshold = Number(form.freeThreshold);
    }

    try {
      const url = editingId
        ? `/api/proxy/admin/ec/shipping/${editingId}?tenantId=${encodeURIComponent(tenantId)}`
        : `/api/proxy/admin/ec/shipping?tenantId=${encodeURIComponent(tenantId)}`;
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('save failed');
      showToast(editingId ? '配送ルールを更新しました' : '配送ルールを作成しました');
      setShowForm(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      fetchRules();
    } catch {
      showToast('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId: string, ruleName: string) => {
    if (!confirm(`「${ruleName}」を削除しますか？この操作は元に戻せません。`)) return;
    try {
      const res = await fetch(
        `/api/proxy/admin/ec/shipping/${ruleId}?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('delete failed');
      showToast('配送ルールを削除しました');
      fetchRules();
    } catch {
      showToast('削除に失敗しました');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="配送設定" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="配送設定"
        subtitle="送料ルールの作成・編集・削除ができます。"
        right={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-600 transition-colors"
          >
            + 新規ルール作成
          </button>
        }
      />

      <div className="px-6 pb-8 space-y-6">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">
              {editingId ? '配送ルールを編集' : '新規配送ルール作成'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ルール名 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例: 全国一律送料"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">送料 (円) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={form.fee}
                  onChange={e => setForm(f => ({ ...f, fee: e.target.value }))}
                  placeholder="500"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">送料無料の注文金額</label>
                <input
                  type="number"
                  value={form.freeThreshold}
                  onChange={e => setForm(f => ({ ...f, freeThreshold: e.target.value }))}
                  placeholder="例: 5000 (5000円以上で無料)"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                />
                <p className="text-xs text-gray-400 mt-1">空欄の場合は常に送料がかかります</p>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                    className="rounded border-gray-300 text-red-500 focus:ring-red-400"
                  />
                  <span className="text-sm text-gray-700">デフォルトルールにする</span>
                </label>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || form.fee === ''}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        {rules.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-16 h-16 text-red-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <p className="text-gray-500 font-medium">配送ルールが登録されていません</p>
            <button
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-600 transition-colors"
            >
              + 最初のルールを作成する
            </button>
          </div>
        )}

        {/* Rules list */}
        {rules.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rules.map(rule => (
              <div
                key={rule.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-gray-900">{rule.name}</h3>
                      {rule.isDefault && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          デフォルト
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-2xl font-bold text-red-600">
                      {'\u00A5'}{rule.fee.toLocaleString()}
                    </p>
                  </div>
                </div>
                {rule.freeThreshold != null && rule.freeThreshold > 0 && (
                  <p className="text-sm text-gray-500 mb-3">
                    {'\u00A5'}{rule.freeThreshold.toLocaleString()}以上で送料無料
                  </p>
                )}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => openEdit(rule)}
                    className="text-sm text-red-600 hover:text-red-800 font-medium"
                  >
                    編集
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => handleDelete(rule.id, rule.name)}
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
