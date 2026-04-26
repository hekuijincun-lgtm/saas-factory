"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getVerticalTheme } from "@/src/lib/verticalTheme";
import { loadStripe, type Stripe as StripeJS } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

interface PlanVerification {
  status: "idle" | "verifying" | "verified" | "error";
  planId?: string;
  subscriptionId?: string;
  error?: string;
}

const VALID_PLANS = new Set(["starter", "pro", "enterprise"]);

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

const VERTICAL_OPTIONS = [
  { value: "generic", label: "業種を選択してください" },
  { value: "eyebrow", label: "アイブロウサロン" },
  { value: "nail", label: "ネイルサロン" },
  { value: "hair", label: "ヘアサロン" },
  { value: "esthetic", label: "エステ・リラクゼ���ション" },
  { value: "dental", label: "歯科・クリニック" },
  { value: "cleaning", label: "ハウスクリーニング" },
  { value: "handyman", label: "便利屋・なんでも屋" },
  { value: "pet", label: "ペットサロン" },
  { value: "seitai", label: "整体院" },
  { value: "gym", label: "ジム・フィットネス" },
  { value: "school", label: "習い事・スクール" },
  { value: "shop", label: "ネットショップ" },
  { value: "food", label: "食品・お取り寄せ" },
  { value: "handmade", label: "ハンドメイド・クリエイター" },
] as const;

const VERTICAL_LABELS: Record<string, string> = Object.fromEntries(
  VERTICAL_OPTIONS.filter(o => o.value !== "generic").map(o => [o.value, o.label])
);

const VERTICAL_DESCRIPTIONS: Record<string, string> = {
  eyebrow: '眉毛スタイリング・WAX・パーマなどの予約管理に最適化されたプランです',
  nail: 'ジェルネイル・アート・ケアなどデザイン別メニュー管理に対応しています',
  hair: 'カット・カラー・パーマなどカテゴリ別の施術管理に対応しています',
  esthetic: 'フェイシャル・ボディ・毛穴ケアなど施術カテゴリ別管理に対応しています',
  dental: '診療種別管理・問診票・定期検診リマインドに対応していま���',
  cleaning: 'ハウスクリーニング専用の見積もり・スケジュール��理に対応しています',
  handyman: '多岐にわたるサービスの見積もり自動化・顧客管理に対応しています',
  pet: 'ペットカルテ・ワクチン管理・トリミング予約に対応して���ます',
  seitai: '施術部位マッピング・カルテ管理・リピート促進に対応���ています',
  gym: 'QR会員証・チェックイン管理・月謝管理を自動化',
  school: '月謝管理・出席記録・進捗管理を自動化',
  shop: '商品管理・注文対応・リピート促進をLINEで自動化',
  food: '食品販売・注文管理・配送連絡をLINEで自動化',
  handmade: '作品管理・オーダー対応・ファン育成をLINEで自動化',
};

// Stripe config from env
const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

