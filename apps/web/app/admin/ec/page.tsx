'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../_components/ui/AdminTopBar';

interface EcStats {
  totalProducts: number;
  monthlySales: number;
  monthlyOrders: number;
  pendingShipments: number;
}

interface RecentOrder {
  id: string;
  shortId: string;
  customerName: string;
  total: number;
  status: string;
  createdAt: string;
}

interface StockAlert {
  id: string;
  name: string;
  stock: number;
}

const DEMO_STATS: EcStats = {
  totalProducts: 48,
  monthlySales: 284600,
  monthlyOrders: 37,
  pendingShipments: 5,
};

const DEMO_ORDERS: RecentOrder[] = [
  { id: 'o1', shortId: 'EC-0037', customerName: '田中太郎', total: 12800, status: 'paid', createdAt: '2026-03-21T14:30:00' },
  { id: 'o2', shortId: 'EC-0036', customerName: '山田花子', total: 5400, status: 'shipped', createdAt: '2026-03-21T11:15:00' },
  { id: 'o3', shortId: 'EC-0035', customerName: '佐藤健一', total: 23000, status: 'paid', createdAt: '2026-03-20T16:40:00' },
  { id: 'o4', shortId: 'EC-0034', customerName: '鈴木美咲', total: 8900, status: 'delivered', createdAt: '2026-03-20T09:20:00' },
  { id: 'o5', shortId: 'EC-0033', customerName: '高橋一郎', total: 3200, status: 'pending', createdAt: '2026-03-19T18:05:00' },
];

const DEMO_STOCK_ALERTS: StockAlert[] = [
  { id: 'p1', name: '限定ハンドメイドポーチ', stock: 0 },
  { id: 'p2', name: 'オーガニック石鹸セット', stock: 2 },
  { id: 'p3', name: '季節のジャム詰め合わせ', stock: 1 },
];

const STATUS_LABELS: Record<string, string> = {
  pending: '未払い',
  paid: '支払済',
  shipped: '発送済',
  delivered: '完了',
  cancelled: 'キャンセル',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-blue-100 text-blue-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function EcDashboardPage() {
  const { tenantId, status } = useAdminTenantId();
  const [stats, setStats] = useState<EcStats | null>(null);
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== 'ready') return;
    setLoading(true);

    const fetchStats = fetch(
      `/api/proxy/admin/ec/stats?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const s = json?.data ?? json?.stats ?? null;
        if (s && typeof s.totalProducts === 'number') {
          setStats(s);
          if (s.stockAlerts) setStockAlerts(s.stockAlerts);
          return true;
        }
        return false;
      })
      .catch(() => false);

    const fetchOrders = fetch(
      `/api/proxy/admin/ec/orders?tenantId=${encodeURIComponent(tenantId)}&limit=5`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const list: RecentOrder[] = json?.data ?? json?.orders ?? [];
        if (list.length > 0) {
          setOrders(list.slice(0, 5));
          return true;
        }
        return false;
      })
      .catch(() => false);

    Promise.all([fetchStats, fetchOrders]).then(([statsOk, ordersOk]) => {
      if (!statsOk) {
        setStats(DEMO_STATS);
        setStockAlerts(DEMO_STOCK_ALERTS);
        setIsDemo(true);
      }
      if (!ordersOk) {
        setOrders(DEMO_ORDERS);
        if (!statsOk) setIsDemo(true);
      }
      setLoading(false);
    });
  }, [tenantId, status]);

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="EC管理 ダッシュボード" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="EC管理 ダッシュボード"
        subtitle="商品・注文・売上状況を一覧で確認できます。"
      />

      <div className="px-6 pb-8 space-y-6">
        {isDemo && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            デモデータ
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">総商品数</p>
            <p className="mt-2 text-3xl font-bold text-red-600">{stats?.totalProducts ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">今月売上</p>
            <p className="mt-2 text-3xl font-bold text-red-600">{'\u00A5'}{(stats?.monthlySales ?? 0).toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">今月注文数</p>
            <p className="mt-2 text-3xl font-bold text-red-600">{stats?.monthlyOrders ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">未発送数</p>
            <p className="mt-2 text-3xl font-bold text-red-600">{stats?.pendingShipments ?? 0}</p>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href={withTenant('/admin/ec/products', tenantId)}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-red-300 hover:shadow-md transition-all group"
          >
            <p className="text-sm font-semibold text-gray-900 group-hover:text-red-600 transition-colors">商品管理</p>
            <p className="text-xs text-gray-400 mt-1">商品の登録・編集</p>
          </Link>
          <Link
            href={withTenant('/admin/ec/orders', tenantId)}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-red-300 hover:shadow-md transition-all group"
          >
            <p className="text-sm font-semibold text-gray-900 group-hover:text-red-600 transition-colors">注文管理</p>
            <p className="text-xs text-gray-400 mt-1">注文の確認・発送処理</p>
          </Link>
          <Link
            href={withTenant('/admin/ec/shipping', tenantId)}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-red-300 hover:shadow-md transition-all group"
          >
            <p className="text-sm font-semibold text-gray-900 group-hover:text-red-600 transition-colors">配送設定</p>
            <p className="text-xs text-gray-400 mt-1">送料ルールの管理</p>
          </Link>
        </div>

        {/* Stock Alerts */}
        {stockAlerts.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 shadow-sm">
            <div className="px-5 py-4 border-b border-red-100 flex items-center gap-2">
              <span className="text-red-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </span>
              <h2 className="text-base font-semibold text-red-800">在庫アラート</h2>
            </div>
            <div className="px-5 py-3 space-y-2">
              {stockAlerts.map(item => (
                <div key={item.id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm font-medium text-gray-900">{item.name}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${item.stock === 0 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {item.stock === 0 ? '在庫切れ' : `残り${item.stock}個`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Orders */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">最近の注文</h2>
            <Link
              href={withTenant('/admin/ec/orders', tenantId)}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              すべて見る
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">注文ID</th>
                  <th className="px-5 py-3">顧客名</th>
                  <th className="px-5 py-3">金額</th>
                  <th className="px-5 py-3">ステータス</th>
                  <th className="px-5 py-3">日時</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} className="border-b border-gray-50 hover:bg-red-50/40 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={withTenant(`/admin/ec/orders/${o.id}`, tenantId)}
                        className="text-red-600 hover:text-red-700 font-medium"
                      >
                        {o.shortId}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-900">{o.customerName}</td>
                    <td className="px-5 py-3 text-gray-700">{'\u00A5'}{o.total.toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                      注文はまだありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
