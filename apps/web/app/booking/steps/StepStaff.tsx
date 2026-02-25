'use client';

import { useEffect, useState } from 'react';
import { getStaff } from '@/src/lib/bookingApi';
import { STAFF } from '../../_components/constants/staff';
import type { StaffOption } from '../BookingFlow';

interface Props {
  onSelect: (staff: StaffOption) => void;
  onBack: () => void;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
    </div>
  );
}

const ANY_STAFF: StaffOption = {
  id: 'any',
  name: '指名なし',
  role: 'どのスタッフでも可',
};

export default function StepStaff({ onSelect, onBack }: Props) {
  const [list, setList] = useState<(StaffOption & { badge?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStaff()
      .then(data => {
        const apiStaff = data.map((s, i) => ({
          id: s.id,
          name: s.name,
          role: s.role,
          badge: i === 0 ? 'おすすめ' : undefined,
        }));
        setList([ANY_STAFF, ...apiStaff]);
      })
      .catch(() => {
        // fallback to constants
        const fallback = STAFF.filter(s => s.id !== 'any').map((s, i) => ({
          ...s,
          badge: i === 0 ? 'おすすめ' : undefined,
        }));
        setList([ANY_STAFF, ...fallback]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="p-1 text-brand-muted hover:text-brand-text transition-colors"
          aria-label="戻る"
        >
          ←
        </button>
        <h2 className="text-lg font-semibold text-brand-text">スタッフを選択</h2>
      </div>

      <div className="space-y-3">
        {list.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className="w-full text-left p-4 bg-white border border-brand-border rounded-2xl hover:border-brand-primary hover:shadow-md transition-all group flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-brand-text group-hover:text-brand-primary transition-colors">
                  {s.name}
                </p>
                {s.badge && (
                  <span className="text-xs px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded-full">
                    {s.badge}
                  </span>
                )}
              </div>
              {s.role && (
                <p className="text-sm text-brand-muted mt-0.5">{s.role}</p>
              )}
            </div>
            <span className="text-brand-muted group-hover:text-brand-primary transition-colors text-lg">
              ›
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
