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
  CreditCard,
  LifeBuoy,
  PawPrint,
  FileText,
  Syringe,
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
  Megaphone,
  ClipboardCheck,
} from "lucide-react";
import { adminNavItems, filterNavItems } from "./nav.config";
import { getVerticalTheme } from "@/src/lib/verticalTheme";

// ============================================================
// 定数
// ============================================================

const FALLBACK_STORE_NAME = "マイショップ";

// href → lucide-react icon のマッピング
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  "/admin":              LayoutDashboard,
  "/admin/menu":         ClipboardList,
  "/admin/staff":        Users,
  "/admin/reservations": Calendar,
  "/admin/customers":    UserCircle,
  "/admin/ai":           Bot,
  "/admin/billing":      CreditCard,
  // temporarily hidden — re-enable with nav.config.ts
  // "/admin/admins":       Shield,
  // "/admin/security":     KeyRound,
  "/admin/pet":          PawPrint,
  "/admin/pet/reservations": Calendar,
  "/admin/pet/customers": UserCircle,
  "/admin/pet/profiles": FileText,
  "/admin/pet/vaccines": Syringe,
  "/admin/pet/staff":    Users,
  "/admin/pet/pricing":  ClipboardList,
  "/admin/pet/estimates": ClipboardList,
  "/admin/pet/karte":    ClipboardCheck,
  "/admin/pet/ai-config": Bot,
  "/admin/pet/settings": Settings,
  "/admin/marketing":    Megaphone,
  "/admin/support":      LifeBuoy,
  "/admin/settings":     Settings,
};

// ============================================================
// サイドバー内部
// ============================================================


