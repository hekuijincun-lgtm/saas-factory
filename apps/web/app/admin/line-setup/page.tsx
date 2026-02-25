"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { readJson } from "../../../src/lib/json";
import { saveAdminSettings } from "../../lib/adminApi";
// ===============================
// 🔧 API Endpoints（必要ならここだけ変更）
// ===============================
const STATUS_URL = "/api/proxy/admin/integrations/line/status";
const CREDS_GET_URL  = "/api/proxy/admin/line/credentials";
const CREDS_SAVE_URL = "/api/proxy/admin/integrations/line/save";
// ===============================
// ✅ Booking 風 Shell（同梱で安全）
// ===============================
function BookingLikeShell({
  label = "ADMIN",
  title,
  children,
}: {
  label?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-6">
      <div className="w-full max-w-3xl overflow-hidden rounded-[32px] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
        <div className="bg-slate-700 px-10 py-8">
          <div className="text-[13px] tracking-[0.16em] font-semibold text-slate-200">
            {label}
          </div>
          <div className="mt-2 text-3xl font-bold text-white">{title}</div>
        </div>
        <div className="px-10 py-10 space-y-10">{children}</div>
      </div>
    </div>
  );
}

// ===============================
// 🟢 Status UI
// ===============================
type LineStatus = {
  ok?: boolean;
  stamp?: string;
  line_session_present?: boolean;
  debug?: boolean;
  [k: string]: any;
};

