'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import StepMenu from './steps/StepMenu';
import StepStaff from './steps/StepStaff';
import StepDatetime from './steps/StepDatetime';
import StepConfirm from './steps/StepConfirm';
import StepSurvey from './steps/StepSurvey';
import type { MenuItem } from '@/src/lib/bookingApi';
import { fetchAdminSettings } from '../lib/adminApi';
import type { EyebrowSurveyQuestion } from '@/src/types/settings';

export interface BookingState {
  menuId: string | null;
  menuName: string | null;
  menuPrice: number | null;
  menuDurationMin: number | null;
  menuStyleType?: string | null; // menu.eyebrow.styleType（予約時styleBreakdown用）
  staffId: string | null;
  staffName: string | null;
  date: string | null;
  time: string | null;
  lineUserId?: string | null;
  surveyAnswers?: Record<string, string | boolean>;
}

export interface StaffOption {
  id: string;
  name: string;
  role?: string;
}

const INITIAL: BookingState = {
  menuId: null, menuName: null, menuPrice: null, menuDurationMin: null, menuStyleType: null,
  staffId: null, staffName: null, date: null, time: null,
  lineUserId: null, surveyAnswers: undefined,
};

const DEFAULT_CONSENT = '予約内容を確認し、同意の上で予約を確定します';

// ============================================================
// lineUserId localStorage 永続化（30日 TTL）
// LINE から ?lu=Uxxxx で来たとき保存し、次回アクセス時に復元する
// ============================================================
const BOOKING_LU_KEY = 'booking_lu';
const BOOKING_LU_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function saveLu(lu: string): void {
  try {
    localStorage.setItem(
      BOOKING_LU_KEY,
      JSON.stringify({ v: lu, exp: Date.now() + BOOKING_LU_TTL_MS })
    );
  } catch { /* localStorage 利用不可の場合は無視 */ }
}

function loadLu(): string | null {
  try {
    const raw = localStorage.getItem(BOOKING_LU_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: string; exp: number };
    if (Date.now() > parsed.exp) {
      localStorage.removeItem(BOOKING_LU_KEY);
      return null;
    }
    return parsed.v || null;
  } catch { return null; }
}

// ============================================================
// StepIndicator
// ============================================================
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

