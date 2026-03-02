'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getMyReservations, type MyReservation } from '@/src/lib/bookingApi';

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
  const isActive = status === 'active' || !status;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
        isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {isActive ? '予約確定' : status}
    </span>
  );
}

function ReservationCard({ r }: { r: MyReservation }) {
  const isPast = r.date ? new Date(`${r.date}T23:59:59+09:00`) < new Date() : false;

  return (
    <div className={`rounded-2xl border p-4 space-y-2 ${isPast ? 'border-brand-border bg-gray-50' : 'border-brand-primary/30 bg-white shadow-sm'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-brand-text">
          {formatDate(r.date, r.time)}
        </div>
        <StatusBadge status={r.status} />
      </div>
      {r.menuName && (
        <div className="text-sm text-brand-text">{r.menuName}</div>
      )}
      <div className="text-xs text-brand-muted">所要 {r.durationMin}分</div>
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

  const upcoming = reservations.filter(r => r.date && new Date(`${r.date}T23:59:59+09:00`) >= new Date());
  const past = reservations.filter(r => r.date && new Date(`${r.date}T23:59:59+09:00`) < new Date());

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-brand-text">予約一覧</h2>

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
              {upcoming.map(r => <ReservationCard key={r.reservationId} r={r} />)}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wide">過去の予約</p>
              {past.map(r => <ReservationCard key={r.reservationId} r={r} />)}
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
