'use client';

// route: /admin/reservations
import AdminTopBar from '../../_components/ui/AdminTopBar';
import ReservationsLedger from '../../_components/admin/ReservationsLedger';

export default function Page() {
  return (
    <>
      <AdminTopBar title="予約管理" subtitle="予約の一覧と管理を行います。" />
      <ReservationsLedger />
    </>
  );
}
