// route: /admin/staff
'use client';

import AdminShell from '../../_components/ui/AdminShell';
import AdminTopBar from '../../_components/ui/AdminTopBar';
import AdminSidebar from '../../_components/admin/AdminSidebar';
import StaffManager from '../../_components/admin/StaffManager';

export default function Page() {
  return (
    <AdminShell
      sidebar={<AdminSidebar />}
      topbar={<AdminTopBar title="スタッフ管理" subtitle="スタッフの追加・編集を行います。" />}
    >
      <StaffManager />
    </AdminShell>
  );
}

