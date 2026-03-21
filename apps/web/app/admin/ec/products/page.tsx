'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface Product {
  id: string;
  name: string;
  price: number;
  comparePrice?: number | null;
  stock: number;
  isUnlimitedStock?: boolean;
  status: 'active' | 'draft' | 'archived';
  categoryId?: string | null;
  imageUrl?: string | null;
}

interface Category {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, string> = {
  active: '公開中',
  draft: '下書き',
  archived: 'アーカイブ',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  draft: 'bg-yellow-100 text-yellow-700',
  archived: 'bg-gray-100 text-gray-500',
};

export default function ProductListPage() {
  const { tenantId, status } = useAdminTenantId();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const fetchData = useCallback(() => {
    if (status !== 'ready') return;
    setLoading(true);

    const fetchProducts = fetch(
      `/api/proxy/admin/ec/products?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        setProducts(json?.data ?? json?.products ?? []);
      })
      .catch(() => setProducts([]));

    const fetchCategories = fetch(
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
      .catch(() => setCategories([]));

    Promise.all([fetchProducts, fetchCategories]).finally(() => setLoading(false));
  }, [tenantId, status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = products.filter(p => {
    if (filterCategory !== 'all' && p.categoryId !== filterCategory) return false;
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    return true;
  });

  const getCategoryName = (id?: string | null) => {
    if (!id) return 'カテゴリなし';
    return categories.find(c => c.id === id)?.name ?? 'カテゴリなし';
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="商品管理" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="商品管理"
        subtitle="商品の一覧・登録・編集ができます。"
        right={
          <Link
            href={withTenant('/admin/ec/products/new', tenantId)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-600 transition-colors"
          >
            + 新規商品登録
          </Link>
        }
      />

      <div className="px-6 pb-8 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">カテゴリ</label>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
            >
              <option value="all">すべて</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">ステータス</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
            >
              <option value="all">すべて</option>
              <option value="active">公開中</option>
              <option value="draft">下書き</option>
              <option value="archived">アーカイブ</option>
            </select>
          </div>
          <div className="ml-auto text-sm text-gray-500">
            {filtered.length}件の商品
          </div>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-16 h-16 text-red-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-gray-500 font-medium">商品が登録されていません</p>
            <Link
              href={withTenant('/admin/ec/products/new', tenantId)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-600 transition-colors"
            >
              + 最初の商品を登録する
            </Link>
          </div>
        )}

        {/* Product cards grid */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(product => (
              <Link
                key={product.id}
                href={withTenant(`/admin/ec/products/${product.id}`, tenantId)}
                className="rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-red-300 transition-all group overflow-hidden"
              >
                {/* Image thumbnail */}
                <div className="aspect-square bg-gray-100 relative overflow-hidden">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  {/* Status badge */}
                  <span className={`absolute top-2 right-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[product.status] || 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABELS[product.status] || product.status}
                  </span>
                </div>

                {/* Info */}
                <div className="p-4">
                  <p className="text-xs text-gray-400 mb-1">{getCategoryName(product.categoryId)}</p>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-red-600 transition-colors line-clamp-2">
                    {product.name}
                  </h3>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-lg font-bold text-red-600">{'\u00A5'}{product.price.toLocaleString()}</span>
                    {product.comparePrice != null && product.comparePrice > product.price && (
                      <span className="text-sm text-gray-400 line-through">{'\u00A5'}{product.comparePrice.toLocaleString()}</span>
                    )}
                  </div>
                  <div className="mt-2">
                    {product.isUnlimitedStock ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">在庫無制限</span>
                    ) : product.stock === 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">在庫切れ</span>
                    ) : product.stock <= 5 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">残り{product.stock}個</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">在庫{product.stock}個</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
