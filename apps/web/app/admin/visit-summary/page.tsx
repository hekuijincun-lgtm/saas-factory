'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../_components/ui/AdminTopBar';

interface VisitRecord {
  id: string;
  customerName: string;
  date: string;
  menuName: string;
  staffName: string;
  memo: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function VisitSummaryPage() {
  const { tenantId, status } = useAdminTenantId();
  const [records, setRecords] = useState<VisitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const [form, setForm] = useState({
    customerName: '',
    date: today(),
    menuName: '',
    staffName: '',
    memo: '',
  });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const fetchRecords = useCallback(() => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(`/api/proxy/admin/special-features/visitSummary?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const data = json?.data ?? json?.records ?? json?.items ?? [];
        setRecords(data);
      })
      .catch(() => {
        setRecords([]);
      })
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const resetForm = () => {
    setForm({ customerName: '', date: today(), menuName: '', staffName: '', memo: '' });
    setShowForm(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.customerName.trim()) {
      showToast('顧客名を入力してください');
      return;
    }
    try {
      if (editingId) {
        const res = await fetch(`/api/proxy/admin/special-features/visitSummary/${editingId}?tenantId=${encodeURIComponent(tenantId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error('update failed');
        showToast('メモを更新しました');
      } else {
        const res = await fetch(`/api/proxy/admin/special-features/visitSummary?tenantId=${encodeURIComponent(tenantId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error('create failed');
        showToast('メモを追加しました');
      }
      resetForm();
      fetchRecords();
    } catch {
      showToast('保存に失敗しました');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このメモを削除しますか？')) return;
    try {
      const res = await fetch(`/api/proxy/admin/special-features/visitSummary/${id}?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('delete failed');
      showToast('メモを削除しました');
      fetchRecords();
    } catch {
      showToast('削除に失敗しました');
    }
  };

  const handleEdit = (record: VisitRecord) => {
    setForm({
      customerName: record.customerName,
      date: record.date,
      menuName: record.menuName,
      staffName: record.staffName,
      memo: record.memo,
    });
    setEditingId(record.id);
    setShowForm(true);
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="来店サマリー・施術メモ" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  const filtered = records.filter(r =>
    !filter.trim() || r.customerName.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <>
      <AdminTopBar title="来店サマリー・施術メモ" />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="px-6 pb-8 space-y-6">
        {/* Filter + Add button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <input
            type="text"
            placeholder="顧客名で検索..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full sm:w-72 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          />
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新規メモ追加
          </button>
        </div>

        {/* Add / Edit form */}
        {showForm && (
          <div className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">
              {editingId ? 'メモを編集' : '新規メモ追加'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">顧客名 *</label>
                <input
                  type="text"
                  value={form.customerName}
                  onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="山田太郎"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">日付</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">メニュー名</label>
                <input
                  type="text"
                  value={form.menuName}
                  onChange={e => setForm(f => ({ ...f, menuName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="カット＋カラー"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">担当スタッフ</label>
                <input
                  type="text"
                  value={form.staffName}
                  onChange={e => setForm(f => ({ ...f, staffName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="佐藤"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">施術メモ</label>
              <textarea
                rows={3}
                value={form.memo}
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
                placeholder="施術内容や次回の注意事項など..."
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                {editingId ? '更新' : '保存'}
              </button>
              <button
                onClick={resetForm}
                className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {filtered.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-16 h-16 text-indigo-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500 font-medium">
              {filter.trim() ? '該当する記録が見つかりません' : 'まだ来店メモがありません'}
            </p>
            {!filter.trim() && (
              <p className="text-gray-400 text-sm mt-1">「新規メモ追加」から最初のメモを作成しましょう</p>
            )}
          </div>
        )}

        {/* Record cards */}
        <div className="space-y-3">
          {filtered.map(record => (
            <div
              key={record.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-base font-semibold text-gray-900">{record.customerName}</span>
                    <span className="text-xs text-gray-400">{record.date}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-600 flex-wrap">
                    {record.menuName && (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        {record.menuName}
                      </span>
                    )}
                    {record.staffName && (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {record.staffName}
                      </span>
                    )}
                  </div>
                  {record.memo && (
                    <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg px-3 py-2">
                      {record.memo}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleEdit(record)}
                    className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDelete(record.id)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
