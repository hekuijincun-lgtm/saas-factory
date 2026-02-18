"use client";

import { useEffect, useMemo, useState } from "react";

type ApiResp = {
  ok: boolean;
  tenantId?: string;
  data?: any;
  error?: string;
};

type Settings = {
  businessName?: string;
  timezone?: string;
  openTime: string;
  closeTime: string;
  slotIntervalMin: number;
  slotMinutes: number;
  closedWeekdays: number[];
};

const WEEKDAYS = [
  { k: 0, label: "日" },
  { k: 1, label: "月" },
  { k: 2, label: "火" },
  { k: 3, label: "水" },
  { k: 4, label: "木" },
  { k: 5, label: "金" },
  { k: 6, label: "土" },
];

function normalizeTime(v: string, fallback: string) {
  return /^\d{2}:\d{2}$/.test(v) ? v : fallback;
}

export default function AdminSettingsPage() {
  const [tenantId, setTenantId] = useState("default");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [s, setS] = useState<Settings>({
    openTime: "10:00",
    closeTime: "19:00",
    slotIntervalMin: 30,
    slotMinutes: 30,
    closedWeekdays: [],
  });

  const api = useMemo(() => {
    const base = "/api/proxy/admin/settings";
    return {
      get: (tid: string) =>
        `${base}?tenantId=${encodeURIComponent(tid)}&nocache=${crypto
          .randomUUID()
          .replace(/-/g, "")}`,
      put: (tid: string) => `${base}?tenantId=${encodeURIComponent(tid)}`,
    };
  }, []);

  async function load(tid: string) {
    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch(api.get(tid), { cache: "no-store" });
      const j = (await r.json()) as ApiResp;
      if (!j.ok) throw new Error(j.error || "failed");
      const d = j.data || {};
      setS({
        businessName: d.businessName,
        timezone: d.timezone,
        openTime: normalizeTime(String(d.openTime || "10:00"), "10:00"),
        closeTime: normalizeTime(String(d.closeTime || "19:00"), "19:00"),
        slotIntervalMin: Number(d.slotIntervalMin ?? 30),
        slotMinutes: Number(d.slotMinutes ?? 30),
        closedWeekdays: Array.isArray(d.closedWeekdays)
          ? d.closedWeekdays.map((x: any) => Number(x))
          : [],
      });
    } catch (e: any) {
      setMsg(`読み込み失敗: ${String(e?.message || e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body = {
        openTime: s.openTime,
        closeTime: s.closeTime,
        slotIntervalMin: Number(s.slotIntervalMin),
        slotMinutes: Number(s.slotMinutes),
        closedWeekdays: s.closedWeekdays,
      };
      const r = await fetch(api.put(tenantId), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as ApiResp;
      if (!j.ok) throw new Error(j.error || "save_failed");
      setMsg("保存したよ ✅");
      await load(tenantId);
    } catch (e: any) {
      setMsg(`保存失敗: ${String(e?.message || e)}`);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load(tenantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleWeekday = (k: number) => {
    setS((prev) => {
      const set = new Set(prev.closedWeekdays || []);
      if (set.has(k)) set.delete(k);
      else set.add(k);
      return { ...prev, closedWeekdays: Array.from(set).sort((a, b) => a - b) };
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-6 shadow-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Settings</h1>
              <p className="text-slate-300 mt-1">営業時間・スロット設定（tenant別）</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">tenantId</span>
              <input
                className="w-44 rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2 text-sm outline-none"
                value={tenantId}
                onChange={(e) =>
                  setTenantId(e.target.value.trim() || "default")
                }
              />
              <button
                className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-60"
                onClick={() => load(tenantId)}
                disabled={loading || saving}
                type="button"
              >
                再読み込み
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="text-sm text-slate-300">Open</div>
                <input
                  className="mt-2 w-full rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2 text-lg outline-none"
                  value={s.openTime}
                  onChange={(e) =>
                    setS((p) => ({
                      ...p,
                      openTime: normalizeTime(e.target.value, p.openTime),
                    }))
                  }
                  placeholder="10:00"
                />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="text-sm text-slate-300">Close</div>
                <input
                  className="mt-2 w-full rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2 text-lg outline-none"
                  value={s.closeTime}
                  onChange={(e) =>
                    setS((p) => ({
                      ...p,
                      closeTime: normalizeTime(e.target.value, p.closeTime),
                    }))
                  }
                  placeholder="19:00"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="text-sm text-slate-300">Slot Interval (min)</div>
                <input
                  type="number"
                  className="mt-2 w-full rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2 text-lg outline-none"
                  value={s.slotIntervalMin}
                  onChange={(e) =>
                    setS((p) => ({
                      ...p,
                      slotIntervalMin: Number(e.target.value || 0),
                    }))
                  }
                  min={5}
                  step={5}
                />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="text-sm text-slate-300">Slot Minutes</div>
                <input
                  type="number"
                  className="mt-2 w-full rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2 text-lg outline-none"
                  value={s.slotMinutes}
                  onChange={(e) =>
                    setS((p) => ({
                      ...p,
                      slotMinutes: Number(e.target.value || 0),
                    }))
                  }
                  min={5}
                  step={5}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-sm text-slate-300 mb-3">Closed Weekdays</div>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((w) => {
                  const on = (s.closedWeekdays || []).includes(w.k);
                  return (
                    <button
                      key={w.k}
                      className={
                        "rounded-full px-4 py-2 text-sm border " +
                        (on
                          ? "bg-rose-500/20 border-rose-400 text-rose-100"
                          : "bg-slate-900/40 border-slate-700 text-slate-200 hover:bg-slate-800/60")
                      }
                      onClick={() => toggleWeekday(w.k)}
                      type="button"
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {msg && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm">
                {msg}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                className="rounded-2xl border border-slate-700 bg-slate-800/60 px-5 py-3 text-sm hover:bg-slate-800 disabled:opacity-60"
                onClick={() => load(tenantId)}
                disabled={loading || saving}
                type="button"
              >
                {loading ? "読み込み中..." : "リセット"}
              </button>
              <button
                className="rounded-2xl bg-emerald-500/20 border border-emerald-400 px-5 py-3 text-sm hover:bg-emerald-500/30 disabled:opacity-60"
                onClick={save}
                disabled={saving || loading}
                type="button"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
