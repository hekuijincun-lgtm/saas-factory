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
  const [heroImage, setHeroImage] = useState<string | null>(null);

  useEffect(() => {
    // Fetch storeName + vertical + hero image from admin settings API; fail silently
    fetch(`/api/booking/settings?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const data = json?.data ?? json;
        const name = data?.storeName;
        if (name && typeof name === 'string' && name.trim()) {
          setStoreName(name.trim());
        }
        const v = data?.vertical;
        if (v && typeof v === 'string') setVertical(v);
        const hero = data?.images?.hero;
        if (hero && typeof hero === 'string') setHeroImage(hero);
      })
      .catch(() => {/* keep fallback */});
  }, [tenantId]);

  const hex = getVerticalHex(vertical);

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
      {/* 中央カード */}
      <div className="w-full max-w-[520px] bg-white rounded-3xl shadow-soft overflow-hidden">
        {/* ヘッダー（ヒーロー画像があれば表示） */}
        <div className="relative overflow-hidden" style={{ backgroundColor: hex.header }}>
          {heroImage && (
            <img src={heroImage} alt={storeName} className="w-full h-40 object-cover"
              onError={e => (e.currentTarget.style.display = 'none')} />
          )}
          <div className={heroImage ? "absolute inset-0 bg-black/30 flex items-end" : ""}>
            <div className="px-8 py-6">
              <h1 className="text-2xl font-bold text-white">{storeName}</h1>
            </div>
          </div>
        </div>

        {/* ボディ */}
        <div className="px-8 py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
