"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings,
  UtensilsCrossed,
  Users,
  Calendar,
  Menu,
  X,
  Store,
  Bot,
  LayoutDashboard,
  UserCircle,
} from "lucide-react";
import { adminNavItems } from "./nav.config";

// ============================================================
// 定数
// ============================================================

const FALLBACK_STORE_NAME = "Lumiere 表参道";

// href → lucide-react icon のマッピング
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  "/admin":              LayoutDashboard,
  "/admin/menu":         UtensilsCrossed,
  "/admin/staff":        Users,
  "/admin/reservations": Calendar,
  "/admin/customers":    UserCircle,
  "/admin/ai":           Bot,
  "/admin/settings":     Settings,
};

// ============================================================
// サイドバー内部
// ============================================================

function Sidebar({
  storeName,
  isOpen,
  onClose,
}: {
  storeName: string;
  isOpen: boolean;
  onClose: () => void;
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
            // ダッシュボード(/admin)は完全一致のみ active
            const isActive =
              href === "/admin"
                ? pathname === "/admin"
                : pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
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
        <div className="p-3 border-t border-gray-800">
          <div className="px-4 py-2 text-[10px] text-gray-600 font-mono">
            api: /api/proxy
          </div>
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

  useEffect(() => {
    setMounted(true);

    // tenantId を URL から取得（なければ default）
    const params = new URLSearchParams(window.location.search);
    const tenantId = params.get("tenantId") || "default";

    // API から storeName を取得
    fetch(`/api/proxy/admin/settings?tenantId=${encodeURIComponent(tenantId)}`)
      .then((r) => r.json())
      .then((data: any) => {
        // API returns { ok, tenantId, data: { storeName, ... } }
        const sn = data?.data?.storeName || data?.storeName;
        if (sn) {
          setStoreName(sn);
        }
      })
      .catch(() => {
        // API 失敗時はフォールバック名のまま
      });
  }, []);

  // hydration mismatch 完全防止
  if (!mounted) return null;

  return (
    <div data-admin-shell className="flex h-screen overflow-hidden bg-gray-50">
      {/* サイドバー */}
      <Sidebar
        storeName={storeName}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
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
