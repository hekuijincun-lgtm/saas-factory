"use client";

import { useState } from "react";

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^\w]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 20) || "shop"
  );
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");
  const [debugLink, setDebugLink] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed) return;

    const name = tenantName.trim() || emailTrimmed.split("@")[0];
    const tenantId = slugify(name) + "-" + randomSuffix();
    const returnTo = `/admin?tenantId=${encodeURIComponent(tenantId)}`;

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
        tenantId,
        tenantName: name,
        signup: "1",
        returnTo,
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
                ⚡ Debug リンク（メール未送信）
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
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="例：渋谷ネイルサロン"
                maxLength={40}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
              <p className="mt-1 text-xs text-slate-400">
                省略するとメールアドレスから自動生成されます
              </p>
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
              <a href="/login" className="text-indigo-500 hover:underline">
                ログイン
              </a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
