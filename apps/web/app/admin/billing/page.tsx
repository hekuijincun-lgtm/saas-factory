// route: /admin/billing
'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminTopBar from '../../_components/ui/AdminTopBar';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import type { SubscriptionInfo, PlanId } from '@/src/types/settings';
import { CreditCard, AlertTriangle, X } from 'lucide-react';
import { loadStripe, type Stripe as StripeJS } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

// Stripe config from env
const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

let stripePromise: Promise<StripeJS | null> | null = null;
function getStripePromise() {
  if (!stripePromise && STRIPE_PUBLISHABLE_KEY) {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
}

// ── Plan display ─────────��──────────────────────────────���────────────────────

const PLAN_LABELS: Record<PlanId, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const STATUS_CONFIG: Record<SubscriptionInfo['status'], { label: string; color: string }> = {
  active:   { label: '有効',     color: 'bg-green-100 text-green-800' },
  trialing: { label: 'トライアル', color: 'bg-blue-100 text-blue-800' },
  past_due: { label: '支払い遅延', color: 'bg-amber-100 text-amber-800' },
  cancelled:{ label: 'キャンセル済み', color: 'bg-red-100 text-red-800' },
};

function formatDate(ms: number | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatDateTime(ms: number | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-500 shrink-0 w-40">{label}</span>
      <span className="text-sm text-gray-900 text-right">{children}</span>
    </div>
  );
}

function NoSubscription() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <CreditCard className="w-7 h-7 text-gray-400" />
      </div>
      <p className="text-sm font-medium text-gray-500">課金情報��ありません</p>
      <p className="text-xs text-gray-400 mt-1">プランを契約すると、ここにプラン情報が表示されます。</p>
    </div>
  );
}

interface ChargeItem {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: number;
  description: string;
}

// ── Stripe SetupIntent card update (inner component) ────────────────────────

