'use client';

import { useState } from 'react';
import { createReservation } from '@/src/lib/bookingApi';
import type { BookingState } from '../BookingFlow';

interface Props {
  booking: BookingState;
  onBack: () => void;
  onDone: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm py-1">
      <span className="text-brand-muted">{label}</span>
      <span className="font-medium text-brand-text">{value}</span>
    </div>
  );
}

function SuccessScreen({ booking, onDone }: { booking: BookingState; onDone: () => void }) {
  return (
    <div className="text-center space-y-4 py-8">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <span className="text-2xl text-green-600 font-bold">✓</span>
      </div>
      <h2 className="text-xl font-bold text-brand-text">予約が完了しました</h2>
      <p className="text-sm text-brand-muted">
        {booking.date} {booking.time} に予約を承りました。
      </p>
      <button
        onClick={onDone}
        className="mt-4 px-6 py-3 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md transition-all"
      >
        最初に戻る
      </button>
    </div>
  );
}

export default function StepConfirm({ booking, onBack, onDone }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return <SuccessScreen booking={booking} onDone={onDone} />;
  }

  const canSubmit = name.trim().length > 0 && agreed && !loading;

  const handleSubmit = async () => {
    if (!booking.date || !booking.time || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await createReservation({
        date: booking.date,
        time: booking.time,
        name: name.trim(),
        phone: phone.trim() || undefined,
        staffId:
          booking.staffId === 'any' ? undefined : (booking.staffId ?? undefined),
        lineUserId: booking.lineUserId ?? undefined,
      });
      setDone(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '予約に失敗しました';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1 text-brand-muted hover:text-brand-text transition-colors"
          aria-label="戻る"
        >
          ←
        </button>
        <h2 className="text-lg font-semibold text-brand-text">予約内容の確認</h2>
      </div>

      {/* Summary */}
      <div className="bg-brand-bg rounded-2xl p-4 divide-y divide-brand-border">
        <Row label="メニュー" value={booking.menuName ?? '-'} />
        <Row
          label="料金"
          value={booking.menuPrice != null ? `¥${booking.menuPrice.toLocaleString()}` : '-'}
        />
        <Row
          label="所要時間"
          value={booking.menuDurationMin != null ? `${booking.menuDurationMin}分` : '-'}
        />
        <Row label="スタッフ" value={booking.staffName ?? '-'} />
        <Row
          label="日時"
          value={
            booking.date && booking.time
              ? `${booking.date} ${booking.time}`
              : '-'
          }
        />
      </div>

      {/* Customer info */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1.5">
            お名前 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="山田 太郎"
            className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1.5">
            電話番号（任意）
          </label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="090-1234-5678"
            className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-colors"
          />
        </div>
      </div>

      {/* Agree checkbox */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={e => setAgreed(e.target.checked)}
          className="mt-0.5 w-4 h-4 text-brand-primary border-brand-border rounded focus:ring-brand-primary"
        />
        <span className="text-sm text-brand-text leading-relaxed">
          予約内容を確認し、同意の上で予約を確定します
        </span>
      </label>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full py-4 bg-brand-primary text-white rounded-2xl font-semibold hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? '予約中...' : '予約を確定する'}
      </button>
    </div>
  );
}
