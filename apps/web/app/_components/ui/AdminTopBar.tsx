'use client';

import type { ReactNode } from 'react';
import ClientDatePill from './ClientDatePill';

interface AdminTopBarProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export default function AdminTopBar({ title, subtitle, right }: AdminTopBarProps) {
  return (
    <div className="px-6 py-4 flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-brand-text">{title}</h1>
        {subtitle && <p className="text-sm text-brand-muted mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        {right}
        <ClientDatePill format="full" />
      </div>
    </div>
  );
}