function StripeCardUpdateInner({
  onSuccess,
  onError,
  updating,
  setUpdating,
}: {
  onSuccess: () => void;
  onError: (msg: string) => void;
  updating: boolean;
  setUpdating: (v: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  async function handleConfirm() {
    if (!stripe || !elements) return;
    setUpdating(true);
    const { error } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    setUpdating(false);
    if (error) {
      onError(error.message ?? 'カードの更新に失敗しました');
    } else {
      onSuccess();
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 px-4 py-3 bg-white">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>
      <button
        onClick={handleConfirm}
        disabled={updating || !stripe}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all"
      >
        {updating ? '更新中...' : 'カードを更新'}
      </button>
    </div>
  );
}

// ── Main page ─────────────���──────────────────────────────────────────────────

export default function BillingPage() {
  const { status: tenantStatus, tenantId } = useAdminTenantId();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Card update state
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardUpdating, setCardUpdating] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardSuccess, setCardSuccess] = useState(false);
  const [stripeSetupSecret, setStripeSetupSecret] = useState<string | null>(null);

  // Cancel state
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Charges
  const [charges, setCharges] = useState<ChargeItem[]>([]);
  const [chargesLoading, setChargesLoading] = useState(false);

  const hasCustomer = !!subscription?.stripeCustomerId;
  const customerId = subscription?.stripeCustomerId ?? '';

  useEffect(() => {
    if (tenantStatus !== 'ready') return;
    setLoading(true);
    setError(null);
    fetch(`/api/proxy/admin/settings?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((json: any) => {
        const s = json?.data ?? json;
        setSubscription(s?.subscription ?? null);
      })
      .catch(() => setError('課金情報の取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [tenantId, tenantStatus]);

  // Load charges when subscription has a customer
  useEffect(() => {
    if (!hasCustomer) return;
    setChargesLoading(true);
    fetch(`/api/proxy/admin/billing/charges?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((json: any) => { if (json.ok) setCharges(json.charges ?? []); })
      .catch(() => {})
      .finally(() => setChargesLoading(false));
  }, [hasCustomer, tenantId]);

  // ── Stripe: fetch SetupIntent clientSecret when opening card form ──────
  useEffect(() => {
    if (!showCardForm) return;
    setStripeSetupSecret(null);
    (async () => {
      try {
        const res = await fetch(`/api/proxy/admin/billing/update-card?tenantId=${encodeURIComponent(tenantId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await res.json() as any;
        if (data.ok && data.clientSecret) {
          setStripeSetupSecret(data.clientSecret);
        } else {
          setCardError(data.detail ?? data.error ?? 'SetupIntentの取得に失敗しました');
        }
      } catch {
        setCardError('SetupIntentの取得に失敗しま���た');
      }
    })();
  }, [showCardForm, tenantId]);

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/proxy/admin/billing/cancel?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json() as any;
      if (data.ok) {
        setSubscription(prev => prev ? { ...prev, status: 'cancelled' } : prev);
        setCancelConfirm(false);
      } else {
        setCancelError(data.detail ?? data.error ?? '解約に失敗しました');
      }
    } catch {
      setCancelError('解約に��敗しました');
    } finally {
      setCancelling(false);
    }
  }

  if (tenantStatus === 'loading') {
    return (
      <>
        <AdminTopBar title="請求管理" subtitle="現在のプランと契約状態を確認できます。" />
        <div className="px-6 py-12 text-center text-sm text-gray-400">読み込み中...</div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="請求管理" subtitle="現在のプランと契約状態を確認できます。" />

      <div className="px-6 pb-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Subscription card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-indigo-100 rounded-lg shrink-0">
                <CreditCard className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">サブスクリプション</h2>
                <p className="text-xs text-gray-500">プラン情報と契約状態</p>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-gray-400">読み込み中...</div>
            ) : error ? (
              <div className="py-12 text-center">
                <p className="text-sm text-red-500">{error}</p>
              </div>
            ) : !subscription ? (
              <NoSubscription />
            ) : (
              <div>
                {/* Plan + Status header */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xl font-bold text-gray-900">
                    {PLAN_LABELS[subscription.planId] ?? subscription.planId}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_CONFIG[subscription.status]?.color ?? 'bg-gray-100 text-gray-800'}`}>
                    {STATUS_CONFIG[subscription.status]?.label ?? subscription.status}
                  </span>
                </div>

                {/* Detail rows */}
                <div className="border-t border-gray-100">
                  <InfoRow label="プラン">
                    {PLAN_LABELS[subscription.planId] ?? subscription.planId}
                  </InfoRow>
                  <InfoRow label="ステータス">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CONFIG[subscription.status]?.color ?? 'bg-gray-100 text-gray-800'}`}>
                      {STATUS_CONFIG[subscription.status]?.label ?? subscription.status}
                    </span>
                  </InfoRow>
                  <InfoRow label="決済プロバイダー">
                    {hasCustomer ? 'Stripe' : '—'}
                  </InfoRow>
                  <InfoRow label="次回更新日">
                    {formatDate(subscription.currentPeriodEnd)}
                  </InfoRow>
                  <InfoRow label="契約開���日">
                    {formatDateTime(subscription.createdAt)}
                  </InfoRow>
                  {customerId && (
                    <InfoRow label="顧客 ID">
                      <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                        {customerId}
                      </code>
                    </InfoRow>
                  )}
                </div>

                {subscription.status === 'past_due' && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm font-medium text-amber-800">お支払いに問題がありま���</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      お支払い情報をご確認ください。問題が解消されない場合、サービスが制限される場合があります。
                    </p>
                  </div>
                )}

                {subscription.status === 'cancelled' && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm font-medium text-red-800">サブスクリプションはキャンセル済みです</p>
                    <p className="text-xs text-red-700 mt-0.5">
                      再開するには新しいプランをご契約くだ���い。
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Management actions */}
          {hasCustomer && subscription?.status !== 'cancelled' && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
              <h2 className="text-base font-semibold text-gray-900 mb-1">契約管理</h2>

              {cardSuccess && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  カード情報を更新しました
                </div>
              )}

              {!showCardForm ? (
                <button
                  onClick={() => { setShowCardForm(true); setCardSuccess(false); setCardError(null); }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-all"
                >
                  <CreditCard className="w-4 h-4" />
                  カード情報を変更
                </button>
              ) : (
                <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">新しいカード情報</span>
                    <button onClick={() => { setShowCardForm(false); setStripeSetupSecret(null); }} className="text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Stripe card update */}
                  {stripeSetupSecret && (
                    <Elements stripe={getStripePromise()} options={{ clientSecret: stripeSetupSecret, appearance: { theme: 'stripe' } }}>
                      <StripeCardUpdateInner
                        onSuccess={() => { setCardSuccess(true); setShowCardForm(false); setStripeSetupSecret(null); }}
                        onError={(msg) => setCardError(msg)}
                        updating={cardUpdating}
                        setUpdating={setCardUpdating}
                      />
                    </Elements>
                  )}
                  {!stripeSetupSecret && (
                    <div className="py-4 text-center text-sm text-gray-400">準備中...</div>
                  )}

                  {cardError && <p className="text-xs text-red-500">{cardError}</p>}
                </div>
              )}

              {/* Cancel subscription */}
              <div className="pt-4 border-t border-gray-100">
                {!cancelConfirm ? (
                  <button
                    onClick={() => setCancelConfirm(true)}
                    className="text-sm text-red-500 hover:text-red-700 transition-colors"
                  >
                    サブスクリプションを解約する
                  </button>
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-800">本当に解約しますか？</p>
                        <p className="text-xs text-red-600 mt-1">
                          解約するとStarter プランの制限が適用されます。この操作は取り消せません。
                        </p>
                      </div>
                    </div>
                    {cancelError && <p className="text-xs text-red-500">{cancelError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-all"
                      >
                        {cancelling ? '処理中...' : '解約する'}
                      </button>
                      <button
                        onClick={() => setCancelConfirm(false)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-all"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Charge history */}
          {hasCustomer && charges.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">請求履歴</h2>
              <div className="divide-y divide-gray-100">
                {charges.map(ch => (
                  <div key={ch.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm text-gray-900">¥{ch.amount.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">{formatDate(ch.createdAt)}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      ch.status === 'paid' ? 'bg-green-100 text-green-700' :
                      ch.status === 'refunded' ? 'bg-gray-100 text-gray-600' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {ch.status === 'paid' ? '支払済' : ch.status === 'refunded' ? '返金済' : '失敗'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
