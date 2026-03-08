"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [debugLink, setDebugLink] = useState<string | null>(null);

  // Resolve tenantId from URL if present
  const tenantId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("tenantId") ?? "default"
    : "default";
  const isDebug = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("debug") === "1"
    : false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;

    setStatus("loading");
    setErrorMsg("");
    setDebugLink(null);

    try {
      // Reuse existing magic link infrastructure with returnTo pointing to /admin/settings#password
      const returnTo = tenantId !== "default"
        ? `/admin/settings?tenantId=${encodeURIComponent(tenantId)}#password`
        : "/admin/settings#password";

      const res = await fetch("/api/auth/email/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          returnTo,
          tenantId,
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
        setErrorMsg(msg);
        setStatus("error");
        return;
      }

      if (data.debug && typeof data.callbackUrl === "string") {
        setDebugLink(data.callbackUrl);
      }
      setStatus("sent");
    } catch {
      setErrorMsg("ネットワークエラーが発生しました。");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
          <div className="bg-slate-700 px-8 py-8">
            <div className="text-xs tracking-widest text-white/70">PASSWORD RECOVERY</div>
            <h1 className="mt-2 text-2xl font-semibold text-white">メール送信完了</h1>
          </div>
          <div className="px-8 py-10 space-y-4">
            <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-5 text-center">
              <p className="text-sm font-semibold text-green-800">
                パスワード再設定用のリンクを送信しました
              </p>
              <p className="mt-1.5 text-xs text-green-600 leading-relaxed">
                <strong>{email}</strong> 宛にメールを送信しました。
                <br />
                リンクからログイン後、設定画面でパスワードを変更できます。
                <br />
                有効期限は <strong>10分</strong> です。
              </p>
            </div>
            {debugLink && (
              <div className="rounded-xl bg-yellow-50 border-2 border-yellow-300 px-4 py-3">
                <p className="text-xs font-bold text-yellow-700 mb-2">
                  Debug — リンク（メール未送信）
                </p>
                <a href={debugLink} className="text-xs text-indigo-600 underline break-all font-mono">
                  {debugLink}
                </a>
              </div>
            )}
            <a
              href={`/login${tenantId !== "default" ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`}
              className="block w-full text-center text-sm text-indigo-500 hover:underline"
            >
              ログイン画面に戻る
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
        <div className="bg-slate-700 px-8 py-8">
          <div className="text-xs tracking-widest text-white/70">PASSWORD RECOVERY</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">パスワードを忘れた場合</h1>
          <p className="mt-2 text-sm text-white/70">
            登録済みのメールアドレスにログインリンクを送信します。
            ログイン後、設定画面でパスワードを再設定できます。
          </p>
        </div>

        <div className="px-8 py-10">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="recovery-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                メールアドレス
              </label>
              <input
                id="recovery-email"
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
              {status === "loading" ? "送信中..." : "メールを送信"}
            </button>

            <a
              href={`/login${tenantId !== "default" ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`}
              className="block w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              ログイン画面に戻る
            </a>
          </form>
        </div>
      </div>
    </div>
  );
}
