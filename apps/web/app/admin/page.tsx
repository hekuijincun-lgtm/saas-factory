// route: /admin
'use client';

import AdminTopBar from '../_components/ui/AdminTopBar';
import AdminDashboard from '../_components/admin/AdminDashboard';

export default function Page() {
  return (
    <>
      <AdminTopBar title="ダッシュボード" subtitle="今日の店舗状況のサマリーです。" />
      <AdminDashboard />
    </>
  );
}
