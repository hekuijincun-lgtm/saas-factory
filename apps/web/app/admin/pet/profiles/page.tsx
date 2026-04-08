'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface VaccineRecord {
  name: string;
  date: string;
  expiresAt: string;
  vetClinic?: string;
}

interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string;
  size: string;
  age?: number;
  weight?: number;
  gender?: string;
  photoUrl?: string;
  ownerName?: string;
  customerKey?: string;
  lastGroomingDate?: string;
  vaccines?: VaccineRecord[];
}

function sizeBadgeLabel(size: string): string {
  switch (size) {
    case 'small': return '小型';
    case 'medium': return '中型';
    case 'large': return '大型';
    default: return size;
  }
}

function sizeBadgeColor(size: string): string {
  switch (size) {
    case 'small': return 'bg-green-100 text-green-700';
    case 'medium': return 'bg-orange-100 text-orange-700';
    case 'large': return 'bg-amber-100 text-amber-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}

function isDueForGrooming(lastGroomingDate?: string): boolean {
  if (!lastGroomingDate) return false;
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return now - new Date(lastGroomingDate).getTime() > thirtyDays;
}

function hasExpiringVaccine(vaccines?: VaccineRecord[]): boolean {
  if (!vaccines || vaccines.length === 0) return false;
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return vaccines.some(v => {
    if (!v.expiresAt) return false;
    const exp = new Date(v.expiresAt).getTime();
    return exp - now <= thirtyDays;
  });
}

export default function PetProfileListPage() {
  const { tenantId, status } = useAdminTenantId();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(`/api/proxy/admin/pets?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        setPets(json?.data ?? json?.pets ?? []);
      })
      .catch(() => {
        setPets([]);
      })
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  const filtered = useMemo(() => {
    if (!search.trim()) return pets;
    const q = search.trim().toLowerCase();
    return pets.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.breed && p.breed.toLowerCase().includes(q)) ||
      (p.ownerName && p.ownerName.toLowerCase().includes(q))
    );
  }, [pets, search]);

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="ペットカルテ一覧" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="ペットカルテ一覧"
        subtitle="登録されたペットのプロフィールを管理します。"
        right={
          <Link
            href={withTenant('/admin/pet/profiles/new', tenantId)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-orange-600 transition-colors flex-shrink-0 whitespace-nowrap"
          >
            + 新規登録
          </Link>
        }
      />

      <div className="px-6 pb-8 space-y-6">
        {/* Search */}
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="名前・犬種・飼い主名で検索..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
          />
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-16 h-16 text-orange-200 mb-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4.5 11.5c-1 0-2-.5-2-2s1.5-3 2.5-3 1.5 1 1.5 2.5-1 2.5-2 2.5zm15 0c-1 0-2-1-2-2.5s.5-2.5 1.5-2.5 2.5 1.5 2.5 3-1 2-2 2zm-12.5 1c-1 0-2-1-2-2.5S5.5 7 6.5 7 9 8.5 9 10s-1 2.5-2 2.5zm10 0c-1 0-2-1-2-2.5S15.5 7 16.5 7s2 1.5 2 3-1 2.5-2 2.5zM12 22c-3.5 0-6-2-7-4 0-2 4.5-3 7-3s7 1 7 3c-1 2-3.5 4-7 4z" />
            </svg>
            <p className="text-gray-500 font-medium">まだペットが登録されていません</p>
            <Link
              href={withTenant('/admin/pet/profiles/new', tenantId)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-orange-600 transition-colors"
            >
              + 最初のペットを登録する
            </Link>
          </div>
        )}

        {/* Pet cards grid */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(pet => (
              <Link
                key={pet.id}
                href={withTenant(`/admin/pet/profiles/${pet.id}`, tenantId)}
                className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-orange-300 hover:shadow-md transition-all overflow-hidden"
              >
                <div className="flex items-start gap-4">
                  {/* Photo or placeholder */}
                  {pet.photoUrl ? (
                    <img
                      src={pet.photoUrl}
                      alt={pet.name}
                      className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-8 h-8 text-orange-300" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M4.5 11.5c-1 0-2-.5-2-2s1.5-3 2.5-3 1.5 1 1.5 2.5-1 2.5-2 2.5zm15 0c-1 0-2-1-2-2.5s.5-2.5 1.5-2.5 2.5 1.5 2.5 3-1 2-2 2zm-12.5 1c-1 0-2-1-2-2.5S5.5 7 6.5 7 9 8.5 9 10s-1 2.5-2 2.5zm10 0c-1 0-2-1-2-2.5S15.5 7 16.5 7s2 1.5 2 3-1 2.5-2 2.5zM12 22c-3.5 0-6-2-7-4 0-2 4.5-3 7-3s7 1 7 3c-1 2-3.5 4-7 4z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-lg font-bold text-gray-900 group-hover:text-orange-600 transition-colors truncate">
                        {pet.name}
                      </p>
                      {pet.size && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sizeBadgeColor(pet.size)}`}>
                          {sizeBadgeLabel(pet.size)}
                        </span>
                      )}
                      {hasExpiringVaccine(pet.vaccines) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          要更新
                        </span>
                      )}
                      {isDueForGrooming(pet.lastGroomingDate) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          要連絡
                        </span>
                      )}
                    </div>
                    {pet.breed && (
                      <p className="text-sm text-gray-500 mt-0.5">{pet.breed}</p>
                    )}
                    {pet.ownerName && (
                      <p className="text-xs text-gray-400 mt-1">飼い主: {pet.ownerName}</p>
                    )}
                    {pet.lastGroomingDate && (
                      <p className="text-xs text-gray-400 mt-0.5">最終施術: {pet.lastGroomingDate}</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