// Lazy-load Stripe.js only when needed
let stripePromise: Promise<StripeJS | null> | null = null;
function getStripePromise() {
  if (!stripePromise && STRIPE_PUBLISHABLE_KEY) {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
}

// ─── Stripe inner form (must be inside <Elements>) ──────────────────────────
function StripeCardInner({
  onReady,
  onError,
}: {
  onReady: (confirm: () => Promise<{ subscriptionId: string; provider: 'stripe' } | null>) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  // Expose confirm function to parent
  useEffect(() => {
    if (!stripe || !elements) return;
    onReady(async () => {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      });
      if (error) {
        onError(error.message ?? '決済に失敗しました');
        return null;
      }
      // Payment succeeded in-place (no redirect needed)
      return null; // subscriptionId will be resolved from parent state
    });
  }, [stripe, elements, onReady, onError]);

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        カード情報
      </label>
      <div className="rounded-xl border border-slate-200 px-4 py-3 bg-white">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>
      <p className="mt-1 text-xs text-slate-400">
        決済はStripeにより安全に処理されます
      </p>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
interface SignupFormProps {
  initialVertical?: string;
}

export default function SignupForm({ initialVertical }: SignupFormProps) {
  const verticalLocked = !!initialVertical && initialVertical !== "generic";
  const vt = getVerticalTheme(initialVertical);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [storeName, setStoreName] = useState("");
  const [vertical, setVertical] = useState(initialVertical || "generic");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [debugLink, setDebugLink] = useState<string | null>(null);

  // Payment state
  const [plan, setPlan] = useState<PlanVerification>({ status: "idle" });
  const [urlPlanId, setUrlPlanId] = useState<string | null>(null);
  const [isTrial, setIsTrial] = useState(false);
  const [subscribedId, setSubscribedId] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  // Stripe-specific: clientSecret from POST /billing/subscribe
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [stripeSubscriptionId, setStripeSubscriptionId] = useState<string | null>(null);
  const stripeConfirmRef = useRef<(() => Promise<{ subscriptionId: string; provider: 'stripe' } | null>) | null>(null);

  // Parse URL params
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!verticalLocked) {
      const qv = params.get("vertical");
      if (qv && VERTICAL_LABELS[qv]) setVertical(qv);
    }
    const rawPlan = params.get("plan");
    if (rawPlan && VALID_PLANS.has(rawPlan)) setUrlPlanId(rawPlan);
    if (params.get("trial") === "1") setIsTrial(true);
  }, [verticalLocked]);

  // ── Stripe: create subscription + get clientSecret when plan changes ──────
  useEffect(() => {
    if (!STRIPE_PUBLISHABLE_KEY || !urlPlanId || isTrial) return;
    // Reset on plan change
    setStripeClientSecret(null);
    setStripeSubscriptionId(null);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/proxy/billing/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: urlPlanId, email: '' }),
        });
        const data = await res.json() as any;
        if (cancelled) return;
        if (data.ok && data.clientSecret) {
          setStripeClientSecret(data.clientSecret);
          setStripeSubscriptionId(data.subscriptionId);
        }
      } catch { /* network error — card form won't show */ }
    })();
    return () => { cancelled = true; };
  }, [urlPlanId, isTrial]);

  const handleStripeReady = useCallback((confirm: () => Promise<{ subscriptionId: string; provider: 'stripe' } | null>) => {
    stripeConfirmRef.current = confirm;
  }, []);

  const handleStripeError = useCallback((msg: string) => {
    setCardError(msg);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed) return;

    if (password.length < 8) {
      setErrorMsg("��スワードは8文字以上で入力してください。");
      setStatus("error");
      return;
    }
    if (password !== passwordConfirm) {
      setErrorMsg("パスワードが一致しません。");
      setStatus("error");
      return;
    }

    const isDebug =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") === "1";

    setStatus("loading");
    setErrorMsg("");
    setDebugLink(null);

    let subId = subscribedId;

    // Stripe: confirmPayment if needed
    if (STRIPE_PUBLISHABLE_KEY && urlPlanId && !isTrial && !subId && stripeConfirmRef.current) {
      setSubscribing(true);
      setCardError(null);
      try {
        await stripeConfirmRef.current();
        // If confirmPayment succeeded (no redirect), use the subscription created earlier
        subId = stripeSubscriptionId;
        setSubscribedId(subId);
        setPlan({ status: 'verified', planId: urlPlanId, subscriptionId: subId ?? undefined });
      } catch {
        setStatus("error");
        setErrorMsg(cardError ?? '決済に失敗しまし���');
        setSubscribing(false);
        return;
      }
      setSubscribing(false);
      if (cardError) {
        setStatus("error");
        setErrorMsg(cardError);
        return;
      }
    }

    const res = await fetch("/api/auth/email/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailTrimmed,
        password,
        storeName: storeName.trim(),
        signup: true,
        ...(vertical !== "generic" ? { vertical } : {}),
        ...(subId ? { stripeSubscriptionId: subId } : {}),
        ...(urlPlanId && !subId ? { planId: urlPlanId } : {}),
        ...(isTrial ? { trial: true } : {}),
        ...(isDebug ? { debug: "1" } : {}),
      }),
    }).catch(() => null);

    if (!res) {
      setErrorMsg("ネットワーク��ラーが発生しました。");
      setStatus("error");
      return;
    }

    const data = (await res.json()) as Record<string, unknown>;
    if (!data.ok) {
      const err = String(data.error ?? "");
      setErrorMsg(
        err === "rate_limited"
          ? "送信回数の上限です。1分後に再試行してください。"
          : err === "invalid_store_name"
          ? "ショップ名は2〜50文字で入力してください。"
          : err === "stripe_subscription_already_used"
          ? "このサブスクリプションは既に使用されています。LPから再度お申し込みください。"
          : `エラー: ${err || "不明なエラー"}`
      );
      setStatus("error");
      return;
    }

    if (data.debug && typeof data.callbackUrl === "string") {
      setDebugLink(data.callbackUrl);
    }
    setStatus("sent");
  }

  const verticalLabel = VERTICAL_LABELS[vertical];
  const title = verticalLocked && verticalLabel
    ? `${verticalLabel}向け サービスを始める`
    : "アカウント作成";

  if (status === "sent") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl ring-1 ring-black/5 px-8 py-10 text-center">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            メールを送信しました
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            <strong>{email}</strong> 宛にログインリンクを送りました。
            <br />
            メールを確認してリンクをクリックすると、ショップが自動で作成されます。
            <br />
            有効期限は <strong>10分</strong> です。
          </p>
          {debugLink && (
            <div className="mt-5 p-3 bg-yellow-50 border-2 border-yellow-300 rounded-xl text-left">
              <p className="text-xs font-bold text-yellow-700 mb-1">
                Debug リンク（メール未送信）
              </p>
              <a
                href={debugLink}
                className="text-xs text-indigo-600 underline break-all font-mono"
              >
                {debugLink}
              </a>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setStatus("idle");
              setEmail("");
              setDebugLink(null);
            }}
            className="mt-6 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            別のメールアドレスで���す
          </button>
        </div>
      </div>
    );
  }

  const needsCard = !!urlPlanId && !isTrial && !!STRIPE_PUBLISHABLE_KEY;
  const showStripeForm = needsCard && stripeClientSecret;

  // Card section content
  const cardSection = plan.status !== 'verified' && (
    <>
      {showStripeForm && (
        <Elements stripe={getStripePromise()} options={{ clientSecret: stripeClientSecret!, appearance: { theme: 'stripe' } }}>
          <StripeCardInner onReady={handleStripeReady} onError={handleStripeError} />
        </Elements>
      )}
      {cardError && (
        <p className="mt-1.5 text-xs text-red-500">{cardError}</p>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
        <div className="bg-slate-700 px-8 py-8">
          <div className="text-xs tracking-widest text-white/70">SIGN UP</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            {title}
          </h1>
          <p className="mt-2 text-sm text-white/70">
            メールアドレスを入力して開始してください
          </p>
        </div>

        <div className="px-8 py-10">
          {/* Plan badge */}
          {plan.status === "verified" && plan.planId && (
            <div className="mb-5 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 flex items-center gap-2 justify-center">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                <strong>{PLAN_LABELS[plan.planId] ?? plan.planId}</strong>{" "}
                プラン — 決済完了
              </span>
            </div>
          )}
          {plan.status === "idle" && urlPlanId && !isTrial && (
            <div className="mb-5 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm text-indigo-700 text-center">
              <strong>{PLAN_LABELS[urlPlanId] ?? urlPlanId}</strong> プランで登録
            </div>
          )}
          {isTrial && plan.status === "idle" && !subscribedId && (
            <div className="mb-5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-4 text-center">
              <span className="inline-block bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full mb-2">
                14日間無料トライ��ル
              </span>
              <p className="text-sm text-emerald-700">
                クレジットカード不要・14日間すべての機能をお試しいただけます
              </p>
            </div>
          )}

          {/* Vertical badge */}
          {verticalLocked && verticalLabel && (
            <div className={`mb-5 rounded-xl ${vt.light} border ${vt.border} px-4 py-3 text-center`}>
              <p className={`text-sm font-medium ${vt.text}`}>{verticalLabel}</p>
              {VERTICAL_DESCRIPTIONS[vertical] && (
                <p className={`text-xs ${vt.textSubtle} mt-1`}>{VERTICAL_DESCRIPTIONS[vertical]}</p>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                autoComplete="email"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                パスワード
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8文字以上"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                パスワード（確認）
              </label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="もう一度入力"
                required
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                ショップ名（任意）
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="例：渋谷ネイルサロン"
                maxLength={40}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
              <p className="mt-1 text-xs text-slate-400">
                省略するとメールアドレスから自動生成され��す
              </p>
            </div>

            {!verticalLocked && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  業種
                </label>
                <select
                  value={vertical}
                  onChange={(e) => setVertical(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition bg-white"
                >
                  {VERTICAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {vertical !== 'generic' && VERTICAL_DESCRIPTIONS[vertical] ? (
                  <p className="mt-1.5 text-xs text-indigo-500">{VERTICAL_DESCRIPTIONS[vertical]}</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">後から管理���面で変更できます</p>
                )}
              </div>
            )}

            {/* Card Element (Stripe) */}
            {cardSection}

            {status === "error" && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading" || subscribing || !email.trim() || password.length < 8 || password !== passwordConfirm}
              className={`block w-full rounded-full ${verticalLocked ? vt.primary : 'bg-indigo-600'} py-4 text-center text-base font-semibold text-white shadow-md transition ${verticalLocked ? vt.primaryHover : 'hover:bg-indigo-700'} active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {status === "loading" || subscribing ? "処理中..." : "ログインリンクを送信"}
            </button>

            <p className="text-center text-xs text-slate-400 pt-2">
              すでにアカウ��トをお持ちの場合は{" "}
              <Link href="/login" className="text-indigo-500 hover:underline">
                ログイン
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
