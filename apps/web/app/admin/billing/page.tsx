// route: /admin/billing
'use client';

import { useState, useEffect } from 'react';
import AdminTopBar from '../../_components/ui/AdminTopBar';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import type { SubscriptionInfo, PlanId } from '@/src/types/settings';
import { CreditCard, ExternalLink } from 'lucide-react';

// ── Plan display ─────────────────────────────────────────────────────────────

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

// ── Row component ────────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-500 shrink-0 w-40">{label}</span>
      <span className="text-sm text-gray-900 text-right">{children}</span>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function NoSubscription() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <CreditCard className="w-7 h-7 text-gray-400" />
      </div>
      <p className="text-sm font-medium text-gray-500">課金情報がありません</p>
      <p className="text-xs text-gray-400 mt-1">Stripe Checkout で契約すると、ここにプラン情報が表示されます。</p>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { status: tenantStatus, tenantId } = useAdminTenantId();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  async function openPortal() {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch(`/api/proxy/admin/billing/portal-session?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json() as any;
      if (json?.ok && json.url) {
        window.location.href = json.url;
      } else {
        setPortalError(json?.error === 'no_stripe_customer'
          ? 'Stripe の顧客情報が見つかりません'
          : 'ポータルの作成に失敗しました');
      }
    } catch {
      setPortalError('ポータルの作成に失敗しました');
    } finally {
      setPortalLoading(false);
    }
  }

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
                <p className="text-xs text-gray-500">Stripe 経由で管理されているプラン情報です</p>
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
                  <InfoRow label="次回更新日">
                    {formatDate(subscription.currentPeriodEnd)}
                  </InfoRow>
                  <InfoRow label="契約開始日">
                    {formatDateTime(subscription.createdAt)}
                  </InfoRow>
                  {subscription.stripeCustomerId && (
                    <InfoRow label="顧客 ID">
                      <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                        {subscription.stripeCustomerId}
                      </code>
                    </InfoRow>
                  )}
                  {subscription.stripeSubscriptionId && (
                    <InfoRow label="サブスクリプション ID">
                      <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                        {subscription.stripeSubscriptionId}
                      </code>
                    </InfoRow>
                  )}
                </div>

                {/* Past due warning */}
                {subscription.status === 'past_due' && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm font-medium text-amber-800">お支払いに問題があります</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Stripe のお支払い情報をご確認ください。問題が解消されない場合、サービスが制限される場合があります。
                    </p>
                  </div>
                )}

                {/* Cancelled info */}
                {subscription.status === 'cancelled' && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm font-medium text-red-800">サブスクリプションはキャンセル済みです</p>
                    <p className="text-xs text-red-700 mt-0.5">
                      再開するには新しいプランをご契約ください。
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Portal actions */}
          {subscription?.stripeCustomerId && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Stripe で管理</h2>
              <p className="text-xs text-gray-500 mb-4">
                プラン変更・お支払い方法の更新・解約は Stripe Customer Portal から行えます。
              </p>
              {portalError && (
                <p className="text-sm text-red-500 mb-3">{portalError}</p>
              )}
              <button
                onClick={openPortal}
                disabled={portalLoading}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all"
              >
                {portalLoading ? '読み込み中...' : (
                  <>
                    Stripe で管理する
                    <ExternalLink className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
