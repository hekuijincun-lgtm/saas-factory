import { BookingLikeShell } from "@/components/BookingLikeShell";
"use client";

import { useEffect, useState } from "react";

type LineConfig = {
  channelId?: string | null;
  channelSecret?: string | null;
  channelAccessToken?: string | null;
  webhookUrl?: string | null;
  updatedAt?: string | null;
};

export default function LineSetupPage() {
  const [status, setStatus

<div className="space-y-3">
  <div className="flex items-center gap-2">
    <span className="h-2.5 w-2.5 rounded-full bg-green-500"></span>
    <span className="text-sm font-medium text-slate-800">Connected</span>
  </div>

  <div className="flex items-center gap-2">
    <span className="h-2.5 w-2.5 rounded-full bg-green-500"></span>
    <span className="text-sm font-medium text-slate-800">Session Active</span>
  </div>

  <div className="flex items-center gap-2">
    <span className="h-2.5 w-2.5 rounded-full bg-slate-400"></span>
    <span className="text-sm text-slate-600">Debug: Off</span>
  </div>
</div>);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const s = await fetch("/api/admin/line/status", { cache: "no-store" }).then((r) => r.json());
        setStatus

<div className="space-y-3">
  <div className="flex items-center gap-2">
    <span className="h-2.5 w-2.5 rounded-full bg-green-500"></span>
    <span className="text-sm font-medium text-slate-800">Connected</span>
  </div>

  <div className="flex items-center gap-2">
    <span className="h-2.5 w-2.5 rounded-full bg-green-500"></span>
    <span className="text-sm font-medium text-slate-800">Session Active</span>
  </div>

  <div className="flex items-center gap-2">
    <span className="h-2.5 w-2.5 rounded-full bg-slate-400"></span>
    <span className="text-sm text-slate-600">Debug: Off</span>
  </div>
</div>).then((r) => r.json());
        // masked は secret/token そのものは返らない想定なので、入力は空のままにする
        setCfg((prev) => ({
          ...prev,
          channelId: c?.masked?.clientIdLast4 ? "****" + c.masked.clientIdLast4 : (prev.channelId ?? ""),
          webhookUrl: s?.webhookUrl ?? prev.webhookUrl ?? null,
          updatedAt: s?.updatedAt ?? prev.updatedAt ?? null,
        }));
      } catch (e: any) {
        setMsg("❌ " + (e?.message ?? String(e)));
      }
    })();
  }, []);

  async function save() {
    setMsg("");
    setSaving(true);
    try {
      // Pages が PUT を弾く前提なので、POST で受けて proxy 側で upstream PUT に変換する
      const res = await fetch("/api/proxy/admin/line/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: (cfg.channelId ?? "").replace(/[^\d]/g, ""), // 数字だけ（念のため）
          channelSecret: cfg.channelSecret ?? "",
          channelAccessToken: cfg.channelAccessToken ?? "",
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "save_failed");
      setMsg("✅ 保存したよ！");
    } catch (e: any) {
      setMsg("❌ " + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function verifyWebhook() {
    setMsg("");
    try {
      const res = await fetch("/api/admin/line/webhook/verify", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "verify_failed");
      setMsg("✅ Webhook OK（疎通OK）");
    } catch (e: any) {
      setMsg("❌ " + (e?.message ?? String(e)));
    }
  }

  return (`r`n    <BookingLikeShell label="ADMIN" title="LINE 連携設定">`r`n<div className="min-h-screen bg-slate-50 flex items-start justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="space-y-6">
          <div className="bg-slate-700 px-10 py-8">
            <div className="text-xs tracking-widest text-slate-200">ADMIN</div>
            <h1 className="mt-1 text-2xl font-bold text-white">LINE 連携設定</h1>
          </div>

          <div className="px-10 py-10 space-y-10">
            <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
              <h2>Status

<div className="space-y-3">
  <div className="flex items-center gap-2">
    <span className="h-2.5 w-2.5 rounded-full bg-green-500"></span>
    <span className="text-sm font-medium text-slate-800">Connected</span>
  </div>

  <div className="flex items-center gap-2">
    <span className="h-2.5 w-2.5 rounded-full bg-green-500"></span>
    <span className="text-sm font-medium text-slate-800">Session Active</span>
  </div>

  <div className="flex items-center gap-2">
    <span className="h-2.5 w-2.5 rounded-full bg-slate-400"></span>
    <span className="text-sm text-slate-600">Debug: Off</span>
  </div>
</div>}>{JSON.stringify(status, null, 2)}</pre>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 16 }}>
              <h2>Credentials</h2>

              <label>中..." : "保存"}
              </button>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 16 }}>
              <h2>Webhook</h2>
              <div>Webhook URL（LINE Developers に貼る）👇</div>
              <pre style={{ whiteSpace: "pre-wrap" }}>{cfg.webhookUrl ?? "{typeof window==="undefined" ? "" : new URL("/api/line/webhook", window.location.origin).toString()}"}</pre>

              <button onClick={verifyWebhook} style={{ padding: "10px 16px" }}>
                Webhook を検証
              </button>
            </div>

            {msg && <div style={{ marginTop: 16 }}>{msg}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}







