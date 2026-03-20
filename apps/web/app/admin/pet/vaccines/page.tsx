'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface ExpiringVaccine {
  petId: string;
  petName: string;
  ownerName?: string;
  vaccineName: string;
  date: string;
  expiresAt: string;
  daysRemaining: number;
}

function statusColor(days: number): string {
  if (days < 0) return 'bg-red-100 text-red-700';
  if (days <= 14) return 'bg-amber-100 text-amber-700';
  return 'bg-green-100 text-green-700';
}

function statusLabel(days: number): string {
  if (days < 0) return '期限切れ';
  if (days === 0) return '本日期限';
  return `残り${days}日`;
}

function rowBg(days: number): string {
  if (days < 0) return 'bg-red-50';
  if (days <= 14) return 'bg-amber-50';
  return '';
}

export default function VaccineAlertPage() {
  const { tenantId, status } = useAdminTenantId();
  const [vaccines, setVaccines] = useState<ExpiringVaccine[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(`/api/proxy/admin/pets/expiring-vaccines?tenantId=${encodeURIComponent(tenantId)}&days=60`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const raw = json?.data ?? json?.alerts ?? json?.vaccines ?? [];
        // Backend may return nested { pet, vaccine } objects — flatten to ExpiringVaccine
        const mapped: ExpiringVaccine[] = raw.map((item: any) => {
          if (item.pet && item.vaccine) {
            const now = Date.now();
            const exp = new Date(item.vaccine.expiresAt).getTime();
            const daysRemaining = Math.ceil((exp - now) / (24 * 60 * 60 * 1000));
            return {
              petId: item.pet.id,
              petName: item.pet.name,
              ownerName: item.pet.ownerName,
              vaccineName: item.vaccine.name,
              date: item.vaccine.date,
              expiresAt: item.vaccine.expiresAt,
              daysRemaining,
            };
          }
          return item;
        });
        setVaccines(mapped);
      })
      .catch(() => {
        setVaccines([]);
      })
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="ワクチン期限管理" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  const expired = vaccines.filter(v => v.daysRemaining < 0);
  const expiringSoon = vaccines.filter(v => v.daysRemaining >= 0 && v.daysRemaining <= 14);
  const upcoming = vaccines.filter(v => v.daysRemaining > 14);

  return (
    <>
      <AdminTopBar
        title="ワクチン期限管理"
        subtitle="今後60日以内に期限を迎えるワクチンを一覧表示します。"
        right={
          <Link
            href={withTenant('/admin/pet', tenantId)}
            className="text-sm text-orange-600 hover:text-orange-700 font-medium"
          >
            ダッシュボードに戻る
          </Link>
        }
      />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="px-6 pb-8 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">期限切れ</p>
            <p className="mt-2 text-3xl font-bold text-red-600">{expired.length}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">14日以内</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">{expiringSoon.length}</p>
          </div>
          <div className="rounded-2xl border border-green-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">15-60日</p>
            <p className="mt-2 text-3xl font-bold text-green-600">{upcoming.length}</p>
          </div>
        </div>

        {/* Empty state */}
        {vaccines.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-16 h-16 text-green-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-500 font-medium">期限が近いワクチンはありません</p>
          </div>
        )}

        {/* Table */}
        {vaccines.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3">ペット名</th>
                    <th className="px-5 py-3">飼い主名</th>
                    <th className="px-5 py-3">ワクチン名</th>
                    <th className="px-5 py-3">接種日</th>
                    <th className="px-5 py-3">有効期限</th>
                    <th className="px-5 py-3">残り日数</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {vaccines
                    .sort((a, b) => a.daysRemaining - b.daysRemaining)
                    .map((v, i) => (
                    <tr key={`${v.petId}-${v.vaccineName}-${i}`} className={`border-b border-gray-50 ${rowBg(v.daysRemaining)}`}>
                      <td className="px-5 py-3">
                        <Link
                          href={withTenant(`/admin/pet/profiles/${v.petId}`, tenantId)}
                          className="font-medium text-orange-600 hover:text-orange-700"
                        >
                          {v.petName}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-gray-700">{v.ownerName || '-'}</td>
                      <td className="px-5 py-3 text-gray-900 font-medium">{v.vaccineName}</td>
                      <td className="px-5 py-3 text-gray-700">{v.date}</td>
                      <td className="px-5 py-3 text-gray-700">{v.expiresAt}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(v.daysRemaining)}`}>
                          {statusLabel(v.daysRemaining)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => showToast('通知機能は準備中です')}
                          className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                        >
                          LINEで通知
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
