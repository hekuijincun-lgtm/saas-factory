// route: /admin/pet/customers/[id] — 飼い主詳細・編集
'use client';

export const runtime = 'edge';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../../_components/ui/AdminTopBar';
import type { Reservation, Staff } from '@/src/lib/bookingApi';
import ReservationDetailPanel from '../../../../_components/admin/ReservationDetailPanel';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  visitCount: number;
  lastVisitAt: string | null;
  customerKey: string | null;
}

interface LinkedPet {
  id: string;
  name: string;
  species?: string;
  breed?: string;
  size?: string;
  photoUrl?: string;
  weight?: number;
  age?: number;
  gender?: string;
}

export default function PetCustomerDetailPage() {
  const { id: customerId } = useParams<{ id: string }>();
  const { tenantId, status } = useAdminTenantId();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [mounted, setMounted] = useState(false);

  // Edit form
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', address: '' });
  const [geoStatus, setGeoStatus] = useState<'none' | 'ok' | 'failed'>('none');

  // Linked pets
  const [pets, setPets] = useState<LinkedPet[]>([]);
  const [petsLoading, setPetsLoading] = useState(true);

  // Reservations
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(true);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [staffList, setStaffList] = useState<Staff[]>([]);

  // Complete modal
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [completeReservationId, setCompleteReservationId] = useState<string | null>(null);
  const [actualDuration, setActualDuration] = useState('60');
  const [completing, setCompleting] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  // Fetch customer detail
  useEffect(() => {
    if (status !== 'ready' || !customerId) return;
    setLoading(true);
    fetch(`/api/proxy/admin/customers/${encodeURIComponent(customerId)}?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((json: any) => {
        if (json?.ok && json.customer) {
          const c = json.customer as Customer;
          setCustomer(c);
          setForm({
            name: c.name || '',
            phone: c.phone || '',
            email: c.email || '',
            notes: c.notes || '',
            address: c.address || '',
          });
          if (c.lat != null && c.lng != null) setGeoStatus('ok');
          else if (c.address) setGeoStatus('failed');
          else setGeoStatus('none');
        } else {
          setCustomer(null);
        }
      })
      .catch(() => setCustomer(null))
      .finally(() => setLoading(false));
  }, [tenantId, status, customerId]);

  // Fetch linked pets
  useEffect(() => {
    if (status !== 'ready' || !customer?.customerKey) { setPetsLoading(false); return; }
    setPetsLoading(true);
    fetch(`/api/proxy/admin/pets?tenantId=${encodeURIComponent(tenantId)}&customerKey=${encodeURIComponent(customer.customerKey)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const list = json?.data ?? json?.pets ?? [];
        setPets(Array.isArray(list) ? list : []);
      })
      .catch(() => setPets([]))
      .finally(() => setPetsLoading(false));
  }, [tenantId, status, customer?.customerKey]);

  // Fetch reservations
  const fetchReservations = useCallback(async () => {
    if (status !== 'ready' || !customerId) return;
    setReservationsLoading(true);
    try {
      const res = await fetch(
        `/api/proxy/admin/customers/${encodeURIComponent(customerId)}/reservations?tenantId=${encodeURIComponent(tenantId)}`,
        { cache: 'no-store' }
      );
      const json = await res.json() as any;
      if (json?.ok) setReservations(json.reservations ?? []);
    } catch { /* ignore */ }
    setReservationsLoading(false);
  }, [tenantId, status, customerId]);

  useEffect(() => { fetchReservations(); }, [fetchReservations]);

  // Fetch staff
  useEffect(() => {
    if (status !== 'ready') return;
    fetch(`/api/proxy/admin/staff?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => { if (json?.ok) setStaffList(json.staff ?? []); })
      .catch(() => {});
  }, [tenantId, status]);

  // Save customer
  const handleSave = async () => {
    if (!customer) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/proxy/admin/customers/${encodeURIComponent(customer.id)}?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name || null,
            phone: form.phone || null,
            email: form.email || null,
            notes: form.notes || null,
            address: form.address || null,
          }),
        }
      );
      if (!res.ok) throw new Error('save failed');
      const json = await res.json() as any;
      if (!json.ok) throw new Error(json.error || 'save failed');
      // Update geo status from response
      if (form.address) {
        if (json.lat != null && json.lng != null) setGeoStatus('ok');
        else setGeoStatus('failed');
      } else {
        setGeoStatus('none');
      }
      showToast('保存しました');
    } catch {
      showToast('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!completeReservationId) return;
    setCompleting(true);
    try {
      const res = await fetch(
        `/api/proxy/admin/reservations/${encodeURIComponent(completeReservationId)}/complete?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actualDurationMinutes: actualDuration ? parseInt(actualDuration, 10) : undefined }),
        }
      );
      const json = await res.json() as any;
      if (!json.ok) throw new Error();
      setCompleteModalOpen(false);
      setCompleteReservationId(null);
      showToast('予約を完了にしました');
      fetchReservations();
    } catch {
      showToast('完了処理に失敗しました');
    } finally {
      setCompleting(false);
    }
  };

  function sizeBadge(size?: string) {
    switch (size) {
      case 'small': return { label: '小型', cls: 'bg-green-100 text-green-700' };
      case 'medium': return { label: '中型', cls: 'bg-orange-100 text-orange-700' };
      case 'large': return { label: '大型', cls: 'bg-amber-100 text-amber-700' };
      default: return null;
    }
  }

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="飼い主詳細" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (!customer) {
    return (
      <>
        <AdminTopBar title="飼い主詳細" />
        <div className="px-6 py-16 text-center">
          <p className="text-gray-500">飼い主が見つかりませんでした。</p>
          <Link href={withTenant('/admin/pet/customers', tenantId)} className="mt-4 inline-block text-orange-600 hover:text-orange-700 font-medium text-sm">
            一覧に戻る
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title={customer.name || '（名前なし）'}
        subtitle="飼い主詳細"
        right={
          <Link href={withTenant('/admin/pet/customers', tenantId)} className="text-sm text-orange-600 hover:text-orange-700 font-medium">
            一覧に戻る
          </Link>
        }
      />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="px-4 sm:px-6 pb-8 space-y-8">
        {/* ── 飼い主情報編集 ── */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6 max-w-2xl">
          <h2 className="text-base font-semibold text-gray-900 mb-4">飼い主情報</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">名前</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">電話番号</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="090-1234-5678"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">メールアドレス</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="example@mail.com"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">住所（移動トリミング用）</label>
              <input
                type="text"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="〒123-4567 東京都渋谷区..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              {geoStatus === 'ok' && (
                <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                  <span>📍</span> 位置情報登録済み
                </p>
              )}
              {geoStatus === 'failed' && (
                <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                  <span>⚠️</span> 住所を認識できませんでした
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">メモ</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="飼い主に関するメモ（アレルギー対応、送迎の有無など）"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
              />
            </div>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-500">
            <span>来店 <strong className="text-gray-900">{customer.visitCount}</strong> 回</span>
            {customer.lastVisitAt && <span>最終来店: {customer.lastVisitAt}</span>}
            {customer.customerKey && (
              <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{customer.customerKey}</span>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存する'}
          </button>
        </section>

        {/* ── 登録ペット一覧 ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">登録ペット</h2>
            <Link
              href={withTenant('/admin/pet/profiles/new', tenantId)}
              className="inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              ペットを追加
            </Link>
          </div>

          {petsLoading ? (
            <div className="py-8 text-center text-sm text-gray-400">読み込み中...</div>
          ) : pets.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-400">登録されたペットはいません</p>
              {!customer.customerKey && (
                <p className="text-xs text-gray-400 mt-1">電話番号を設定すると、ペットカルテとの紐付けが可能になります</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pets.map(p => {
                const sb = sizeBadge(p.size);
                return (
                  <Link
                    key={p.id}
                    href={withTenant(`/admin/pet/profiles/${p.id}`, tenantId)}
                    className="flex items-start gap-4 p-4 bg-white rounded-2xl border border-gray-200 shadow-sm hover:border-orange-300 hover:shadow-md transition-all group"
                  >
                    {/* Photo */}
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt={p.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                        <svg className="w-8 h-8 text-orange-200" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M4.5 11.5c-1 0-2-.5-2-2s1.5-3 2.5-3 1.5 1 1.5 2.5-1 2.5-2 2.5zm15 0c-1 0-2-1-2-2.5s.5-2.5 1.5-2.5 2.5 1.5 2.5 3-1 2-2 2zm-12.5 1c-1 0-2-1-2-2.5S5.5 7 6.5 7 9 8.5 9 10s-1 2.5-2 2.5zm10 0c-1 0-2-1-2-2.5S15.5 7 16.5 7s2 1.5 2 3-1 2.5-2 2.5zM12 22c-3.5 0-6-2-7-4 0-2 4.5-3 7-3s7 1 7 3c-1 2-3.5 4-7 4z" />
                        </svg>
                      </div>
                    )}
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 group-hover:text-orange-700 transition-colors truncate">{p.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {p.breed && <span className="text-xs text-gray-500">{p.breed}</span>}
                        {sb && <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${sb.cls}`}>{sb.label}</span>}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-gray-400">
                        {p.weight != null && <span>{p.weight}kg</span>}
                        {p.age != null && <span>{p.age}歳</span>}
                        {p.gender && <span>{p.gender === 'male' ? 'オス' : p.gender === 'female' ? 'メス' : ''}</span>}
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-orange-400 flex-shrink-0 mt-1 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 予約履歴 ── */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-4">予約履歴</h2>
          {reservationsLoading ? (
            <div className="py-8 text-center text-sm text-gray-400">読み込み中...</div>
          ) : reservations.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">予約履歴がありません</div>
          ) : (
            <div className="space-y-2 max-w-2xl">
              {reservations.map(r => {
                const staffName = (() => {
                  if (!r.staffId || r.staffId === 'any') return '指名なし';
                  const s = staffList.find(x => x.id === r.staffId);
                  return s ? s.name : r.staffId;
                })();
                const menuName = r.meta?.menuName ?? '—';
                return (
                  <button
                    key={r.reservationId}
                    onClick={() => setSelectedReservation(r)}
                    className="w-full text-left px-4 py-3 bg-white hover:bg-orange-50 border border-gray-200 hover:border-orange-200 rounded-xl transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-gray-900">{r.date} {r.time}</span>
                        <span className="text-gray-300">|</span>
                        <span className="text-gray-600">{menuName}</span>
                        <span className="text-gray-300">|</span>
                        <span className="text-gray-500">{staffName}</span>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-orange-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Reservation detail panel */}
      {selectedReservation && (
        <ReservationDetailPanel
          reservation={selectedReservation}
          staffList={staffList}
          tenantId={tenantId}
          mounted={mounted}
          onClose={() => setSelectedReservation(null)}
          onRefresh={fetchReservations}
          onCancelReservation={() => { setSelectedReservation(null); fetchReservations(); }}
          isCancelling={false}
          onCompleteReservation={(r) => {
            setSelectedReservation(null);
            setCompleteReservationId(r.reservationId);
            setActualDuration('60');
            setCompleteModalOpen(true);
          }}
        />
      )}

      {/* 予約完了モーダル */}
      {completeModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={() => setCompleteModalOpen(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-lg max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900">✅ 予約を完了にしますか？</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">実際の施術時間（任意）</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={actualDuration}
                  onChange={e => setActualDuration(e.target.value)}
                  min={0}
                  className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 text-sm text-center"
                />
                <span className="text-sm text-gray-500">分</span>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">※次回の予約時間の参考に使います</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleComplete}
                disabled={completing}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 transition-colors text-sm"
              >
                {completing ? '処理中...' : '完了にする'}
              </button>
              <button
                onClick={() => setCompleteModalOpen(false)}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:shadow-md transition-all"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
