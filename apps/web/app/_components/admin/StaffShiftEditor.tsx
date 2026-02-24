'use client';

import { useState, useEffect } from 'react';
import type { StaffShift, StaffShiftWeekly, StaffShiftException, Dow, TimeStr } from '@/src/types/shift';
import {
  generateTimeOptions,
  validateShiftDay,
  generateDefaultWeekly,
  getDayLabel,
  timeToMinutes,
} from '@/src/lib/shiftUtils';
import { getStaffShift, updateStaffShift } from '@/src/lib/staffShiftApi';
import { ApiClientError } from '@/src/lib/apiClient';
import Card from '../ui/Card';
import { X, Plus, Trash2, Copy } from 'lucide-react';

interface StaffShiftEditorProps {
  staffId: string;
  staffName: string;
  onClose: () => void;
  onSave: (shift: StaffShift) => void;
  /** 時刻選択肢（settings 由来; 未指定時は generateTimeOptions() のデフォルト） */
  timeOptions?: TimeStr[];
  /** デフォルト開始時刻（generateDefaultWeekly に渡す） */
  defaultOpen?: string;
  /** デフォルト終了時刻（generateDefaultWeekly に渡す; 自動補正の上限にも使用） */
  defaultClose?: string;
}

const DAYS_OF_WEEK: Dow[] = [0, 1, 2, 3, 4, 5, 6]; // 日〜土

