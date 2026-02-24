'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { getReservations, cancelReservationById, assignStaffToReservation, getStaff, type Reservation, type Staff } from '@/src/lib/bookingApi';
import { ApiClientError } from '@/src/lib/apiClient';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Badge from '../ui/Badge';
import { STAFF } from '../constants/staff';
import type { StaffShift } from '@/src/types/shift';
import { isWorkingTime } from '@/src/lib/shiftUtils';
import { getAdminSettings } from '@/src/lib/adminSettingsApi';
import type { AdminSettings } from '@/src/types/settings';
import { useAdminSettings } from '../../admin/_lib/useAdminSettings';

// この定数は削除（APIから取得したstaffListを使用）

// タイムスロット生成（open〜close を interval 分刻みで生成）
// デフォルト: 10:00-19:00 を 60 分刻み（後方互換）
function generateTimeSlots(open = '10:00', close = '19:00', interval = 60): string[] {
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  const openMin  = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  const step = interval > 0 ? interval : 60;
  const slots: string[] = [];
  for (let min = openMin; min <= closeMin; min += step) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
  }
  // fallback: settings 取得前も UI が壊れないようにデフォルトを返す
  return slots.length > 0 ? slots : ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
}

export default function ReservationsLedger() {
  // tenantId は URL クエリから取得（なければ default）
  const searchParams = useSearchParams();
  const tenantId = searchParams?.get('tenantId') || 'default';
  // settings hook (失敗時は 10:00/19:00/30min fallback で継続)
  const { settings: bizSettings } = useAdminSettings(tenantId);

  const [mounted, setMounted] = useState(false);
  const [todayStr, setTodayStr] = useState<string>('');

  useEffect(() => {
    setMounted(true);
    const today = new Date();
    setTodayStr(today.toISOString().split('T')[0]);
  }, []);
  const [date, setDate] = useState<string>('');
  
  useEffect(() => {
    if (mounted && todayStr) {
      setDate(todayStr);
    }
  }, [mounted, todayStr]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [assigningStaffId, setAssigningStaffId] = useState<string>('');
  const [assigningReservationId, setAssigningReservationId] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [assigning, setAssigning] = useState<boolean>(false);
  const [staffShifts, setStaffShifts] = useState<Map<string, StaffShift>>(new Map());
  const [settings, setSettings] = useState<AdminSettings | null>(null);

  // settings が取得されたら open/close/interval に追随（取得前は デフォルト値で表示継続）
  const timeSlots = useMemo(
    () => generateTimeSlots(bizSettings.open, bizSettings.close, bizSettings.interval),
    [bizSettings],
  );

  // 設定を取得
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await getAdminSettings();
        setSettings(data);
      } catch (err) {
        console.warn('Failed to fetch settings:', err);
      }
    };
    fetchSettings();
  }, []);

  // スタッフのシフトを読み込む（localStorageから）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const shifts = new Map<string, StaffShift>();
    staffList.forEach((staff) => {
      if (staff.id === 'any') return; // 指名なしはスキップ
      
      try {
        const key = `lumiere.staffShift.${staff.id}`;
        const data = localStorage.getItem(key);
        if (data) {
          const shift = JSON.parse(data) as StaffShift;
          shifts.set(staff.id, shift);
        }
      } catch (err) {
        console.warn(`Failed to load shift for staff ${staff.id}:`, err);
      }
    });
    
    setStaffShifts(shifts);
  }, [staffList]);

  // 表示用スタッフリスト（指名なし + APIから取得したスタッフ）
  const displayStaffList = [
    { id: 'any', name: '指名なし', role: undefined, active: true, sortOrder: 0 },
    ...staffList,
  ];

  // 予約を (date, time, staffId) をキーにした Map に変換
  // staffId がない場合は 'any' として扱う
  const reservationMap = new Map<string, Reservation>();
  reservations.forEach((res) => {
    const staffId = (res as any).staffId || 'any';
    const key = `${res.date}|${res.time}|${staffId}`;
    reservationMap.set(key, res);
  });

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getReservations(date);
      // 配列チェック
      if (Array.isArray(response.reservations)) {
        setReservations(response.reservations);
      } else {
        console.warn('fetchReservations: response.reservations is not an array, setting to empty array');
        setReservations([]);
      }
    } catch (err) {
      const errorMessage =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to fetch reservations';
      setError(errorMessage);
      setReservations([]); // エラー時は空配列にフォールバック
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (date) {
      fetchReservations();
    }
  }, [date, fetchReservations]);

  // スタッフ一覧を取得
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
        console.warn('Failed to fetch staff, using fallback:', err);
        // フォールバック
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

  const handleDateChange = (days: number) => {
    const currentDate = new Date(date);
    currentDate.setDate(currentDate.getDate() + days);
    setDate(currentDate.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setDate(todayStr);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}(${weekdays[d.getDay()]})`;
  };

  const handleCancel = async (reservation: Reservation) => {
    if (!window.confirm(`予約をキャンセルしますか？\n日付: ${reservation.date}\n時間: ${reservation.time}\nお名前: ${reservation.name}`)) {
      return;
    }

    setCancellingId(reservation.reservationId);

    try {
      await cancelReservationById(reservation.reservationId);
      await fetchReservations();
      setSelectedReservation(null);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        await fetchReservations();
        setSelectedReservation(null);
      } else if (err instanceof ApiClientError && err.status === 409) {
        // 409エラー: キャンセル期限切れ or 既にキャンセル済み
        const errorMessage = err.message || '';
        if (errorMessage.includes('already canceled') || errorMessage.includes('既にキャンセル')) {
          setError('既にキャンセル済みです');
          // 既にキャンセル済みの場合は一覧を更新
          await fetchReservations();
          setSelectedReservation(null);
        } else {
          setError(err.message || 'キャンセル期限を過ぎています');
        }
      } else {
        const errorMessage =
          err instanceof ApiClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to cancel reservation';
        setError(errorMessage);
      }
    } finally {
      setCancellingId(null);
    }
  };

  const getReservationForCell = (time: string, staffId: string) => {
    const key = `${date}|${time}|${staffId}`;
    return reservationMap.get(key);
  };

  // 予約の現在の staffId を取得（割り当て状態を確認するため）
  const getReservationStaffId = (reservation: Reservation): string => {
    return (reservation as any).staffId || 'any';
  };

  // 担当者を割り当て（API呼び出し）
  const handleAssignStaff = async () => {
    if (!selectedReservation || !assigningStaffId) return;

    setAssigning(true);
    setError(null);

    try {
      const reservationId = selectedReservation.reservationId;
      const staffId = assigningStaffId === 'any' ? null : assigningStaffId;
      
      await assignStaffToReservation(reservationId, staffId);
      
      // 成功後、予約一覧を再取得
      await fetchReservations();
      
      // モーダルを閉じる
      setSelectedReservation(null);
      setAssigningStaffId('');
      setAssigningReservationId(null);
    } catch (err) {
      const errorMessage =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to assign staff';
      setError(errorMessage);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-2xl shadow-soft border border-brand-border p-6">
        <div className="flex items-center justify-between">
          {/* 左: タイトル */}
          <h1 className="text-2xl font-semibold text-brand-text">予約台帳</h1>

          {/* 中央: 日付ナビ */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleDateChange(-1)}
              className="p-2 text-brand-muted hover:text-brand-text hover:bg-brand-bg rounded-xl transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="px-4 py-2 bg-brand-bg border border-brand-border rounded-xl">
              <span className="text-sm font-medium text-brand-text">{formatDate(date)}</span>
            </div>
            <button
              onClick={() => handleDateChange(1)}
              className="p-2 text-brand-muted hover:text-brand-text hover:bg-brand-bg rounded-xl transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* 右: 今日ボタン + 予約作成 */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleToday}
              className="px-4 py-2 text-sm font-medium text-brand-text bg-white border border-brand-border rounded-xl hover:shadow-md transition-all"
            >
              今日
            </button>
            <button
              onClick={() => {
                // TODO: 予約作成モーダルを開く
                alert('予約作成機能は準備中です');
              }}
              className="px-5 py-4 bg-brand-primary text-white rounded-2xl shadow-soft hover:shadow-md transition-all flex items-center gap-2 leading-tight"
            >
              <Plus className="w-5 h-5" />
              <span className="font-medium">予約作成</span>
            </button>
          </div>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* グリッドテーブル */}
      <div className="bg-white rounded-2xl shadow-soft border border-brand-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
            <span className="ml-3 text-sm text-brand-muted">読み込み中...</span>
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-300px)]">
            <table className="min-w-full border-collapse">
              {/* ヘッダー行（スタッフ列） */}
              <thead className="bg-brand-bg sticky top-0 z-10">
                <tr>
                <th className="sticky left-0 z-20 bg-brand-bg border-r border-brand-border px-4 py-3 text-left text-xs font-semibold text-brand-muted uppercase tracking-wider min-w-[80px]">
                  TIME
                </th>
                {displayStaffList.map((staff) => (
                    <th
                      key={staff.id}
                      className="border-r border-brand-border px-4 py-3 text-center text-xs font-semibold text-brand-muted uppercase tracking-wider min-w-[200px] last:border-r-0"
                    >
                      <div>
                        <div className="font-medium text-brand-text">{staff.name}</div>
                        {staff.role && <div className="text-xs text-brand-muted mt-1">({staff.role})</div>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* ボディ（時間行 × スタッフ列） */}
              <tbody className="bg-white divide-y divide-brand-border">
                {timeSlots.map((time) => (
                  <tr key={time} className="hover:bg-brand-bg/50 transition-colors">
                    {/* TIME列（sticky） */}
                    <td className="sticky left-0 z-10 bg-white border-r border-brand-border px-4 py-3 text-sm font-medium text-brand-text min-w-[80px]">
                      {time}
                    </td>

                  {/* スタッフ列 */}
                  {displayStaffList.map((staff) => {
                      const reservation = getReservationForCell(time, staff.id);
                      // 指名なし('any')の場合は常に有効
                      const isWorking = staff.id === 'any' 
                        ? true 
                        : isWorkingTime(date, time, staffShifts.get(staff.id) || null);
                      
                      return (
                        <td
                          key={`${time}-${staff.id}`}
                          className={`border-r border-brand-border px-2 py-2 min-w-[200px] last:border-r-0 align-top ${
                            !isWorking ? 'bg-gray-100 opacity-50' : ''
                          }`}
                        >
                          {reservation ? (
                            <div
                              onClick={() => isWorking && setSelectedReservation(reservation)}
                              className={`border rounded-xl p-3 transition-all ${
                                isWorking
                                  ? 'bg-blue-50 border-blue-200 cursor-pointer hover:shadow-md'
                                  : 'bg-gray-100 border-gray-200 cursor-not-allowed opacity-50'
                              }`}
                            >
                              <div className="font-medium text-brand-text text-sm mb-1">
                                {reservation.name}
                              </div>
                              <div className="text-xs text-brand-muted mb-2">
                                {reservation.phone || '-'}
                              </div>
                              <div className="flex items-center justify-between">
                                <Badge variant="reserved">予約済み</Badge>
                                <span className="text-xs text-brand-muted font-mono">
                                  {reservation.reservationId.slice(0, 8)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className={`h-16 ${!isWorking ? 'bg-gray-50' : ''}`} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 詳細モーダル（既存を流用） */}
      {selectedReservation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedReservation(null)}>
          <div className="bg-white rounded-2xl shadow-soft max-w-2xl w-full p-6 space-y-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-brand-text">予約詳細</h2>
                <p className="text-sm text-brand-muted mt-1">予約ID: {selectedReservation.reservationId}</p>
              </div>
              <button
                onClick={() => setSelectedReservation(null)}
                className="p-2 text-brand-muted hover:text-brand-text hover:bg-brand-bg rounded-lg transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-brand-muted mb-1">日付</p>
                  <p className="text-base text-brand-text">{selectedReservation.date}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-brand-muted mb-1">時間</p>
                  <p className="text-base text-brand-text">{selectedReservation.time}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-brand-muted mb-1">お名前</p>
                <p className="text-base text-brand-text">{selectedReservation.name}</p>
              </div>

              {selectedReservation.phone && (
                <div>
                  <p className="text-sm font-medium text-brand-muted mb-1">電話番号</p>
                  <p className="text-base text-brand-text">{selectedReservation.phone}</p>
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-brand-muted mb-1">作成日時</p>
                <p className="text-base text-brand-text">
                  {mounted ? (() => {
                    try {
                      return new Date(selectedReservation.createdAt).toLocaleString('ja-JP');
                    } catch {
                      return selectedReservation.createdAt;
                    }
                  })() : selectedReservation.createdAt}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-brand-muted mb-1">ステータス</p>
                <div><Badge variant="reserved">予約済み</Badge></div>
              </div>

              {/* 担当者情報 */}
              <div>
                <p className="text-sm font-medium text-brand-muted mb-1">担当者</p>
                <p className="text-base text-brand-text">
                  {(() => {
                    const staffId = getReservationStaffId(selectedReservation);
                    if (staffId === 'any') return '指名なし';
                    const staff = staffList.find((s) => s.id === staffId);
                    return staff ? staff.name : '指名なし';
                  })()}
                </p>
              </div>

              {/* 担当者を割り当て（指名なしの場合のみ表示） */}
              {getReservationStaffId(selectedReservation) === 'any' && (
                <div className="border-t border-brand-border pt-4 mt-4">
                  <h3 className="text-lg font-semibold text-brand-text mb-3">担当者を割り当て</h3>
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="assign-staff" className="block text-sm font-medium text-brand-text mb-2">
                        スタッフを選択
                      </label>
                      <select
                        id="assign-staff"
                        value={assigningStaffId}
                        onChange={(e) => setAssigningStaffId(e.target.value)}
                        className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all bg-white"
                      >
                        <option value="">選択してください</option>
                        {staffList
                          .filter((staff) => {
                            // 選択された予約の日時で、そのスタッフが勤務中かどうかをチェック
                            if (!selectedReservation) return false;
                            const shift = staffShifts.get(staff.id);
                            return isWorkingTime(selectedReservation.date, selectedReservation.time, shift || null);
                          })
                          .map((staff) => (
                            <option key={staff.id} value={staff.id}>
                              {staff.name} {staff.role ? `(${staff.role})` : ''}
                            </option>
                          ))}
                      </select>
                    </div>
                    <button
                      onClick={handleAssignStaff}
                      disabled={!assigningStaffId}
                      className="w-full px-4 py-3 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:bg-brand-muted disabled:cursor-not-allowed transition-all"
                    >
                      割り当て
                    </button>
                    <p className="text-xs text-brand-muted">
                      ※ 現時点では画面表示のみ更新されます。API連携は準備中です。
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-4 border-t border-brand-border">
              <button
                onClick={() => {
                  setSelectedReservation(null);
                  handleCancel(selectedReservation);
                }}
                disabled={cancellingId === selectedReservation.reservationId}
                className="px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {cancellingId === selectedReservation.reservationId ? 'キャンセル中...' : 'キャンセル'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

