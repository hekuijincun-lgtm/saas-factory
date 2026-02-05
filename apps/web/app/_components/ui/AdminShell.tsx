'use client';

import type { ReactNode } from 'react';

interface AdminShellProps {
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
}

export default function AdminShell({ sidebar, topbar, children }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-brand-bg flex">
      {/* 左サイドバー（md以上で表示、固定位置） */}
      <aside className="hidden md:flex w-[280px] bg-gradient-to-b from-brand-panel to-brand-panel2 flex-shrink-0 h-screen overflow-y-auto fixed left-0 top-0 z-20">
        {sidebar}
      </aside>

      {/* 右側メインコンテンツ（サイドバー分のマージンを追加） */}
      <main className="flex-1 flex flex-col min-w-0 md:ml-[280px]">
        {/* TopBar */}
        <div className="bg-white border-b border-brand-border">
          {topbar}
        </div>

        {/* コンテンツエリア（中央にmax-w-1200px） */}
        <div className="flex-1 p-6">
          <div className="max-w-[1200px] mx-auto space-y-6">
            {children}
          </div>
        </div>
      </main>

      {/* モバイル用簡易ヘッダー（md未満） */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-brand-border z-10 h-16 flex items-center px-4">
        <h1 className="text-lg font-bold text-brand-text">Lumiere 表参道</h1>
      </div>
    </div>
  );
}

