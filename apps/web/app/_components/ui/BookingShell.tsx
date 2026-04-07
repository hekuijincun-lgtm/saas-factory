'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getVerticalHex } from '@/src/lib/verticalTheme';

interface BookingShellProps {
  children: ReactNode;
}

interface ShellData {
  storeName: string;
  vertical: string;
  heroImage: string | null;
  catchcopy: string | null;
}

const FALLBACK_NAME = 'Lumiere 表参道';

export default function BookingShell({ children }: BookingShellProps) {
  const searchParams = useSearchParams();
  const tenantId = searchParams?.get('tenantId') || 'default';
  const [data, setData] = useState<ShellData>({
    storeName: FALLBACK_NAME, vertical: 'generic', heroImage: null,
    catchcopy: null,
  });

  useEffect(() => {
    fetch(`/api/booking/settings?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const d = json?.data ?? json;
        setData({
          storeName: d?.storeName?.trim() || FALLBACK_NAME,
          vertical: d?.vertical || 'generic',
          heroImage: d?.images?.hero || null,
          catchcopy: d?.catchcopy || null,
        });
      })
      .catch(() => {});
  }, [tenantId]);

  const hex = getVerticalHex(data.vertical);
  const isPet = data.vertical === 'pet';

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* ── ヒーローセクション ── */}
      <section className="relative w-full overflow-hidden" style={{ minHeight: data.heroImage ? '280px' : '120px' }}>
        {data.heroImage ? (
          <>
            <img src={data.heroImage} alt={data.storeName}
              className="w-full h-72 md:h-80 object-cover"
              onError={e => (e.currentTarget.style.display = 'none')} />
            <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/50" />
          </>
        ) : (
          <div className="w-full h-32 md:h-40" style={{ background: `linear-gradient(135deg, ${hex.header}, ${hex.header}dd)` }} />
        )}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          {isPet && <p className="text-white/80 text-sm mb-0.5">🐾 ペットサロン</p>}
          <h1 className="text-white text-2xl md:text-3xl font-bold drop-shadow-lg">{data.storeName}</h1>
          {data.catchcopy && <p className="text-white/90 text-sm mt-1">{data.catchcopy}</p>}
          {!data.catchcopy && isPet && (
            <p className="text-white/80 text-sm mt-1">大切なペットをプロの手でケア</p>
          )}
        </div>
      </section>

      {/* ── 予約フロー（メインコンテンツ） ── */}
      <div className="flex justify-center px-4 py-6">
        <div className="w-full max-w-[520px] bg-white rounded-3xl shadow-soft overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-800">
              {isPet ? '🐾 ご予約' : '📅 ご予約'}
            </h2>
          </div>
          <div className="px-6 py-6">
            {children}
          </div>
        </div>
      </div>

      {/* ── 予約CTAフッター ── */}
      {isPet && (
        <section className="relative py-10 px-4 text-center overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #D4845A, #E8A87C)' }} />
          <div className="absolute inset-0 flex items-center justify-center opacity-10">
            <span className="text-[120px]">🐾</span>
          </div>
          <div className="relative">
            <p className="text-white text-lg font-bold mb-1">LINEで簡単予約</p>
            <p className="text-white/80 text-sm mb-5">24時間いつでもお気軽にどうぞ</p>
            <a href={`/booking?tenantId=${tenantId}#top`}
              onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="inline-block bg-white text-amber-700 font-bold px-8 py-3 rounded-full shadow-lg hover:shadow-xl transition-shadow">
              🗓 コースを選ぶ
            </a>
          </div>
        </section>
      )}

      {/* フッター */}
      <footer className="py-6 text-center text-xs text-gray-400">
        <p>© {new Date().getFullYear()} {data.storeName}</p>
      </footer>
    </div>
  );
}
