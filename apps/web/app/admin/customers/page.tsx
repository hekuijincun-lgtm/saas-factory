// route: /admin/customers
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminTopBar from '../../_components/ui/AdminTopBar';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  visitCount: number;
  lastVisitAt: string | null;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-500">顧客データがありません</p>
      <p className="text-xs text-gray-400 mt-1">予約が完了すると顧客が登録されます</p>
    </div>
  );
}

export default function CustomersPage() {
  const searchParams = useSearchParams();
  const tenantId = searchParams?.get('tenantId') || 'default';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(
      `/api/proxy/admin/customers?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' }
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((json: any) => {
        if (json?.ok) {
          setCustomers(json.customers ?? []);
        } else {
          setError('顧客データの取得に失敗しました');
        }
      })
      .catch(() => setError('顧客データの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  return (
    <>
      <AdminTopBar
        title="顧客管理"
        subtitle="来店顧客の一覧です。"
      />

      <div className="px-6 pb-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-sm text-gray-400">読み込み中...</div>
          ) : error ? (
            <div className="py-20 text-center">
              <p className="text-sm text-red-500">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-3 text-xs text-gray-500 underline"
              >
                再読み込み
              </button>
            </div>
          ) : customers.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                      名前
                    </th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                      電話番号
                    </th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                      来店回数
                    </th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                      最終来店日
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900">
                        {c.name || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 tabular-nums">
                        {c.phone ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 text-right tabular-nums">
                        {c.visitCount}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 text-right tabular-nums">
                        {c.lastVisitAt ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
