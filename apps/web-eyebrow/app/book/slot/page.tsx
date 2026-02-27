"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchSlots, generateFallbackSlots, SlotItem } from "@/src/lib/apiClient";

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toJpDate(d: Date): string {
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${pad(d.getDate())}(${days[d.getDay()]})`;
}

function SlotPicker() {
  const router = useRouter();
  const params = useSearchParams();

  const menuId   = params.get("menuId") ?? "";
  const menuName = params.get("menuName") ?? "";
  const price    = params.get("price") ?? "0";
  const duration = params.get("duration") ?? "30";
  const tenantId = params.get("tenantId") ?? "default";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [slots, setSlots] = useState<SlotItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  const weekStart = addDays(today, weekOffset * 7);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    setSlots(null);
    fetchSlots(tenantId, selectedDate).then((res) => {
      if (res === null) {
        setSlots(generateFallbackSlots());
        setIsFallback(true);
      } else {
        setSlots(res);
        setIsFallback(false);
      }
      setLoading(false);
    });
  }, [selectedDate, tenantId]);

  const handleSelectSlot = (time: string) => {
    const qs = new URLSearchParams({
      menuId,
      menuName,
      price,
      duration,
      tenantId,
      date: selectedDate,
      time,
    }).toString();
    router.push(`/book/confirm?${qs}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs mb-1" style={{ color: "var(--brow-accent)" }}>
          {decodeURIComponent(menuName)} · ¥{Number(price).toLocaleString()} · {duration}分
        </p>
        <h1 className="text-xl font-bold" style={{ color: "var(--brow-text)" }}>
          日時を選ぶ
        </h1>
      </div>

      {/* Week navigator */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => { setWeekOffset((p) => p - 1); setSelectedDate(""); }}
            disabled={weekOffset === 0}
            className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40"
          >
            ← 前の週
          </button>
          <span className="text-xs font-semibold" style={{ color: "var(--brow-text)" }}>
            {toJpDate(weekStart)} 〜 {toJpDate(addDays(weekStart, 6))}
          </span>
          <button
            onClick={() => { setWeekOffset((p) => p + 1); setSelectedDate(""); }}
            disabled={weekOffset >= 3}
            className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40"
          >
            次の週 →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDates.map((d) => {
            const ds = toDateStr(d);
            const isPast = d < today;
            const isSelected = ds === selectedDate;
            const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
            const dow = d.getDay();
            const isSun = dow === 0;
            const isSat = dow === 6;
            return (
              <button
                key={ds}
                onClick={() => !isPast && setSelectedDate(ds)}
                disabled={isPast}
                className="rounded-xl py-2 flex flex-col items-center gap-0.5 text-xs font-medium transition-all"
                style={
                  isSelected
                    ? { background: "var(--brow-primary)", color: "white" }
                    : isPast
                    ? { background: "var(--brow-light)", color: "var(--brow-border)", cursor: "not-allowed" }
                    : {
                        background: "var(--brow-card)",
                        border: "1px solid var(--brow-border)",
                        color: isSun ? "#c0392b" : isSat ? "#2980b9" : "var(--brow-text)",
                      }
                }
              >
                <span style={{ fontSize: "0.65rem" }}>{dayNames[dow]}</span>
                <span>{d.getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Slots */}
      {selectedDate && (
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--brow-text)" }}>
            {toJpDate(new Date(selectedDate + "T00:00:00"))} の空き時間
            {isFallback && (
              <span className="ml-2 text-xs font-normal" style={{ color: "var(--brow-muted)" }}>
                (仮枠表示)
              </span>
            )}
          </h2>
          {loading ? (
            <p className="text-sm text-center py-4" style={{ color: "var(--brow-muted)" }}>
              読み込み中…
            </p>
          ) : slots && slots.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {slots.map((s) => (
                <button
                  key={s.time}
                  onClick={() => handleSelectSlot(s.time)}
                  className="rounded-xl py-2.5 text-sm font-semibold transition-all hover:opacity-90"
                  style={{ background: "var(--brow-primary)", color: "white" }}
                >
                  {s.time}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-center py-4" style={{ color: "var(--brow-muted)" }}>
              この日の空き枠はありません
            </p>
          )}
        </div>
      )}

      {!selectedDate && (
        <p className="text-sm text-center py-4" style={{ color: "var(--brow-muted)" }}>
          上のカレンダーから日付を選んでください
        </p>
      )}

      <div>
        <a href="/book/menu" className="text-xs underline" style={{ color: "var(--brow-muted)" }}>
          ← メニュー選択に戻る
        </a>
      </div>
    </div>
  );
}

export default function SlotPage() {
  return (
    <Suspense fallback={<div className="text-center py-10 text-sm" style={{ color: "var(--brow-muted)" }}>読み込み中…</div>}>
      <SlotPicker />
    </Suspense>
  );
}
