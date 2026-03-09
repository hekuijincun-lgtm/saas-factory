"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAdminTenantId, withTenant } from "@/src/lib/useAdminTenantId";
import {
  Settings,
  ClipboardList,
  Users,
  Calendar,
  Menu,
  X,
  Store,
  Bot,
  LayoutDashboard,
  UserCircle,
  LogOut,
} from "lucide-react";
import { adminNavItems } from "./nav.config";

// ============================================================
// 定数
// ============================================================

const FALLBACK_STORE_NAME = "Lumiere 表参道";

// href → lucide-react icon のマッピング
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  "/admin":              LayoutDashboard,
  "/admin/menu":         ClipboardList,
  "/admin/staff":        Users,
  "/admin/reservations": Calendar,
  "/admin/customers":    UserCircle,
  "/admin/ai":           Bot,
  // temporarily hidden — re-enable with nav.config.ts
  // "/admin/admins":       Shield,
  // "/admin/security":     KeyRound,
  "/admin/settings":     Settings,
};

// ============================================================
// サイドバー内部
// ============================================================


function Sidebar({
  storeName,
  isOpen,
  onClose,
  tenantId,
}: {
  storeName: string;
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* オーバーレイ（モバイルのみ） */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* サイドバー本体 */}
      <aside
        className={[
          "fixed lg:static inset-y-0 left-0 z-50",
          "w-64 bg-gray-900 text-white flex flex-col shrink-0",
          "border-r border-gray-800 transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        {/* ヘッダ */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Store className="w-4 h-4 text-indigo-400 shrink-0" />
              <span
                className="font-bold text-base text-white truncate"
                title={storeName}
              >
                {storeName}
              </span>
            </div>
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">
              管理パネル
            </span>
          </div>
          {/* モバイル閉じるボタン */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 hover:bg-gray-800 rounded-lg transition-colors shrink-0"
            aria-label="メニューを閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ナビゲーション */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {adminNavItems.map(({ href, label }) => {
            const Icon = ICON_MAP[href] ?? Settings;
            // ダッシュボード(/admin)は完全一致のみ active（pathname はクエリを含まない）
            const isActive =
              href === "/admin"
                ? pathname === "/admin"
                : pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={withTenant(href, tenantId)}
                onClick={onClose}
                className={[
                  "relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/30"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white",
                ].join(" ")}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-white rounded-r-full" />
                )}
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* フッタ */}
        <div className="p-3 border-t border-gray-800 space-y-1">
          <a
            href={`/api/auth/logout${tenantId && tenantId !== "default" ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`}
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-all duration-150"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="truncate">ログアウト</span>
          </a>
        </div>
      </aside>
    </>
  );
}

// ============================================================
// AdminShell（export default）
// ============================================================

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [storeName, setStoreName] = useState(FALLBACK_STORE_NAME);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { status: tenantStatus, tenantId: sessionTenantId, authenticated } = useAdminTenantId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (tenantStatus !== "ready") return;

    // ── URL canonicalization ──────────────────────────────────────────
    // セッション tenantId を正として URL を正規化する。
    // ① URL の tenantId が間違っている → 修正
    // ② URL に tenantId がなく、セッションが non-default → 付与
    // ③ その他（URL 正しい or default テナント+URL なし）→ 何もしない
    // ※ early return は廃止: リダイレクトと settings fetch を並行実行する
    const params = new URLSearchParams(window.location.search);
    const urlTenantId = params.get("tenantId");
    const needsCanon =
      (urlTenantId !== null && urlTenantId !== sessionTenantId) ||
      (urlTenantId === null && sessionTenantId !== "default");
    if (needsCanon) {
      const newParams = new URLSearchParams(window.location.search);
      newParams.set("tenantId", sessionTenantId);
      router.replace(`${window.location.pathname}?${newParams.toString()}`);
      // early return 廃止 → settings fetch を続行（storeName 取得漏れ防止）
    }

    // API から storeName + onboarding フラグを取得
    fetch(`/api/proxy/admin/settings?tenantId=${encodeURIComponent(sessionTenantId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: any) => {
        // API returns { ok, tenantId, data: { storeName, ... } }
        const sn = data?.data?.storeName || data?.storeName;
        if (sn) {
          setStoreName(sn);
        }

        // onboardingCompleted===false (signup ユーザーのみ) → /admin/onboarding へ redirect
        // Exclude: onboarding itself + pages reachable from onboarding checklist
        const oc =
          data?.data?.onboarding?.onboardingCompleted ??
          data?.onboarding?.onboardingCompleted;
        const onboardingExempt =
          pathname?.startsWith("/admin/onboarding") ||
          pathname?.startsWith("/admin/line-setup") ||
          pathname?.startsWith("/admin/menu") ||
          pathname?.startsWith("/admin/staff") ||
          pathname?.startsWith("/admin/dashboard") ||
          pathname?.startsWith("/admin/settings");
        if (oc === false && !onboardingExempt) {
          router.push(`/admin/onboarding?tenantId=${encodeURIComponent(sessionTenantId)}`);
        }
      })
      .catch(() => {
        // API 失敗時はフォールバック名のまま
      });
  }, [tenantStatus, sessionTenantId]);

  // hydration mismatch 完全防止
  if (!mounted) return null;

  // /admin/line-setup は専用セットアップ画面 — サイドバーなしで children をそのまま返す
  if (pathname === "/admin/line-setup") {
    return <>{children}</>;
  }

  // Auth guard: session expired or invalid → show login redirect banner
  // Skip for pages that handle their own auth (line-setup is already excluded above)
  if (tenantStatus === "ready" && !authenticated) {
    const loginParams = new URLSearchParams();
    const returnTo = typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/admin";
    loginParams.set("returnTo", returnTo);
    if (sessionTenantId && sessionTenantId !== "default") {
      loginParams.set("tenantId", sessionTenantId);
    }
    loginParams.set("reason", "session_expired");
    const loginUrl = `/login?${loginParams.toString()}`;

    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 max-w-md w-full p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <LogOut className="w-7 h-7 text-amber-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            ログインの有効期限が切れました
          </h2>
          <p className="text-sm text-gray-500">
            セッションの有効期限が切れたか、認証情報が無効です。再度ログインしてください。
          </p>
          <a
            href={loginUrl}
            className="inline-flex items-center justify-center w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            ログインページへ
          </a>
          {sessionTenantId && sessionTenantId !== "default" && (
            <p className="text-xs text-gray-400">
              テナント: {sessionTenantId}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div data-admin-shell className="flex h-screen overflow-hidden bg-gray-50">
      {/* サイドバー */}
      <Sidebar
        storeName={storeName}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        tenantId={sessionTenantId}
      />

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* トップバー（モバイル用ハンバーガー） */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 lg:hidden shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="メニューを開く"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <span className="font-semibold text-gray-900 text-sm truncate">
            {storeName}
          </span>
        </header>

        {/* ページコンテンツ */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
