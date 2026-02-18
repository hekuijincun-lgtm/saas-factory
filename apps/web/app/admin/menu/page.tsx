'use client';

// route: /admin/menu
import AdminShell from '../../_components/ui/AdminShell';
import AdminTopBar from '../../_components/ui/AdminTopBar';
import AdminSidebar from '../../_components/admin/AdminSidebar';
import MenuManager from '../../_components/admin/MenuManager';

export default function Page() {
  return (
    <AdminShell
      sidebar={<AdminSidebar />}
      topbar={<AdminTopBar title="メニュー管理" data-stamp="MENU_STAMP_20260218_180519" subtitle="メニューの追加・編集を行います。" />}
    >
      <MenuManager />
    </AdminShell>
  );
}





