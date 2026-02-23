"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [tenantId, setTenantId] = useState("default");
  const [loading, setLoading] = useState(false);

  const [s, setS] = useState({
    openTime: "",
    closeTime: "",
    slotIntervalMin: 30,
    slotMinutes: 30,
    closedWeekdays: [] as number[],
  });

  const api = {
    get: (tid: string) =>
      `/api/proxy/admin/settings?tenantId=${tid}`,
    put: (tid: string) =>
      `/api/proxy/admin/settings?tenantId=${tid}`,
  };

  const load = async () => {
    setLoading(true);
    const r = await fetch(api.get(tenantId), { cache: "no-store" });
    const j: any = await r.json();
    if (!j.ok) {
      alert("取得失敗");
      setLoading(false);
      return;
    }
    const d = j.data || {};
    setS({
      openTime: d.openTime || "",
      closeTime: d.closeTime || "",
      slotIntervalMin: d.slotIntervalMin || 30,
      slotMinutes: d.slotMinutes || 30,
      closedWeekdays: d.closedWeekdays || [],
    });
    setLoading(false);
  };

  const save = async () => {
    const r = await fetch(api.put(tenantId), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(s),
    });
    const j: any = await r.json();
    if (!j.ok) return alert("保存失敗");
    alert("保存しました");
  };

  useEffect(() => {
    load();
  }, [tenantId]);

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ページヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              営業時間・スロット設定
            </h1>
            <p className="text-sm text-muted-foreground">
              予約枠の基本設定を管理します。
            </p>
          </div>
        </div>

        {/* 設定カード */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-6">

          <div className="flex gap-4 items-center">
            <span className="text-sm text-gray-500">tenantId</span>
            <input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="border rounded px-3 py-2"
            />
            <button
              onClick={load}
              className="bg-gray-200 px-4 py-2 rounded"
            >
              再読み込み
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm text-gray-600">Open</label>
              <input
                value={s.openTime}
                onChange={(e) => setS({ ...s, openTime: e.target.value })}
                className="border rounded w-full px-3 py-2 mt-1"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Close</label>
              <input
                value={s.closeTime}
                onChange={(e) => setS({ ...s, closeTime: e.target.value })}
                className="border rounded w-full px-3 py-2 mt-1"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Slot Interval (min)</label>
              <input
                type="number"
                value={s.slotIntervalMin}
                onChange={(e) =>
                  setS({ ...s, slotIntervalMin: Number(e.target.value) })
                }
                className="border rounded w-full px-3 py-2 mt-1"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Slot Minutes</label>
              <input
                type="number"
                value={s.slotMinutes}
                onChange={(e) =>
                  setS({ ...s, slotMinutes: Number(e.target.value) })
                }
                className="border rounded w-full px-3 py-2 mt-1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={load}
              className="bg-gray-200 px-4 py-2 rounded"
            >
              リセット
            </button>
            <button
              onClick={save}
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              保存
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