export default function StaffShiftEditor({ staffId, staffName, onClose, onSave, timeOptions, defaultOpen, defaultClose }: StaffShiftEditorProps) {
  const [weekly, setWeekly] = useState<StaffShiftWeekly[]>([]);
  const [exceptions, setExceptions] = useState<StaffShiftException[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  // settings 由来の選択肢があればそれを使う（fallback: 10:00-20:00/30min）
  const TIME_OPTIONS = timeOptions ?? generateTimeOptions();

  // 初期化: APIからシフトを取得
  useEffect(() => {
    const loadShift = async () => {
      setLoading(true);
      setSaveError(null);
      try {
        const shift = await getStaffShift(staffId);
        if (shift.weekly.length > 0) {
          setWeekly(shift.weekly);
        } else {
          // デフォルト値を設定
          setWeekly(generateDefaultWeekly(defaultOpen, defaultClose));
        }
        setExceptions(shift.exceptions || []);
      } catch (err) {
        console.error(`Failed to load shift for ${staffId}:`, err);
        setSaveError(err instanceof Error ? err.message : 'シフトの読み込みに失敗しました');
        // エラー時もデフォルト値を設定
        setWeekly(generateDefaultWeekly(defaultOpen, defaultClose));
        setExceptions([]);
      } finally {
        setLoading(false);
      }
    };
    loadShift();
  }, [staffId]);

  const handleWeeklyChange = (dow: Dow, field: keyof StaffShiftWeekly, value: boolean | string) => {
    setWeekly((prev) => {
      const updated = prev.map((item) => {
        if (item.dow === dow) {
          const newItem = { ...item, [field]: value };
          // 開始時刻が変更された場合、終了時刻を自動調整
          if (field === 'start' && typeof value === 'string') {
            const newStart = value as TimeStr;
            const currentEnd = newItem.end as TimeStr;
            // 終了時刻が開始時刻以下になった場合は調整
            if (newStart >= currentEnd) {
              // 開始時刻の30分後を終了時刻に設定（上限: defaultClose または 20:00）
              const startMinutes = parseInt(newStart.split(':')[0]) * 60 + parseInt(newStart.split(':')[1]);
              const closeMinutes = defaultClose
                ? parseInt(defaultClose.split(':')[0]) * 60 + parseInt(defaultClose.split(':')[1])
                : 20 * 60;
              const endMinutes = Math.min(startMinutes + 30, closeMinutes);
              const endHours = Math.floor(endMinutes / 60);
              const endMins = endMinutes % 60;
              newItem.end = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}` as TimeStr;
            }
          }
          return newItem;
        }
        return item;
      });
      return updated;
    });
    // エラーをクリア
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[`weekly-${dow}`];
      return newErrors;
    });
  };

  const handleCopyToAllDays = (sourceDow: Dow) => {
    const sourceDay = weekly.find((w) => w.dow === sourceDow);
    if (!sourceDay) return;

    setWeekly((prev) =>
      prev.map((item) => {
        if (item.dow !== sourceDow && item.enabled) {
          return {
            ...item,
            start: sourceDay.start,
            end: sourceDay.end,
            breakStart: sourceDay.breakStart,
            breakEnd: sourceDay.breakEnd,
          };
        }
        return item;
      })
    );
  };

  const handleAddException = () => {
    // クライアント側でのみ実行されるため、new Date() は安全
    if (typeof window === 'undefined') return;
    const today = new Date().toISOString().split('T')[0];
    // 重複チェック
    if (exceptions.some((e) => e.date === today)) {
      setErrors((prev) => ({
        ...prev,
        exceptions: 'この日付は既に登録されています',
      }));
      return;
    }
    setExceptions((prev) => [
      ...prev,
      {
        date: today,
        type: 'off',
      },
    ]);
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors.exceptions;
      return newErrors;
    });
  };

  const handleExceptionChange = (index: number, field: keyof StaffShiftException, value: string) => {
    setExceptions((prev) => {
      const updated = prev.map((item, i) => {
        if (i === index) {
          const newItem = { ...item, [field]: value };
          // date変更時の重複チェック
          if (field === 'date') {
            const otherIndex = prev.findIndex((e, idx) => idx !== i && e.date === value);
            if (otherIndex !== -1) {
              setErrors((prev) => ({
                ...prev,
                [`exception-${index}`]: 'この日付は既に登録されています',
              }));
              return item; // 変更を拒否
            }
          }
          // type変更時の処理
          if (field === 'type' && value === 'custom') {
            // customに変更した場合、settings 由来のデフォルト時間を設定
            if (!newItem.start) {
              newItem.start = (defaultOpen || '10:00') as TimeStr;
            }
            if (!newItem.end) {
              newItem.end = (defaultClose || '19:00') as TimeStr;
            }
          }
          return newItem;
        }
        return item;
      });
      return updated;
    });
    // エラーをクリア
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[`exception-${index}`];
      return newErrors;
    });
  };

  const handleRemoveException = (index: number) => {
    setExceptions((prev) => prev.filter((_, i) => i !== index));
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[`exception-${index}`];
      return newErrors;
    });
  };

  const validateAll = (): boolean => {
    const newErrors: Record<string, string> = {};

    // 週次テンプレートのバリデーション
    weekly.forEach((day) => {
      if (day.enabled) {
        const validation = validateShiftDay(day);
        if (!validation.valid) {
          newErrors[`weekly-${day.dow}`] = validation.error || '無効な設定です';
        }
      }
    });

    // 例外日のバリデーション
    exceptions.forEach((exception, index) => {
      if (exception.type === 'custom') {
        if (!exception.start || !exception.end) {
          newErrors[`exception-${index}`] = '開始時刻と終了時刻を入力してください';
        } else {
          const validation = validateShiftDay({
            enabled: true,
            start: exception.start,
            end: exception.end,
            breakStart: exception.breakStart,
            breakEnd: exception.breakEnd,
          });
          if (!validation.valid) {
            newErrors[`exception-${index}`] = validation.error || '無効な設定です';
          }
        }
      }
    });

    // 日付の重複チェック
    const dateSet = new Set<string>();
    exceptions.forEach((exception, index) => {
      if (dateSet.has(exception.date)) {
        newErrors[`exception-${index}`] = 'この日付は既に登録されています';
      } else {
        dateSet.add(exception.date);
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateAll()) {
      setSaveSuccess(false);
      return;
    }

    // 例外日を日付でソート
    const sortedExceptions = [...exceptions].sort((a, b) => a.date.localeCompare(b.date));

    const shift: StaffShift = {
      staffId,
      weekly,
      exceptions: sortedExceptions,
    };

    setSaveError(null);
    try {
      await updateStaffShift(staffId, shift);
      onSave(shift);
      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      const errorMessage =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'シフトの保存に失敗しました';
      setSaveError(errorMessage);
      setSaveSuccess(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-soft max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="sticky top-0 bg-white border-b border-brand-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-semibold text-brand-text">シフト設定</h2>
            <p className="text-sm text-brand-muted mt-1">{staffName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-brand-muted hover:bg-brand-bg rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* ローディング中 */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
              <span className="ml-3 text-sm text-brand-muted">読み込み中...</span>
            </div>
          )}

          {!loading && (
            <>
              {/* 成功メッセージ */}
              {saveSuccess && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                  <p className="text-sm text-green-700">保存しました</p>
                </div>
              )}

              {/* 保存エラーメッセージ */}
              {saveError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-700">{saveError}</p>
                </div>
              )}

              {/* エラーメッセージ */}
              {errors.exceptions && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-700">{errors.exceptions}</p>
                </div>
              )}

          {/* 週次テンプレート */}
          <Card>
            <h3 className="text-lg font-semibold text-brand-text mb-4">週次テンプレート</h3>
            <div className="space-y-3">
              {DAYS_OF_WEEK.map((dow) => {
                const dayShift = weekly.find((w) => w.dow === dow) || {
                  dow,
                  enabled: false,
                  start: (defaultOpen || '10:00') as TimeStr,
                  end: (defaultClose || '19:00') as TimeStr,
                };
                const errorKey = `weekly-${dow}`;
                const hasError = errors[errorKey];

                return (
                  <div
                    key={dow}
                    className={`p-4 border rounded-xl ${
                      hasError ? 'border-red-300 bg-red-50' : 'border-brand-border bg-brand-bg'
                    }`}
                  >
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <input
                          type="checkbox"
                          id={`enabled-${dow}`}
                          checked={dayShift.enabled}
                          onChange={(e) => handleWeeklyChange(dow, 'enabled', e.target.checked)}
                          className="w-4 h-4 text-brand-primary border-brand-border rounded focus:ring-brand-primary"
                        />
                        <label htmlFor={`enabled-${dow}`} className="text-sm font-medium text-brand-text">
                          {getDayLabel(dow)}曜日
                        </label>
                      </div>

                      {dayShift.enabled && (
                        <>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-brand-muted whitespace-nowrap">開始</label>
                            <select
                              value={dayShift.start}
                              onChange={(e) => handleWeeklyChange(dow, 'start', e.target.value)}
                              className="px-3 py-2 border border-brand-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                            >
                              {TIME_OPTIONS.map((time) => (
                                <option key={time} value={time}>
                                  {time}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="text-xs text-brand-muted whitespace-nowrap">終了</label>
                            <select
                              value={dayShift.end}
                              onChange={(e) => handleWeeklyChange(dow, 'end', e.target.value)}
                              className="px-3 py-2 border border-brand-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                            >
                              {TIME_OPTIONS.filter(t => timeToMinutes(t) > timeToMinutes(dayShift.start as TimeStr)).map((time) => (
                                <option key={time} value={time}>
                                  {time}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="text-xs text-brand-muted whitespace-nowrap">休憩開始</label>
                            <select
                              value={dayShift.breakStart || ''}
                              onChange={(e) =>
                                handleWeeklyChange(dow, 'breakStart', (e.target.value || undefined) as TimeStr | undefined)
                              }
                              className="px-3 py-2 border border-brand-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                            >
                              <option value="">なし</option>
                              {TIME_OPTIONS.map((time) => (
                                <option key={time} value={time}>
                                  {time}
                                </option>
                              ))}
                            </select>
                          </div>

                          {dayShift.breakStart && (
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-brand-muted whitespace-nowrap">休憩終了</label>
                              <select
                                value={dayShift.breakEnd || ''}
                                onChange={(e) =>
                                  handleWeeklyChange(dow, 'breakEnd', (e.target.value || undefined) as TimeStr | undefined)
                                }
                                className="px-3 py-2 border border-brand-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                              >
                                <option value="">なし</option>
                                {TIME_OPTIONS.map((time) => (
                                  <option key={time} value={time}>
                                    {time}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <button
                            onClick={() => handleCopyToAllDays(dow)}
                            className="px-3 py-2 text-xs text-brand-primary hover:bg-brand-bg rounded-lg transition-all flex items-center gap-1"
                            title="この設定を他の有効な曜日にコピー"
                          >
                            <Copy className="w-3 h-3" />
                            <span>全曜日にコピー</span>
                          </button>
                        </>
                      )}
                    </div>
                    {hasError && (
                      <p className="text-xs text-red-600 mt-2">{errors[errorKey]}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 例外日 */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-brand-text">例外日</h3>
              <button
                onClick={handleAddException}
                className="px-4 py-2 bg-brand-primary text-white rounded-xl text-sm font-medium hover:shadow-md transition-all flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>例外追加</span>
              </button>
            </div>

            {exceptions.length === 0 ? (
              <p className="text-sm text-brand-muted text-center py-8">例外日がありません</p>
            ) : (
              <div className="space-y-3">
                {exceptions.map((exception, index) => {
                  const errorKey = `exception-${index}`;
                  const hasError = errors[errorKey];
                  return (
                    <div
                      key={index}
                      className={`p-4 border rounded-xl ${
                        hasError ? 'border-red-300 bg-red-50' : 'border-brand-border bg-brand-bg'
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-wrap">
                        <input
                          type="date"
                          value={exception.date}
                          onChange={(e) => handleExceptionChange(index, 'date', e.target.value)}
                          className="px-3 py-2 border border-brand-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                        />

                        <select
                          value={exception.type}
                          onChange={(e) => handleExceptionChange(index, 'type', e.target.value)}
                          className="px-3 py-2 border border-brand-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                        >
                          <option value="off">休み</option>
                          <option value="custom">カスタム時間</option>
                        </select>

                        {exception.type === 'custom' && (
                          <>
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-brand-muted whitespace-nowrap">開始</label>
                              <select
                                value={exception.start || ''}
                                onChange={(e) => handleExceptionChange(index, 'start', e.target.value)}
                                className="px-3 py-2 border border-brand-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                              >
                                {TIME_OPTIONS.map((time) => (
                                  <option key={time} value={time}>
                                    {time}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-center gap-2">
                              <label className="text-xs text-brand-muted whitespace-nowrap">終了</label>
                              <select
                                value={exception.end || ''}
                                onChange={(e) => handleExceptionChange(index, 'end', e.target.value)}
                                className="px-3 py-2 border border-brand-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                              >
                                {exception.start
                                  ? TIME_OPTIONS.filter(t => timeToMinutes(t) > timeToMinutes(exception.start as TimeStr)).map((time) => (
                                      <option key={time} value={time}>
                                        {time}
                                      </option>
                                    ))
                                  : TIME_OPTIONS.map((time) => (
                                      <option key={time} value={time}>
                                        {time}
                                      </option>
                                    ))}
                              </select>
                            </div>

                            <div className="flex items-center gap-2">
                              <label className="text-xs text-brand-muted whitespace-nowrap">休憩開始</label>
                              <select
                                value={exception.breakStart || ''}
                                onChange={(e) => handleExceptionChange(index, 'breakStart', e.target.value)}
                                className="px-3 py-2 border border-brand-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                              >
                                <option value="">なし</option>
                                {TIME_OPTIONS.map((time) => (
                                  <option key={time} value={time}>
                                    {time}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {exception.breakStart && (
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-brand-muted whitespace-nowrap">休憩終了</label>
                                <select
                                  value={exception.breakEnd || ''}
                                  onChange={(e) => handleExceptionChange(index, 'breakEnd', e.target.value)}
                                  className="px-3 py-2 border border-brand-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                                >
                                  <option value="">なし</option>
                                  {TIME_OPTIONS.map((time) => (
                                    <option key={time} value={time}>
                                      {time}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </>
                        )}

                        <button
                          onClick={() => handleRemoveException(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all ml-auto"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {hasError && (
                        <p className="text-xs text-red-600 mt-2">{errors[errorKey]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

              {/* フッター */}
              <div className="flex gap-2 pt-4 border-t border-brand-border">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 bg-white text-brand-text border border-brand-border rounded-xl font-medium hover:shadow-md transition-all"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  保存
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
