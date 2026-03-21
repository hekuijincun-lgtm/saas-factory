'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface Partner {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  specialty?: string;
}

const DEMO_PARTNERS: Partner[] = [
  { id: 'pt1', name: '株式会社 足場屋本舗', phone: '03-1234-5678', email: 'info@ashiba.example.com', specialty: '足場設置' },
  { id: 'pt2', name: '山本塗装工業', phone: '090-9876-5432', email: 'yamamoto@paint.example.com', specialty: '塗装' },
  { id: 'pt3', name: '防水テック合同会社', phone: '03-5555-1234', email: 'contact@waterproof.example.com', specialty: '防水工事' },
  { id: 'pt4', name: '電気工事 田中', phone: '080-1111-2222', email: '', specialty: '電気工事' },
];

export default function PartnersPage() {
  const { tenantId, status } = useAdminTenantId();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', specialty: '' });
  const [submitting, setSubmitting] = useState(false);

  const [toast, setToast] = useState('');
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const fetchPartners = useCallback(() => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(
      `/api/proxy/admin/project/partners?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const list = json?.data ?? json?.partners ?? [];
        if (list.length > 0) {
          setPartners(list);
        } else {
          setPartners(DEMO_PARTNERS);
          setIsDemo(true);
        }
      })
      .catch(() => {
        setPartners(DEMO_PARTNERS);
        setIsDemo(true);
      })
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const resetForm = () => {
    setForm({ name: '', phone: '', email: '', specialty: '' });
    setShowForm(false);
    setEditingId(null);
  };

  const handleStartEdit = (partner: Partner) => {
    setEditingId(partner.id);
    setForm({
      name: partner.name,
      phone: partner.phone || '',
      email: partner.email || '',
      specialty: partner.specialty || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('業者名は必須です');
      return;
    }

    if (isDemo) {
      if (editingId) {
        setPartners(prev => prev.map(p => p.id === editingId ? { ...p, ...form } : p));
        showToast('更新しました（デモ）');
      } else {
        const newPartner: Partner = { id: `pt_${Date.now()}`, ...form };
        setPartners(prev => [...prev, newPartner]);
        showToast('追加しました（デモ）');
      }
      resetForm();
      return;
    }

    setSubmitting(true);
    try {
      const url = editingId
        ? `/api/proxy/admin/project/partners/${editingId}?tenantId=${encodeURIComponent(tenantId)}`
        : `/api/proxy/admin/project/partners?tenantId=${encodeURIComponent(tenantId)}`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('save failed');
      showToast(editingId ? '更新しました' : '追加しました');
      resetForm();
      fetchPartners();
    } catch {
      showToast('保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('この業者を削除しますか？')) return;
    if (isDemo) {
      setPartners(prev => prev.filter(p => p.id !== id));
      showToast('削除しました（デモ）');
      return;
    }
    try {
      const res = await fetch(
        `/api/proxy/admin/project/partners/${id}?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('delete failed');
      showToast('削除しました');
      fetchPartners();
    } catch {
      showToast('削除に失敗しました');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="協力業者管理" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="協力業者管理"
        subtitle="協力業者の登録・編集・削除ができます。"
        right={
          !showForm ? (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 transition-colors"
            >
              + 新規業者登録
            </button>
          ) : undefined
        }
      />

      <div className="px-6 pb-8 space-y-6">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        )}

        {isDemo && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            デモデータ
          </div>
        )}

        {/* Add / Edit Form */}
        {showForm && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">
              {editingId ? '業者情報を編集' : '新規業者登録'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  業者名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例: 株式会社 足場屋本舗"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">専門分野</label>
                <input
                  type="text"
                  value={form.specialty}
                  onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                  placeholder="例: 足場設置"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">電話番号</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="例: 03-1234-5678"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">メールアドレス</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="例: info@example.com"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleSave} disabled={submitting} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 transition-colors disabled:opacity-50">
                {submitting ? '保存中...' : editingId ? '更新' : '登録'}
              </button>
              <button onClick={resetForm} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 transition-colors">
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* Count */}
        <p className="text-sm text-gray-500">{partners.length}件の業者</p>

        {/* Empty state */}
        {partners.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-16 h-16 text-amber-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-gray-500 font-medium">業者はまだ登録されていません</p>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 transition-colors"
            >
              + 最初の業者を登録する
            </button>
          </div>
        )}

        {/* Partners table */}
        {partners.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3">業者名</th>
                    <th className="px-5 py-3">電話番号</th>
                    <th className="px-5 py-3">メール</th>
                    <th className="px-5 py-3">専門分野</th>
                    <th className="px-5 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map(partner => (
                    <tr key={partner.id} className="border-b border-gray-50 hover:bg-amber-50/40 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">{partner.name}</td>
                      <td className="px-5 py-3 text-gray-700">{partner.phone || '-'}</td>
                      <td className="px-5 py-3 text-gray-700">{partner.email || '-'}</td>
                      <td className="px-5 py-3">
                        {partner.specialty ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            {partner.specialty}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleStartEdit(partner)}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-amber-300 hover:text-amber-600 transition-colors"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDelete(partner.id)}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-red-500 hover:border-red-300 hover:text-red-600 transition-colors"
                          >
                            削除
                          </button>
                        </div>
                      </td>
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
