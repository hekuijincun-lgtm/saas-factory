'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminTopBar from '../../../_components/ui/AdminTopBar';
import ReservationsLedger from '../../../_components/admin/ReservationsLedger';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import { getMenu, fetchBookingSettings } from '@/src/lib/bookingApi';
import type { Reservation, MenuItem } from '@/src/lib/bookingApi';

interface PetOption {
  id: string;
  name: string;
  breed?: string;
  size?: string;
  weight?: number;
  age?: string;
  gender?: string;
  ownerName?: string;
  customerKey?: string;
}

export default function PetReservationsPage() {
  const { status, tenantId } = useAdminTenantId();
  const [pets, setPets] = useState<PetOption[]>([]);
  const [selectedPetId, setSelectedPetId] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [estimateMode, setEstimateMode] = useState(false);
  // Map customerKey → customerId for travel check
  const [customerIdMap, setCustomerIdMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (status !== 'ready') return;
    // Fetch pets
    fetch(`/api/proxy/admin/pets?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const list = json?.data ?? json?.pets ?? [];
        setPets(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    // Fetch menu items
    getMenu(tenantId)
      .then(items => setMenuItems(Array.isArray(items) ? items.filter(i => i.active) : []))
      .catch(() => {});
    // Check estimate mode
    fetchBookingSettings(tenantId)
      .then((s: any) => {
        if (s?.estimateMode === 'enabled') setEstimateMode(true);
      })
      .catch(() => {});
  }, [tenantId, status]);

  // Resolve customerId when pet is selected (for travel check)
  useEffect(() => {
    if (status !== 'ready' || !selectedPetId) return;
    const pet = pets.find(p => p.id === selectedPetId);
    if (!pet?.customerKey || customerIdMap[pet.customerKey]) return;
    // Search customers by phone (from customerKey like "phone:090...")
    fetch(`/api/proxy/admin/customers?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const customers = json?.customers ?? [];
        const map: Record<string, string> = { ...customerIdMap };
        for (const c of customers) {
          if (c.customerKey) map[c.customerKey] = c.id;
        }
        setCustomerIdMap(map);
      })
      .catch(() => {});
  }, [status, tenantId, selectedPetId, pets, customerIdMap]);

  const getSelectedCustomerId = useCallback((): string | null => {
    if (!selectedPetId) return null;
    const pet = pets.find(p => p.id === selectedPetId);
    if (!pet?.customerKey) return null;
    return customerIdMap[pet.customerKey] ?? null;
  }, [selectedPetId, pets, customerIdMap]);

  const getCreateMeta = useCallback(() => {
    if (!selectedPetId) return {};
    const pet = pets.find(p => p.id === selectedPetId);
    return {
      petId: selectedPetId,
      petName: pet?.name || '',
    };
  }, [selectedPetId, pets]);

  const renderCardExtra = useCallback((reservation: Reservation) => {
    const petName = (reservation.meta as any)?.petName;
    if (!petName) return null;
    return (
      <div className="text-xs text-orange-600 font-medium mb-1">
        {petName}
      </div>
    );
  }, []);

  const petPickerField = (
    <div>
      <label className="block text-sm font-medium text-brand-text mb-1">ペット</label>
      <select
        value={selectedPetId}
        onChange={(e) => setSelectedPetId(e.target.value)}
        className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary bg-white text-sm"
      >
        <option value="">選択（任意）</option>
        {pets.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}{p.breed ? ` (${p.breed})` : ''}{p.ownerName ? ` — ${p.ownerName}` : ''}
          </option>
        ))}
      </select>
    </div>
  );

  if (status === 'loading') {
    return (
      <>
        <AdminTopBar title="予約管理" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="予約管理" subtitle="ペットサロンの予約を管理します。" />
      {estimateMode && (
        <div className="mx-4 sm:mx-6 mb-4 rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-2.5">
          <p className="text-xs text-yellow-700">
            見積作成モードON: 料金が非表示になっています。予約後にAI見積もりが自動生成されます。
          </p>
        </div>
      )}
      <ReservationsLedger
        key={tenantId}
        createFormExtra={petPickerField}
        getCreateMeta={getCreateMeta}
        renderCardExtra={renderCardExtra}
        overrideMenuList={menuItems.length > 0 ? menuItems : undefined}
        hidePrices={estimateMode}
        mobileTrimming
        getSelectedCustomerId={getSelectedCustomerId}
      />
    </>
  );
}
