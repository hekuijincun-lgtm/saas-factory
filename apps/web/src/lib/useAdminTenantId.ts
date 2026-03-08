"use client";
// Hook: resolve tenantId from authenticated session (/api/auth/me).
// Priority: URL query > session (non-default) > last_tenant_id cookie > default.
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
 * Force a fresh /api/auth/me fetch (bypasses module cache).
 * Returns the fresh MeResult. Useful after membership changes.
 */
export async function refreshMe(): Promise<MeResult> {
  clearMeCache();
  const urlTidForMe = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("tenantId")
    : null;
  const refreshUrl = urlTidForMe
    ? `/api/auth/me?tenantId=${encodeURIComponent(urlTidForMe)}`
    : "/api/auth/me";
  const res = await fetch(refreshUrl, { credentials: "same-origin", cache: "no-store" });
  const d = await res.json() as any;
  const urlTid = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("tenantId")
    : null;
  let tenantId: string;
  if (urlTid) {
    tenantId = urlTid;
  } else if (d?.tenantId && d.tenantId !== "default") {
    tenantId = d.tenantId;
  } else {
    tenantId = readLastTenantCookie() ?? d?.tenantId ?? "default";
  }
  writeLastTenantCookie(tenantId);
  const result: MeResult = {
    tenantId,
    userId: d?.userId ?? "",
    displayName: d?.displayName ?? "",
    role: d?.role ?? null,
  };
  // Seed the cache with fresh data
  _promise = Promise.resolve(result);
  _resolvedAt = Date.now();
  return result;
}

/** Read last_tenant_id cookie (not HttpOnly — readable from JS). */
function readLastTenantCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)last_tenant_id=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Persist tenantId in a non-HttpOnly cookie (14 days). */
function writeLastTenantCookie(tid: string) {
  if (typeof document === "undefined" || !tid || tid === "default") return;
  document.cookie = `last_tenant_id=${encodeURIComponent(tid)}; path=/; max-age=1209600; secure; samesite=lax`;
}

function fetchMe(): Promise<MeResult> {
  // TTL: if cache is stale, force re-fetch
  if (_promise && _resolvedAt > 0 && Date.now() - _resolvedAt >= ME_CACHE_TTL_MS) {
    _promise = null;
  }
  if (!_promise) {
    // Pass URL tenantId so /api/auth/me can re-sign the session cookie
    // when the user navigates to a different tenant.
    const _urlTid = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId")
      : null;
    const meUrl = _urlTid
      ? `/api/auth/me?tenantId=${encodeURIComponent(_urlTid)}`
      : "/api/auth/me";
    _promise = fetch(meUrl, { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((d: any) => {
        _resolvedAt = Date.now();
        // Priority: URL query > session > last_tenant_id cookie > default
        const urlTid = typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("tenantId")
          : null;

        let tenantId: string;
        if (urlTid) {
          // URL query has highest priority
          tenantId = urlTid;
        } else if (d?.ok && d.tenantId && d.tenantId !== "default") {
          // Session has a non-default tenantId
          tenantId = d.tenantId;
        } else {
          // Fall back to cookie, then default
          tenantId = readLastTenantCookie() ?? "default";
        }

        // Persist for future recovery (bookmark /admin without tenantId)
        writeLastTenantCookie(tenantId);

        if (d?.ok) {
          return {
            tenantId,
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
        const urlTid = typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("tenantId")
          : null;
        const tid = urlTid ?? readLastTenantCookie() ?? "default";
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
