"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LogOut,
  X,
  Menu,
  Shield,
  Target,
  CheckSquare,
  Kanban,
  BarChart3,
  Search,
  Upload,
  Megaphone,
  Settings2,
} from "lucide-react";

function Sidebar({
  displayName,
  isOpen,
  onClose,
}: {
  displayName: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  const navItems = [
    { href: "/owner", label: "概要", icon: LayoutDashboard },
    { href: "/owner/outreach/leads", label: "営業リード", icon: Target },
    { href: "/owner/outreach/review", label: "レビューキュー", icon: CheckSquare },
    { href: "/owner/outreach/crm", label: "CRM", icon: Kanban },
    { href: "/owner/outreach/analytics", label: "営業分析", icon: BarChart3 },
    { href: "/owner/outreach/sources", label: "ソース検索", icon: Search },
    { href: "/owner/outreach/import", label: "CSVインポート", icon: Upload },
    { href: "/owner/outreach/campaigns", label: "キャンペーン", icon: Megaphone },
    { href: "/owner/outreach/settings", label: "配信設定", icon: Settings2 },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          "fixed lg:static inset-y-0 left-0 z-50",
          "w-64 bg-gray-900 text-white flex flex-col shrink-0",
          "border-r border-gray-800 transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Shield className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-bold text-base text-white truncate">
                SaaS Factory
              </span>
            </div>
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">
              オーナー管理
            </span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 hover:bg-gray-800 rounded-lg transition-colors shrink-0"
            aria-label="メニューを閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/owner"
                ? pathname === "/owner"
                : pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={[
                  "relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-amber-600 text-white shadow-lg shadow-amber-900/30"
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

        {/* Footer */}
        <div className="p-3 border-t border-gray-800 space-y-1">
          {displayName && (
            <div className="px-4 py-1.5 text-xs text-gray-500 truncate">
              {displayName}
            </div>
          )}
          <a
            href="/api/auth/logout"
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

export default function OwnerShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: any) => {
        if (data?.displayName) setDisplayName(data.displayName);
      })
      .catch(() => {});
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        displayName={displayName}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 lg:hidden shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="メニューを開く"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <span className="font-semibold text-gray-900 text-sm truncate">
            SaaS Factory / オーナー管理
          </span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
