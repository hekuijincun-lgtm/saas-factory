"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveAdminSettings } from "../../lib/adminApi";

// ─── Shell ───────────────────────────────────────────────────────────────────
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

// ─── Field rows ───────────────────────────────────────────────────────────────
function maskValue(v: string, keep = 4) {
  if (!v) return "";
  if (v.length <= keep * 2) return "•".repeat(Math.max(8, v.length));
  return v.slice(0, keep) + "•".repeat(Math.max(8, v.length - keep * 2)) + v.slice(-keep);
}

function FieldRow({
  label,
  value,
  placeholder,
  onChange,
  mono = false,
  secret = false,
  readOnly = false,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  mono?: boolean;
  secret?: boolean;
  readOnly?: boolean;
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
        readOnly={readOnly}
        onChange={(e) => !readOnly && onChange(e.target.value)}
        className={[
          "w-full rounded-xl border bg-white px-3 py-2",
          readOnly ? "bg-slate-50 text-slate-500 cursor-default" : "focus:outline-none focus:ring-2 focus:ring-slate-300",
          mono ? "font-mono text-[13px]" : "",
          secret && !reveal ? "tracking-wider text-slate-700" : "",
        ].join(" ")}
      />
    </div>
  );
}

// ─── Credentials card ─────────────────────────────────────────────────────────
type Creds = {
  channelId: string;
  channelSecret: string;
  channelAccessToken: string;
  bookingUrl: string;
};

function CredentialsCard({
  creds,
  setCreds,
  saving,
  message,
  onSave,
  changed,
  webhookUrl,
}: {
  creds: Creds;
  setCreds: React.Dispatch<React.SetStateAction<Creds>>;
  saving: boolean;
  message: string;
  onSave: () => Promise<void> | void;
  changed: boolean;
  webhookUrl: string;
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
      {/* header */}
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
        {/* Webhook URL — read-only, for pasting into LINE Developers */}
        <FieldRow
          label="Webhook URL（LINE Developers に貼り付け）"
          value={webhookUrl}
          readOnly
          mono
          onChange={() => {}}
        />

        <hr className="border-slate-100" />

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

        <hr className="border-slate-100" />

        {/* Booking URL — optional override */}
        <FieldRow
          label="予約ページURL（任意・未入力で自動）"
          value={creds.bookingUrl ?? ""}
          placeholder="例: https://example.com/booking?tenantId=default"
          mono
          onChange={(v) => setCreds((p) => ({ ...p, bookingUrl: v }))}
        />

        {/* actions */}
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LineSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId") ?? "default";

  // Webhook URL to display — includes tenantId so LINE knows which tenant
  const [webhookUrl, setWebhookUrl] = React.useState("");
  React.useEffect(() => {
    setWebhookUrl(
      `${window.location.origin}/api/line/webhook?tenantId=${encodeURIComponent(tenantId)}`
    );
  }, [tenantId]);

  const [creds, setCreds] = React.useState<Creds>({
    channelId: "",
    channelSecret: "",
    channelAccessToken: "",
    bookingUrl: "",
  });
  const [initialCreds, setInitialCreds] = React.useState<Creds>({
    channelId: "",
    channelSecret: "",
    channelAccessToken: "",
    bookingUrl: "",
  });

  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const changed =
    creds.channelId !== initialCreds.channelId ||
    creds.channelSecret !== initialCreds.channelSecret ||
    creds.channelAccessToken !== initialCreds.channelAccessToken ||
    creds.bookingUrl !== initialCreds.bookingUrl;

  async function onSave() {
    setSaving(true);
    setMessage("");
    try {
      const payload: Creds = {
        channelId:        (creds.channelId ?? "").trim(),
        channelSecret:    (creds.channelSecret ?? "").trim(),
        channelAccessToken: (creds.channelAccessToken ?? "").trim(),
        bookingUrl:       (creds.bookingUrl ?? "").trim(),
      };

      // 既存の /admin/settings に統合して保存
      await saveAdminSettings(
        {
          integrations: {
            line: {
              connected: true,
              channelId:          payload.channelId,
              channelSecret:      payload.channelSecret,
              channelAccessToken: payload.channelAccessToken,
              ...(payload.bookingUrl ? { bookingUrl: payload.bookingUrl } : {}),
            },
          },
          onboarding: { lineConnected: true },
        },
        tenantId
      );

      setMessage("保存しました ✅");
      setInitialCreds(payload);
      router.push(`/admin/menu?tenantId=${tenantId}&onboarding=1`);
    } catch (e: any) {
      setMessage(`保存に失敗: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <BookingLikeShell label="ADMIN" title="LINE 連携設定">
      <CredentialsCard
        creds={creds}
        setCreds={setCreds}
        saving={saving}
        message={message}
        onSave={onSave}
        changed={changed}
        webhookUrl={webhookUrl}
      />
    </BookingLikeShell>
  );
}
