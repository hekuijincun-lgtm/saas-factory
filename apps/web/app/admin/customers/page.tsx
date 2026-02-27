// route: /admin/customers
"use client";

import AdminTopBar from "../../_components/ui/AdminTopBar";

// 将来 API 接続時に置き換える型
interface Customer {
  id: string;
  name: string;
  phone: string;
  visitCount: number;
  lastVisit: string | null;
}

// 空データ（API 接続前のプレースホルダー）
const MOCK_CUSTOMERS: Customer[] = [];

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
  const customers = MOCK_CUSTOMERS;

  return (
    <>
      <AdminTopBar
        title="顧客管理"
        subtitle="来店顧客の一覧です。"
      />

      <div className="px-6 pb-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {customers.length === 0 ? (
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
                        {c.name}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 tabular-nums">
                        {c.phone || "—"}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 text-right tabular-nums">
                        {c.visitCount}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 text-right tabular-nums">
                        {c.lastVisit ?? "—"}
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
