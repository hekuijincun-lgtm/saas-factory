'use client';

// route: /admin/menu
import AdminTopBar from '../../_components/ui/AdminTopBar';
import MenuManager from '../../_components/admin/MenuManager';

export default function Page() {
  return (
    <>
      <AdminTopBar title="メニュー管理" subtitle="メニューの追加・編集を行います。" />
      <MenuManager />
    </>
  );
}
