"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: any; reset: () => void }) {
  useEffect(() => {
    console.error("[line-setup] crashed:", error);
  }, [error]);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>LINE Setup が落ちました 🥲</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        サーバー側で例外が発生。Console / Pages logs を確認して原因を潰そう。
      </p>
      <pre style={{ marginTop: 12, padding: 12, background: "#111", color: "#eee", borderRadius: 8, overflow: "auto" }}>
{String(error?.message ?? error)}
      </pre>
      <button
        onClick={() => reset()}
        style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, border: "1px solid #999" }}
      >
        再試行
      </button>
    </div>
  );
}
