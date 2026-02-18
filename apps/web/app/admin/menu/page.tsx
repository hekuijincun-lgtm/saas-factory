/** --- injected: MENU_DEBUG_GUARD_V1 --- */
async function safeFetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" as RequestCredentials });
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();

  // NOTE: keep logs in prod to debug only this page
  console.log("[menu] url=", url, "status=", res.status, "ct=", ct, "head=", text.slice(0, 120));

  if (!ct.includes("application/json")) {
    throw new Error(`menu_non_json status=${res.status} ct=${ct} head=${text.slice(0, 120)}`);
  }
  const json = JSON.parse(text);
  if (!res.ok) {
    throw new Error(`menu_http_error status=${res.status} body=${text.slice(0, 200)}`);
  }
  return json;
}
/** --- end injected --- */
// route: /admin/menu
'use client';

import AdminShell from '../../_components/ui/AdminShell';
import AdminTopBar from '../../_components/ui/AdminTopBar';
import AdminSidebar from '../../_components/admin/AdminSidebar';
import MenuManager from '../../_components/admin/MenuManager';

export default function Page() {
  return (
    <AdminShell
      sidebar={<AdminSidebar />}
      topbar={<AdminTopBar title="メニュー管理" subtitle="メニューの追加・編集を行います。" />}
    >
      <MenuManager />
    </AdminShell>
  );
}


