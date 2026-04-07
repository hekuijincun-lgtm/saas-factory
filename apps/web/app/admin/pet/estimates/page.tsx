// route: /admin/pet/estimates — 見積管理
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface Estimate {
  id: string;
  reservationId: string;
  petId: string | null;
  estimatedPrice: number;
  estimatedDurationMinutes: number;
  breakdown: { item: string; price: number; duration: number }[];
  aiReasoning: string;
  finalPrice: number | null;
  status: 'pending' | 'approved' | 'revised';
  createdAt: string;
  customerName: string | null;
  slotStart: string | null;
  petName: string | null;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: '未確定', cls: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '確定済', cls: 'bg-green-100 text-green-700' },
  revised: { label: '修正済', cls: 'bg-blue-100 text-blue-700' },
};

export default function EstimatesPage() {
  const { tenantId, status: tenantStatus } = useAdminTenantId();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [toast, setToast] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const fetchEstimates = useCallback(() => {
    if (tenantStatus === 'loading') return;
    setLoading(true);
    const params = new URLSearchParams({ tenantId });
    if (filter) params.set('status', filter);
    fetch(`/api/proxy/admin/estimates?${params}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        if (json?.ok) setEstimates(json.estimates ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId, tenantStatus, filter]);

  useEffect(() => { fetchEstimates(); }, [fetchEstimates]);

  const handleApprove = async (est: Estimate) => {
    try {
      const res = await fetch(
        `/api/proxy/admin/estimates/${encodeURIComponent(est.id)}?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ finalPrice: est.estimatedPrice, status: 'approved' }),
        }
      );
      const json = await res.json() as any;
      if (!json.ok) throw new Error();
      showToast('見積もりを確定しました');
      fetchEstimates();
    } catch {
      showToast('更新に失敗しました');
    }
  };

  const handleRevise = async (est: Estimate) => {
    const price = parseInt(editPrice);
    if (isNaN(price) || price < 0) { showToast('有効な金額を入力してください'); return; }
    try {
      const res = await fetch(
        `/api/proxy/admin/estimates/${encodeURIComponent(est.id)}?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ finalPrice: price, status: 'revised' }),
        }
      );
      const json = await res.json() as any;
      if (!json.ok) throw new Error();
      showToast('金額を修正しました');
      setEditingId(null);
      setEditPrice('');
      fetchEstimates();
    } catch {
      showToast('更新に失敗しました');
    }
  };

  const formatDate = (s: string | null) => {
    if (!s) return '—';
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(s);
    return m ? `${m[1]} ${m[2]}` : s.slice(0, 16);
  };

  if (tenantStatus === 'loading') {
    return (
      <>
        <AdminTopBar title="見積管理" />
        <div className="px-6 py-12 text-center text-sm text-gray-400">読み込み中...</div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="見積管理" subtitle="AI見積もりの確認・承認を行います。" />

      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="px-4 sm:px-6 pb-8 space-y-4">
        {/* Filter */}
        <div className="flex gap-2">
          {[
            { value: '', label: 'すべて' },
            { value: 'pending', label: '未確定' },
            { value: 'approved', label: '確定済' },
            { value: 'revised', label: '修正済' },
          ].map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filter === f.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">読み込み中...</div>
        ) : estimates.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-500">見積もりがありません</p>
            <p className="text-xs text-gray-400 mt-1">見積作成モードがONの状態で予約が入ると自動生成されます</p>
          </div>
        ) : (
          <div className="space-y-3">
            {estimates.map(est => {
              const badge = STATUS_BADGE[est.status] ?? STATUS_BADGE.pending;
              const isEditing = editingId === est.id;
              return (
                <div key={est.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{est.customerName || '名前なし'}</span>
                        {est.petName && (
                          <span className="text-xs text-orange-600 font-medium">{est.petName}</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(est.slotStart)}</p>
                    </div>
                    <Link
                      href={withTenant(`/admin/pet/reservations`, tenantId)}
                      className="text-xs text-orange-600 hover:text-orange-700"
                    >
                      予約詳細
                    </Link>
                  </div>

                  {/* Price */}
                  <div className="flex items-baseline gap-4 mb-3">
                    <div>
                      <span className="text-[10px] text-gray-400">AI見積り</span>
                      <p className="text-lg font-bold text-gray-900 tabular-nums">¥{est.estimatedPrice?.toLocaleString() ?? '—'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400">推定時間</span>
                      <p className="text-lg font-bold text-gray-900 tabular-nums">{est.estimatedDurationMinutes ?? '—'}分</p>
                    </div>
                    {est.finalPrice != null && (
                      <div>
                        <span className="text-[10px] text-gray-400">確定料金</span>
                        <p className="text-lg font-bold text-green-700 tabular-nums">¥{est.finalPrice.toLocaleString()}</p>
                      </div>
                    )}
                  </div>

                  {/* Breakdown */}
                  {est.breakdown.length > 0 && (
                    <div className="mb-3 space-y-1">
                      {est.breakdown.map((b, i) => (
                        <div key={i} className="flex justify-between text-xs text-gray-600">
                          <span>{b.item}</span>
                          <span className="tabular-nums font-medium">¥{b.price?.toLocaleString()} / {b.duration}分</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AI reasoning */}
                  {est.aiReasoning && (
                    <p className="text-xs text-gray-500 mb-3 leading-relaxed">{est.aiReasoning}</p>
                  )}

                  {/* Actions */}
                  {est.status === 'pending' && (
                    <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                      <button
                        onClick={() => handleApprove(est)}
                        className="px-4 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                      >
                        この見積もりで確定
                      </button>
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={editPrice}
                            onChange={e => setEditPrice(e.target.value)}
                            placeholder="金額"
                            className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-300 tabular-nums"
                            autoFocus
                          />
                          <button
                            onClick={() => handleRevise(est)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                          >
                            確定
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditPrice(''); }}
                            className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingId(est.id); setEditPrice(String(est.estimatedPrice ?? '')); }}
                          className="px-4 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          金額を修正
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
