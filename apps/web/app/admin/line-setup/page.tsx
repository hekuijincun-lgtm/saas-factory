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
  const [status, setStatus] = useState<any>(null);
  const [cfg, setCfg] = useState<LineConfig>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      const s = await fetch("/api/admin/line/status", { cache: "no-store" }).then((r) => r.json());
      setStatus(s);

      const c = await fetch("/api/proxy/admin/line/config", { cache: "no-store" }).then((r) => r.json());
      setCfg(c);
    })().catch((e) => setMsg(String(e)));
  }, []);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/proxy/admin/line/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: cfg.channelId ?? "",
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

  
{/* ADMIN_LINE_SETUP_CARD_V1 */}
<div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
  <div className="w-full max-w-xl">
    <div className="overflow-hidden rounded-3xl bg-white shadow-lg">
      <div className="bg-slate-700 px-8 py-6">
        <div className="text-xs tracking-widest text-slate-200">ADMIN</div>
        <h1 className="mt-1 text-2xl font-bold text-white">LINE 連携設定</h1>
      </div>
      <div className="px-8 py-8">
<div style={{ padding: 24, maxWidth: 920 }}>
      <h1>Messaging API 設定</h1>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 16 }}>
        <h2>Status</h2>
        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(status, null, 2)}</pre>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 16 }}>
        <h2>Credentials</h2>

        <label>Channel ID（任意）</label>
        <input
          value={cfg.channelId ?? ""}
          onChange={(e) => setCfg({ ...cfg, channelId: e.target.value })}
          style={{ width: "100%", padding: 10, margin: "8px 0 16px" }}
        />

        <label>Channel Secret（必須）</label>
        <input
          value={cfg.channelSecret ?? ""}
          onChange={(e) => setCfg({ ...cfg, channelSecret: e.target.value })}
          placeholder="LINE Developers の Channel Secret"
          style={{ width: "100%", padding: 10, margin: "8px 0 16px" }}
        />

        <label>Channel Access Token（必須）</label>
        <input
          value={cfg.channelAccessToken ?? ""}
          onChange={(e) => setCfg({ ...cfg, channelAccessToken: e.target.value })}
          placeholder="LINE Developers の Messaging API アクセストークン"
          style={{ width: "100%", padding: 10, margin: "8px 0 16px" }}
        />

        <button onClick={save} disabled={saving} style={{ padding: "10px 16px" }}>
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 16 }}>
        <h2>Webhook</h2>
        <div>Webhook URL（LINE Developers に貼る）👇</div>
        <pre style={{ whiteSpace: "pre-wrap" }}>{cfg.webhookUrl ?? "(loading...)"}</pre>

        <button onClick={verifyWebhook} style={{ padding: "10px 16px" }}>
          Webhook を検証
        </button>

        <div style={{ marginTop: 12, color: "#666" }}>
          <div>LINE Developers 側の設定：</div>
          <ul>
            <li>Messaging API → Webhook URL を設定</li>
            <li>Webhook送信：ON</li>
            <li>応答メッセージ：OFF（推奨）</li>
          </ul>
        </div>
      </div>

      {msg && <div style={{ marginTop: 16 }}>{msg}</div>}
    </div>
  
      </div>
    </div>
  </div>
</div>
);
}





