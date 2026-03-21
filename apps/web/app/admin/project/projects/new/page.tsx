'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../../_components/ui/AdminTopBar';

export default function NewProjectPage() {
  const { tenantId, status } = useAdminTenantId();
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_address: '',
    start_date: '',
    end_date: '',
    note: '',
    status: 'draft',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('案件名は必須です');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(
        `/api/proxy/admin/project/projects?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      );
      if (!res.ok) {
        const json: any = await res.json().catch(() => ({}));
        throw new Error(json?.error || '登録に失敗しました');
      }
      router.push(withTenant('/admin/project/projects', tenantId));
    } catch (err: any) {
      setError(err.message || '登録に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <>
        <AdminTopBar title="新規案件登録" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="新規案件登録" subtitle="新しい案件を登録します。" />

      <div className="px-6 pb-8 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
            <h3 className="text-base font-semibold text-gray-900">案件情報</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                案件名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="例: 山田邸 外壁塗装工事"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
              >
                <option value="draft">下書き</option>
                <option value="in_progress">進行中</option>
                <option value="completed">完了</option>
                <option value="cancelled">キャンセル</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開始日</label>
                <input
                  type="date"
                  name="start_date"
                  value={form.start_date}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">終了予定日</label>
                <input
                  type="date"
                  name="end_date"
                  value={form.end_date}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
            <h3 className="text-base font-semibold text-gray-900">顧客情報</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">顧客名</label>
              <input
                type="text"
                name="customer_name"
                value={form.customer_name}
                onChange={handleChange}
                placeholder="例: 山田太郎"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                <input
                  type="tel"
                  name="customer_phone"
                  value={form.customer_phone}
                  onChange={handleChange}
                  placeholder="例: 090-1234-5678"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <input
                  type="email"
                  name="customer_email"
                  value={form.customer_email}
                  onChange={handleChange}
                  placeholder="例: yamada@example.com"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">住所</label>
              <input
                type="text"
                name="customer_address"
                value={form.customer_address}
                onChange={handleChange}
                placeholder="例: 東京都渋谷区..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
            <h3 className="text-base font-semibold text-gray-900">備考</h3>
            <textarea
              name="note"
              value={form.note}
              onChange={handleChange}
              rows={4}
              placeholder="メモや特記事項を入力..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '登録中...' : '案件を登録する'}
            </button>
            <button
              type="button"
              onClick={() => router.push(withTenant('/admin/project/projects', tenantId))}
              className="rounded-lg border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-gray-600 hover:border-gray-300 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
