'use client';

import AdminTopBar from '../../../_components/ui/AdminTopBar';
import StaffManager from '../../../_components/admin/StaffManager';

export default function PetStaffPage() {
  return (
    <>
      <AdminTopBar title="スタッフ管理" subtitle="トリマーの追加・編集を管理します。" />
      <StaffManager />
    </>
  );
}
