'use client';

import AdminTopBar from '../../_components/ui/AdminTopBar';
import ReservationsLedger from '../../_components/admin/ReservationsLedger';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';

export default function Page() {
  const { status, tenantId } = useAdminTenantId();

  if (status === 'loading') {
    return <div className="px-6 py-12 text-center text-sm text-gray-400">読み込み中...</div>;
  }

  return (
    <>
      <AdminTopBar title="予約管理" subtitle="予約の一覧と管理を行います。" />
      <ReservationsLedger key={tenantId} />
    </>
  );
}
