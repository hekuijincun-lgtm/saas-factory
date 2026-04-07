'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminTopBar from '../../../_components/ui/AdminTopBar';
import AdminSettingsClient from '../../settings/AdminSettingsClient';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import { fetchAdminSettings, saveAdminSettings } from '../../../lib/adminApi';

function EstimateModeToggle({ tenantId }: { tenantId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetchAdminSettings(tenantId)
      .then((s: any) => {
        setEnabled(s?.estimateMode === 'enabled');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId]);

  const handleToggle = useCallback(async () => {
    const next = !enabled;
    setSaving(true);
    try {
      await saveAdminSettings({ estimateMode: next ? 'enabled' : 'disabled' }, tenantId);
      setEnabled(next);
      setToast(next ? '見積作成モードをONにしました' : '見積作成モードをOFFにしました');
      setTimeout(() => setToast(''), 3000);
    } catch {
      setToast('設定の保存に失敗しました');
      setTimeout(() => setToast(''), 3000);
    } finally {
      setSaving(false);
    }
  }, [tenantId, enabled]);

  if (loading) return null;

  return (
    <div className="px-6 mb-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">見積作成モード</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              ONにすると、予約時に料金を非表示にし、予約後にAIが自動で見積もりを生成します。
              オーナーが見積もりを確認・承認してから料金が確定します。
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50 ${
              enabled ? 'bg-orange-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        {enabled && (
          <div className="mt-3 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2">
            <p className="text-xs text-orange-700">
              見積作成モードON: お客様の予約画面・LINE予約でメニュー料金が非表示になります。
              予約が入ると自動でAI見積もりが生成され、「見積管理」ページで確認できます。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PetSettingsPage() {
  const { tenantId, status } = useAdminTenantId();

  return (
    <>
      <AdminTopBar title="管理者設定" subtitle="店舗情報・営業時間・予約設定を管理します。" />
      {status === 'ready' && <EstimateModeToggle tenantId={tenantId} />}
      <AdminSettingsClient />
    </>
  );
}
