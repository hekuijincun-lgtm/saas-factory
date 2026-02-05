'use client';

import { useEffect, useState } from 'react';
import { getSlots, createReservation, getStaff, type TimeSlot, type ReservationResponse, type Staff } from '@/src/lib/bookingApi';
import { ApiClientError } from '@/src/lib/apiClient';
import { STAFF } from '../constants/staff';
import { getAdminSettings } from '@/src/lib/adminSettingsApi';
import type { AdminSettings, ReservationRules } from '@/src/types/settings';

type Step = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * 安全に Date オブジェクトを作成
 * @param input - 日付文字列、Date オブジェクト、または null/undefined
 * @returns 有効な Date オブジェクト（無効な場合は今日の日付）
 */

function safeDate(input: unknown): Date {
  // 入力が無い場合は今日の日付を返す
  if (!input) {
    return new Date();
  }

  // Date オブジェクトの場合
  if (input instanceof Date) {
    if (isNaN(input.getTime())) {
      return new Date(); // Invalid Date の場合は今日の日付を返す
    }
    return input;
  }

  // 文字列の場合
  if (typeof input === 'string') {
    // 空文字の場合は今日の日付を返す
    if (!input.trim()) {
      return new Date();
    }

    // まず標準的な Date パースを試す
    const date1 = new Date(input);
    if (!isNaN(date1.getTime())) {
      return date1;
    }

    // YYYY/MM/DD 形式を試す
    const match1 = input.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (match1) {
      const [, year, month, day] = match1;
      const date2 = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date2.getTime())) {
        return date2;
      }
    }

    // YYYY.MM.DD 形式を試す
    const match2 = input.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
    if (match2) {
      const [, year, month, day] = match2;
      const date3 = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date3.getTime())) {
        return date3;
      }
    }

    // YYYY-MM-DD 形式を直接試す
    const match3 = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match3) {
      const [, year, month, day] = match3;
      const date4 = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date4.getTime())) {
        return date4;
      }
    }

    // すべて失敗した場合は今日の日付を返す
    return new Date();
  }

  // その他の場合は今日の日付を返す
  return new Date();
}

/**
 * Date オブジェクトをローカル時間で YYYY-MM-DD 形式に変換
 * @param d - Date オブジェクト
 * @returns YYYY-MM-DD 形式の文字列
 */
function formatYmdLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 日付を安全に ISO 形式 (YYYY-MM-DD) に変換
 * @param input - 日付文字列、Date オブジェクト、または null/undefined
 * @returns YYYY-MM-DD 形式の文字列（無効な場合は今日の日付）
 */
function toIsoDateSafe(input?: string | Date | null): string {
  const safe = safeDate(input);
  return formatYmdLocal(safe);
}