function StatusRow({
  label,
  active,
  activeText,
  inactiveText,
  tone = "normal",
}: {
  label: string;
  active?: boolean;
  activeText: string;
  inactiveText: string;
  tone?: "normal" | "warn";
}) {
  const dot = active
    ? "bg-emerald-500"
    : tone === "warn"
    ? "bg-amber-500"
    : "bg-rose-500";

  const pill = active
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : tone === "warn"
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-rose-50 text-rose-700 border-rose-200";

  return (
    <div className="flex items-center justify-between rounded-2xl border bg-white px-5 py-4 shadow-sm">
      <div className="text-sm font-medium text-slate-700">{label}</div>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${pill}`}>
          {active ? activeText : inactiveText}
        </span>
      </div>
    </div>
  );
}

function StatusCard({
  status,
  loading,
  onReload,
  error,
}: {
  status: LineStatus | null;
  loading: boolean;
  onReload: () => void;
  error: string;
}) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <div className="text-base font-semibold text-slate-900">Status</div>
          <div className="text-sm text-slate-500">接続状態（API から取得）</div>
        </div>
        <button
          type="button"
          onClick={onReload}
          className="rounded-xl border px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.99]"
        >
          {loading ? "Reloading…" : "↻ Reload"}
        </button>
      </div>

      <div className="grid gap-4 px-5 py-5">
        {error ? (
          <div className="rounded-xl border bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        <StatusRow
          label="Connection"
          active={!!status?.ok}
          activeText="Connected"
          inactiveText="Disconnected"
        />
        <StatusRow
          label="Session"
          active={!!status?.line_session_present}
          activeText="Active"
          inactiveText="Missing"
          tone="warn"
        />
        <StatusRow
          label="Debug"
          active={!status?.debug}
          activeText="Off"
          inactiveText="On"
          tone="warn"
        />

        <div className="text-xs text-slate-500">
          stamp: <span className="font-mono">{status?.stamp ?? "-"}</span>
        </div>
      </div>
    </div>
  );
}

// ===============================
// 🔐 Credentials UI（あなたのコード）
// ===============================
function maskValue(v: string, keep = 4) {
  if (!v) return "";
  if (v.length <= keep * 2) return "•".repeat(Math.max(8, v.length));
  return (
    v.slice(0, keep) +
    "•".repeat(Math.max(8, v.length - keep * 2)) +
    v.slice(-keep)
  );
}

function FieldRow({
  label,
  value,
  placeholder,
  onChange,
  mono = false,
  secret = false,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  mono?: boolean;
  secret?: boolean;
}) {
  const [reveal, setReveal] = React.useState(false);
  const shown = secret && !reveal ? maskValue(value) : value;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value ?? "");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value ?? "";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-700">{label}</div>
        <div className="flex items-center gap-2">
          {secret && (
            <button
              type="button"
              onClick={() => setReveal((x) => !x)}
              className="rounded-lg border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {reveal ? "🙈 Hide" : "👁️ Show"}
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            className="rounded-lg border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            📋 Copy
          </button>
        </div>
      </div>

      <input
        value={shown}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={[
          "w-full rounded-xl border bg-white px-3 py-2",
          "focus:outline-none focus:ring-2 focus:ring-slate-300",
          mono ? "font-mono text-[13px]" : "",
          secret && !reveal ? "tracking-wider text-slate-700" : "",
        ].join(" ")}
      />
    </div>
  );
}

type Creds = { channelId: string; channelSecret: string; channelAccessToken: string };

function CredentialsCard({
  creds,
  setCreds,
  saving,
  message,
  onSave,
  changed,
}: {
  creds: Creds;
  setCreds: React.Dispatch<React.SetStateAction<Creds>>;
  saving: boolean;
  message: string;
  onSave: () => Promise<void> | void;
  changed: boolean;
}) {
  const ready =
    /^\d+$/.test((creds.channelId ?? "").replace(/[^\d]/g, "")) &&
    (creds.channelSecret ?? "").length >= 8 &&
    (creds.channelAccessToken ?? "").length >= 20;

  const statusLabel = ready ? "Ready" : "Missing";
  const statusCls = ready
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-amber-50 text-amber-700 border-amber-200";

  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-white">
            <span className="text-sm font-bold">LI</span>
          </div>
          <div>
            <div className="text-base font-semibold text-slate-900">Credentials</div>
            <div className="text-sm text-slate-500">Messaging API の接続情報</div>
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusCls}`}>
          {statusLabel}
        </span>
      </div>

      <div className="grid gap-4 px-5 py-5">
        <FieldRow
          label="Channel ID（数字）"
          value={creds.channelId ?? ""}
          placeholder="例: 2008463345"
          mono
          onChange={(v) => setCreds((p) => ({ ...p, channelId: v }))}
        />
        <FieldRow
          label="Channel Secret"
          value={creds.channelSecret ?? ""}
          placeholder="LINE Developers の Channel Secret"
          mono
          secret
          onChange={(v) => setCreds((p) => ({ ...p, channelSecret: v }))}
        />
        <FieldRow
          label="Channel Access Token"
          value={creds.channelAccessToken ?? ""}
          placeholder="Messaging API のアクセストークン"
          mono
          secret
          onChange={(v) => setCreds((p) => ({ ...p, channelAccessToken: v }))}
        />

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500">
            {ready ? "入力OK ✅ 保存して反映しよ" : "不足があります（ID/Secret/Token）"}
          </div>

          <button
            type="button"
            onClick={onSave}
            disabled={!ready || saving || !changed}
            className={[
              "rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-[0.99]",
              !ready || saving || !changed
                ? "cursor-not-allowed bg-slate-200 text-slate-500"
                : "bg-slate-900 text-white hover:bg-slate-800",
            ].join(" ")}
          >
            {saving ? "Saving…" : changed ? "保存して次へ（メニュー作成）" : "保存済み"}
          </button>
        </div>

        {message ? (
          <div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {message}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function LineSetupPage() {
  const router = useRouter();
  const [status, setStatus] = React.useState<LineStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = React.useState(false);
  const [statusError, setStatusError] = React.useState("");

  const [creds, setCreds] = React.useState<Creds>({
    channelId: "",
    channelSecret: "",
    channelAccessToken: "",
  });
  const [initialCreds, setInitialCreds] = React.useState<Creds>({
    channelId: "",
    channelSecret: "",
    channelAccessToken: "",
  });

  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const changed =
    creds.channelId !== initialCreds.channelId ||
    creds.channelSecret !== initialCreds.channelSecret ||
    creds.channelAccessToken !== initialCreds.channelAccessToken;

  async function loadStatus() {
    setLoadingStatus(true);
    setStatusError("");
    try {
      const u = new URL(STATUS_URL, window.location.origin);
      u.searchParams.set("nocache", crypto.randomUUID());
      const r = await fetch(u.toString(), { method: "GET", cache: "no-store" });
      const j = (await r.json()) as LineStatus;
      const jj: { error?: string; message?: string } = await readJson<{ error?: string; message?: string }>(r);
      if (!r.ok) throw new Error(jj?.error ?? `status http ${r.status}`);
      setStatus(j);
    } catch (e: any) {
      setStatusError(e?.message ?? String(e));
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }

  async function loadCredsIfAvailable() {
    try {
      const u = new URL(CREDS_GET_URL, window.location.origin);
      u.searchParams.set("nocache", crypto.randomUUID());
      const r = await fetch(u.toString(), { method: "GET", cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as Partial<Creds>;
      const next: Creds = {
        channelId: j.channelId ?? "",
        channelSecret: j.channelSecret ?? "",
        channelAccessToken: j.channelAccessToken ?? "",
      };
      setCreds(next);
      setInitialCreds(next);
    } catch {}
  }

  async function onSave() {
    setSaving(true);
    setMessage("");
    try {
      const payload: Creds = {
        channelId: (creds.channelId ?? "").trim(),
        channelSecret: (creds.channelSecret ?? "").trim(),
        channelAccessToken: (creds.channelAccessToken ?? "").trim(),
      };

      const r = await fetch(CREDS_SAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({} as any));
      const jj: { error?: string; message?: string } = await readJson<{ error?: string; message?: string }>(r);
      if (!r.ok) throw new Error(jj?.error ?? `save http ${r.status}`);

      setMessage(jj?.message ?? "保存しました ✅");
      setInitialCreds(payload);
      await loadStatus();
      // onboarding: lineConnected=true を保存してメニュー作成ページへ遷移
      try {
        await saveAdminSettings({ onboarding: { lineConnected: true } });
      } catch {
        // onboarding 保存失敗は警告のみ（メイン保存は成功済み）
      }
      router.push("/admin/menu?onboarding=1");
    } catch (e: any) {
      setMessage(`保存に失敗: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  React.useEffect(() => {
    loadStatus();
    // loadCredsIfAvailable(); // disabled: GET endpoint currently broken
}, []);

  return (
    <BookingLikeShell label="ADMIN" title="LINE 連携設定">
      <StatusCard status={status} loading={loadingStatus} onReload={loadStatus} error={statusError} />
      <CredentialsCard creds={creds} setCreds={setCreds} saving={saving} message={message} onSave={onSave} changed={changed} />
    </BookingLikeShell>
  );
}














