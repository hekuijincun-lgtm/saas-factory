"use client";

import { useState } from "react";

interface Props {
  tenantId: string;
  returnTo: string;
  bootstrapKey: string | null;
  reason: string | null;
  isDebug: boolean;
}

export default function LoginForm({ tenantId, returnTo, bootstrapKey, reason, isDebug }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [debugLink, setDebugLink] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setStatus("loading");
    setErrorMsg("");
    setDebugLink(null);

    try {
      const res = await fetch("/api/auth/email/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          returnTo,
          tenantId,
          ...(bootstrapKey ? { bootstrapKey } : {}),
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
            : err === "email_not_configured"
            ? "メール送信が設定されていません（管理者に連絡してください）。"
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

  // Build LINE login URL preserving context
  const lineParams = new URLSearchParams({ returnTo });
  if (tenantId !== "default") lineParams.set("tenantId", tenantId);
  if (bootstrapKey) lineParams.set("bootstrapKey", bootstrapKey);
  const lineStartUrl = `/api/auth/line/start?${lineParams.toString()}`;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">

        {/* ── header ───────────────────────────────────────────────── */}
        <div className="bg-slate-700 px-8 py-8">
          <div className="text-xs tracking-widest text-white/70">ADMIN LOGIN</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">ログイン</h1>
          <p className="mt-2 text-sm text-white/70">
            メールアドレスにログインリンクを送信します
          </p>
        </div>

        {/* ── body ─────────────────────────────────────────────────── */}
        <div className="px-8 py-10">

          {/* session-expired / not-logged-in banner */}
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

          {/* sent state */}
          {status === "sent" ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-5 text-center">
                <div className="text-3xl mb-2">📬</div>
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

              {/* debug: show clickable link */}
              {debugLink && (
                <div className="rounded-xl bg-yellow-50 border-2 border-yellow-300 px-4 py-3">
                  <p className="text-xs font-bold text-yellow-700 mb-2">
                    ⚡ Debug モード — ログインリンク（メール未送信）
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
                className="block w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                別のメールアドレスで送信する
              </button>
            </div>
          ) : (
            /* email form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
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

              {/* LINE login fallback */}
              <div className="pt-6 border-t border-slate-100">
                <p className="text-center text-xs text-slate-400 mb-3">または</p>
                <a
                  href={lineStartUrl}
                  className="block w-full rounded-full border border-[#06C755] py-3 text-center text-sm font-semibold text-[#06C755] transition hover:bg-[#06C755]/5"
                >
                  LINEでログイン（旧）
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
