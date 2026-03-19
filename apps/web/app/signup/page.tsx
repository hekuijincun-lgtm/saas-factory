"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

interface PlanVerification {
  status: "idle" | "verifying" | "verified" | "error";
  planId?: string;
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
  { value: "esthetic", label: "エステ・リラクゼーション" },
  { value: "dental", label: "歯科・クリニック" },
] as const;

const VERTICAL_DESCRIPTIONS: Record<string, string> = {
  eyebrow: '眉毛スタイリング・WAX・パーマなどの予約管理に最適化されたプランです',
  nail: 'ジェルネイル・アート・ケアなどデザイン別メニュー管理に対応しています',
  hair: 'カット・カラー・パーマなどカテゴリ別の施術管理に対応しています',
  esthetic: 'フェイシャル・ボディ・毛穴ケアなど施術カテゴリ別管理に対応しています',
  dental: '診療種別管理・問診票・定期検診リマインドに対応しています',
};

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [storeName, setStoreName] = useState("");
  const [vertical, setVertical] = useState("generic");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");
  const [debugLink, setDebugLink] = useState<string | null>(null);

  // Stripe session verification
  const [plan, setPlan] = useState<PlanVerification>({ status: "idle" });
  const [stripeSessionId, setStripeSessionId] = useState<string | null>(null);
  // Plan from URL ?plan= (fallback signup without Stripe)
  const [urlPlanId, setUrlPlanId] = useState<string | null>(null);
  // Free trial mode from ?trial=1
  const [isTrial, setIsTrial] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    // Read ?plan= for fallback signup (Stripe not configured)
    const rawPlan = params.get("plan");
    if (rawPlan && VALID_PLANS.has(rawPlan)) {
      setUrlPlanId(rawPlan);
    }

    // Read ?trial=1 for free trial mode
    if (params.get("trial") === "1") {
      setIsTrial(true);
    }

    const sid = params.get("session_id");
    if (!sid) return;

    setStripeSessionId(sid);
    setPlan({ status: "verifying" });

    fetch("/api/proxy/billing/verify-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid }),
    })
      .then((r) => r.json() as Promise<Record<string, unknown>>)
      .then((data) => {
        if (data.ok && data.planId) {
          setPlan({ status: "verified", planId: String(data.planId) });
        } else {
          setPlan({
            status: "error",
            error: String(data.error ?? "決済が確認できません"),
          });
        }
      })
      .catch(() => {
        setPlan({ status: "error", error: "決済確認に失敗しました" });
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed) return;

    const isDebug =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") === "1";

    setStatus("loading");
    setErrorMsg("");
    setDebugLink(null);

    const res = await fetch("/api/auth/email/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailTrimmed,
        storeName: storeName.trim(),
        signup: true,
        ...(vertical !== "generic" ? { vertical } : {}),
        ...(stripeSessionId ? { stripeSessionId } : {}),
        ...(urlPlanId && !stripeSessionId ? { planId: urlPlanId } : {}),
        ...(isTrial ? { trial: true } : {}),
        ...(isDebug ? { debug: "1" } : {}),
      }),
    }).catch(() => null);

    if (!res) {
      setErrorMsg("ネットワークエラーが発生しました。");
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
          : err === "stripe_session_already_used"
          ? "この決済セッションは既に使用されています。LPから再度お申し込みください。"
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
            別のメールアドレスで試す
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
        <div className="bg-slate-700 px-8 py-8">
          <div className="text-xs tracking-widest text-white/70">SIGN UP</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            アカウント作成
          </h1>
          <p className="mt-2 text-sm text-white/70">
            メールアドレスを入力して開始してください
          </p>
        </div>

        <div className="px-8 py-10">
          {/* Plan verification badge */}
          {plan.status === "verifying" && (
            <div className="mb-5 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-500 text-center">
              決済を確認中...
            </div>
          )}
          {plan.status === "verified" && plan.planId && (
            <div className="mb-5 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 flex items-center gap-2 justify-center">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                <strong>{PLAN_LABELS[plan.planId] ?? plan.planId}</strong>{" "}
                プラン — 決済完了
              </span>
            </div>
          )}
          {plan.status === "error" && (
            <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 text-center">
              {plan.error}
            </div>
          )}
          {plan.status === "idle" && urlPlanId && !isTrial && (
            <div className="mb-5 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm text-indigo-700 text-center">
              <strong>{PLAN_LABELS[urlPlanId] ?? urlPlanId}</strong> プランで登録
            </div>
          )}
          {isTrial && plan.status === "idle" && !stripeSessionId && (
            <div className="mb-5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-4 text-center">
              <span className="inline-block bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full mb-2">
                14日間無料トライアル
              </span>
              <p className="text-sm text-emerald-700">
                クレジットカード不要・14日間すべての機能をお試しいただけます
              </p>
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
                省略するとメールアドレスから自動生成されます
              </p>
            </div>

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
                <p className="mt-1 text-xs text-slate-400">後から管理画面で変更できます</p>
              )}
            </div>

            {status === "error" && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading" || !email.trim()}
              className="block w-full rounded-full bg-indigo-600 py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-indigo-700 active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "loading" ? "送信中..." : "ログインリンクを送信"}
            </button>

            <p className="text-center text-xs text-slate-400 pt-2">
              すでにアカウントをお持ちの場合は{" "}
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
