'use client';

export const runtime = 'edge';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface MemberInfo {
  member_id: string;
  status: string;
  plan_name: string;
  plan_type: string;
  remaining_count: number | null;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:    { label: '有効', color: 'bg-green-100 text-green-700' },
  paused:    { label: '休会中', color: 'bg-amber-100 text-amber-700' },
  cancelled: { label: '解約済', color: 'bg-gray-100 text-gray-500' },
};

const TYPE_LABEL: Record<string, string> = {
  monthly: '月額会員',
  count:   '回数券',
  annual:  '年額会員',
};

export default function MembershipPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<MemberInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/proxy/subscription/qr/${encodeURIComponent(token)}`)
      .then(r => {
        if (!r.ok) throw new Error('invalid');
        return r.json();
      })
      .then((json: any) => {
        if (!json.ok) throw new Error(json.error || 'invalid');
        setInfo(json);
      })
      .catch(() => setError('会員証が見つかりません。QRコードを再発行してください。'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">無効な会員証</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  const st = STATUS_LABEL[info.status] ?? { label: info.status, color: 'bg-gray-100 text-gray-500' };
  const typeLabel = TYPE_LABEL[info.plan_type] ?? info.plan_type;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden max-w-sm w-full">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 px-6 py-8 text-center text-white">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
            </svg>
          </div>
          <h1 className="text-xl font-bold">会員証</h1>
          <p className="text-white/70 text-sm mt-1">Membership Card</p>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">ステータス</span>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${st.color}`}>
              {st.label}
            </span>
          </div>

          {/* Plan */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">プラン</span>
            <span className="text-sm font-semibold text-gray-900">{info.plan_name ?? typeLabel}</span>
          </div>

          {/* Type */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">種別</span>
            <span className="text-sm text-gray-700">{typeLabel}</span>
          </div>

          {/* Remaining (count-based only) */}
          {info.remaining_count !== null && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">残回数</span>
              <span className="text-2xl font-bold text-blue-600">{info.remaining_count}<span className="text-sm font-normal text-gray-400 ml-1">回</span></span>
            </div>
          )}

          {/* Active indicator */}
          {info.status === 'active' && (
            <div className="mt-4 rounded-xl bg-green-50 border border-green-200 p-4 text-center">
              <svg className="w-8 h-8 text-green-500 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-green-700">ご利用いただけます</p>
            </div>
          )}

          {info.status !== 'active' && (
            <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 p-4 text-center">
              <p className="text-sm text-gray-500">現在ご利用いただけません。受付にお問い合わせください。</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 text-center">
          <p className="text-xs text-gray-400">Powered by LumiBook</p>
        </div>
      </div>
    </div>
  );
}
