'use client';

import AdminTopBar from '../../_components/ui/AdminTopBar';
import AdminMembersManager from '../../_components/admin/AdminMembersManager';

export default function AdminMembersPage() {
  return (
    <div className="space-y-6">
      <AdminTopBar title="管理者管理" subtitle="管理者の追加・権限変更・無効化" />
      <AdminMembersManager />
    </div>
  );
}
