'use client';

import type { ReactNode } from 'react';

interface BookingShellProps {
  children: ReactNode;
}

export default function BookingShell({ children }: BookingShellProps) {
  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
      {/* 中央カード */}
      <div className="w-full max-w-[520px] bg-white rounded-3xl shadow-soft overflow-hidden">
        {/* ヘッダー */}
        <div className="bg-brand-header px-8 py-6">
          <div className="text-xs font-medium text-white/80 uppercase tracking-wider mb-1">
            HAIR SALON
          </div>
          <h1 className="text-2xl font-bold text-white">Lumiere 表参道</h1>
        </div>

        {/* ボディ */}
        <div className="px-8 py-8">
          {children}
        </div>
      </div>
    </div>
  );
}




