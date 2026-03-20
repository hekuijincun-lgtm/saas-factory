'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../_components/ui/AdminTopBar';

interface VaccineRecord {
  id: string;
  petName: string;
  vaccineName: string;
  date: string;
  expiresAt: string;
  vetClinic: string;
  notes: string;
}

function expiryDays(expiresAt: string): number {
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  return Math.ceil((exp - now) / (24 * 60 * 60 * 1000));
}

function expiryColor(days: number): string {
  if (days < 0) return 'bg-red-100 text-red-700';
  if (days <= 30) return 'bg-amber-100 text-amber-700';
  return 'bg-green-100 text-green-700';
}

function expiryLabel(days: number): string {
  if (days < 0) return '期限切れ';
  if (days === 0) return '本日期限';
  return `残り${days}日`;
}

function rowBg(days: number): string {
  if (days < 0) return 'bg-red-50';
  if (days <= 30) return 'bg-amber-50';
  return '';
}

const emptyForm: Omit<VaccineRecord, 'id'> = {
  petName: '',
  vaccineName: '',
  date: '',
  expiresAt: '',
  vetClinic: '',
  notes: '',
};

export default function VaccineRecordPage() {
  const { tenantId, status } = useAdminTenantId();
  const [records, setRecords] = useState<VaccineRecord[]>([]);
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
    fetch(`/api/proxy/admin/special-features/vaccineRecord?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
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
    if (!form.petName || !form.vaccineName || !form.date || !form.expiresAt) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/proxy/admin/special-features/vaccineRecord?tenantId=${encodeURIComponent(tenantId)}`, {
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
      await fetch(`/api/proxy/admin/special-features/vaccineRecord/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`, {
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
        <AdminTopBar title="ワクチン・予防接種記録" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="ワクチン・予防接種記録" subtitle="ペットのワクチン接種記録と期限を管理します。" />

      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="px-6 pb-8 space-y-6">
        {/* Add button */}
        <div className="flex justify-end">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">ペット名 *</label>
                <input type="text" required value={form.petName} onChange={e => setForm({ ...form, petName: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ワクチン名 *</label>
                <input type="text" required value={form.vaccineName} onChange={e => setForm({ ...form, vaccineName: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">接種日 *</label>
                <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">有効期限 *</label>
                <input type="date" required value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">動物病院名</label>
                <input type="text" value={form.vetClinic} onChange={e => setForm({ ...form, vetClinic: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">ワクチン記録がありません</p>
            <p className="text-xs text-gray-400 mt-1">「新規追加」ボタンから記録を追加してください</p>
          </div>
        )}

        {/* Table */}
        {!error && records.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3">ペット名</th>
                    <th className="px-5 py-3">ワクチン名</th>
                    <th className="px-5 py-3">接種日</th>
                    <th className="px-5 py-3">有効期限</th>
                    <th className="px-5 py-3">動物病院</th>
                    <th className="px-5 py-3">状態</th>
                    <th className="px-5 py-3">備考</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {records
                    .sort((a, b) => expiryDays(a.expiresAt) - expiryDays(b.expiresAt))
                    .map(r => {
                      const days = expiryDays(r.expiresAt);
                      return (
                        <tr key={r.id} className={rowBg(days)}>
                          <td className="px-5 py-3 font-medium text-gray-900">{r.petName}</td>
                          <td className="px-5 py-3 text-gray-700">{r.vaccineName}</td>
                          <td className="px-5 py-3 text-gray-700 tabular-nums">{r.date}</td>
                          <td className="px-5 py-3 text-gray-700 tabular-nums">{r.expiresAt}</td>
                          <td className="px-5 py-3 text-gray-700">{r.vetClinic || '-'}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${expiryColor(days)}`}>
                              {expiryLabel(days)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-500 text-xs">{r.notes || '-'}</td>
                          <td className="px-5 py-3">
                            <button onClick={() => handleDelete(r.id)}
                              className="text-xs text-red-500 hover:text-red-700 font-medium">
                              削除
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
