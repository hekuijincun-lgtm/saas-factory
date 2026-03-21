'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../../_components/ui/AdminTopBar';

interface Category {
  id: string;
  name: string;
}

const EMPTY_FORM = {
  name: '',
  description: '',
  price: '',
  comparePrice: '',
  sku: '',
  categoryId: '',
  stock: '',
  isUnlimitedStock: false,
  status: 'draft' as 'active' | 'draft',
};

export default function NewProductPage() {
  const { tenantId, status } = useAdminTenantId();
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [categories, setCategories] = useState<Category[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    fetch(
      `/api/proxy/admin/ec/categories?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        setCategories(json?.data ?? json?.categories ?? []);
      })
      .catch(() => {});
  }, [tenantId, status]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price) return;
    setSaving(true);

    try {
      const body: any = {
        name: form.name.trim(),
        description: form.description.trim(),
        price: Number(form.price),
        sku: form.sku.trim() || undefined,
        categoryId: form.categoryId || undefined,
        stock: form.isUnlimitedStock ? 0 : Number(form.stock || 0),
        isUnlimitedStock: form.isUnlimitedStock,
        status: form.status,
      };
      if (form.comparePrice) {
        body.comparePrice = Number(form.comparePrice);
      }

      const res = await fetch(
        `/api/proxy/admin/ec/products?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error('save failed');
      const json = (await res.json()) as any;
      const productId = json?.data?.id ?? json?.id;

      // Upload image if selected
      if (imageFile && productId) {
        const formData = new FormData();
        formData.append('image', imageFile);
        await fetch(
          `/api/proxy/admin/ec/products/${productId}/image?tenantId=${encodeURIComponent(tenantId)}`,
          { method: 'POST', body: formData },
        ).catch(() => {});
      }

      showToast('商品を登録しました');
      router.push(withTenant('/admin/ec/products', tenantId));
    } catch {
      showToast('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') {
    return (
      <>
        <AdminTopBar title="新規商品登録" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="新規商品登録"
        subtitle="商品情報を入力して登録してください。"
      />

      <div className="px-6 pb-8 space-y-6 max-w-3xl">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        )}

        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">商品情報</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">商品名 <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="例: オーガニック石鹸セット"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">説明</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="商品の説明を入力..."
                rows={4}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">販売価格 (円) <span className="text-red-500">*</span></label>
              <input
                type="number"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="3000"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">比較価格 (円)</label>
              <input
                type="number"
                value={form.comparePrice}
                onChange={e => setForm(f => ({ ...f, comparePrice: e.target.value }))}
                placeholder="5000"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
              />
              <p className="text-xs text-gray-400 mt-1">元の価格（割引表示用）</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">SKU</label>
              <input
                type="text"
                value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="例: SOAP-001"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">カテゴリ</label>
              <select
                value={form.categoryId}
                onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
              >
                <option value="">カテゴリなし</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">在庫数</label>
              <input
                type="number"
                value={form.stock}
                onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                placeholder="100"
                disabled={form.isUnlimitedStock}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 disabled:opacity-50 disabled:bg-gray-50"
              />
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isUnlimitedStock}
                  onChange={e => setForm(f => ({ ...f, isUnlimitedStock: e.target.checked }))}
                  className="rounded border-gray-300 text-red-500 focus:ring-red-400"
                />
                <span className="text-xs text-gray-600">在庫無制限</span>
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ステータス</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as 'active' | 'draft' }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
              >
                <option value="draft">下書き</option>
                <option value="active">公開中</option>
              </select>
            </div>
          </div>
        </div>

        {/* Image upload */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">商品画像</h3>
          <div className="flex items-start gap-4">
            {imagePreview && (
              <div className="w-32 h-32 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}
            <div>
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer">
                画像を選択
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-gray-400 mt-2">JPG, PNG, WebP (最大5MB)</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim() || !form.price}
            className="rounded-lg bg-red-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '商品を登録する'}
          </button>
          <button
            onClick={() => router.push(withTenant('/admin/ec/products', tenantId))}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            キャンセル
          </button>
        </div>
      </div>
    </>
  );
}
