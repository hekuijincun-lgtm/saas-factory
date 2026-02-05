// route: /admin/reservations
'use client';

import AdminShell from '../../_components/ui/AdminShell';
import AdminTopBar from '../../_components/ui/AdminTopBar';
import AdminSidebar from '../../_components/admin/AdminSidebar';
import ReservationsLedger from '../../_components/admin/ReservationsLedger';

export default function Page() {
  return (
    <AdminShell
      sidebar={<AdminSidebar />}
      topbar={<AdminTopBar title="予約管理" subtitle="予約の一覧と管理を行います。" />}
    >
      <ReservationsLedger />
    </AdminShell>
  );
}

