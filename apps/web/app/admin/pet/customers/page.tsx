// route: /admin/pet/customers — 飼い主管理（ペットサロン専用）
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface LinkedPet {
  id: string;
  name: string;
  breed?: string;
  photoUrl?: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  visitCount: number;
  lastVisitAt: string | null;
  customerKey: string | null;
}

export default function PetCustomersPage() {
  const { status, tenantId } = useAdminTenantId();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [petMap, setPetMap] = useState<Record<string, LinkedPet[]>>({});

  const fetchCustomers = useCallback(() => {
    if (status === 'loading') return;
    setLoading(true);
    setError(null);
    fetch(`/api/proxy/admin/customers?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((json: any) => {
        if (json?.ok) setCustomers(json.customers ?? []);
        else setError('取得に失敗しました');
      })
      .catch(() => setError('取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // Fetch all pets once to build customerKey → pets map
  useEffect(() => {
    if (status === 'loading') return;
    fetch(`/api/proxy/admin/pets?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const list = json?.data ?? json?.pets ?? [];
        if (!Array.isArray(list)) return;
        const map: Record<string, LinkedPet[]> = {};
        for (const p of list) {
          const key = p.customerKey;
          if (!key) continue;
          if (!map[key]) map[key] = [];
          map[key].push({ id: p.id, name: p.name, breed: p.breed, photoUrl: p.photoUrl });
        }
        setPetMap(map);
      })
      .catch(() => {});
  }, [tenantId, status]);

  const filtered = search.trim()
    ? customers.filter(c => {
        const q = search.toLowerCase();
        const pets = c.customerKey ? petMap[c.customerKey] ?? [] : [];
        return (
          (c.name || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q) ||
          pets.some(p => p.name.toLowerCase().includes(q))
        );
      })
    : customers;

  if (status === 'loading') {
    return (
      <>
        <AdminTopBar title="飼い主管理" subtitle="飼い主情報とペットの管理" />
        <div className="px-6 py-12 text-center text-sm text-gray-400">読み込み中...</div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="飼い主管理" subtitle="飼い主情報とペットの管理" />

      <div className="px-4 sm:px-6 pb-8 space-y-4">
        {/* Search */}
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="飼い主名・電話番号・ペット名で検索"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-gray-400">読み込み中...</div>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <button onClick={fetchCustomers} className="mt-3 text-xs text-gray-500 underline">再読み込み</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">
              {search.trim() ? '該当する飼い主が見つかりません' : '飼い主データがありません'}
            </p>
            {!search.trim() && (
              <p className="text-xs text-gray-400 mt-1">予約が完了すると飼い主が登録されます</p>
            )}
          </div>
        ) : (
          <>
            {/* PC table */}
            <div className="hidden sm:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">飼い主</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">ペット</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">電話番号</th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">来店回数</th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">最終来店日</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(c => {
                    const pets = c.customerKey ? petMap[c.customerKey] ?? [] : [];
                    return (
                      <tr key={c.id} className="hover:bg-orange-50 transition-colors group">
                        <td className="px-5 py-3.5">
                          <Link
                            href={withTenant(`/admin/pet/customers/${c.id}`, tenantId)}
                            className="font-medium text-gray-900 group-hover:text-orange-700"
                          >
                            {c.name || '（名前なし）'}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap gap-1.5">
                            {pets.length === 0 ? (
                              <span className="text-xs text-gray-400">-</span>
                            ) : (
                              pets.map(p => (
                                <Link
                                  key={p.id}
                                  href={withTenant(`/admin/pet/profiles/${p.id}`, tenantId)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg text-xs font-medium text-gray-700 transition-colors"
                                >
                                  {p.photoUrl ? (
                                    <img src={p.photoUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                                  ) : (
                                    <span className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center text-orange-400 text-[10px]">
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M4.5 11.5c-1 0-2-.5-2-2s1.5-3 2.5-3 1.5 1 1.5 2.5-1 2.5-2 2.5zm15 0c-1 0-2-1-2-2.5s.5-2.5 1.5-2.5 2.5 1.5 2.5 3-1 2-2 2zm-12.5 1c-1 0-2-1-2-2.5S5.5 7 6.5 7 9 8.5 9 10s-1 2.5-2 2.5zm10 0c-1 0-2-1-2-2.5S15.5 7 16.5 7s2 1.5 2 3-1 2.5-2 2.5zM12 22c-3.5 0-6-2-7-4 0-2 4.5-3 7-3s7 1 7 3c-1 2-3.5 4-7 4z"/></svg>
                                    </span>
                                  )}
                                  {p.name}
                                </Link>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 tabular-nums">{c.phone ?? '—'}</td>
                        <td className="px-5 py-3.5 text-gray-600 text-right tabular-nums">{c.visitCount}</td>
                        <td className="px-5 py-3.5 text-gray-500 text-right tabular-nums">{c.lastVisitAt ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {filtered.map(c => {
                const pets = c.customerKey ? petMap[c.customerKey] ?? [] : [];
                return (
                  <Link
                    key={c.id}
                    href={withTenant(`/admin/pet/customers/${c.id}`, tenantId)}
                    className="block bg-white rounded-xl p-4 shadow-sm border border-gray-200 active:bg-orange-50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-medium text-gray-900">{c.name || '（名前なし）'}</span>
                      <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap ml-2">{c.lastVisitAt ?? '—'}</span>
                    </div>
                    {pets.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {pets.map(p => (
                          <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 border border-orange-200 rounded-lg text-xs text-gray-700">
                            {p.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      {c.phone && <span className="tabular-nums">{c.phone}</span>}
                      <span>来店 {c.visitCount} 回</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
