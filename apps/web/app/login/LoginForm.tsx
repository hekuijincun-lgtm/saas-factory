"use client";

import { useState } from "react";

interface Props {
  tenantId: string;
  returnTo: string;
  reason: string | null;
  isDebug: boolean;
}

export default function LoginForm({ tenantId, returnTo, reason, isDebug }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Magic link state (secondary flow)
  const [magicLinkMode, setMagicLinkMode] = useState(false);
  const [mlStatus, setMlStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [mlError, setMlError] = useState("");
  const [debugLink, setDebugLink] = useState<string | null>(null);
  const [bootstrapKey, setBootstrapKey] = useState("");
  const [showBootstrapKey, setShowBootstrapKey] = useState(false);

  // Build LINE login URL
  const lineParams = new URLSearchParams({ returnTo });
  if (tenantId !== "default") lineParams.set("tenantId", tenantId);
  const lineStartUrl = `/api/auth/line/start?${lineParams.toString()}`;

  // ── Password login ──────────────────────────────────────────────────────
  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/password/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password, tenantId }),
      });

      const data = (await res.json()) as any;

      if (!data.ok) {
        const err = String(data.error ?? "");
        const msg =
          err === "invalid_credentials"
            ? "メールアドレスまたはパスワードが正しくありません。"
            : err === "password_not_set"
            ? "パスワードが未設定です。「メールでログインリンクを受け取る」からログインし、設定画面でパスワードを設定してください。"
            : err === "tenant_not_found"
            ? "このメールアドレスに対応するアカウントが見つかりません。"
            : err === "invalid_email"
            ? "メールアドレスの形式が正しくありません。"
            : `エラー: ${err || "不明なエラー"}`;
        setErrorMsg(msg);
        setStatus("error");
        return;
      }

      // Success — redirect
      window.location.href = data.redirectTo;
    } catch {
      setErrorMsg("ネットワークエラーが発生しました。");
      setStatus("error");
    }
  }

  // ── Magic link send ─────────────────────────────────────────────────────
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;

    setMlStatus("loading");
    setMlError("");
    setDebugLink(null);

    try {
      const res = await fetch("/api/auth/email/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          returnTo,
          tenantId,
          ...(bootstrapKey.trim() ? { bootstrapKey: bootstrapKey.trim() } : {}),
          ...(isDebug ? { debug: "1" } : {}),
        }),
      });

      const data = (await res.json()) as Record<string, unknown>;

      if (!data.ok) {
        const err = String(data.error ?? "");
        const msg =
          err === "rate_limited"
            ? "送信回数の上限です。1分後に再試行してください。"
            : err === "invalid_email"
            ? "メールアドレスの形式が正しくありません。"
            : `エラー: ${err || "不明なエラー"}`;
        setMlError(msg);
        setMlStatus("error");
        return;
      }

      if (data.debug && typeof data.callbackUrl === "string") {
        setDebugLink(data.callbackUrl);
      }
      setBootstrapKey("");
      setMlStatus("sent");
    } catch {
      setMlError("ネットワークエラーが発生しました。");
      setMlStatus("error");
    }
  }

  // ── Magic link sent view ────────────────────────────────────────────────
  if (mlStatus === "sent") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
          <div className="bg-slate-700 px-8 py-8">
            <div className="text-xs tracking-widest text-white/70">EMAIL LINK</div>
            <h1 className="mt-2 text-2xl font-semibold text-white">メール送信完了</h1>
          </div>
          <div className="px-8 py-10 space-y-4">
            <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-5 text-center">
              <p className="text-sm font-semibold text-green-800">
                ログインリンクを送信しました
              </p>
              <p className="mt-1.5 text-xs text-green-600 leading-relaxed">
                <strong>{email}</strong> 宛にメールを送信しました。
                <br />
                受信箱を確認してリンクをクリックしてください。
                <br />
                有効期限は <strong>10分</strong> です。
              </p>
            </div>
            {debugLink && (
              <div className="rounded-xl bg-yellow-50 border-2 border-yellow-300 px-4 py-3">
                <p className="text-xs font-bold text-yellow-700 mb-2">
                  Debug — ログインリンク（メール未送信）
                </p>
                <a href={debugLink} className="text-xs text-indigo-600 underline break-all font-mono">
                  {debugLink}
                </a>
              </div>
            )}
            <button
              type="button"
              onClick={() => { setMlStatus("idle"); setMagicLinkMode(false); setDebugLink(null); }}
              className="block w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              ログイン画面に戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Magic link form view ────────────────────────────────────────────────
  if (magicLinkMode) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
          <div className="bg-slate-700 px-8 py-8">
            <div className="text-xs tracking-widest text-white/70">EMAIL LINK</div>
            <h1 className="mt-2 text-2xl font-semibold text-white">メールでログイン</h1>
            <p className="mt-2 text-sm text-white/70">
              メールアドレスにログインリンクを送信します
            </p>
          </div>
          <div className="px-8 py-10">
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div>
                <label htmlFor="ml-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  メールアドレス
                </label>
                <input
                  id="ml-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  autoFocus
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
                />
              </div>

              {/* Bootstrap key (optional) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  招待コード（任意）
                </label>
                <div className="relative">
                  <input
                    type={showBootstrapKey ? "text" : "password"}
                    value={bootstrapKey}
                    onChange={(e) => setBootstrapKey(e.target.value)}
                    placeholder="初回登録用の招待コードがある場合のみ"
                    autoComplete="off"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-16 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBootstrapKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 px-1"
                  >
                    {showBootstrapKey ? "隠す" : "表示"}
                  </button>
                </div>
              </div>

              {mlStatus === "error" && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                  {mlError}
                </div>
              )}

              <button
                type="submit"
                disabled={mlStatus === "loading" || !email.trim()}
                className="block w-full rounded-full bg-indigo-600 py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-indigo-700 active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mlStatus === "loading" ? "送信中..." : "ログインリンクを送信"}
              </button>

              <button
                type="button"
                onClick={() => { setMagicLinkMode(false); setMlStatus("idle"); }}
                className="block w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                パスワードログインに戻る
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── Main: email + password login ────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">

        {/* Header */}
        <div className="bg-slate-700 px-8 py-8">
          <div className="text-xs tracking-widest text-white/70">ADMIN LOGIN</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">ログイン</h1>
          <p className="mt-2 text-sm text-white/70">
            メールアドレスとパスワードでログイン
          </p>
        </div>

        {/* Body */}
        <div className="px-8 py-10">

          {/* Reason banners */}
          {reason === "session_expired" && (
            <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
              セッションが期限切れです。再ログインしてください。
            </div>
          )}
          {reason === "not_logged_in" && (
            <div className="mb-5 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
              管理画面へのアクセスにはログインが必要です。
            </div>
          )}
          {reason && !["session_expired", "not_logged_in"].includes(reason) && (
            <div className="mb-5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              エラー: {reason}
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                autoFocus
                autoComplete="email"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                パスワード
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8文字以上"
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>

            {status === "error" && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading" || !email.trim() || !password}
              className="block w-full rounded-full bg-indigo-600 py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-indigo-700 active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "loading" ? "ログイン中..." : "ログイン"}
            </button>
          </form>

          {/* Secondary links */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <a
                href={`/forgot-password${tenantId !== "default" ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`}
                className="text-indigo-500 hover:underline"
              >
                パスワードを忘れた場合
              </a>
              <a href="/signup" className="text-indigo-500 hover:underline">
                新規登録
              </a>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-2">
              <p className="text-center text-xs text-slate-400">または</p>
              <button
                type="button"
                onClick={() => setMagicLinkMode(true)}
                className="block w-full rounded-full border border-slate-200 py-3 text-center text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                メールでログインリンクを受け取る
              </button>
              <a
                href={lineStartUrl}
                className="block w-full rounded-full border border-[#06C755] py-3 text-center text-sm font-semibold text-[#06C755] transition hover:bg-[#06C755]/5"
              >
                LINEでログイン
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
