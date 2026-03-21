'use client';

export const runtime = 'edge';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../../_components/ui/AdminTopBar';

interface OrderItem {
  id: string;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;
  imageUrl?: string | null;
}

interface OrderDetail {
  id: string;
  shortId: string;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  total: number;
  shippingFee: number;
  subtotal: number;
  createdAt: string;
  customerName: string;
  customerEmail?: string;
  shippingAddress?: {
    postalCode?: string;
    prefecture?: string;
    city?: string;
    line1?: string;
    line2?: string;
    phone?: string;
  };
  items: OrderItem[];
  note?: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '未払い',
  paid: '支払済',
  shipped: '発送済',
  delivered: '配送完了',
  cancelled: 'キャンセル',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-blue-100 text-blue-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const STATUS_FLOW: Record<string, string> = {
  paid: 'shipped',
  shipped: 'delivered',
};

const STATUS_ACTION_LABELS: Record<string, string> = {
  shipped: '発送済みにする',
  delivered: '配送完了にする',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function OrderDetailPage() {
  const { tenantId, status } = useAdminTenantId();
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const fetchOrder = useCallback(() => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(
      `/api/proxy/admin/ec/orders/${orderId}?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        setOrder(json?.data ?? json);
      })
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [tenantId, status, orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (!confirm(`ステータスを「${STATUS_LABELS[newStatus] || newStatus}」に変更しますか？`)) return;
    setUpdating(true);
    try {
      const res = await fetch(
        `/api/proxy/admin/ec/orders/${orderId}/status?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        },
      );
      if (!res.ok) throw new Error('update failed');
      showToast('ステータスを更新しました');
      fetchOrder();
    } catch {
      showToast('更新に失敗しました');
    } finally {
      setUpdating(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="注文詳細" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (!order) {
    return (
      <>
        <AdminTopBar title="注文詳細" />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-gray-500 font-medium">注文が見つかりませんでした</p>
        </div>
      </>
    );
  }

  const nextStatus = STATUS_FLOW[order.status];
  const addr = order.shippingAddress;

  return (
    <>
      <AdminTopBar
        title={`注文詳細 ${order.shortId}`}
        subtitle={formatDate(order.createdAt)}
      />

      <div className="px-6 pb-8 space-y-6 max-w-4xl">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        )}

        {/* Status & Action */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-500">ステータス:</span>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-500'}`}>
                {STATUS_LABELS[order.status] || order.status}
              </span>
            </div>
            {nextStatus && (
              <button
                onClick={() => handleStatusUpdate(nextStatus)}
                disabled={updating}
                className="rounded-lg bg-red-500 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updating ? '更新中...' : STATUS_ACTION_LABELS[nextStatus] || nextStatus}
              </button>
            )}
          </div>
        </div>

        {/* Order summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">注文金額</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">小計</span>
                <span className="font-medium text-gray-900">{'\u00A5'}{(order.subtotal ?? (order.total - (order.shippingFee || 0))).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">送料</span>
                <span className="font-medium text-gray-900">{'\u00A5'}{(order.shippingFee || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-100">
                <span className="font-semibold text-gray-900">合計</span>
                <span className="text-lg font-bold text-red-600">{'\u00A5'}{order.total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">配送先</h3>
            {addr ? (
              <div className="text-sm text-gray-700 space-y-1">
                <p className="font-medium">{order.customerName}</p>
                {addr.postalCode && <p>{'\u3012'}{addr.postalCode}</p>}
                <p>{addr.prefecture}{addr.city}{addr.line1}</p>
                {addr.line2 && <p>{addr.line2}</p>}
                {addr.phone && <p>TEL: {addr.phone}</p>}
                {order.customerEmail && <p className="text-gray-500">{order.customerEmail}</p>}
              </div>
            ) : (
              <p className="text-sm text-gray-400">配送先情報なし</p>
            )}
          </div>
        </div>

        {/* Order items */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">注文商品</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">商品名</th>
                  <th className="px-5 py-3 text-right">単価</th>
                  <th className="px-5 py-3 text-right">数量</th>
                  <th className="px-5 py-3 text-right">小計</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map(item => (
                  <tr key={item.id} className="border-b border-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {item.imageUrl && (
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                            <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <span className="font-medium text-gray-900">{item.productName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">{'\u00A5'}{item.price.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-gray-700">{item.quantity}</td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">{'\u00A5'}{item.subtotal.toLocaleString()}</td>
                  </tr>
                ))}
                {order.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                      商品情報なし
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Note */}
        {order.note && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">備考</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.note}</p>
          </div>
        )}
      </div>
    </>
  );
}
