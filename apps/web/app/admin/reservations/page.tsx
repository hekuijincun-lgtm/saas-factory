'use client';

import { useSearchParams } from 'next/navigation';
import AdminTopBar from '../../_components/ui/AdminTopBar';
import ReservationsLedger from '../../_components/admin/ReservationsLedger';

export default function Page() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenantId') || 'default';
  return (
    <>
      <AdminTopBar title="予約管理" subtitle="予約の一覧と管理を行います。" />
      <ReservationsLedger key={tenantId} />
    </>
  );
}
