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
    <div className="px-6 py-4 flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-brand-text">{title}</h1>
        {subtitle && <p className="text-sm text-brand-muted mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        {right}
        <ClientDatePill format="full" />
      </div>
    </div>
  );
}

