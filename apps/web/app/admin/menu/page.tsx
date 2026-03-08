'use client';

// route: /admin/menu
import AdminTopBar from '../../_components/ui/AdminTopBar';
import MenuManager from '../../_components/admin/MenuManager';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';

export default function Page() {
  const { status, tenantId } = useAdminTenantId();

  if (status === 'loading') {
    return <div className="px-6 py-12 text-center text-sm text-gray-400">読み込み中...</div>;
  }

  return (
    <>
      <AdminTopBar title="メニュー管理" subtitle="メニューの追加・編集を行います。" />
      <MenuManager key={tenantId} tenantId={tenantId} />
    </>
  );
}
