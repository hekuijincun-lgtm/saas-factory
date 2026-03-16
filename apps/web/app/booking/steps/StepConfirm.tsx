'use client';

import { useRef, useState } from 'react';
import { createReservation, getSlots } from '@/src/lib/bookingApi';
import type { BookingState } from '../BookingFlow';
import type { SurveyQuestion } from '@/src/types/settings';

interface Props {
  booking: BookingState;
  onBack: () => void;
  onDone: () => void;
  consentText?: string;
  /** 施術同意文（眉毛施術設定で設定した長文テキスト）— チェックボックスの前に独立したブロックとして表示 */
  treatmentConsentText?: string;
  surveyQuestions?: SurveyQuestion[];
  tenantId?: string;
}

const DEFAULT_CONSENT = '予約内容を確認し、同意の上で予約を確定します';
const CUSTOMER_KEY_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function saveCustomerKey(tenantId: string, key: string): void {
  try {
    localStorage.setItem(
      `booking_ck_${tenantId}`,
      JSON.stringify({ v: key, exp: Date.now() + CUSTOMER_KEY_TTL_MS })
    );
  } catch { /* ignore */ }
}

/** 409 duplicate_slot など raw エラーコードをユーザー向け日本語に変換 */
function mapError(msg: string): string {
  if (msg.includes('duplicate_slot')) {
    return 'この時間帯はすでに予約で埋まっています。前の画面に戻って別の日時を選んでください。';
  }
  return msg || '予約に失敗しました。もう一度お試しください。';
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm py-1">
      <span className="text-brand-muted">{label}</span>
      <span className="font-medium text-brand-text">{value}</span>
    </div>
  );
}

function SuccessScreen({
  booking,
  onDone,
  tenantId,
}: {
  booking: BookingState;
  onDone: () => void;
  tenantId: string;
}) {
  const handleViewList = () => {
    window.location.href = `/booking/reservations?tenantId=${encodeURIComponent(tenantId)}`;
  };

  return (
    <div className="text-center space-y-4 py-8">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <span className="text-2xl text-green-600 font-bold">✓</span>
      </div>
      <h2 className="text-xl font-bold text-brand-text">予約が完了しました</h2>
      <p className="text-sm text-brand-muted">
        {booking.date} {booking.time} に予約を承りました。
      </p>
      <div className="flex flex-col gap-3 mt-4">
        <button
          onClick={handleViewList}
          className="px-6 py-3 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md transition-all"
        >
          予約一覧を見る
        </button>
        <button
          onClick={onDone}
          className="px-6 py-3 border border-brand-border text-brand-muted rounded-xl font-medium hover:text-brand-text transition-colors"
        >
          最初に戻る
        </button>
      </div>
    </div>
  );
}

