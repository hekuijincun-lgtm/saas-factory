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

function fetchMe(): Promise<MeResult> {
  if (!_promise) {
    _promise = fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: any) => {
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
