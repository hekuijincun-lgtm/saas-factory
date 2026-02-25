'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

interface BookingShellProps {
  children: ReactNode;
}

const FALLBACK_NAME = 'Lumiere 表参道';

export default function BookingShell({ children }: BookingShellProps) {
  const [storeName, setStoreName] = useState<string>(FALLBACK_NAME);

  useEffect(() => {
    // Fetch storeName from admin settings API; fail silently
    fetch('/api/proxy/admin/settings?tenantId=default', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const name = json?.data?.storeName || json?.storeName;
        if (name && typeof name === 'string' && name.trim()) {
          setStoreName(name.trim());
        }
      })
      .catch(() => {/* keep fallback */});
  }, []);

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
      {/* 中央カード */}
      <div className="w-full max-w-[520px] bg-white rounded-3xl shadow-soft overflow-hidden">
        {/* ヘッダー */}
        <div className="bg-brand-header px-8 py-6">
          <div className="text-xs font-medium text-white/80 uppercase tracking-wider mb-1">
            HAIR SALON
          </div>
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
