'use client';

import AdminTopBar from '../../_components/ui/AdminTopBar';
import BootstrapKeyManager from '../../_components/admin/BootstrapKeyManager';

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      <AdminTopBar title="セキュリティ設定" subtitle="管理者オンボーディングキーの発行と管理" />
      <BootstrapKeyManager />
    </div>
  );
}
