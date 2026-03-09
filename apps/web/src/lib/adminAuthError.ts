/**
 * Admin API auth error detection & user-facing messages.
 * Shared across admin components to avoid duplicating 401/403 handling.
 */

export interface AuthErrorInfo {
  isAuthError: true;
  status: number;
  message: string;
  /** URL to redirect to for re-login (includes tenantId + returnTo) */
  loginUrl: string;
}

/**
 * Check if a fetch Response is a 401 or 403 auth error.
 * Returns null if the response is not an auth error.
 */
export function detectAuthError(
  res: Response,
  tenantId: string
): AuthErrorInfo | null {
  if (res.status !== 401 && res.status !== 403) return null;

  const returnTo = typeof window !== "undefined"
    ? window.location.pathname + window.location.search
    : "/admin";

  const loginParams = new URLSearchParams();
  loginParams.set("returnTo", returnTo);
  if (tenantId && tenantId !== "default") {
    loginParams.set("tenantId", tenantId);
  }
  const loginUrl = `/login?${loginParams.toString()}`;

  if (res.status === 401) {
    return {
      isAuthError: true,
      status: 401,
      message: "ログインの有効期限が切れました。再ログインしてください。",
      loginUrl,
    };
  }

  // 403 — could be tenant mismatch or role issue
  return {
    isAuthError: true,
    status: 403,
    message: "アクセス権限がありません。テナントが異なる可能性があります。再ログインしてください。",
    loginUrl,
  };
}
