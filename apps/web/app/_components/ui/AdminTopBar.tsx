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
    <div className="px-4 sm:px-6 pt-4 pb-2">
      <div className="flex items-center justify-end gap-2 mb-2">
        {right}
        <ClientDatePill format="full" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-brand-text break-keep">{title}</h1>
        {subtitle && <p className="text-sm text-brand-muted mt-0.5 break-keep">{subtitle}</p>}
      </div>
    </div>
  );
}
