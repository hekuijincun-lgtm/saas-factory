'use client';

// route: /admin/menu
import { useSearchParams } from 'next/navigation';
import AdminTopBar from '../../_components/ui/AdminTopBar';
import MenuManager from '../../_components/admin/MenuManager';

export default function Page() {
  const searchParams = useSearchParams();
  const tenantId = searchParams?.get('tenantId') || 'default';

  return (
    <>
      <AdminTopBar title="メニュー管理" subtitle="メニューの追加・編集を行います。" />
      <MenuManager key={tenantId} />
    </>
  );
}