export default function StepConfirm({ booking, onBack, onDone, consentText, treatmentConsentText, surveyQuestions, tenantId }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [done, setDone] = useState(false);
  // 二重送信防止用フラグ（React の state 非同期更新を補完する ref ガード）
  const submittingRef = useRef(false);

  const resolvedTenantId = tenantId || 'default';

  if (done) {
    return <SuccessScreen booking={booking} onDone={onDone} tenantId={resolvedTenantId} />;
  }

  const canSubmit = name.trim().length > 0 && agreed && !loading;

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!booking.date || !booking.time || !name.trim()) return;
    if (!canSubmit) return;

    submittingRef.current = true;
    setLoading(true);
    setError(null);
    setIsDuplicate(false);
    try {
      const metaPayload: Record<string, any> = {};
      if (booking.menuStyleType) {
        metaPayload.verticalData = { styleType: booking.menuStyleType };
      }
      if (booking.menuName) {
        metaPayload.menuName = booking.menuName;
      }
      if (booking.surveyAnswers && Object.keys(booking.surveyAnswers).length > 0) {
        metaPayload.surveyAnswers = booking.surveyAnswers;
      }
      // 選択オプション
      if (booking.selectedOptions && booking.selectedOptions.length > 0) {
        metaPayload.selectedOptions = booking.selectedOptions.map(o => ({
          id: o.id, name: o.name, price: o.price, durationMin: o.durationMin,
        }));
      }
      // 料金内訳スナップショット（menuPrice はオプション込みの合計）
      if (booking.menuPrice != null) {
        const menuPrice = booking.menuPrice;
        const nominationFee = booking.nominationFee ?? 0;
        const optionsPrice = (booking.selectedOptions ?? []).reduce((s, o) => s + o.price, 0);
        metaPayload.pricing = {
          menuPrice: menuPrice - optionsPrice,
          optionsPrice,
          nominationFee,
          totalPrice: menuPrice + nominationFee,
        };
      }
      // Pre-flight: re-check slot availability (bookableForMenu) to catch stale data
      try {
        const staffForSlots = booking.staffId && booking.staffId !== 'any' ? booking.staffId : undefined;
        const slotsRes = await getSlots(booking.date!, staffForSlots, booking.menuDurationMin ?? undefined);
        const slot = slotsRes.slots.find((s: any) => s.time === booking.time);
        // Use bookableForMenu if available, fallback to available for backward compat
        const isBookable = slot ? (slot.bookableForMenu ?? slot.available) : false;
        if (!slot || !isBookable) {
          onBack();
          return;
        }
      } catch { /* slots check failed — proceed to reserve and let it decide */ }

      const res = await createReservation({
        date: booking.date,
        time: booking.time,
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        staffId:
          booking.staffId === 'any' ? undefined : (booking.staffId ?? undefined),
        lineUserId: booking.lineUserId ?? undefined,
        durationMin: booking.menuDurationMin ?? undefined,
        ...(Object.keys(metaPayload).length > 0 ? { meta: metaPayload } : {}),
      });
      // save customerKey to localStorage for reservation list lookup
      if (res.customerKey) {
        saveCustomerKey(resolvedTenantId, res.customerKey);
      }
      setDone(true);
    } catch (e: any) {
      console.error("[reserve error]", e);
      const errCode = e?.data?.error ?? e?.message ?? '';
      const isSlotConflict =
        errCode === 'duplicate_slot' ||
        errCode === 'slot_locked' ||
        errCode === 'duration_overlap' ||
        e?.status === 409;
      console.log("[StepConfirm] catch", { isSlotConflict, message: e?.message, status: e?.status, dataError: e?.data?.error });
      if (isSlotConflict) {
        console.log("[slot_conflict->back] calling onBack()");
        onBack();
        return;
      }
      setError('予約に失敗しました');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const displayConsent = consentText || DEFAULT_CONSENT;
  const enabledQuestions = (surveyQuestions ?? []).filter(q => q.enabled);
  const answers = booking.surveyAnswers ?? {};

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
          label="メニュー料金"
          value={booking.menuPrice != null ? `¥${booking.menuPrice.toLocaleString()}` : '-'}
        />
        {booking.selectedOptions && booking.selectedOptions.length > 0 && (
          <>
            {booking.selectedOptions.map(opt => (
              <Row
                key={opt.id}
                label={`┗ ${opt.name}`}
                value={`+¥${opt.price.toLocaleString()} / +${opt.durationMin}分`}
              />
            ))}
          </>
        )}
        {booking.nominationFee > 0 && (
          <Row label="指名料" value={`+¥${booking.nominationFee.toLocaleString()}`} />
        )}
        {booking.menuPrice != null && (
          <Row
            label="合計"
            value={`¥${((booking.menuPrice ?? 0) + (booking.nominationFee ?? 0)).toLocaleString()}`}
          />
        )}
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

      {/* Survey answers summary */}
      {enabledQuestions.length > 0 && (
        <div className="bg-brand-bg rounded-2xl p-4">
          <p className="text-xs font-medium text-brand-muted mb-2">事前アンケート回答</p>
          <div className="space-y-1.5">
            {enabledQuestions.map(q => {
              const val = answers[q.id];
              const display =
                q.type === 'checkbox'
                  ? (val ? 'はい' : 'いいえ')
                  : (typeof val === 'string' && val.trim() ? val : '（未回答）');
              return (
                <div key={q.id} className="text-sm">
                  <span className="text-brand-muted">{q.label}：</span>
                  <span className="text-brand-text">{display}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

        {/* 推奨入力バナー */}
        {!phone && !email && (
          <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
            <span className="shrink-0 mt-0.5">ℹ</span>
            <span>予約確認・変更の連絡のため、電話番号またはメールアドレスの入力を推奨します（任意）</span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1.5">
            電話番号
            <span className="ml-1.5 text-xs font-normal text-blue-600">（推奨・任意）</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="09012345678"
            className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1.5">
            メールアドレス
            <span className="ml-1.5 text-xs font-normal text-blue-600">（推奨・任意）</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="example@email.com"
            className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-colors"
          />
        </div>
      </div>

      {/* 施術同意文 — separate treatment consent block (only shown if set by admin) */}
      {treatmentConsentText && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-700 mb-2">施術同意文</p>
          <div className="max-h-40 overflow-y-auto text-xs text-amber-900 leading-relaxed whitespace-pre-wrap">
            {treatmentConsentText}
          </div>
        </div>
      )}

      {/* Agree checkbox */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={e => setAgreed(e.target.checked)}
          className="mt-0.5 w-4 h-4 text-brand-primary border-brand-border rounded focus:ring-brand-primary"
        />
        <span className="text-sm text-brand-text leading-relaxed">
          {displayConsent}
        </span>
      </label>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 space-y-2">
          <p>{error}</p>
          {isDuplicate && (
            <button
              onClick={onBack}
              className="text-sm font-medium text-red-700 underline hover:text-red-900"
            >
              別の日時を選ぶ
            </button>
          )}
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