export default function CustomerBookingApp() {
  const [mounted, setMounted] = useState(false);
  const [today, setToday] = useState<string>('');
  const [step, setStep] = useState<Step>(1);
  const [selectedDate, setSelectedDate] = useState<string>('');

  useEffect(() => {
    setMounted(true);
    const todayStr = formatYmdLocal(new Date());
    setToday(todayStr);
    setSelectedDate(todayStr);
  }, []);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('any'); // デフォルト: 指名なし
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<ReservationResponse | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState<boolean>(true);

  // Step 1: 日付選択
  // Step 2: スタッフ選択（新規）
  // Step 3: 時間選択
  // Step 4: 情報入力
  // Step 5: 確認
  // Step 6: 完了

  // 設定を取得（初回のみ）
  useEffect(() => {
    const fetchSettings = async () => {
      setSettingsLoading(true);
      try {
        const data = await getAdminSettings();
        setSettings(data);
      } catch (err) {
        console.warn('Failed to fetch settings, using defaults:', err);
        // エラー時はデフォルト設定を使用（getAdminSettingsがデフォルトを返すので問題なし）
      } finally {
        setSettingsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  // スタッフ一覧を取得（初回のみ）
  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const staff = await getStaff();
        // 配列チェック
        if (Array.isArray(staff)) {
          setStaffList(staff);
        } else {
          console.warn('fetchStaff: staff is not an array, using fallback');
          setStaffList(STAFF.filter(s => s.id !== 'any').map(s => ({
            id: s.id,
            name: s.name,
            role: s.role,
            active: true,
            sortOrder: 0,
          })));
        }
      } catch (err) {
        // エラー時はフォールバック（既存のSTAFF定数を使用）
        console.warn('Failed to fetch staff, using fallback:', err);
        setStaffList(STAFF.filter(s => s.id !== 'any').map(s => ({
          id: s.id,
          name: s.name,
          role: s.role,
          active: true,
          sortOrder: 0,
        })));
      }
    };
    fetchStaff();
  }, []);

  // 日付またはスタッフが変更されたらスロットを取得（API側で設定が適用済み）
  useEffect(() => {
    if (step === 3 && selectedDate) {
      const fetchSlots = async () => {
        setLoading(true);
        setError(null);
        setSlots([]); // ローディング開始時にスロットをクリア
        
        try {
          // API側で設定（営業時間、定休日、例外日、cutoffMinutes、shift）が適用済み
          // staffId が 'any' の場合は省略
          const response = await getSlots(selectedDate, selectedStaffId !== 'any' ? selectedStaffId : undefined);
          
          // レスポンスの検証
          if (response && response.slots && Array.isArray(response.slots)) {
            setSlots(response.slots);
          } else {
            console.warn('getSlots: Invalid response format', response);
            setSlots([]);
            setError('スロットデータの形式が不正です');
          }
        } catch (err) {
          const errorMessage =
            err instanceof ApiClientError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Failed to fetch slots';
          setError(errorMessage);
          setSlots([]);
          console.error('Failed to fetch slots:', err);
        } finally {
          setLoading(false);
        }
      };

      fetchSlots();
    } else {
      // step が 3 以外の場合はスロットをクリア
      setSlots([]);
      setError(null);
    }
  }, [selectedDate, selectedStaffId, step]);

  const handleDateNext = () => {
    if (selectedDate) {
      setStep(2);
    }
  };

  const handleStaffNext = () => {
    // selectedStaffId は常に設定されている（デフォルト 'any'）ので、常に次へ進める
    setStep(3);
  };

  const handleTimeNext = () => {
    if (selectedTime) {
      setStep(4);
    }
  };

  const handleInfoNext = () => {
    if (name.trim()) {
      setStep(5);
    }
  };

  const handleConfirm = async () => {
    if (!selectedTime || !name.trim()) {
      setError('時間と名前を入力してください');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await createReservation({
        date: selectedDate,
        time: selectedTime,
        name: name.trim(),
        phone: phone.trim() || undefined,
        staffId: selectedStaffId !== 'any' ? selectedStaffId : null,
      });
      setReservation(response);
      setError(null);
      setStep(6);
    } catch (err) {
      // 409エラーの場合は特別なメッセージを表示してStep3に戻す
      if (err instanceof ApiClientError && err.status === 409) {
        setError('その枠は埋まりました。別の時間を選択してください。');
        setStep(3);
        // 409エラー時もslotsを再取得して最新状態を反映
        try {
          const slotsResponse = await getSlots(selectedDate, selectedStaffId !== 'any' ? selectedStaffId : undefined);
          setSlots(slotsResponse.slots);
        } catch (slotsErr) {
          console.error('Failed to refresh slots:', slotsErr);
        }
      } else {
        const errorMessage =
          err instanceof ApiClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to create reservation';
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
        {/* ステップインジケーター */}
        <div className="flex items-center justify-between mb-6">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-medium ${
                  step >= s
                    ? 'bg-brand-primary text-white'
                    : 'bg-brand-bg text-brand-muted'
                }`}
              >
                {s}
              </div>
              {s < 6 && (
                <div
                  className={`flex-1 h-1 mx-2 rounded ${
                    step > s ? 'bg-brand-primary' : 'bg-brand-border'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: 日付選択 */}
        {step === 1 && (
          <div className="space-y-4">
            {settingsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
                <span className="ml-3 text-sm text-brand-muted">読み込み中...</span>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-brand-text mb-1">予約日を選択</h2>
                  <p className="text-sm text-brand-muted">ご希望の日付を選択してください</p>
                </div>
                <div>
                  <label htmlFor="date" className="block text-sm font-medium text-brand-text mb-2">
                    予約日
                  </label>
                  <input
                    id="date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      // バリデーション: 公開期間内か
                      if (settings) {
                        const todayDate = safeDate(today);
                        const selectedDateObj = safeDate(newDate);
                        const publicDays = settings.publicDays ?? settings.rules?.publicDays ?? 0;
                        const maxDate = new Date(todayDate);
                        maxDate.setDate(todayDate.getDate() + publicDays);
                        
                        if (isNaN(todayDate.getTime()) || isNaN(selectedDateObj.getTime()) || isNaN(maxDate.getTime())) {
                          setError('日付の処理中にエラーが発生しました');
                          return;
                        }
                        
                        if (selectedDateObj < todayDate || selectedDateObj > maxDate) {
                          setError(`予約可能期間は今日から${publicDays}日後までです`);
                          return;
                        }
                        
                        // バリデーション: 定休日か
                        const dow = selectedDateObj.getDay();
                        if (settings.closedWeekdays?.includes(dow)) {
                          setError('選択された日付は定休日です');
                          return;
                        }
                        
                        // バリデーション: 例外日（closed）か
                        const exception = settings.exceptions?.find((ex) => ex.date === newDate);
                        if (exception && exception.type === 'closed') {
                          setError('選択された日付は休業日です');
                          return;
                        }
                      }
                      
                      setSelectedDate(newDate);
                      setError(null);
                    }}
                    className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all"
                    min={mounted ? formatYmdLocal(safeDate(today)) : undefined}
                    max={mounted && settings ? (() => {
                      const todayDate = safeDate(today);
                      const publicDays = settings.publicDays ?? settings.rules?.publicDays ?? 0;
                      const maxDate = new Date(todayDate);
                      maxDate.setDate(todayDate.getDate() + publicDays);
                      if (isNaN(maxDate.getTime())) {
                        // Invalid Date の場合は今日の日付を返す（フォールバック）
                        return formatYmdLocal(todayDate);
                      }
                      return formatYmdLocal(maxDate);
                    })() : undefined}
                  />
                  {settings && (
                    <p className="text-xs text-brand-muted mt-1">
                      予約可能期間: 今日から{settings.publicDays ?? settings.rules?.publicDays ?? 0}日後まで
                    </p>
                  )}
                </div>
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
                <button
                  onClick={handleDateNext}
                  disabled={!selectedDate || !!error}
                  className="w-full px-4 py-3 bg-brand-primary text-white rounded-2xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:ring-offset-2 disabled:bg-brand-muted disabled:cursor-not-allowed transition-all"
                >
                  次へ
                </button>
              </>
            )}
          </div>
        )}

        {/* Step 2: スタッフ選択 */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-brand-text mb-1">スタッフを選択</h2>
              <p className="text-sm text-brand-muted">指名なしも選べます（あとで割当可能）</p>
            </div>
            <div className="space-y-3">
              {/* 指名なし（おすすめ） */}
              <button
                onClick={() => setSelectedStaffId('any')}
                className={`w-full px-4 py-4 rounded-2xl text-left border transition-all ${
                  selectedStaffId === 'any'
                    ? 'bg-white border-brand-primary shadow-md ring-2 ring-brand-primary/20'
                    : 'bg-white border-brand-border shadow-sm hover:shadow-md hover:border-brand-primary'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-brand-text">指名なし</span>
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md">おすすめ</span>
                </div>
                <div className="text-sm text-brand-muted mt-1">後からスタッフを割り当て可能</div>
              </button>

              {/* スタッフ一覧 */}
              {staffList.length > 0 ? (
                staffList.map((staff) => (
                  <button
                    key={staff.id}
                    onClick={() => setSelectedStaffId(staff.id)}
                    className={`w-full px-4 py-4 rounded-2xl text-left border transition-all ${
                      selectedStaffId === staff.id
                        ? 'bg-white border-brand-primary shadow-md ring-2 ring-brand-primary/20'
                        : 'bg-white border-brand-border shadow-sm hover:shadow-md hover:border-brand-primary'
                    }`}
                  >
                    <div className="font-medium text-brand-text">{staff.name}</div>
                    {staff.role && <div className="text-sm text-brand-muted mt-1">{staff.role}</div>}
                  </button>
                ))
              ) : (
                <div className="text-sm text-brand-muted text-center py-4">スタッフ情報を読み込み中...</div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 px-4 py-3 bg-white text-brand-text border border-brand-border rounded-2xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:ring-offset-2 transition-all"
              >
                戻る
              </button>
              <button
                onClick={handleStaffNext}
                className="flex-1 px-4 py-3 bg-brand-primary text-white rounded-2xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:ring-offset-2 transition-all"
              >
                次へ
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 時間選択 */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-brand-text mb-1">時間を選択</h2>
              <p className="text-sm text-brand-muted">ご希望の時間を選択してください</p>
            </div>
            
            {/* ローディング状態 */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-primary"></div>
                <span className="mt-4 text-sm text-brand-muted">時間枠を取得中...</span>
                <span className="mt-1 text-xs text-brand-muted">しばらくお待ちください</span>
              </div>
            )}

            {/* エラー状態 */}
            {!loading && error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm font-medium text-red-800 mb-1">エラーが発生しました</p>
                <p className="text-sm text-red-700">{error}</p>
                <button
                  onClick={async () => {
                    setError(null);
                    setLoading(true);
                    try {
                      const response = await getSlots(selectedDate, selectedStaffId !== 'any' ? selectedStaffId : undefined);
                      if (response && response.slots && Array.isArray(response.slots)) {
                        setSlots(response.slots);
                      } else {
                        setError('スロットデータの形式が不正です');
                        setSlots([]);
                      }
                    } catch (err) {
                      const errorMessage =
                        err instanceof ApiClientError
                          ? err.message
                          : err instanceof Error
                            ? err.message
                            : 'Failed to fetch slots';
                      setError(errorMessage);
                      setSlots([]);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
                >
                  再試行
                </button>
              </div>
            )}

            {/* スロットが空の場合 */}
            {!loading && !error && slots.length === 0 && (
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <p className="text-sm text-brand-muted">選択された日付には予約可能な時間枠がありません</p>
                <p className="text-xs text-brand-muted mt-1">別の日付を選択してください</p>
              </div>
            )}

            {/* スロット表示 */}
            {!loading && !error && slots.length > 0 && (
              <div>
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((slot) => {
                    // API側でcutoffMinutesが適用済みなので、available=falseの場合は無効化
                    const isDisabled = !slot.available;
                    
                    // reason の文言マップ
                    const reasonLabel: Record<string, string> = {
                      cutoff: '締切',
                      reserved: '予約済',
                      shift: '勤務外/休憩',
                      closed: '休業',
                    };
                    
                    return (
                      <button
                        key={slot.time}
                        onClick={() => !isDisabled && setSelectedTime(slot.time)}
                        disabled={isDisabled}
                        className={`px-4 py-2.5 rounded-2xl text-sm font-medium transition-all border relative ${
                          selectedTime === slot.time
                            ? 'bg-white text-brand-text border-brand-primary shadow-md ring-2 ring-brand-primary/20'
                            : !isDisabled
                              ? 'bg-white text-brand-text border-brand-border shadow-sm hover:shadow-md hover:border-brand-primary'
                              : 'bg-slate-50 text-brand-muted border-brand-border opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{slot.time}</span>
                          {isDisabled && slot.reason && reasonLabel[slot.reason] && (
                            <span className="text-xs text-rose-600 font-normal">
                              {reasonLabel[slot.reason]}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {settings && selectedDate === today && settings.rules?.cutoffMinutes && (
                  <p className="text-xs text-brand-muted mt-2">
                    当日は{settings.rules.cutoffMinutes}分前まで予約可能です
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="flex-1 px-4 py-3 bg-white text-brand-text border border-brand-border rounded-2xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:ring-offset-2 transition-all"
              >
                戻る
              </button>
              <button
                onClick={handleTimeNext}
                disabled={!selectedTime}
                className="flex-1 px-4 py-3 bg-brand-primary text-white rounded-2xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:bg-brand-muted disabled:cursor-not-allowed transition-all"
              >
                次へ
              </button>
            </div>
          </div>
        )}

        {/* Step 4: 情報入力 */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-brand-text mb-1">お客様情報</h2>
              <p className="text-sm text-brand-muted">予約に必要な情報を入力してください</p>
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-brand-text mb-2">
                お名前 <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="山田 太郎"
                className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-brand-text mb-2">
                電話番号（任意）
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="090-1234-5678"
                className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(3)}
                className="flex-1 px-4 py-3 bg-white text-brand-text border border-brand-border rounded-2xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:ring-offset-2 transition-all"
              >
                戻る
              </button>
              <button
                onClick={handleInfoNext}
                disabled={!name.trim()}
                className="flex-1 px-4 py-3 bg-brand-primary text-white rounded-2xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:bg-brand-muted disabled:cursor-not-allowed transition-all"
              >
                次へ
              </button>
            </div>
          </div>
        )}

        {/* Step 5: 確認 */}
        {step === 5 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-brand-text mb-1">予約内容の確認</h2>
              <p className="text-sm text-brand-muted">内容をご確認の上、予約を確定してください</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <div>
                <span className="text-sm font-medium text-slate-700">日付:</span>{' '}
                <span className="text-sm text-slate-900">{selectedDate}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-slate-700">スタッフ:</span>{' '}
                <span className="text-sm text-slate-900">
                  {selectedStaffId === 'any' 
                    ? '指名なし' 
                    : staffList.find((s) => s.id === selectedStaffId)?.name || '指名なし'}
                </span>
              </div>
              <div>
                <span className="text-sm font-medium text-slate-700">時間:</span>{' '}
                <span className="text-sm text-slate-900">{selectedTime}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-slate-700">お名前:</span>{' '}
                <span className="text-sm text-slate-900">{name}</span>
              </div>
              {phone && (
                <div>
                  <span className="text-sm font-medium text-slate-700">電話番号:</span>{' '}
                  <span className="text-sm text-slate-900">{phone}</span>
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep(4)}
                className="flex-1 px-4 py-3 bg-white text-brand-text border border-brand-border rounded-2xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:ring-offset-2 transition-all"
              >
                戻る
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-brand-primary text-white rounded-2xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:bg-brand-muted disabled:cursor-not-allowed transition-all"
              >
                {loading ? '予約中...' : '予約確定'}
              </button>
            </div>
          </div>
        )}

        {/* Step 6: 完了 */}
        {step === 6 && reservation && (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start">
                <svg
                  className="w-5 h-5 text-green-600 mr-2 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-green-900 mb-2">予約が完了しました</h3>
                  <div className="text-sm text-green-700 space-y-1">
                    <div>
                      <span className="font-medium">予約ID:</span> {reservation.reservationId}
                    </div>
                    <div>
                      <span className="font-medium">日付:</span> {reservation.date}
                    </div>
                    <div>
                      <span className="font-medium">時間:</span> {reservation.time}
                    </div>
                    <div>
                      <span className="font-medium">お名前:</span> {reservation.name}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setStep(1);
                setSelectedDate(today);
                setSelectedStaffId('any');
                setSelectedTime(null);
                setName('');
                setPhone('');
                setReservation(null);
                setError(null);
              }}
              className="w-full px-4 py-3 bg-brand-primary text-white rounded-2xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 transition-all"
            >
              新しい予約をする
            </button>
          </div>
        )}
    </div>
  );
}
