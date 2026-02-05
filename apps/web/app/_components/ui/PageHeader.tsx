'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export default function PageHeader({ title, subtitle, right }: PageHeaderProps) {
  const [mounted, setMounted] = useState(false);
  const [apiBaseDisplay, setApiBaseDisplay] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    // 開発時のみ API_BASE を表示
    if (process.env.NODE_ENV !== 'production') {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8787';
      setApiBaseDisplay(apiBase.replace(/^https?:\/\//, '').replace(/\/$/, ''));
    }
  }, []);

  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-text">{title}</h1>
        {subtitle && <p className="text-sm text-brand-muted mt-2">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {mounted && apiBaseDisplay && (
          <span className="px-2 py-1 text-xs font-mono text-brand-muted bg-brand-bg border border-brand-border rounded-md">
            api: {apiBaseDisplay}
          </span>
        )}
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
    </div>
  );
}

