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
  phone: string | null;
  storeAddress: string | null;
  openTime: string | null;
  closeTime: string | null;
  closedWeekdays: number[];
}

const FALLBACK_NAME = 'Lumiere 表参道';
const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function getClosedDayLabel(days: number[]): string {
  if (!days || days.length === 0) return 'なし';
  return days.map(d => DAY_LABELS[d] || '?').join('・') + '曜日';
}

export default function BookingShell({ children }: BookingShellProps) {
  const searchParams = useSearchParams();
  const tenantId = searchParams?.get('tenantId') || 'default';
  const [data, setData] = useState<ShellData>({
    storeName: FALLBACK_NAME, vertical: 'generic', heroImage: null,
    catchcopy: null, phone: null, storeAddress: null,
    openTime: null, closeTime: null, closedWeekdays: [],
  });

  useEffect(() => {
    fetch(`/api/booking/settings?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const d = json?.data ?? json;
        const bh = d?.businessHours ?? {};
        setData({
          storeName: d?.storeName?.trim() || FALLBACK_NAME,
          vertical: d?.vertical || 'generic',
          heroImage: d?.images?.hero || null,
          catchcopy: d?.catchcopy || null,
          phone: d?.phone || null,
          storeAddress: d?.storeAddress || null,
          openTime: bh?.openTime || d?.openTime || null,
          closeTime: bh?.closeTime || d?.closeTime || null,
          closedWeekdays: bh?.closedWeekdays || d?.closedWeekdays || [],
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

      {/* ── 特徴セクション（ペット限定） ── */}
      {isPet && (
        <section className="py-6 px-4" style={{ backgroundColor: '#FFF8F0' }}>
          <div className="max-w-[520px] mx-auto grid grid-cols-3 gap-3">
            {[
              { emoji: '🏆', title: '経験豊富', desc: 'プロのトリマー' },
              { emoji: '🛡️', title: '安心・安全', desc: 'ワクチン確認済' },
              { emoji: '📱', title: '24時間予約', desc: 'LINEで簡単' },
            ].map(item => (
              <div key={item.title} className="text-center bg-white rounded-xl py-4 px-2 shadow-sm border border-amber-100/50">
                <div className="text-3xl mb-1.5">{item.emoji}</div>
                <p className="font-bold text-xs text-gray-800">{item.title}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

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

      {/* ── 店舗情報セクション ── */}
      {(data.phone || data.storeAddress || data.openTime) && (
        <section className="px-4 pb-6">
          <div className="max-w-[520px] mx-auto">
            <h2 className="text-base font-bold text-gray-800 mb-3">📍 店舗情報</h2>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {data.openTime && data.closeTime && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-lg">🕐</span>
                  <span className="text-sm text-gray-400 w-16 shrink-0">営業時間</span>
                  <span className="text-sm text-gray-700">{data.openTime}〜{data.closeTime}</span>
                </div>
              )}
              {data.closedWeekdays.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-lg">📅</span>
                  <span className="text-sm text-gray-400 w-16 shrink-0">定休日</span>
                  <span className="text-sm text-gray-700">{getClosedDayLabel(data.closedWeekdays)}</span>
                </div>
              )}
              {data.storeAddress && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-lg">📍</span>
                  <span className="text-sm text-gray-400 w-16 shrink-0">住所</span>
                  <span className="text-sm text-gray-700">{data.storeAddress}</span>
                </div>
              )}
              {data.phone && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-lg">📞</span>
                  <span className="text-sm text-gray-400 w-16 shrink-0">電話番号</span>
                  <a href={`tel:${data.phone}`} className="text-sm text-blue-600 hover:underline">{data.phone}</a>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

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
