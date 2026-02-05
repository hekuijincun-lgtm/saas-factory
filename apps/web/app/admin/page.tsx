// route: /admin
'use client';

import AdminShell from '../_components/ui/AdminShell';
import AdminTopBar from '../_components/ui/AdminTopBar';
import AdminSidebar from '../_components/admin/AdminSidebar';
import AdminDashboard from '../_components/admin/AdminDashboard';

export default function Page() {
  return (
    <AdminShell
      sidebar={<AdminSidebar />}
      topbar={<AdminTopBar title="ダッシュボード" subtitle="今日の店舗状況のサマリーです。" />}
    >
      <AdminDashboard />
    </AdminShell>
  );
}

