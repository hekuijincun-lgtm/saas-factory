'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import StepMenu from './steps/StepMenu';
import StepStaff from './steps/StepStaff';
import StepDatetime from './steps/StepDatetime';
import StepConfirm from './steps/StepConfirm';
import type { MenuItem } from '@/src/lib/bookingApi';

export interface BookingState {
  menuId: string | null;
  menuName: string | null;
  menuPrice: number | null;
  menuDurationMin: number | null;
  staffId: string | null;
  staffName: string | null;
  date: string | null;
  time: string | null;
}

export interface StaffOption {
  id: string;
  name: string;
  role?: string;
}

const INITIAL: BookingState = {
  menuId: null, menuName: null, menuPrice: null, menuDurationMin: null,
  staffId: null, staffName: null, date: null, time: null,
};

const STEP_LABELS = ['メニュー', 'スタッフ', '日時', '確認'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center mb-8">
      {STEP_LABELS.map((label, i) => {
        const step = i + 1;
        const done = current > step;
        const active = current === step;
        return (
          <div key={step} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  done
                    ? 'bg-green-500 text-white'
                    : active
                    ? 'bg-brand-primary text-white'
                    : 'bg-brand-bg text-brand-muted'
                }`}
              >
                {done ? '✓' : step}
              </div>
              <span
                className={`text-xs mt-1 ${
                  active ? 'text-brand-primary font-medium' : 'text-brand-muted'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div
                className={`h-px w-4 mb-4 flex-shrink-0 ${
                  done ? 'bg-green-500' : 'bg-brand-border'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BookingFlow() {
  const searchParams = useSearchParams();
  const tenantId = searchParams?.get('tenantId') || 'default';

  const [step, setStep] = useState(1);
  const [state, setState] = useState<BookingState>(INITIAL);

  const update = (patch: Partial<BookingState>) =>
    setState(prev => ({ ...prev, ...patch }));
  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => Math.max(1, s - 1));
  const reset = () => { setState(INITIAL); setStep(1); };

  const handleMenuSelect = (menu: MenuItem) => {
    update({
      menuId: menu.id,
      menuName: menu.name,
      menuPrice: menu.price,
      menuDurationMin: menu.durationMin,
    });
    next();
  };

  const handleStaffSelect = (staff: StaffOption) => {
    update({ staffId: staff.id, staffName: staff.name });
    next();
  };

  const handleDatetimeSelect = (date: string, time: string) => {
    update({ date, time });
    next();
  };

  return (
    <div>
      <StepIndicator current={step} />

      {step === 1 && (
        <StepMenu tenantId={tenantId} onSelect={handleMenuSelect} />
      )}
      {step === 2 && (
        <StepStaff onSelect={handleStaffSelect} onBack={back} />
      )}
      {step === 3 && (
        <StepDatetime
          staffId={state.staffId}
          onSelect={handleDatetimeSelect}
          onBack={back}
        />
      )}
      {step === 4 && (
        <StepConfirm booking={state} onBack={back} onDone={reset} />
      )}
    </div>
  );
}
