'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getMyReservations, cancelMyReservation, type MyReservation } from '@/src/lib/bookingApi';

const CUSTOMER_KEY_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function loadCustomerKey(tenantId: string): string | null {
  try {
    const raw = localStorage.getItem(`booking_ck_${tenantId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: string; exp: number };
    if (Date.now() > parsed.exp) {
      localStorage.removeItem(`booking_ck_${tenantId}`);
      return null;
    }
    return parsed.v || null;
  } catch { return null; }
}

function formatDate(date: string, time: string): string {
  if (!date) return '-';
  const [y, m, d] = date.split('-');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const dt = new Date(`${date}T${time || '00:00'}:00+09:00`);
  const wday = weekdays[dt.getDay()] ?? '';
  return `${y}年${m}月${d}日（${wday}）${time ? ' ' + time : ''}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: '予約確定', className: 'bg-green-100 text-green-700' },
    cancelled: { label: 'キャンセル済み', className: 'bg-red-100 text-red-500' },
  };
  const s = map[status] || map.active;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

function ReservationCard({
  r,
  onCancel,
  cancelling,
}: {
  r: MyReservation;
  onCancel: (id: string) => void;
  cancelling: string | null;
}) {
  const isPast = r.date ? new Date(`${r.date}T23:59:59+09:00`) < new Date() : false;
  const isCancelled = r.status === 'cancelled';
  const canCancel = !isPast && !isCancelled && r.status === 'active';

  return (
    <div className={`rounded-2xl border p-4 space-y-2 ${isPast || isCancelled ? 'border-brand-border bg-gray-50' : 'border-brand-primary/30 bg-white shadow-sm'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-brand-text">
          {formatDate(r.date, r.time)}
        </div>
        <StatusBadge status={r.status} />
      </div>
      {r.menuName && (
        <div className="text-sm text-brand-text">{r.menuName}</div>
      )}
      <div className="flex items-center justify-between">
        <div className="text-xs text-brand-muted">所要 {r.durationMin}分</div>
        {canCancel && (
          <button
            onClick={() => onCancel(r.reservationId)}
            disabled={cancelling === r.reservationId}
            className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50 transition-colors"
          >
            {cancelling === r.reservationId ? 'キャンセル中...' : 'キャンセルする'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ReservationsList() {
  const searchParams = useSearchParams();
  const tenantId = searchParams?.get('tenantId') || 'default';

  const [reservations, setReservations] = useState<MyReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noKey, setNoKey] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const ck = loadCustomerKey(tenantId);
    if (!ck) {
      setNoKey(true);
      setLoading(false);
      return;
    }
    getMyReservations(tenantId, ck)
      .then(list => setReservations(list))
      .catch(e => setError(e instanceof Error ? e.message : '取得に失敗しました'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const handleCancel = async (reservationId: string) => {
    if (!confirm('この予約をキャンセルしますか？')) return;
    const ck = loadCustomerKey(tenantId);
    if (!ck) return;

    setCancelling(reservationId);
    setToast(null);
    try {
      await cancelMyReservation(tenantId, reservationId, ck);
      setReservations(prev =>
        prev.map(r => r.reservationId === reservationId ? { ...r, status: 'cancelled' } : r)
      );
      setToast({ message: '予約をキャンセルしました', type: 'success' });
    } catch (e: any) {
      setToast({ message: e.message || 'キャンセルに失敗しました', type: 'error' });
    } finally {
      setCancelling(null);
    }
  };

  // トースト自動非表示
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleGoBook = () => {
    window.location.href = `/booking?tenantId=${encodeURIComponent(tenantId)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
      </div>
    );
  }

  if (noKey) {
    return (
      <div className="text-center space-y-4 py-10">
        <div className="w-14 h-14 rounded-full bg-brand-bg flex items-center justify-center mx-auto text-2xl">
          📋
        </div>
        <h2 className="text-base font-semibold text-brand-text">予約情報がありません</h2>
        <p className="text-sm text-brand-muted">この端末には予約履歴がありません</p>
        <button
          onClick={handleGoBook}
          className="mt-2 px-6 py-3 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md transition-all"
        >
          予約する
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 py-6">
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
        <button
          onClick={handleGoBook}
          className="w-full py-3 border border-brand-border text-brand-muted rounded-xl text-sm hover:text-brand-text transition-colors"
        >
          予約する
        </button>
      </div>
    );
  }

  const upcoming = reservations.filter(r => r.date && new Date(`${r.date}T23:59:59+09:00`) >= new Date() && r.status !== 'cancelled');
  const cancelled = reservations.filter(r => r.status === 'cancelled');
  const past = reservations.filter(r => r.date && new Date(`${r.date}T23:59:59+09:00`) < new Date() && r.status !== 'cancelled');

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-brand-text">予約一覧</h2>

      {/* トースト */}
      {toast && (
        <div className={`p-3 rounded-xl text-sm ${toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {toast.message}
        </div>
      )}

      {reservations.length === 0 ? (
        <div className="text-center space-y-4 py-8">
          <p className="text-sm text-brand-muted">予約が見つかりませんでした</p>
          <button
            onClick={handleGoBook}
            className="px-6 py-3 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md transition-all"
          >
            予約する
          </button>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wide">今後の予約</p>
              {upcoming.map(r => <ReservationCard key={r.reservationId} r={r} onCancel={handleCancel} cancelling={cancelling} />)}
            </div>
          )}
          {cancelled.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wide">キャンセル済み</p>
              {cancelled.map(r => <ReservationCard key={r.reservationId} r={r} onCancel={handleCancel} cancelling={cancelling} />)}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wide">過去の予約</p>
              {past.map(r => <ReservationCard key={r.reservationId} r={r} onCancel={handleCancel} cancelling={cancelling} />)}
            </div>
          )}
          <button
            onClick={handleGoBook}
            className="w-full py-3 border border-brand-border text-brand-muted rounded-xl text-sm hover:text-brand-text transition-colors"
          >
            新しく予約する
          </button>
        </>
      )}
    </div>
  );
}
