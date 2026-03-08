"use client";

import { useState } from "react";

export default function SetupPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const tenantId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId") ?? ""
      : "";

  const valid = password.length >= 8 && password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/setup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password, tenantId }),
      });

      const data = (await res.json()) as any;

      if (!data.ok) {
        const err = String(data.error ?? "");
        setErrorMsg(
          err === "password_length"
            ? "8文字以上128文字以下で入力してください。"
            : err === "missing_user_id"
            ? "セッションが無効です。再度サインアップしてください。"
            : `エラー: ${err || "不明なエラー"}`
        );
        setStatus("error");
        return;
      }

      // Success — redirect to returnTo (from signup callback) or default admin
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get("returnTo");
      const dest = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
        ? returnTo
        : tenantId
          ? `/admin/line-setup?tenantId=${encodeURIComponent(tenantId)}`
          : "/admin";
      window.location.href = dest;
    } catch {
      setErrorMsg("ネットワークエラーが発生しました。");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
        <div className="bg-slate-700 px-8 py-8">
          <div className="text-xs tracking-widest text-white/70">
            SETUP PASSWORD
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            パスワードを設定
          </h1>
          <p className="mt-2 text-sm text-white/70">
            管理画面にログインするためのパスワードを設定してください
          </p>
        </div>

        <div className="px-8 py-10">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                パスワード
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8文字以上"
                required
                minLength={8}
                maxLength={128}
                autoFocus
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>

            <div>
              <label
                htmlFor="confirm"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                パスワード（確認）
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="もう一度入力"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
              {confirm.length > 0 && password !== confirm && (
                <p className="mt-1 text-xs text-red-500">
                  パスワードが一致しません
                </p>
              )}
            </div>

            {status === "error" && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading" || !valid}
              className="block w-full rounded-full bg-indigo-600 py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-indigo-700 active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "loading" ? "設定中..." : "パスワードを設定して始める"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
