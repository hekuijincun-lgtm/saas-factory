// route: /admin
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminTopBar from '../_components/ui/AdminTopBar';
import AdminDashboard from '../_components/admin/AdminDashboard';

function OnboardingBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    fetch('/api/proxy/admin/settings?tenantId=default', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const s = json?.data ?? json;
        const lineConnected = !!(s?.onboarding?.lineConnected);
        if (!lineConnected) setShow(true);
      })
      .catch(() => {});
  }, []);

  if (!show) return null;

  return (
    <div className="mx-6 mt-4 flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="text-amber-500 text-lg">⚠️</span>
        <div>
          <p className="text-sm font-semibold text-amber-800">初期設定が未完了です</p>
          <p className="text-xs text-amber-700 mt-0.5">LINE連携・メニュー・スタッフの設定を完了してください。</p>
        </div>
      </div>
      <Link
        href="/admin/onboarding"
        className="flex-shrink-0 rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
      >
        設定を完了する →
      </Link>
    </div>
  );
}

export default function Page() {
  return (
    <>
      <AdminTopBar title="ダッシュボード" subtitle="今日の店舗状況のサマリーです。" />
      <OnboardingBanner />
      <AdminDashboard />
    </>
  );
}
