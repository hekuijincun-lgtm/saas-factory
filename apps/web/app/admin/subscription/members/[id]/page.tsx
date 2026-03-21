'use client';

export const runtime = 'edge';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../../_components/ui/AdminTopBar';

interface MemberDetail {
  id: string;
  name: string;
  planName: string;
  planType?: string;
  status: 'active' | 'paused' | 'cancelled';
  remainingCount?: number | null;
  startDate?: string;
  qrToken?: string;
  email?: string;
  phone?: string;
}

interface CheckinRecord {
  id: string;
  checkedInAt: string;
  method?: string;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'アクティブ',
  paused: '休会中',
  cancelled: '解約済',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenantId, status } = useAdminTenantId();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [qrGenerating, setQrGenerating] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const fetchMember = useCallback(() => {
    if (status !== 'ready') return;
    setLoading(true);

    const memberFetch = fetch(
      `/api/proxy/admin/subscription/members/${id}?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        setMember(json?.data ?? json?.member ?? json);
      })
      .catch(() => setMember(null));

    const checkinFetch = fetch(
      `/api/proxy/admin/subscription/members/${id}/checkins?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        setCheckins(json?.data ?? json?.checkins ?? []);
      })
      .catch(() => setCheckins([]));

    Promise.all([memberFetch, checkinFetch]).finally(() => setLoading(false));
  }, [id, tenantId, status]);

  useEffect(() => {
    fetchMember();
  }, [fetchMember]);

  const handleAction = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!confirm(
      action === 'pause' ? '休会にしますか？' :
      action === 'resume' ? '再開しますか？' :
      '解約しますか？この操作は元に戻せません。'
    )) return;

    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/proxy/admin/subscription/members/${id}?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      );
      if (!res.ok) throw new Error('action failed');
      showToast(
        action === 'pause' ? '休会にしました' :
        action === 'resume' ? '再開しました' :
        '解約しました'
      );
      fetchMember();
    } catch {
      showToast('操作に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateQr = async () => {
    setQrGenerating(true);
    try {
      const res = await fetch(
        `/api/proxy/admin/subscription/members/${id}/qr?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      );
      if (!res.ok) throw new Error('qr failed');
      const json: any = await res.json();
      const token = json?.data?.token ?? json?.token ?? '';
      if (token && member) {
        setMember({ ...member, qrToken: token });
      }
      showToast('QRコードトークンを発行しました');
    } catch {
      showToast('QRコード発行に失敗しました');
    } finally {
      setQrGenerating(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="会員詳細" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (!member) {
    return (
      <>
        <AdminTopBar title="会員詳細" />
        <div className="px-6 py-16 text-center">
          <p className="text-gray-500">会員情報が見つかりませんでした。</p>
          <Link
            href={withTenant('/admin/subscription/members', tenantId)}
            className="mt-4 inline-block text-sm text-blue-600 hover:underline"
          >
            会員一覧に戻る
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="会員詳細"
        right={
          <Link
            href={withTenant('/admin/subscription/members', tenantId)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            一覧に戻る
          </Link>
        }
      />

      <div className="px-6 pb-8 space-y-6">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        )}

        {/* Member Info Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">{member.name}</h2>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[member.status] || 'bg-gray-100 text-gray-500'}`}>
                  {STATUS_LABELS[member.status] || member.status}
                </span>
              </div>
              <div className="mt-3 space-y-1.5 text-sm text-gray-600">
                <p>プラン: <span className="font-medium text-gray-900">{member.planName}</span></p>
                {member.startDate && <p>開始日: {member.startDate}</p>}
                {member.remainingCount != null && (
                  <p>残回数: <span className="font-bold text-blue-600">{member.remainingCount}回</span></p>
                )}
                {member.email && <p>メール: {member.email}</p>}
                {member.phone && <p>電話: {member.phone}</p>}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            {member.status === 'active' && (
              <>
                <button
                  onClick={() => handleAction('pause')}
                  disabled={actionLoading}
                  className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-100 transition-colors disabled:opacity-50"
                >
                  休会にする
                </button>
                <button
                  onClick={() => handleAction('cancel')}
                  disabled={actionLoading}
                  className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  解約する
                </button>
              </>
            )}
            {member.status === 'paused' && (
              <>
                <button
                  onClick={() => handleAction('resume')}
                  disabled={actionLoading}
                  className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  再開する
                </button>
                <button
                  onClick={() => handleAction('cancel')}
                  disabled={actionLoading}
                  className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  解約する
                </button>
              </>
            )}
          </div>
        </div>

        {/* QR Code Section */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">QRコード</h3>
          {member.qrToken ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                <p className="text-xs text-gray-500 mb-1">チェックイン用トークン</p>
                <p className="text-sm font-mono text-gray-900 break-all">{member.qrToken}</p>
              </div>
              <p className="text-xs text-gray-400">
                このトークンをQRコードに変換して会員カードに印刷できます。
              </p>
              <button
                onClick={handleGenerateQr}
                disabled={qrGenerating}
                className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                {qrGenerating ? '再発行中...' : 'トークン再発行'}
              </button>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-gray-500 mb-3">QRコードトークンが未発行です</p>
              <button
                onClick={handleGenerateQr}
                disabled={qrGenerating}
                className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {qrGenerating ? '発行中...' : 'QRコード発行'}
              </button>
            </div>
          )}
        </div>

        {/* Check-in History */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">チェックイン履歴</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">日時</th>
                  <th className="px-5 py-3">方法</th>
                </tr>
              </thead>
              <tbody>
                {checkins.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-5 py-3 text-gray-700">{formatDateTime(c.checkedInAt)}</td>
                    <td className="px-5 py-3 text-gray-500">{c.method === 'qr' ? 'QR' : c.method === 'manual' ? '手動' : c.method || '-'}</td>
                  </tr>
                ))}
                {checkins.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-5 py-8 text-center text-gray-400">
                      チェックイン履歴がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
