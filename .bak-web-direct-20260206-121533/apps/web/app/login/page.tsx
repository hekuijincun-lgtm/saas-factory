"use client";

import React, { useState } from "react";
import { AuthCardShell } from "../_components/ui/AuthCardShell";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const tenantId = "default";

  const onLineLogin = async () => {
    setLoading(true);
    try {
      const url = `https://saas-factory-api..workers.dev/admin/integrations/line/auth-url?tenantId=${encodeURIComponent(tenantId)}`;
      const r = await fetch(url, { cache: "no-store", credentials: "include" });

      const text = await r.text(); // ← まず text で受ける（空/HTMLでも落ちない）
      if (!r.ok) {
        throw new Error(`auth-url failed: ${r.status} ${r.statusText} body=${text?.slice(0, 200) ?? ""}`);
      }
      if (!text || !text.trim()) {
        throw new Error("auth-url returned empty body");
      }

      let j: any;
      try {
        j = JSON.parse(text);
      } catch {
        throw new Error(`auth-url returned non-JSON: ${text.slice(0, 200)}`);
      }

      if (!j?.url) throw new Error(j?.error ?? "auth-url is missing");
      window.location.href = j.url;
    } catch (e: any) {
      alert(`LINEログイン開始に失敗: ${e?.message ?? e}`);
      setLoading(false);
    }
  };

  return (
    <AuthCardShell
      title="ログイン"
      subtitle="管理画面に入るために、LINEでログインしてください。"
      badge={loading ? "確認中…" : "未ログイン"}
    >
      <div className="space-y-6">
        <button
          onClick={onLineLogin}
          disabled={loading}
          className="w-full rounded-2xl px-6 py-4 text-base font-semibold bg-blue-600 text-white disabled:opacity-60"
        >
          {loading ? "LINEへ移動中…" : "LINEでログイン"}
        </button>

        <p className="text-xs text-gray-500 leading-relaxed">
          ※ ログイン後、通知・予約連携（Messaging API設定）へ進みます。
        </p>
      </div>
    </AuthCardShell>
  );
}


