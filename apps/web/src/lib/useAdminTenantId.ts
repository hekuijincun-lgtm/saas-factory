"use client";
// Hook: resolve tenantId from authenticated session (/api/auth/me).
// Module-level cache so multiple components share one network request.
import { useState, useEffect } from "react";

interface MeResult {
  tenantId: string;
  userId: string;
  displayName: string;
  role: string | null;
}

let _promise: Promise<MeResult> | null = null;
let _resolvedAt = 0;
const ME_CACHE_TTL_MS = 30_000; // 30 seconds — prevents stale session across tenant switches

/** Invalidate cached /api/auth/me result. Call on logout or tenant switch. */
export function clearMeCache() {
  _promise = null;
  _resolvedAt = 0;
}

/**
 * Force a fresh /api/auth/me fetch that queries Workers for live role.
 * Returns the fresh MeResult. Useful after membership changes.
 */
export async function refreshMe(): Promise<MeResult> {
  clearMeCache();
  // Use ?fresh=1 to bypass session cookie role and get live role from KV
  const res = await fetch("/api/auth/me?fresh=1", { credentials: "same-origin", cache: "no-store" });
  const d = await res.json() as any;
  const result: MeResult = {
    tenantId: d?.tenantId ?? "default",
    userId: d?.userId ?? "",
    displayName: d?.displayName ?? "",
    role: d?.role ?? null,
  };
  // Seed the cache with fresh data
  _promise = Promise.resolve(result);
  _resolvedAt = Date.now();
  return result;
}

function fetchMe(): Promise<MeResult> {
  // TTL: if cache is stale, force re-fetch
  if (_promise && _resolvedAt > 0 && Date.now() - _resolvedAt >= ME_CACHE_TTL_MS) {
    _promise = null;
  }
  if (!_promise) {
    _promise = fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((d: any) => {
        _resolvedAt = Date.now();
        if (d?.ok && d.tenantId && d.tenantId !== "default") {
          return {
            tenantId: d.tenantId,
            userId: d.userId ?? "",
            displayName: d.displayName ?? "",
            role: d.role ?? null,
          };
        }
        throw new Error(d?.error ?? "no_session");
      })
      .catch(() => {
        _promise = null; // allow retry on next call
        _resolvedAt = 0;
        const tid =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("tenantId") ??
              "default"
            : "default";
        return { tenantId: tid, userId: "", displayName: "", role: null };
      });
  }
  return _promise;
}

export interface AdminTenantState {
  status: "loading" | "ready";
  tenantId: string;
  userId: string;
  displayName: string;
  role: string | null;
}

/**
 * admin ページ遷移用 URL ヘルパ（単一実装）。
 * tenantId を path の ?tenantId= に付与する。
 * AdminShell / onboarding / page.tsx など全 admin リンクで共用する。
 */
export function withTenant(path: string, tenantId: string): string {
  if (!tenantId) return path;
  return `${path}?tenantId=${encodeURIComponent(tenantId)}`;
}

export function useAdminTenantId(): AdminTenantState {
  const [state, setState] = useState<AdminTenantState>({
    status: "loading",
    tenantId: "default",
    userId: "",
    displayName: "",
    role: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((me) => {
      if (!cancelled) setState({ status: "ready", ...me });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
