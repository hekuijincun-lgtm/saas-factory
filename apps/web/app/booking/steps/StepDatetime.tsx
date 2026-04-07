'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSlots, type TimeSlot } from '@/src/lib/bookingApi';

interface TimeBlock {
  id: string;
  date: string;
  blockType: 'closed' | 'full' | 'partial';
  availableSlots: string[] | null;
  note: string;
}

interface MonthlyStatus {
  yearMonth: string;
  limit: number | null;
  booked: number;
  isFull: boolean;
}

interface Props {
  staffId: string | null;
  durationMin?: number | null;
  onSelect: (date: string, time: string) => void;
  onBack: () => void;
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function getWeekDates(offsetWeeks: number): string[] {
  const dates: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + offsetWeeks * 7 + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function getTenantId(): string {
  if (typeof window === 'undefined') return 'default';
  return new URLSearchParams(window.location.search).get('tenantId') || 'default';
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
      {msg}
    </div>
  );
}

export default function StepDatetime({ staffId, durationMin, onSelect, onBack }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // time_blocks & monthly-status
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [monthlyStatus, setMonthlyStatus] = useState<MonthlyStatus | null>(null);
  const [loadedMonth, setLoadedMonth] = useState<string>('');

  const weekDates = getWeekDates(weekOffset);
  const todayStr = today();

  // Fetch time blocks and monthly status when month changes
  const fetchMonthData = useCallback(async (month: string) => {
    if (month === loadedMonth) return;
    const tenantId = getTenantId();
    try {
      const [blocksRes, statusRes] = await Promise.all([
        fetch(`/api/proxy/public/time-blocks?tenantId=${encodeURIComponent(tenantId)}&month=${month}`, {
          headers: { accept: 'application/json' },
          cache: 'no-store',
        }),
        fetch(`/api/proxy/public/booking/monthly-status?tenantId=${encodeURIComponent(tenantId)}&yearMonth=${month}`, {
          headers: { accept: 'application/json' },
          cache: 'no-store',
        }),
      ]);
      const blocksData = await blocksRes.json().catch(() => ({ blocks: [] })) as any;
      const statusData = await statusRes.json().catch(() => ({})) as any;
      setTimeBlocks(blocksData.blocks || []);
      if (statusData.ok) {
        setMonthlyStatus(statusData as MonthlyStatus);
      }
      setLoadedMonth(month);
    } catch {
      // Best effort — don't block booking flow
    }
  }, [loadedMonth]);

  // Set initial date to today on mount
  useEffect(() => {
    setSelectedDate(todayStr);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load month data when week changes
  useEffect(() => {
    if (weekDates.length === 0) return;
    // Use mid-week date to determine month
    const midDate = weekDates[3] || weekDates[0];
    const month = getYearMonth(midDate);
    fetchMonthData(month);
  }, [weekOffset, fetchMonthData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build blocked dates lookup
  const blockedDates = new Map<string, TimeBlock>();
  for (const b of timeBlocks) {
    blockedDates.set(b.date, b);
  }

  const isDateBlocked = (d: string): boolean => {
    const block = blockedDates.get(d);
    if (!block) return false;
    return block.blockType === 'closed' || block.blockType === 'full';
  };

  const getBlockForDate = (d: string): TimeBlock | undefined => {
    return blockedDates.get(d);
  };

  // Fetch slots when date, staffId, or durationMin changes
  useEffect(() => {
    if (!selectedDate) return;
    // Skip fetching slots if date is blocked
    if (isDateBlocked(selectedDate)) {
      setSlots([]);
      return;
    }
    setLoading(true);
    setError(null);
    getSlots(selectedDate, staffId && staffId !== 'any' ? staffId : undefined, durationMin ?? undefined)
      .then(r => {
        const block = getBlockForDate(selectedDate);
        let filteredSlots = r.slots;
        // If partial block, filter to only available slots
        if (block && block.blockType === 'partial' && block.availableSlots) {
          const allowed = new Set(block.availableSlots);
          filteredSlots = filteredSlots.map(s => {
            if (!allowed.has(s.time)) {
              return { ...s, available: false, cellAvailable: false, bookableForMenu: false };
            }
            return s;
          });
        }
        setSlots(filteredSlots);
      })
      .catch(e => setError(e.message || 'スロットの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [selectedDate, staffId, durationMin, timeBlocks]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="p-1 text-brand-muted hover:text-brand-text transition-colors"
          aria-label="戻る"
        >
          ←
        </button>
        <h2 className="text-lg font-semibold text-brand-text">日時を��択</h2>
      </div>

      {/* Monthly full banner */}
      {monthlyStatus?.isFull && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800">
          今月は満員です。来月以降をお選びください。
        </div>
      )}

      {/* Week navigator */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setWeekOffset(w => Math.max(0, w - 1))}
          disabled={weekOffset === 0}
          className="p-2 rounded-lg text-brand-muted disabled:opacity-30 hover:bg-brand-bg transition-colors"
          aria-label="前の週"
        >
          ‹
        </button>

        <div className="flex-1 grid grid-cols-7 gap-1">
          {weekDates.map(d => {
            const dt = new Date(d + 'T12:00:00');
            const dayIdx = dt.getDay();
            const isSelected = d === selectedDate;
            const isPast = d < todayStr;
            const blocked = isDateBlocked(d);
            const isDisabled = isPast || blocked;
            const dayNum = parseInt(d.slice(8, 10), 10);
            const isSun = dayIdx === 0;
            const isSat = dayIdx === 6;

            return (
              <button
                key={d}
                onClick={() => { if (!isDisabled) setSelectedDate(d); }}
                disabled={isDisabled}
                className={`
                  flex flex-col items-center py-2 rounded-xl text-xs transition-all
                  ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-brand-bg cursor-pointer'}
                  ${isSelected && !isDisabled ? 'bg-brand-primary text-white hover:bg-brand-primary' : ''}
                  ${blocked && !isPast ? 'bg-gray-100 line-through' : ''}
                `}
              >
                <span
                  className={`text-xs ${
                    isSelected && !isDisabled
                      ? 'text-white'
                      : isSun
                      ? 'text-red-400'
                      : isSat
                      ? 'text-blue-400'
                      : 'text-brand-muted'
                  }`}
                >
                  {DAY_LABELS[dayIdx]}
                </span>
                <span
                  className={`font-semibold mt-0.5 ${
                    isSelected && !isDisabled ? 'text-white' : 'text-brand-text'
                  }`}
                >
                  {dayNum}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setWeekOffset(w => w + 1)}
          className="p-2 rounded-lg text-brand-muted hover:bg-brand-bg transition-colors"
          aria-label="次の週"
        >
          ›
        </button>
      </div>

      {/* Blocked date message */}
      {selectedDate && isDateBlocked(selectedDate) ? (
        <p className="text-center text-brand-muted text-sm py-8">
          {blockedDates.get(selectedDate)?.blockType === 'closed' ? '定休日です' : '満員です'}
          {blockedDates.get(selectedDate)?.note ? ` (${blockedDates.get(selectedDate)!.note})` : ''}
        </p>
      ) : /* Slot grid */
      loading ? (
        <Spinner />
      ) : error ? (
        <ErrorMsg msg={error} />
      ) : slots.length === 0 ? (
        <p className="text-center text-brand-muted text-sm py-8">
          この日は予約枠がありません
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {slots.map(slot => {
            // bookableForMenu: this menu duration fits. Fallback to available for backward compat.
            const bookable = slot.bookableForMenu ?? slot.available;
            // cellAvailable: grid cell has capacity (matches admin ledger)
            const cellOpen = slot.cellAvailable ?? slot.available;

            // Display: ○ = bookable, △ = cell open but menu doesn't fit, × = cell full
            const mark = !cellOpen ? '×' : !bookable ? '△' : '○';
            const markColor = !cellOpen
              ? 'text-red-400'
              : !bookable
              ? 'text-amber-500'
              : 'text-green-600';

            return (
              <button
                key={slot.time}
                onClick={() => bookable && onSelect(selectedDate, slot.time)}
                disabled={!bookable}
                className={`
                  p-3 rounded-2xl text-sm font-medium flex flex-col items-center gap-1 transition-all
                  ${
                    bookable
                      ? 'bg-white border border-brand-border hover:border-brand-primary hover:shadow-md text-brand-text cursor-pointer'
                      : 'bg-brand-bg text-brand-muted opacity-60 cursor-not-allowed border border-transparent'
                  }
                `}
              >
                <span>{slot.time}</span>
                <span className={`text-xs font-semibold ${markColor}`}>
                  {mark}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
