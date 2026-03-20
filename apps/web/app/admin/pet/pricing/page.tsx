'use client';

import Link from 'next/link';
import AdminTopBar from '../../../_components/ui/AdminTopBar';
import MenuManager from '../../../_components/admin/MenuManager';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';

export default function PetPricingPage() {
  const { tenantId, status } = useAdminTenantId();

  if (status === 'loading') {
    return (
      <>
        <AdminTopBar title="メニュー管理" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="メニュー管理" subtitle="ペットサロンのメニュー・料金を管理します。" />
      <div className="px-6 pb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href={withTenant('/admin/pet', tenantId)} className="hover:text-orange-600 transition-colors">
            ペットサロン
          </Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">メニュー管理</span>
        </div>
        <MenuManager key={tenantId} tenantId={tenantId} />
      </div>
    </>
  );
}
