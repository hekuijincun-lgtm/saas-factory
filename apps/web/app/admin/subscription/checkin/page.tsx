'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface MemberOption {
  id: string;
  name: string;
  planName: string;
  status: string;
}

interface CheckinEntry {
  id: string;
  memberName: string;
  planName: string;
  checkedInAt: string;
  method?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function CheckinPage() {
  const { tenantId, status } = useAdminTenantId();
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [checkins, setCheckins] = useState<CheckinEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const fetchCheckins = useCallback(() => {
    if (status !== 'ready') return;
    fetch(
      `/api/proxy/admin/subscription/checkins?tenantId=${encodeURIComponent(tenantId)}`,
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
  }, [tenantId, status]);

  useEffect(() => {
    if (status !== 'ready') return;
    setLoading(true);

    const memberFetch = fetch(
      `/api/proxy/admin/subscription/members?tenantId=${encodeURIComponent(tenantId)}&status=active`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        setMembers(json?.data ?? json?.members ?? []);
      })
      .catch(() => setMembers([]));

    const checkinFetch = fetch(
      `/api/proxy/admin/subscription/checkins?tenantId=${encodeURIComponent(tenantId)}`,
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
  }, [tenantId, status]);

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.trim().toLowerCase();
    return members.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.planName.toLowerCase().includes(q),
    );
  }, [members, memberSearch]);

  const handleManualCheckin = async () => {
    if (!selectedMemberId) return;
    setChecking(true);
    try {
      const res = await fetch(
        `/api/proxy/admin/subscription/checkin?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ member_id: selectedMemberId, method: 'manual' }),
        },
      );
      if (!res.ok) throw new Error('checkin failed');
      const member = members.find(m => m.id === selectedMemberId);
      showToast(`${member?.name ?? '会員'}のチェックインを記録しました`);
      setSelectedMemberId('');
      fetchCheckins();
    } catch {
      showToast('チェックインに失敗しました');
    } finally {
      setChecking(false);
    }
  };

  const handleQrCheckin = async () => {
    if (!qrToken.trim()) return;
    setChecking(true);
    try {
      // Look up member_id from QR token via the members list qrToken field
      // Since we don't have a proxy for the public /subscription/qr/:token endpoint,
      // show a message that QR token verification is coming soon
      showToast('QRコード検証機能は準備中です。手動チェックインをご利用ください。');
      setQrToken('');
    } catch {
      showToast('QRチェックインに失敗しました');
    } finally {
      setChecking(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="チェックイン" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="チェックイン"
        subtitle="会員の来店受付・QRコード読取ができます。"
      />

      <div className="px-6 pb-8 space-y-6">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        )}

        {/* Manual Check-in */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">手動チェックイン</h3>
          <div className="space-y-3">
            {/* Member search */}
            <div className="relative max-w-md">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="会員名で絞り込み..."
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
              />
            </div>
            {/* Member select */}
            <select
              value={selectedMemberId}
              onChange={e => setSelectedMemberId(e.target.value)}
              className="w-full max-w-md rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
            >
              <option value="">会員を選択してください</option>
              {filteredMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.planName})
                </option>
              ))}
            </select>
            <button
              onClick={handleManualCheckin}
              disabled={checking || !selectedMemberId}
              className="rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checking ? 'チェックイン中...' : 'チェックイン'}
            </button>
          </div>
        </div>

        {/* QR Token Input */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">QRコード / トークン入力</h3>
          <div className="flex items-end gap-3 max-w-md">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">トークン</label>
              <input
                type="text"
                value={qrToken}
                onChange={e => setQrToken(e.target.value)}
                placeholder="QRコードのトークンを入力..."
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                onKeyDown={e => { if (e.key === 'Enter') handleQrCheckin(); }}
              />
            </div>
            <button
              onClick={handleQrCheckin}
              disabled={checking || !qrToken.trim()}
              className="rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checking ? '処理中...' : '読取'}
            </button>
          </div>
        </div>

        {/* Today's Check-ins */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">本日のチェックイン</h3>
            <span className="text-sm text-blue-600 font-medium">{checkins.length}件</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">時間</th>
                  <th className="px-5 py-3">会員名</th>
                  <th className="px-5 py-3">プラン</th>
                  <th className="px-5 py-3">方法</th>
                </tr>
              </thead>
              <tbody>
                {checkins.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-5 py-3 text-gray-700">{formatTime(c.checkedInAt)}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{c.memberName}</td>
                    <td className="px-5 py-3 text-gray-500">{c.planName}</td>
                    <td className="px-5 py-3 text-gray-500">{c.method === 'qr' ? 'QR' : c.method === 'manual' ? '手動' : c.method || '-'}</td>
                  </tr>
                ))}
                {checkins.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                      本日のチェックインはまだありません
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
