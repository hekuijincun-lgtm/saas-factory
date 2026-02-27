'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import StepMenu from './steps/StepMenu';
import StepStaff from './steps/StepStaff';
import StepDatetime from './steps/StepDatetime';
import StepConfirm from './steps/StepConfirm';
import type { MenuItem } from '@/src/lib/bookingApi';
import { fetchAdminSettings } from '../lib/adminApi';

export interface BookingState {
  menuId: string | null;
  menuName: string | null;
  menuPrice: number | null;
  menuDurationMin: number | null;
  staffId: string | null;
  staffName: string | null;
  date: string | null;
  time: string | null;
  lineUserId?: string | null;
}

export interface StaffOption {
  id: string;
  name: string;
  role?: string;
}

const INITIAL: BookingState = {
  menuId: null, menuName: null, menuPrice: null, menuDurationMin: null,
  staffId: null, staffName: null, date: null, time: null,
  lineUserId: null,
};

const DEFAULT_CONSENT = '予約内容を確認し、同意の上で予約を確定します';

// ステップインジケーター（表示用ラベル・現在ステップを受け取る）
function StepIndicator({ labels, current }: { labels: string[]; current: number }) {
  return (
    <div className="flex items-center mb-8">
      {labels.map((label, i) => {
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
            {i < labels.length - 1 && (
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
  const lineUserId = searchParams?.get('lu') || null;

  const [step, setStep] = useState(1);
  const [state, setState] = useState<BookingState>({ ...INITIAL, lineUserId });

  // 管理者設定（consentText, staffSelectionEnabled）
  const [consentText, setConsentText] = useState(DEFAULT_CONSENT);
  const [staffSelectionEnabled, setStaffSelectionEnabled] = useState(true);

  useEffect(() => {
    fetchAdminSettings(tenantId).then(settings => {
      const raw = settings as any;
      if (raw.consentText) setConsentText(raw.consentText);
      // staffSelectionEnabled が明示的に false の場合のみ無効化
      if (raw.staffSelectionEnabled === false) setStaffSelectionEnabled(false);
    }).catch(() => { /* fallback: default values のまま */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // staffSelectionEnabled が false のとき内部 step 1→3→4 で進む（step 2 スキップ）
  // 表示ラベルは staffSelectionEnabled で切替
  const STEP_LABELS_FULL = ['メニュー', 'スタッフ', '日時', '確認'];
  const STEP_LABELS_NO_STAFF = ['メニュー', '日時', '確認'];
  const stepLabels = staffSelectionEnabled ? STEP_LABELS_FULL : STEP_LABELS_NO_STAFF;

  // 内部 step → 表示 step 番号（staffSelectionEnabled=false のとき step 2 が存在しないため）
  const displayStep = staffSelectionEnabled
    ? step
    : step === 1 ? 1 : step === 3 ? 2 : step === 4 ? 3 : step;

  const update = (patch: Partial<BookingState>) =>
    setState(prev => ({ ...prev, ...patch }));
  const reset = () => { setState({ ...INITIAL, lineUserId }); setStep(1); };

  const handleMenuSelect = (menu: MenuItem) => {
    update({
      menuId: menu.id,
      menuName: menu.name,
      menuPrice: menu.price,
      menuDurationMin: menu.durationMin,
    });
    if (!staffSelectionEnabled) {
      // スタッフ選択をスキップ → any を自動セットして日時ステップへ
      update({ staffId: 'any', staffName: '指名なし' });
      setStep(3);
    } else {
      setStep(2);
    }
  };

  const handleStaffSelect = (staff: StaffOption) => {
    update({ staffId: staff.id, staffName: staff.name });
    setStep(3);
  };

  const handleDatetimeSelect = (date: string, time: string) => {
    update({ date, time });
    setStep(4);
  };

  // back ナビゲーション（スタッフスキップ時は step 3→1 に戻る）
  const handleBackFromDatetime = () => {
    setStep(staffSelectionEnabled ? 2 : 1);
  };
  const handleBackFromConfirm = () => {
    setStep(3);
  };

  return (
    <div>
      <StepIndicator labels={stepLabels} current={displayStep} />

      {step === 1 && (
        <StepMenu tenantId={tenantId} onSelect={handleMenuSelect} />
      )}
      {step === 2 && staffSelectionEnabled && (
        <StepStaff onSelect={handleStaffSelect} onBack={() => setStep(1)} />
      )}
      {step === 3 && (
        <StepDatetime
          staffId={state.staffId}
          onSelect={handleDatetimeSelect}
          onBack={handleBackFromDatetime}
        />
      )}
      {step === 4 && (
        <StepConfirm
          booking={state}
          onBack={handleBackFromConfirm}
          onDone={reset}
          consentText={consentText}
        />
      )}
    </div>
  );
}
