'use client';

import { useState } from 'react';
import Link from 'next/link';
import AdminTopBar from '../../../_components/ui/AdminTopBar';
import MenuManager from '../../../_components/admin/MenuManager';
import BreedPricingManager from '../_components/BreedPricingManager';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';

type TabKey = 'menu' | 'breed';

export default function PetPricingPage() {
  const { tenantId, status } = useAdminTenantId();
  const [tab, setTab] = useState<TabKey>('menu');

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

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'menu', label: 'メニュー管理' },
    { key: 'breed', label: '犬種別料金設定' },
  ];

  return (
    <>
      <AdminTopBar title="メニュー・料金管理" subtitle="メニューと犬種×サイズ別の料金を管理します。" />
      <div className="px-6 pb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href={withTenant('/admin/pet', tenantId)} className="hover:text-orange-600 transition-colors">
            ペットサロン
          </Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">メニュー・料金管理</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'menu' && <MenuManager key={tenantId} tenantId={tenantId} />}
        {tab === 'breed' && <BreedPricingManager tenantId={tenantId} />}
      </div>
    </>
  );
}
