'use client';

interface BadgeProps {
  variant?: 'success' | 'muted' | 'warning' | 'danger' | 'reserved' | 'completed' | 'canceled';
  children: React.ReactNode;
}

export default function Badge({ variant = 'success', children }: BadgeProps) {
  const variantClasses = {
    success: 'bg-green-50 text-green-700 border-green-200',
    muted: 'bg-slate-50 text-slate-600 border-slate-200',
    warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    reserved: 'bg-blue-50 text-blue-700 border-blue-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    canceled: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${variantClasses[variant]}`}
    >
      {children}
    </span>
  );
}

