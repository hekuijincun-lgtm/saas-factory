// route: /admin/customers
'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminTopBar from '../../_components/ui/AdminTopBar';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import ReservationDetailPanel from '../../_components/admin/ReservationDetailPanel';
import type { Reservation, Staff } from '@/src/lib/bookingApi';

interface LinkedPet {
  id: string;
  name: string;
  breed?: string;
  species?: string;
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-500">顧客データがありません</p>
      <p className="text-xs text-gray-400 mt-1">予約が完了すると顧客が登録されます</p>
    </div>
  );
}

// ── CustomerDetailModal ────────────────────────────────────────────────────────
interface CustomerDetailModalProps {
  customer: Customer;
  tenantId: string;
  staffList: Staff[];
  mounted: boolean;
  onClose: () => void;
}

function CustomerDetailModal({ customer, tenantId, staffList, mounted, onClose }: CustomerDetailModalProps) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [linkedPets, setLinkedPets] = useState<LinkedPet[]>([]);

  // Fetch linked pets by customerKey
  useEffect(() => {
    if (!customer.customerKey) return;
    fetch(
      `/api/proxy/admin/pets?tenantId=${encodeURIComponent(tenantId)}&customerKey=${encodeURIComponent(customer.customerKey)}`,
      { cache: 'no-store' }
    )
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const list = json?.data ?? json?.pets ?? [];
        setLinkedPets(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
  }, [customer.customerKey, tenantId]);

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/proxy/admin/customers/${encodeURIComponent(customer.id)}/reservations?tenantId=${encodeURIComponent(tenantId)}`,
        { cache: 'no-store' }
      );
      const json = await res.json() as any;
      if (json?.ok) {
        setReservations(json.reservations ?? []);
      } else {
        setError('予約履歴の取得に失敗しました');
      }
    } catch {
      setError('予約履歴の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [customer.id, tenantId]);

  useEffect(() => { fetchReservations(); }, [fetchReservations]);

  const handleCancel = useCallback(async (r: Reservation) => {
    setCancellingId(r.reservationId);
    try {
      await fetch(
        `/api/proxy/admin/reservations/${encodeURIComponent(r.reservationId)}/cancel?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'POST' }
      );
      await fetchReservations();
    } catch {
      // ignore; reservation list will refresh
    } finally {
      setCancellingId(null);
    }
  }, [tenantId, fetchReservations]);

  return (
    <>
      {/* Customer modal */}
      <div
        className="fixed inset-0 bg-black/50 flex items-end sm:items-start justify-center z-40 sm:p-4 sm:pt-10 overflow-y-auto"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-w-2xl w-full p-5 sm:p-6 space-y-5 sm:mb-10 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{customer.name || '（名前なし）'}</h2>
              <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
                {customer.phone && <span>📞 {customer.phone}</span>}
                <span>来店 {customer.visitCount} 回</span>
                {customer.customerKey && (
                  <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{customer.customerKey}</span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Linked pets */}
          {linkedPets.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">登録ペット</h3>
              <div className="flex flex-wrap gap-3">
                {linkedPets.map(p => (
                  <Link
                    key={p.id}
                    href={withTenant(`/admin/pet/profiles/${p.id}`, tenantId)}
                    className="flex items-center gap-3 px-4 py-2.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-xl transition-colors"
                  >
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt={p.name} className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M4.5 11.5c-1 0-2-.5-2-2s1.5-3 2.5-3 1.5 1 1.5 2.5-1 2.5-2 2.5zm15 0c-1 0-2-1-2-2.5s.5-2.5 1.5-2.5 2.5 1.5 2.5 3-1 2-2 2zm-12.5 1c-1 0-2-1-2-2.5S5.5 7 6.5 7 9 8.5 9 10s-1 2.5-2 2.5zm10 0c-1 0-2-1-2-2.5S15.5 7 16.5 7s2 1.5 2 3-1 2.5-2 2.5zM12 22c-3.5 0-6-2-7-4 0-2 4.5-3 7-3s7 1 7 3c-1 2-3.5 4-7 4z" />
                        </svg>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      {p.breed && <p className="text-xs text-gray-500">{p.breed}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Reservation history */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">予約履歴</h3>
            {loading ? (
              <div className="py-8 text-center text-sm text-gray-400">読み込み中...</div>
            ) : error ? (
              <div className="py-6 text-center text-sm text-red-500">{error}</div>
            ) : reservations.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">予約履歴がありません</div>
            ) : (
              <div className="space-y-2">
                {reservations.map((r) => {
                  const staffName = (() => {
                    if (!r.staffId || r.staffId === 'any') return '指名なし';
                    const s = staffList.find((x) => x.id === r.staffId);
                    return s ? s.name : r.staffId;
                  })();
                  const menuName = r.meta?.menuName ?? '—';
                  return (
                    <button
                      key={r.reservationId}
                      onClick={() => setSelectedReservation(r)}
                      className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-xl transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-gray-900 text-sm">{r.date} {r.time}</span>
                          <span className="mx-2 text-gray-300">|</span>
                          <span className="text-sm text-gray-600">{menuName}</span>
                          <span className="mx-2 text-gray-300">|</span>
                          <span className="text-sm text-gray-500">{staffName}</span>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                      {r.meta?.surveyAnswers && Object.keys(r.meta.surveyAnswers).length > 0 && (
                        <div className="mt-1">
                          <span className="inline-block text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">アンケートあり</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nested reservation detail */}
      {selectedReservation && (
        <ReservationDetailPanel
          reservation={selectedReservation}
          staffList={staffList}
          tenantId={tenantId}
          mounted={mounted}
          onClose={() => setSelectedReservation(null)}
          onRefresh={fetchReservations}
          onCancelReservation={(r) => { setSelectedReservation(null); handleCancel(r); }}
          isCancelling={cancellingId === selectedReservation.reservationId}
        />
      )}
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const { status: tenantStatus, tenantId } = useAdminTenantId();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [staffList, setStaffList] = useState<Staff[]>([]);

  // Fetch staff list for ReservationDetailPanel
  useEffect(() => {
    if (tenantStatus === 'loading') return;
    fetch(`/api/proxy/admin/staff?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json: any) => { if (json?.ok) setStaffList(json.staff ?? []); })
      .catch(() => {});
  }, [tenantId, tenantStatus]);

  // Fetch customer list
  const fetchCustomers = useCallback(() => {
    if (tenantStatus === 'loading') return;
    setLoading(true);
    setError(null);
    fetch(`/api/proxy/admin/customers?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
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
  }, [tenantId, tenantStatus]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  if (tenantStatus === 'loading') {
    return (
      <>
        <AdminTopBar title="顧客管理" subtitle="来店顧客の一覧です。行をクリックすると詳細が開きます。" />
        <div className="px-6 py-12 text-center text-sm text-gray-400">読み込み中...</div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="顧客管理" subtitle="来店顧客の一覧です。行をクリックすると詳細が開きます。" />

      <div className="px-4 sm:px-6 pb-8">
        {loading ? (
          <div className="py-20 text-center text-sm text-gray-400">読み込み中...</div>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <button onClick={fetchCustomers} className="mt-3 text-xs text-gray-500 underline">再読み込み</button>
          </div>
        ) : customers.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* PC: テーブル */}
            <div className="hidden sm:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">名前</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">電話番号</th>
                      <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">来店回数</th>
                      <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">最終来店日</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {customers.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedCustomer(c)}
                        className="hover:bg-blue-50 transition-colors cursor-pointer group"
                      >
                        <td className="px-5 py-3.5 font-medium text-gray-900 group-hover:text-blue-700">
                          {c.name || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 tabular-nums">{c.phone ?? '—'}</td>
                        <td className="px-5 py-3.5 text-gray-600 text-right tabular-nums">{c.visitCount}</td>
                        <td className="px-5 py-3.5 text-gray-500 text-right tabular-nums">{c.lastVisitAt ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* スマホ: カードリスト */}
            <div className="sm:hidden space-y-3">
              {customers.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCustomer(c)}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 active:bg-blue-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <span className="font-medium text-gray-900 text-base">{c.name || '—'}</span>
                    <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap ml-2">{c.lastVisitAt ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    {c.phone && <span className="tabular-nums">{c.phone}</span>}
                    <span>来店 {c.visitCount} 回</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          tenantId={tenantId}
          staffList={staffList}
          mounted={mounted}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </>
  );
}
