"use client";

import { useState, useEffect } from "react";

/**
 * Owner ページ用 tenantId 取得フック。
 * 1. URL の ?tenantId= があればそれを使う
 * 2. なければ /api/auth/me からセッション tenantId を取得
 */
export function useOwnerTenantId(): { tenantId: string; loading: boolean } {
  const [tenantId, setTenantId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("tenantId") || "";
  });
  const [loading, setLoading] = useState(!tenantId);

  useEffect(() => {
    if (tenantId) return; // URL から取得済み
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: any) => {
        if (cancelled) return;
        const tid = data?.tenantId || "";
        setTenantId(tid);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenantId]);

  return { tenantId, loading };
}
