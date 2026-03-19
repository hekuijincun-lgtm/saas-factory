'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

type InquiryStatus = '新規' | '見積済' | '成約' | '失注';

interface Inquiry {
  id: string;
  datetime: string;
  breed: string;
  size: string;
  course: string;
  estimatedPrice: number;
  status: InquiryStatus;
}

const STATUS_COLORS: Record<InquiryStatus, string> = {
  '新規': 'bg-blue-100 text-blue-700',
  '見積済': 'bg-yellow-100 text-yellow-700',
  '成約': 'bg-green-100 text-green-700',
  '失注': 'bg-gray-100 text-gray-500',
};

const DEMO_INQUIRIES: Inquiry[] = [
  { id: 'i1', datetime: '2026-03-19 09:30', breed: 'トイプードル', size: '小型犬', course: 'トリミングコース', estimatedPrice: 6500, status: '新規' },
  { id: 'i2', datetime: '2026-03-18 14:15', breed: 'ゴールデンレトリバー', size: '大型犬', course: 'シャンプーコース', estimatedPrice: 8000, status: '見積済' },
  { id: 'i3', datetime: '2026-03-17 11:00', breed: '柴犬', size: '中型犬', course: 'トリミングコース', estimatedPrice: 5500, status: '成約' },
  { id: 'i4', datetime: '2026-03-16 16:45', breed: 'チワワ', size: '小型犬', course: 'デンタルケア', estimatedPrice: 3000, status: '失注' },
  { id: 'i5', datetime: '2026-03-15 10:20', breed: 'ミニチュアダックスフンド', size: '小型犬', course: 'シャンプーコース', estimatedPrice: 4000, status: '成約' },
  { id: 'i6', datetime: '2026-03-14 13:00', breed: 'ラブラドール', size: '大型犬', course: 'トリミングコース', estimatedPrice: 9500, status: '見積済' },
  { id: 'i7', datetime: '2026-03-13 09:00', breed: 'ポメラニアン', size: '小型犬', course: 'マイクロバブル', estimatedPrice: 5000, status: '新規' },
  { id: 'i8', datetime: '2026-03-12 15:30', breed: 'シーズー', size: '小型犬', course: 'トリミングコース', estimatedPrice: 6000, status: '成約' },
];

const ALL_STATUSES: ('すべて' | InquiryStatus)[] = ['すべて', '新規', '見積済', '成約', '失注'];

export default function PetInquiriesPage() {
  const { tenantId, status } = useAdminTenantId();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'すべて' | InquiryStatus>('すべて');

  useEffect(() => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(`/api/proxy/admin/agents/logs?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const list = json?.data ?? json?.logs ?? [];
        if (list.length === 0) throw new Error('no data');
        // Map agent logs to inquiry shape if needed
        const mapped: Inquiry[] = list.map((item: any, idx: number) => ({
          id: item.id ?? `log-${idx}`,
          datetime: item.datetime ?? item.createdAt ?? item.timestamp ?? '',
          breed: item.breed ?? item.meta?.breed ?? '-',
          size: item.size ?? item.meta?.size ?? '-',
          course: item.course ?? item.meta?.course ?? item.menuName ?? '-',
          estimatedPrice: item.estimatedPrice ?? item.meta?.estimatedPrice ?? 0,
          status: item.status ?? '新規',
        }));
        setInquiries(mapped);
        setIsDemo(false);
      })
      .catch(() => {
        setInquiries(DEMO_INQUIRIES);
        setIsDemo(true);
      })
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  const filtered = filter === 'すべて' ? inquiries : inquiries.filter(i => i.status === filter);

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="問い合わせ・見積もり履歴" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="問い合わせ・見積もり履歴" subtitle="ペットサロンへの問い合わせと見積もり状況を管理します。" />

      <div className="px-6 pb-8 space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href={withTenant('/admin/pet', tenantId)} className="hover:text-orange-600 transition-colors">
            ペットサロン
          </Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">履歴</span>
        </div>

        {isDemo && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
            <span className="w-2 h-2 rounded-full bg-orange-400" />
            デモデータ
          </div>
        )}

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-2">
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={[
                'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                filter === s
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300 hover:text-orange-600',
              ].join(' ')}
            >
              {s}
              {s !== 'すべて' && (
                <span className="ml-1.5 text-xs opacity-70">
                  ({inquiries.filter(i => i.status === s).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">日時</th>
                  <th className="px-5 py-3">犬種</th>
                  <th className="px-5 py-3">サイズ</th>
                  <th className="px-5 py-3">コース</th>
                  <th className="px-5 py-3 text-right">見積金額</th>
                  <th className="px-5 py-3">ステータス</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                      該当する問い合わせがありません
                    </td>
                  </tr>
                )}
                {filtered.map(inq => (
                  <tr key={inq.id} className="border-b border-gray-50 hover:bg-orange-50/40 transition-colors">
                    <td className="px-5 py-3 text-gray-700 whitespace-nowrap">{inq.datetime}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{inq.breed}</td>
                    <td className="px-5 py-3 text-gray-700">{inq.size}</td>
                    <td className="px-5 py-3 text-gray-700">{inq.course}</td>
                    <td className="px-5 py-3 text-right text-gray-700 font-medium">
                      {inq.estimatedPrice > 0 ? `¥${inq.estimatedPrice.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[inq.status]}`}>
                        {inq.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
