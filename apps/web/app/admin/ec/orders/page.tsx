'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface Order {
  id: string;
  shortId: string;
  customerName: string;
  total: number;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
  itemCount: number;
}

const STATUS_TABS = [
  { key: 'all', label: 'すべて' },
  { key: 'pending', label: '未払い' },
  { key: 'paid', label: '支払済' },
  { key: 'shipped', label: '発送済' },
  { key: 'delivered', label: '完了' },
  { key: 'cancelled', label: 'キャンセル' },
] as const;

const STATUS_LABELS: Record<string, string> = {
  pending: '未払い',
  paid: '支払済',
  shipped: '発送済',
  delivered: '完了',
  cancelled: 'キャンセル',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  paid: 'bg-blue-100 text-blue-700 border-blue-200',
  shipped: 'bg-purple-100 text-purple-700 border-purple-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function OrderListPage() {
  const { tenantId, status } = useAdminTenantId();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  const fetchOrders = useCallback(() => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(
      `/api/proxy/admin/ec/orders?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        setOrders(json?.data ?? json?.orders ?? []);
      })
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filtered = activeTab === 'all'
    ? orders
    : orders.filter(o => o.status === activeTab);

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="注文管理" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="注文管理"
        subtitle="注文の確認・ステータス管理ができます。"
      />

      <div className="px-6 pb-8 space-y-6">
        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-red-500 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-red-300 hover:text-red-600'
              }`}
            >
              {tab.label}
              {tab.key !== 'all' && (
                <span className="ml-1.5 text-xs opacity-75">
                  {orders.filter(o => o.status === tab.key).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Count */}
        <p className="text-sm text-gray-500">{filtered.length}件の注文</p>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-16 h-16 text-red-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 font-medium">
              {activeTab === 'all' ? '注文はまだありません' : `${STATUS_LABELS[activeTab] || activeTab}の注文はありません`}
            </p>
          </div>
        )}

        {/* Order cards */}
        {filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map(order => (
              <Link
                key={order.id}
                href={withTenant(`/admin/ec/orders/${order.id}`, tenantId)}
                className="block rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-red-300 transition-all"
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-base font-bold text-gray-900">{order.shortId}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{order.customerName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">{'\u00A5'}{order.total.toLocaleString()}</p>
                      <p className="text-xs text-gray-400">{order.itemCount ? `${order.itemCount}点` : ''}</p>
                    </div>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">{formatDate(order.createdAt)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