// ============================================================
// BookingFlow
// Internal step numbers:
//   1 = Menu
//   2 = Staff (conditional: staffSelectionEnabled)
//   3 = Datetime
//   4 = Survey (conditional: surveyEnabled)
//   5 = Confirm
// ============================================================
export default function BookingFlow() {
  const searchParams = useSearchParams();
  const tenantId = searchParams?.get('tenantId') || 'default';
  const luFromUrl = searchParams?.get('lu') || null;

  const [step, setStep] = useState(1);
  // lineUserId は URL param を初期値とし、マウント後に localStorage を参照して補完
  const [state, setState] = useState<BookingState>({ ...INITIAL, lineUserId: luFromUrl });

  // 管理者設定（consentText, staffSelectionEnabled, eyebrow survey）
  const [consentText, setConsentText] = useState(DEFAULT_CONSENT);
  // 施術同意文 (eyebrow treatment consent) — displayed as a separate text block in StepConfirm
  const [treatmentConsentText, setTreatmentConsentText] = useState<string>('');
  const [staffSelectionEnabled, setStaffSelectionEnabled] = useState(true);
  const [surveyEnabled, setSurveyEnabled] = useState(false);
  const [surveyQuestions, setSurveyQuestions] = useState<EyebrowSurveyQuestion[]>([]);

  // lineUserId: URL param を優先し、無ければ localStorage から復元（クライアントのみ）
  useEffect(() => {
    if (luFromUrl) {
      saveLu(luFromUrl);
    } else {
      const saved = loadLu();
      if (saved) {
        setState(prev => ({ ...prev, lineUserId: saved }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchAdminSettings(tenantId).then(settings => {
      const raw = settings as any;
      // Generic booking agreement checkbox text (top-level)
      const ct = raw.consentText || raw.eyebrow?.consentText;
      if (ct) setConsentText(ct);
      // Treatment-specific consent text — displayed as a SEPARATE block above the checkbox
      const tct = String(raw.eyebrow?.consentText ?? raw.verticalConfig?.consentText ?? "").trim();
      if (tct) setTreatmentConsentText(tct);
      if (raw.staffSelectionEnabled === false) setStaffSelectionEnabled(false);
      if (raw.eyebrow?.surveyEnabled === true) setSurveyEnabled(true);
      if (Array.isArray(raw.eyebrow?.surveyQuestions)) setSurveyQuestions(raw.eyebrow.surveyQuestions);
    }).catch(() => { /* fallback: default values のまま */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // ---- Step labels (visual) ----
  // With staff + with survey:    ['メニュー', 'スタッフ', '日時', 'アンケート', '確認']
  // With staff + no survey:      ['メニュー', 'スタッフ', '日時', '確認']
  // No staff + with survey:      ['メニュー', '日時', 'アンケート', '確認']
  // No staff + no survey:        ['メニュー', '日時', '確認']
  const stepLabels = staffSelectionEnabled
    ? surveyEnabled
      ? ['メニュー', 'スタッフ', '日時', 'アンケート', '確認']
      : ['メニュー', 'スタッフ', '日時', '確認']
    : surveyEnabled
      ? ['メニュー', '日時', 'アンケート', '確認']
      : ['メニュー', '日時', '確認'];

  // Map internal step (1-5) to visual step index for StepIndicator
  const displayStep = (() => {
    if (staffSelectionEnabled && surveyEnabled) {
      // internal 1,2,3,4,5 → visual 1,2,3,4,5
      return step;
    } else if (staffSelectionEnabled && !surveyEnabled) {
      // internal 1,2,3,5 → visual 1,2,3,4
      return step === 5 ? 4 : step;
    } else if (!staffSelectionEnabled && surveyEnabled) {
      // internal 1,3,4,5 → visual 1,2,3,4
      if (step === 1) return 1;
      if (step === 3) return 2;
      if (step === 4) return 3;
      if (step === 5) return 4;
      return step;
    } else {
      // !staff, !survey: internal 1,3,5 → visual 1,2,3
      if (step === 1) return 1;
      if (step === 3) return 2;
      if (step === 5) return 3;
      return step;
    }
  })();

  const update = (patch: Partial<BookingState>) =>
    setState(prev => ({ ...prev, ...patch }));

  // reset は現在の lineUserId を引き継ぐ
  const reset = () => {
    setState(prev => ({ ...INITIAL, lineUserId: prev.lineUserId }));
    setStep(1);
  };

  const handleMenuSelect = (menu: MenuItem) => {
    update({
      menuId: menu.id,
      menuName: menu.name,
      menuPrice: menu.price,
      menuDurationMin: menu.durationMin,
      menuStyleType: menu.eyebrow?.styleType ?? null,
    });
    if (!staffSelectionEnabled) {
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
    setStep(surveyEnabled ? 4 : 5);
  };

  const handleBackFromDatetime = () => {
    setStep(staffSelectionEnabled ? 2 : 1);
  };
  const handleBackFromSurvey = () => {
    setStep(3);
  };
  const handleBackFromConfirm = () => {
    console.log("[BookingFlow] handleBackFromConfirm -> step", surveyEnabled ? 4 : 3);
    // Clear selected date/time so StepDatetime re-fetches fresh slots
    update({ date: null, time: null });
    setStep(3);
  };

  const enabledSurveyQuestions = surveyQuestions.filter(q => q.enabled);

  return (
    <div>
      <StepIndicator labels={stepLabels} current={displayStep} />

      {step === 1 && (
        <StepMenu tenantId={tenantId} onSelect={handleMenuSelect} />
      )}
      {step === 2 && staffSelectionEnabled && (
        <StepStaff tenantId={tenantId} onSelect={handleStaffSelect} onBack={() => setStep(1)} />
      )}
      {step === 3 && (
        <StepDatetime
          staffId={state.staffId}
          durationMin={state.menuDurationMin}
          onSelect={handleDatetimeSelect}
          onBack={handleBackFromDatetime}
        />
      )}
      {step === 4 && surveyEnabled && (
        <StepSurvey
          questions={enabledSurveyQuestions}
          answers={state.surveyAnswers ?? {}}
          onAnswer={(id, value) => update({ surveyAnswers: { ...state.surveyAnswers, [id]: value } })}
          onNext={() => setStep(5)}
          onBack={handleBackFromSurvey}
        />
      )}
      {step === 5 && (
        <StepConfirm
          booking={state}
          onBack={handleBackFromConfirm}
          onDone={reset}
          consentText={consentText}
          treatmentConsentText={treatmentConsentText}
          surveyQuestions={enabledSurveyQuestions}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}
