'use client';

import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export default function Card({ title, subtitle, children, className = '' }: CardProps) {
  return (
    <div className={`rounded-2xl bg-white border border-brand-border shadow-soft p-6 md:p-8 ${className}`}>
      {title && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-brand-text">{title}</h3>
          {subtitle && <p className="text-sm text-brand-muted mt-1">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