function Sidebar({
  storeName,
  isOpen,
  collapsed,
  onClose,
  onToggleCollapse,
  tenantId,
  vertical,
}: {
  storeName: string;
  isOpen: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
  tenantId: string;
  vertical?: string;
}) {
  const pathname = usePathname();
  const isPet = vertical === "pet";
  const vt = getVerticalTheme(vertical);
  const filteredNavItems = filterNavItems([...adminNavItems], vertical);

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
          "text-white flex flex-col shrink-0",
          "transition-all duration-300 ease-in-out",
          collapsed ? "lg:w-16 w-64" : "w-64",
          "bg-gray-900 border-r border-gray-800",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        {/* ヘッダ */}
        <div className={`${collapsed ? "p-3 justify-center" : "p-5"} border-b border-gray-800 flex items-center justify-between gap-2`}>
          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                {isPet ? (
                  <PawPrint className={`w-4 h-4 ${vt.sidebarText} shrink-0`} />
                ) : (
                  <Store className={`w-4 h-4 ${vt.sidebarText} shrink-0`} />
                )}
                <span
                  className="font-bold text-base text-white truncate"
                  title={storeName}
                >
                  {storeName}
                </span>
              </div>
              <span className={`text-[10px] uppercase tracking-wider ${vt.sidebarText}`}>
                {isPet ? "ペットサロン管理" : "管理パネル"}
              </span>
            </div>
          )}
          {collapsed && (
            <div className="flex items-center justify-center">
              {isPet ? (
                <PawPrint className={`w-5 h-5 ${vt.sidebarText}`} />
              ) : (
                <Store className={`w-5 h-5 ${vt.sidebarText}`} />
              )}
            </div>
          )}
          {/* モバイル閉じるボタン */}
          <button
            onClick={onClose}
            className={`lg:hidden p-1.5 rounded-lg transition-colors shrink-0 ${"hover:bg-gray-800"}`}
            aria-label="メニューを閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ナビゲーション */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {filteredNavItems.map(({ href, label }) => {
            const Icon = ICON_MAP[href] ?? Settings;
            // ダッシュボード: pet は /admin/pet を完全一致、それ以外は /admin を完全一致
            const dashHref = isPet ? "/admin/pet" : "/admin";
            const isActive =
              href === dashHref
                ? pathname === href
                : pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={withTenant(href, tenantId)}
                onClick={onClose}
                title={collapsed ? label : undefined}
                className={[
                  "relative flex items-center rounded-lg text-sm font-medium transition-all duration-150",
                  collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-4 py-2.5",
                  isActive
                    ? `${vt.sidebarActive} text-white shadow-lg ${vt.sidebarShadow}`
                    : `${vt.sidebarText} hover:bg-gray-800 ${vt.sidebarHover}`,
                ].join(" ")}
              >
                {isActive && !collapsed && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-white rounded-r-full" />
                )}
                <Icon className={collapsed ? "w-5 h-5" : "w-4 h-4 shrink-0"} />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* フッタ */}
        <div className={`p-3 border-t border-gray-800 space-y-1`}>
          <a
            href={`/api/auth/logout${tenantId && tenantId !== "default" ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`}
            title={collapsed ? "ログアウト" : undefined}
            className={`flex items-center rounded-lg text-sm font-medium transition-all duration-150 ${collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-4 py-2.5"} ${vt.sidebarText} hover:bg-gray-800 ${vt.sidebarHover}`}
          >
            <LogOut className={collapsed ? "w-5 h-5" : "w-4 h-4 shrink-0"} />
            {!collapsed && <span className="truncate">ログアウト</span>}
          </a>
          {/* デスクトップ折りたたみトグル */}
          <button
            onClick={onToggleCollapse}
            className={`hidden lg:flex items-center w-full rounded-lg text-sm font-medium transition-all duration-150 ${collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-4 py-2.5"} ${vt.sidebarText} hover:bg-gray-800 ${vt.sidebarHover}`}
            title={collapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
          >
            {collapsed ? <ChevronsRight className="w-5 h-5" /> : <ChevronsLeft className="w-4 h-4 shrink-0" />}
            {!collapsed && <span className="truncate">閉じる</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

// ============================================================
// 下部タブバー（スマホ用）
// ============================================================

/** Bottom tab nav items (max 5). The 5th is a "More" menu. */
function BottomTabBar({
  tenantId,
  vertical,
}: {
  tenantId: string;
  vertical?: string;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const vt = getVerticalTheme(vertical);
  const filteredNavItems = filterNavItems([...adminNavItems], vertical);

  // Pick first 4 items for direct tabs, rest go into "More"
  const directItems = filteredNavItems.slice(0, 4);
  const moreItems = filteredNavItems.slice(4);

  const isActive = (href: string) => {
    const isPet = vertical === "pet";
    const dashHref = isPet ? "/admin/pet" : "/admin";
    return href === dashHref
      ? pathname === href
      : pathname === href || pathname?.startsWith(href + "/");
  };

  return (
    <>
      {/* "More" overlay */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/40"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute bottom-[56px] left-0 right-0 bg-white rounded-t-2xl shadow-xl max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 space-y-0.5">
              {moreItems.map(({ href, label }) => {
                const Icon = ICON_MAP[href] ?? Settings;
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={withTenant(href, tenantId)}
                    onClick={() => setMoreOpen(false)}
                    className={[
                      "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                      active
                        ? `${vt.sidebarActive} text-white`
                        : "text-gray-700 hover:bg-gray-100",
                    ].join(" ")}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 flex sm:hidden safe-area-bottom">
        {directItems.map(({ href, label }) => {
          const Icon = ICON_MAP[href] ?? Settings;
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={withTenant(href, tenantId)}
              className={[
                "flex-1 flex flex-col items-center justify-center py-2 text-[10px] font-medium transition-colors min-h-[56px]",
                active ? "text-indigo-600" : "text-gray-500",
              ].join(" ")}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${active ? "text-indigo-600" : "text-gray-400"}`} />
              <span className="truncate max-w-[64px]">{label}</span>
            </Link>
          );
        })}
        {moreItems.length > 0 && (
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={[
              "flex-1 flex flex-col items-center justify-center py-2 text-[10px] font-medium transition-colors min-h-[56px]",
              moreOpen ? "text-indigo-600" : "text-gray-500",
            ].join(" ")}
          >
            <MoreHorizontal className={`w-5 h-5 mb-0.5 ${moreOpen ? "text-indigo-600" : "text-gray-400"}`} />
            <span>その他</span>
          </button>
        )}
      </nav>
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
  const [vertical, setVertical] = useState<string | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { status: tenantStatus, tenantId: sessionTenantId, authenticated } = useAdminTenantId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (tenantStatus !== "ready") return;
    if (!authenticated) return;

    // ── URL canonicalization ──────────────────────────────────────────
    // セッション tenantId を正として URL を正規化する。
    const params = new URLSearchParams(window.location.search);
    const urlTenantId = params.get("tenantId");
    const needsCanon =
      (urlTenantId !== null && urlTenantId !== sessionTenantId) ||
      (urlTenantId === null && sessionTenantId !== "default");
    if (needsCanon) {
      const newParams = new URLSearchParams(window.location.search);
      newParams.set("tenantId", sessionTenantId);
      router.replace(`${window.location.pathname}?${newParams.toString()}`);
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
        const v = data?.data?.vertical || data?.vertical;
        if (v) {
          setVertical(v);
          // pet vertical: /admin にアクセスした場合 /admin/pet にリダイレクト
          if (v === "pet" && pathname === "/admin") {
            router.replace(`/admin/pet?tenantId=${encodeURIComponent(sessionTenantId)}`);
          }
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

  // Auth loading guard: セッション確認が完了するまで children を描画しない
  if (tenantStatus === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500">認証を確認中...</p>
        </div>
      </div>
    );
  }

  // Auth guard: session expired, invalid, or tenant unresolved → block UI
  // Skip for pages that handle their own auth (line-setup is already excluded above)
  const needsLogin = !authenticated;
  // Allow "default" tenant when explicitly specified in URL (for testing/demo)
  const urlHasDefaultTenant = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tenantId") === "default";
  const tenantUnresolved = authenticated && sessionTenantId === "default" && !urlHasDefaultTenant;
  if (needsLogin || tenantUnresolved) {
    const loginParams = new URLSearchParams();
    const returnTo = typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/admin";
    loginParams.set("returnTo", returnTo);
    if (sessionTenantId && sessionTenantId !== "default") {
      loginParams.set("tenantId", sessionTenantId);
    }
    loginParams.set("reason", needsLogin ? "session_expired" : "no_tenant");
    const loginUrl = `/login?${loginParams.toString()}`;

    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 max-w-md w-full p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <LogOut className="w-7 h-7 text-amber-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            {tenantUnresolved
              ? "テナントを特定できません"
              : "ログインの有効期限が切れました"}
          </h2>
          <p className="text-sm text-gray-500">
            {tenantUnresolved
              ? "アクセス先のテナントが特定できないため、管理画面を表示できません。再度ログインしてください。"
              : "セッションの有効期限が切れたか、認証情報が無効です。再度ログインしてください。"}
          </p>
          <a
            href={loginUrl}
            className="inline-flex items-center justify-center w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            ログインページへ
          </a>
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
        collapsed={sidebarCollapsed}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
        tenantId={sessionTenantId}
        vertical={vertical}
      />

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* トップバー（タブレット用ハンバーガー — sm以下はボトムタブに切替） */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 hidden sm:flex lg:hidden items-center gap-3 shrink-0">
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

        {/* モバイルヘッダー（ストア名のみ） */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex sm:hidden items-center gap-3 shrink-0">
          <span className="font-semibold text-gray-900 text-sm truncate">
            {storeName}
          </span>
        </header>

        {/* ページコンテンツ — pb-16 for bottom tab bar on mobile */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-6 sm:pb-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* スマホ用下部タブバー */}
      <BottomTabBar tenantId={sessionTenantId} vertical={vertical} />
    </div>
  );
}
