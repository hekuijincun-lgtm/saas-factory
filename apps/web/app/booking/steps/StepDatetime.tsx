'use client';

import { useEffect, useState } from 'react';
import { getSlots, type TimeSlot } from '@/src/lib/bookingApi';

interface Props {
  staffId: string | null;
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
    // format as YYYY-MM-DD in local time
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

export default function StepDatetime({ staffId, onSelect, onBack }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekDates = getWeekDates(weekOffset);
  const todayStr = today();

  // Set initial date to today on mount
  useEffect(() => {
    setSelectedDate(todayStr);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch slots when date or staffId changes
  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    setError(null);
    getSlots(selectedDate, staffId && staffId !== 'any' ? staffId : undefined)
      .then(r => setSlots(r.slots))
      .catch(e => setError(e.message || 'スロットの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [selectedDate, staffId]);

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
        <h2 className="text-lg font-semibold text-brand-text">日時を選択</h2>
      </div>

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
            const dayNum = parseInt(d.slice(8, 10), 10);
            const isSun = dayIdx === 0;
            const isSat = dayIdx === 6;

            return (
              <button
                key={d}
                onClick={() => { if (!isPast) setSelectedDate(d); }}
                disabled={isPast}
                className={`
                  flex flex-col items-center py-2 rounded-xl text-xs transition-all
                  ${isPast ? 'opacity-30 cursor-not-allowed' : 'hover:bg-brand-bg cursor-pointer'}
                  ${isSelected ? 'bg-brand-primary text-white hover:bg-brand-primary' : ''}
                `}
              >
                <span
                  className={`text-xs ${
                    isSelected
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
                    isSelected ? 'text-white' : 'text-brand-text'
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

      {/* Slot grid */}
      {loading ? (
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
            const mark = slot.available ? '○' : '×';
            return (
              <button
                key={slot.time}
                onClick={() => slot.available && onSelect(selectedDate, slot.time)}
                disabled={!slot.available}
                className={`
                  p-3 rounded-2xl text-sm font-medium flex flex-col items-center gap-1 transition-all
                  ${
                    slot.available
                      ? 'bg-white border border-brand-border hover:border-brand-primary hover:shadow-md text-brand-text cursor-pointer'
                      : 'bg-brand-bg text-brand-muted opacity-60 cursor-not-allowed border border-transparent'
                  }
                `}
              >
                <span>{slot.time}</span>
                <span
                  className={`text-xs font-semibold ${
                    slot.available ? 'text-green-600' : 'text-red-400'
                  }`}
                >
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
