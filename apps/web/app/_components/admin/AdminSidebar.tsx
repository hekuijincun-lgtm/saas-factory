'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Calendar, Utensils, Users, Settings, LogOut } from 'lucide-react';
import { usePathname } from 'next/navigation';

type Tab = 'dashboard' | 'reservations' | 'menus' | 'staff' | 'settings';

interface AdminSidebarProps {
  activeTab?: Tab;
  setTab?: (tab: Tab) => void;
}

interface NavItem {
  id: Tab;
  label: string;
  href: string;
  icon: React.ReactNode;
}

export default function AdminSidebar({ activeTab: propActiveTab, setTab: propSetTab }: AdminSidebarProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // パスから activeTab を決定
  const getActiveTabFromPath = (): Tab => {
    if (!mounted || !pathname) return 'dashboard';
    if (pathname.startsWith('/admin/reservations')) return 'reservations';
    if (pathname.startsWith('/admin/menu')) return 'menus';
    if (pathname.startsWith('/admin/staff')) return 'staff';
    if (pathname.startsWith('/admin/settings')) return 'settings';
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'dashboard';
    return 'dashboard';
  };

  const activeTab = propActiveTab ?? getActiveTabFromPath();

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'ダッシュボード', href: '/admin', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'reservations', label: '予約管理', href: '/admin/reservations', icon: <Calendar className="w-5 h-5" /> },
    { id: 'menus', label: 'メニュー管理', href: '/admin/menu', icon: <Utensils className="w-5 h-5" /> },
    { id: 'staff', label: 'スタッフ管理', href: '/admin/staff', icon: <Users className="w-5 h-5" /> },
    { id: 'settings', label: '管理者設定', href: '/admin/settings', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <div className="h-full flex flex-col p-6">
      {/* ヘッダー */}
      <div className="mb-8">
        <h1 className="text-xl font-bold text-white mb-1">Lumiere 表参道</h1>
        <p className="text-sm text-slate-400">管理パネル</p>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 flex flex-col space-y-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => {
                if (propSetTab) {
                  propSetTab(item.id);
                }
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-primary text-white rounded-2xl shadow-md'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white/90 rounded-lg'
              }`}
            >
              <span className={isActive ? 'text-white' : 'text-slate-400'}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ログアウト */}
      <div className="pt-4 border-t border-slate-700/50">
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800/60 hover:text-slate-300 transition-colors">
          <LogOut className="w-5 h-5" />
          <span>ログアウト</span>
        </button>
      </div>
    </div>
  );
}
