'use client';

// route: /admin/staff
import AdminTopBar from '../../_components/ui/AdminTopBar';
import StaffManager from '../../_components/admin/StaffManager';

export default function Page() {
  return (
    <>
      <AdminTopBar title="スタッフ管理" subtitle="スタッフの追加・編集を行います。" />
      <StaffManager />
    </>
  );
}
