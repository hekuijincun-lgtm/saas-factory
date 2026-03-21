'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getVerticalHex } from '@/src/lib/verticalTheme';

interface BookingShellProps {
  children: ReactNode;
}

const FALLBACK_NAME = 'Lumiere 表参道';

export default function BookingShell({ children }: BookingShellProps) {
  const searchParams = useSearchParams();
  const tenantId = searchParams?.get('tenantId') || 'default';
  const [storeName, setStoreName] = useState<string>(FALLBACK_NAME);
  const [vertical, setVertical] = useState<string>('generic');

  useEffect(() => {
    // Fetch storeName + vertical from admin settings API; fail silently
    fetch(`/api/booking/settings?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const name = json?.data?.storeName || json?.storeName;
        if (name && typeof name === 'string' && name.trim()) {
          setStoreName(name.trim());
        }
        const v = json?.data?.vertical || json?.vertical;
        if (v && typeof v === 'string') setVertical(v);
      })
      .catch(() => {/* keep fallback */});
  }, [tenantId]);

  const hex = getVerticalHex(vertical);

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
      {/* 中央カード */}
      <div className="w-full max-w-[520px] bg-white rounded-3xl shadow-soft overflow-hidden">
        {/* ヘッダー */}
        <div className="px-8 py-6" style={{ backgroundColor: hex.header }}>
          {/* Removed static "HAIR SALON" label — multi-vertical SaaS (hair / nail / eyebrow) so store name only */}
          <h1 className="text-2xl font-bold text-white">{storeName}</h1>
        </div>

        {/* ボディ */}
        <div className="px-8 py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
