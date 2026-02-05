'use client';

import { useState } from 'react';
import AdminShell from '../ui/AdminShell';
import AdminTopBar from '../ui/AdminTopBar';
import AdminSidebar from './AdminSidebar';
import AdminDashboard from './AdminDashboard';
import ReservationsManager from './ReservationsManager';
import MenuManager from './MenuManager';
import StaffManager from './StaffManager';
import AdminSettings from './AdminSettings';

type Tab = 'dashboard' | 'reservations' | 'menus' | 'staff' | 'settings';

const TAB_CONFIG: Record<Tab, { title: string; subtitle?: string }> = {
  dashboard: {
    title: 'ダッシュボード',
    subtitle: '今日の店舗状況のサマリーです。',
  },
  reservations: {
    title: '予約管理',
    subtitle: '予約の一覧と管理を行います。',
  },
  menus: {
    title: 'メニュー管理',
    subtitle: 'メニューの追加・編集を行います。',
  },
  staff: {
    title: 'スタッフ管理',
    subtitle: 'スタッフの追加・編集を行います。',
  },
  settings: {
    title: '管理者設定',
    subtitle: 'システム設定を変更します。',
  },
};

export default function AdminApp() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const config = TAB_CONFIG[tab];

  const renderContent = () => {
    switch (tab) {
      case 'dashboard':
        return <AdminDashboard />;
      case 'reservations':
        return <ReservationsManager />;
      case 'menus':
        return <MenuManager />;
      case 'staff':
        return <StaffManager />;
      case 'settings':
        return <AdminSettings />;
      default:
        return null;
    }
  };

  return (
    <AdminShell
      sidebar={<AdminSidebar activeTab={tab} setTab={setTab} />}
      topbar={<AdminTopBar title={config.title} subtitle={config.subtitle} />}
    >
      {renderContent()}
    </AdminShell>
  );
}
