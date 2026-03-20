'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../_components/ui/AdminTopBar';

interface CheckItem {
  name: string;
  checked: boolean;
  notes: string;
}

interface EquipmentCheckRecord {
  id: string;
  date: string;
  items: CheckItem[];
}

const DEFAULT_CHECKLIST: string[] = [
  'オートクレーブ（高圧蒸気滅菌器）',
  'UV消毒器',
  'ドライヤー',
  'シャンプー台',
  'トリミングテーブル',
  'バリカン',
  'ハサミ類',
  'エアコン・空調',
  '照明設備',
  '消火器',
];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function EquipmentCheckPage() {
  const { tenantId, status } = useAdminTenantId();
  const [records, setRecords] = useState<EquipmentCheckRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState(todayStr());
  const [formItems, setFormItems] = useState<CheckItem[]>(
    DEFAULT_CHECKLIST.map(name => ({ name, checked: false, notes: '' }))
  );
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
    fetch(`/api/proxy/admin/special-features/equipmentCheck?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
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

  const toggleItem = (index: number) => {
    setFormItems(prev => prev.map((item, i) => i === index ? { ...item, checked: !item.checked } : item));
  };

  const updateItemNotes = (index: number, notes: string) => {
    setFormItems(prev => prev.map((item, i) => i === index ? { ...item, notes } : item));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDate) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/proxy/admin/special-features/equipmentCheck?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: formDate, items: formItems }),
      });
      if (!res.ok) throw new Error();
      showToast('登録しました');
      setFormDate(todayStr());
      setFormItems(DEFAULT_CHECKLIST.map(name => ({ name, checked: false, notes: '' })));
      setShowForm(false);
      fetchRecords();
    } catch {
      showToast('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このチェック記録を削除しますか？')) return;
    try {
      await fetch(`/api/proxy/admin/special-features/equipmentCheck/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`, {
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
        <AdminTopBar title="機器チェックリスト" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="機器チェックリスト" subtitle="日々の機器点検記録を管理します。" />

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
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">点検日 *</label>
              <input type="date" required value={formDate} onChange={e => setFormDate(e.target.value)}
                className="w-full sm:w-60 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">チェック項目</p>
              {formItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <button
                    type="button"
                    onClick={() => toggleItem(i)}
                    className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                      item.checked
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {item.checked && (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <span className={`text-sm flex-1 ${item.checked ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                    {item.name}
                  </span>
                  <input
                    type="text"
                    placeholder="備考"
                    value={item.notes}
                    onChange={e => updateItemNotes(i, e.target.value)}
                    className="w-40 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              ))}
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">チェック記録がありません</p>
            <p className="text-xs text-gray-400 mt-1">「新規追加」ボタンから今日の点検を始めましょう</p>
          </div>
        )}

        {/* Record cards */}
        {!error && records.length > 0 && (
          <div className="space-y-4">
            {records
              .sort((a, b) => b.date.localeCompare(a.date))
              .map(r => {
                const checkedCount = r.items.filter(i => i.checked).length;
                const totalCount = r.items.length;
                const allChecked = checkedCount === totalCount;
                return (
                  <div key={r.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900 tabular-nums">{r.date}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          allChecked ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {checkedCount}/{totalCount} 完了
                        </span>
                      </div>
                      <button onClick={() => handleDelete(r.id)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium">
                        削除
                      </button>
                    </div>
                    <div className="px-5 py-3 space-y-1.5">
                      {r.items.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                            item.checked ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {item.checked ? (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </span>
                          <span className={item.checked ? 'text-gray-700' : 'text-gray-400'}>{item.name}</span>
                          {item.notes && <span className="text-xs text-gray-400 ml-auto">{item.notes}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </>
  );
}
