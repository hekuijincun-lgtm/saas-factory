"use client";
import { useEffect } from "react";

export default function Page() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const line = url.searchParams.get("line");

    const reason =
      line === "error_secret" ? "secret" :
      line === "error_missing" ? "missing_env" :
      line === "ok" ? "ok" :
      line ? "unknown" :
      null;

    const target = reason
      ? /admin/line-setup?reason=\
      : "/admin";

    window.location.replace(target);
  }, []);

  return (
    <div style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Redirecting…</h1>
      <p style={{ opacity: 0.7 }}>REDIR_20260214_151904</p>
      <p>もし自動で移動しない場合は、少し待ってから更新してね。</p>
      <p><a href="/admin/line-setup?reason=unknown">手動でセットアップへ</a></p>
    </div>
  );
}