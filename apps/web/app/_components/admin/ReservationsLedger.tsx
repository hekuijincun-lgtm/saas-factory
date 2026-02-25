'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { getReservations, cancelReservationById, assignStaffToReservation, getStaff, createReservation, getMenu, type Reservation, type Staff, type MenuItem } from '@/src/lib/bookingApi';
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
  return slots;
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

  // 予約作成モーダル
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<{
    menuId: string; staffId: string; date: string; time: string;
    name: string; phone: string; note: string;
  }>({ menuId: '', staffId: 'any', date: '', time: '', name: '', phone: '', note: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [menuList, setMenuList] = useState<MenuItem[]>([]);

  // 予約可能日時グリッド
  const [availabilityOverrides, setAvailabilityOverrides] = useState<Map<string, string>>(new Map());
  const [availSaving, setAvailSaving] = useState(false);

  // 予約編集モーダル
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<{ name: string; phone: string; note: string; staffId: string }>({ name: '', phone: '', note: '', staffId: 'any' });
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  // メニュー一覧を取得
  useEffect(() => {
    getMenu(tenantId).then(setMenuList).catch(() => {});
  }, [tenantId]);

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
    const staffId = res.staffId || 'any';
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

  // Auto-refresh: poll every 30s + refresh on window focus
  useEffect(() => {
    if (!date) return;
    const handleFocus = () => fetchReservations();
    window.addEventListener('focus', handleFocus);
    const timer = setInterval(() => fetchReservations(), 30_000);
    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(timer);
    };
  }, [date, fetchReservations]);

  // 予約可能日時オーバーライドを取得
  const fetchAvailability = useCallback(async () => {
    if (!date || staffList.length === 0) return;
    try {
      const params = new URLSearchParams({ tenantId, date });
      const res = await fetch(`/api/proxy/admin/availability?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json() as { ok: boolean; staff: Record<string, Record<string, string>> };
      if (json.ok && json.staff) {
        const newMap = new Map<string, string>();
        for (const [staffId, times] of Object.entries(json.staff)) {
          for (const [time, status] of Object.entries(times)) {
            newMap.set(`${staffId}:${time}`, status as string);
          }
        }
        setAvailabilityOverrides(newMap);
      }
    } catch (err) {
      console.warn('Failed to fetch availability:', err);
    }
  }, [date, staffList, tenantId]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  // 予約可能ステータス取得（override優先、なければシフト由来）
  const getAvailabilityStatus = useCallback((staffId: string, time: string): 'open' | 'half' | 'closed' => {
    const override = availabilityOverrides.get(`${staffId}:${time}`);
    if (override === 'open' || override === 'half' || override === 'closed') return override;
    const shift = staffShifts.get(staffId);
    return isWorkingTime(date, time, shift || null) ? 'open' : 'closed';
  }, [availabilityOverrides, staffShifts, date]);

  // ○→△→×→○ サイクル、KVに保存（楽観的更新）
  const cycleAvailability = useCallback(async (staffId: string, time: string) => {
    const current = getAvailabilityStatus(staffId, time);
    const cycleMap: Record<string, 'open' | 'half' | 'closed'> = { open: 'half', half: 'closed', closed: 'open' };
    const next = cycleMap[current];
    const key = `${staffId}:${time}`;

    setAvailabilityOverrides(prev => new Map(prev).set(key, next));
    setAvailSaving(true);
    try {
      await fetch('/api/proxy/admin/availability', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, staffId, date, time, status: next }),
      });
    } catch (err) {
      console.warn('Failed to save availability:', err);
      setAvailabilityOverrides(prev => new Map(prev).set(key, current));
    } finally {
      setAvailSaving(false);
    }
  }, [getAvailabilityStatus, tenantId, date]);

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
    return reservation.staffId || 'any';
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

  // 編集モードを開始
  const startEdit = (reservation: Reservation) => {
    setEditForm({
      name: reservation.name,
      phone: reservation.phone || '',
      note: reservation.note || '',
      staffId: reservation.staffId || 'any',
    });
    setEditError(null);
    setEditMode(true);
  };

  // 予約を編集（PATCH /admin/reservations/:id）
  const handleEdit = async () => {
    if (!selectedReservation) return;
    if (!editForm.name.trim()) { setEditError('お名前は必須です'); return; }
    setEditing(true);
    setEditError(null);
    try {
      await fetch(`/api/proxy/admin/reservations/${selectedReservation.reservationId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          phone: editForm.phone.trim() || null,
          note: editForm.note.trim() || null,
          staffId: editForm.staffId === 'any' ? null : editForm.staffId,
        }),
      });
      setEditMode(false);
      setSelectedReservation(null);
      await fetchReservations();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '更新に失敗しました');
    } finally {
      setEditing(false);
    }
  };

  // 予約作成モーダルを開く（日付・時刻を現在選択日に合わせて初期化）
  const openCreateModal = () => {
    setCreateForm(f => ({ ...f, date, staffId: 'any', time: timeSlots[0] || '' }));
    setCreateError(null);
    setCreateModalOpen(true);
  };

  // 予約を作成（/reserveへPOST）
  const handleCreate = async () => {
    if (!createForm.name.trim()) { setCreateError('お名前は必須です'); return; }
    if (!createForm.date) { setCreateError('日付を選択してください'); return; }
    if (!createForm.time) { setCreateError('時間を選択してください'); return; }

    setCreating(true);
    setCreateError(null);
    try {
      await createReservation({
        date: createForm.date,
        time: createForm.time,
        name: createForm.name.trim(),
        phone: createForm.phone.trim() || undefined,
        staffId: createForm.staffId,
      });
      setCreateModalOpen(false);
      setCreateForm({ menuId: '', staffId: 'any', date: '', time: '', name: '', phone: '', note: '' });
      await fetchReservations();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        setCreateError('その枠は埋まりました。別の時間またはスタッフを選択してください。');
      } else {
        setCreateError(err instanceof Error ? err.message : '予約の作成に失敗しました');
      }
    } finally {
      setCreating(false);
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
              onClick={openCreateModal}
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

      {/* 予約可能日時グリッド */}
      <div className="bg-white rounded-2xl shadow-soft border border-brand-border overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-brand-border">
          <div>
            <h2 className="text-lg font-semibold text-brand-text">予約可能日時</h2>
            <p className="text-xs text-brand-muted mt-0.5">クリックで ○→△→×→○ 切替。KVに保存され /slots に反映されます</p>
          </div>
          {availSaving && (
            <div className="flex items-center gap-2 text-xs text-brand-muted">
              <div className="animate-spin rounded-full h-3 w-3 border-b border-brand-primary" />
              <span>保存中...</span>
            </div>
          )}
        </div>
        {staffList.length === 0 ? (
          <div className="p-6 text-center text-sm text-brand-muted">スタッフが未登録です</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full border-collapse">
              <thead className="bg-brand-bg">
                <tr>
                  <th className="sticky left-0 z-10 bg-brand-bg border-r border-brand-border px-4 py-3 text-left text-xs font-semibold text-brand-muted uppercase tracking-wider min-w-[80px]">
                    TIME
                  </th>
                  {staffList.map((staff) => (
                    <th
                      key={staff.id}
                      className="border-r border-brand-border px-4 py-3 text-center text-xs font-semibold text-brand-muted uppercase tracking-wider min-w-[120px] last:border-r-0"
                    >
                      <div className="font-medium text-brand-text">{staff.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-brand-border">
                {timeSlots.map((time) => (
                  <tr key={time} className="hover:bg-brand-bg/50">
                    <td className="sticky left-0 z-10 bg-white border-r border-brand-border px-4 py-2 text-sm font-medium text-brand-text min-w-[80px]">
                      {time}
                    </td>
                    {staffList.map((staff) => {
                      const status = getAvailabilityStatus(staff.id, time);
                      const cfg = {
                        open:   { label: '○', cls: 'text-green-600 bg-green-50 hover:bg-green-100 border-green-200' },
                        half:   { label: '△', cls: 'text-amber-600 bg-amber-50 hover:bg-amber-100 border-amber-200' },
                        closed: { label: '×', cls: 'text-gray-400 bg-gray-50 hover:bg-gray-100 border-gray-200' },
                      }[status];
                      return (
                        <td key={staff.id} className="border-r border-brand-border px-2 py-2 text-center last:border-r-0">
                          <button
                            onClick={() => cycleAvailability(staff.id, time)}
                            className={`w-12 h-8 rounded-lg border text-sm font-bold transition-colors ${cfg.cls}`}
                          >
                            {cfg.label}
                          </button>
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
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => { setSelectedReservation(null); setEditMode(false); }}
        >
          <div className="bg-white rounded-2xl shadow-soft max-w-2xl w-full p-6 space-y-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-brand-text">
                  {editMode ? '予約を編集' : '予約詳細'}
                </h2>
                <p className="text-sm text-brand-muted mt-1">予約ID: {selectedReservation.reservationId}</p>
              </div>
              <button
                onClick={() => { setSelectedReservation(null); setEditMode(false); }}
                className="p-2 text-brand-muted hover:text-brand-text hover:bg-brand-bg rounded-lg transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {editMode ? (
              /* ─── 編集フォーム ─── */
              <div className="space-y-4">
                {editError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{editError}</div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-brand-muted mb-1">日付（変更不可）</p>
                    <p className="text-base text-brand-text">{selectedReservation.date}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-muted mb-1">時間（変更不可）</p>
                    <p className="text-base text-brand-text">{selectedReservation.time}</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-text mb-1">お名前 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-text mb-1">電話番号</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="090-0000-0000"
                    className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-text mb-1">担当スタッフ</label>
                  <select
                    value={editForm.staffId}
                    onChange={(e) => setEditForm(f => ({ ...f, staffId: e.target.value }))}
                    className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary bg-white text-sm"
                  >
                    <option value="any">指名なし</option>
                    {staffList.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-text mb-1">備考</label>
                  <textarea
                    value={editForm.note}
                    onChange={(e) => setEditForm(f => ({ ...f, note: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleEdit}
                    disabled={editing}
                    className="flex-1 px-4 py-3 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                  >
                    {editing ? '保存中...' : '保存する'}
                  </button>
                  <button
                    onClick={() => { setEditMode(false); setEditError(null); }}
                    className="px-4 py-3 text-sm font-medium text-brand-text bg-white border border-brand-border rounded-xl hover:shadow-md transition-all"
                  >
                    戻る
                  </button>
                </div>
              </div>
            ) : (
              /* ─── 詳細表示 ─── */
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

                {selectedReservation.note && (
                  <div>
                    <p className="text-sm font-medium text-brand-muted mb-1">備考</p>
                    <p className="text-base text-brand-text">{selectedReservation.note}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium text-brand-muted mb-1">作成日時</p>
                  <p className="text-base text-brand-text">
                    {mounted ? (() => {
                      try { return new Date(selectedReservation.createdAt).toLocaleString('ja-JP'); }
                      catch { return selectedReservation.createdAt; }
                    })() : selectedReservation.createdAt}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-brand-muted mb-1">ステータス</p>
                  <div><Badge variant="reserved">予約済み</Badge></div>
                </div>

                <div>
                  <p className="text-sm font-medium text-brand-muted mb-1">担当者</p>
                  <p className="text-base text-brand-text">
                    {(() => {
                      const sid = getReservationStaffId(selectedReservation);
                      if (sid === 'any') return '指名なし';
                      const s = staffList.find((x) => x.id === sid);
                      return s ? s.name : sid;
                    })()}
                  </p>
                </div>
              </div>
            )}

            {!editMode && (
              <div className="flex items-center gap-2 pt-4 border-t border-brand-border">
                <button
                  onClick={() => startEdit(selectedReservation)}
                  className="px-4 py-2 text-sm font-medium text-brand-text bg-white border border-brand-border rounded-xl hover:shadow-md transition-all"
                >
                  編集
                </button>
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
            )}
          </div>
        </div>
      )}
      {/* 予約作成モーダル */}
      {createModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setCreateModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-soft max-w-lg w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-brand-text">予約を作成</h2>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="p-2 text-brand-muted hover:text-brand-text hover:bg-brand-bg rounded-lg transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {createError}
              </div>
            )}

            <div className="space-y-3">
              {/* メニュー */}
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">メニュー</label>
                <select
                  value={createForm.menuId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, menuId: e.target.value }))}
                  className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary bg-white text-sm"
                >
                  <option value="">選択（任意）</option>
                  {menuList.filter((m) => m.active).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}（{m.durationMin}分 / ¥{m.price.toLocaleString()}）
                    </option>
                  ))}
                </select>
              </div>

              {/* スタッフ */}
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">スタッフ</label>
                <select
                  value={createForm.staffId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, staffId: e.target.value }))}
                  className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary bg-white text-sm"
                >
                  <option value="any">指名なし</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.role ? ` (${s.role})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 日付・時間 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-brand-text mb-1">
                    日付 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={createForm.date}
                    onChange={(e) => setCreateForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-text mb-1">
                    時間 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={createForm.time}
                    onChange={(e) => setCreateForm((f) => ({ ...f, time: e.target.value }))}
                    className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary bg-white text-sm"
                  >
                    <option value="">選択</option>
                    {timeSlots.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* お名前 */}
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">
                  お名前 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="山田 花子"
                  className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm"
                />
              </div>

              {/* 電話番号 */}
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">
                  電話番号
                </label>
                <input
                  type="tel"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="090-0000-0000"
                  className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm"
                />
              </div>

              {/* 備考 */}
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">備考</label>
                <textarea
                  value={createForm.note}
                  onChange={(e) => setCreateForm((f) => ({ ...f, note: e.target.value }))}
                  rows={2}
                  placeholder="電話予約、特記事項など"
                  className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 px-4 py-3 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
              >
                {creating ? '作成中...' : '予約を作成'}
              </button>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-3 text-sm font-medium text-brand-text bg-white border border-brand-border rounded-xl hover:shadow-md transition-all"
              >
                キャンセル
              </button>
            </div>

            <p className="text-xs text-brand-muted">チャンネル: 電話（phone）として記録されます</p>
          </div>
        </div>
      )}
    </div>
  );
}

