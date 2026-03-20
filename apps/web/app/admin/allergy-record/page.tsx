'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../_components/ui/AdminTopBar';

interface AllergyRecord {
  id: string;
  customerName: string;
  allergen: string;
  severity: '軽度' | '中度' | '重度';
  reaction: string;
  avoidProducts: string;
  notes: string;
}

function severityColor(s: string): string {
  if (s === '重度') return 'bg-red-100 text-red-700';
  if (s === '中度') return 'bg-amber-100 text-amber-700';
  return 'bg-green-100 text-green-700';
}

function severityBorder(s: string): string {
  if (s === '重度') return 'border-l-red-500';
  if (s === '中度') return 'border-l-amber-500';
  return 'border-l-green-500';
}

type Severity = '軽度' | '中度' | '重度';

const emptyForm: Omit<AllergyRecord, 'id'> = {
  customerName: '',
  allergen: '',
  severity: '軽度',
  reaction: '',
  avoidProducts: '',
  notes: '',
};

export default function AllergyRecordPage() {
  const { tenantId, status } = useAdminTenantId();
  const [records, setRecords] = useState<AllergyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const fetchRecords = useCallback(() => {
    if (status !== 'ready') return;
    setLoading(true);
    setError(null);
    fetch(`/api/proxy/admin/special-features/allergyRecord?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        setRecords(json?.data ?? json?.records ?? []);
      })
      .catch(() => setError('データの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName || !form.allergen) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/proxy/admin/special-features/allergyRecord?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      showToast('登録しました');
      setForm(emptyForm);
      setShowForm(false);
      fetchRecords();
    } catch {
      showToast('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('この記録を削除しますか？')) return;
    try {
      await fetch(`/api/proxy/admin/special-features/allergyRecord/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'DELETE',
      });
      showToast('削除しました');
      fetchRecords();
    } catch {
      showToast('削除に失敗しました');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="アレルギー・禁忌記録" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  // Group by severity for summary
  const severeCount = records.filter(r => r.severity === '重度').length;
  const moderateCount = records.filter(r => r.severity === '中度').length;
  const mildCount = records.filter(r => r.severity === '軽度').length;

  return (
    <>
      <AdminTopBar title="アレルギー・禁忌記録" subtitle="顧客のアレルギー情報と禁忌成分を管理します。" />

      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="px-6 pb-8 space-y-6">
        {/* Summary + Add button */}
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700">
              重度 {severeCount}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
              中度 {moderateCount}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
              軽度 {mildCount}
            </span>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            {showForm ? 'キャンセル' : '新規追加'}
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">顧客名 *</label>
                <input type="text" required value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">アレルゲン *</label>
                <input type="text" required value={form.allergen} onChange={e => setForm({ ...form, allergen: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">重症度 *</label>
                <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value as Severity })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="軽度">軽度</option>
                  <option value="中度">中度</option>
                  <option value="重度">重度</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">症状</label>
                <input type="text" value={form.reaction} onChange={e => setForm({ ...form, reaction: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">使用禁止成分</label>
                <input type="text" value={form.avoidProducts} onChange={e => setForm({ ...form, avoidProducts: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="カンマ区切りで入力" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={saving}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? '保存中...' : '登録する'}
              </button>
            </div>
          </form>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-10">
            <p className="text-sm text-red-500">{error}</p>
            <button onClick={fetchRecords} className="mt-3 text-xs text-gray-500 underline">再読み込み</button>
          </div>
        )}

        {/* Empty state */}
        {!error && records.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">アレルギー記録がありません</p>
            <p className="text-xs text-gray-400 mt-1">「新規追加」ボタンから記録を追加してください</p>
          </div>
        )}

        {/* Cards */}
        {!error && records.length > 0 && (
          <div className="space-y-3">
            {records
              .sort((a, b) => {
                const order = { '重度': 0, '中度': 1, '軽度': 2 };
                return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
              })
              .map(r => (
                <div key={r.id} className={`bg-white rounded-2xl border border-gray-200 shadow-sm p-5 border-l-4 ${severityBorder(r.severity)}`}>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-900">{r.customerName}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${severityColor(r.severity)}`}>
                          {r.severity}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">アレルゲン:</span> {r.allergen}
                      </div>
                      {r.reaction && (
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">症状:</span> {r.reaction}
                        </div>
                      )}
                      {r.avoidProducts && (
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">使用禁止成分:</span>{' '}
                          {r.avoidProducts.split(',').map((p, i) => (
                            <span key={i} className="inline-block bg-red-50 text-red-600 text-xs px-1.5 py-0.5 rounded mr-1 mb-1">
                              {p.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                      {r.notes && (
                        <div className="text-xs text-gray-400">{r.notes}</div>
                      )}
                    </div>
                    <button onClick={() => handleDelete(r.id)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0 ml-4">
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
