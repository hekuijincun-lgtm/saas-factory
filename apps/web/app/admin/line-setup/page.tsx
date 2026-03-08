"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveAdminSettings } from "../../lib/adminApi";
import { useAdminTenantId } from "@/src/lib/useAdminTenantId";

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
          placeholder="読み込み中..."
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

// ─── Mapping Diagnostic Card ──────────────────────────────────────────────────
type MappingInfo = {
  status: "loading" | "no_credentials" | "no_mapping" | "ok" | "mismatch" | "error";
  botUserId?: string | null;
  mappedTenantId?: string | null;
  hasToken?: boolean;
  error?: string;
};

type WebhookLog = {
  ts?: string;
  eventCount?: number;
  firstEventType?: string | null;
  firstText?: string | null;
  sigVerified?: boolean;
  hasSig?: boolean;
  hasReplyToken?: boolean;
  resolvedBy?: string;
  parseError?: string | null;
} | null;

function MappingDiagnosticCard({
  tenantId,
  mapping,
  onRemap,
  remapping,
  remapMessage,
  webhookUrl,
  lastWebhook,
  lastWebhookStatus,
}: {
  tenantId: string;
  mapping: MappingInfo;
  onRemap: () => void;
  remapping: boolean;
  remapMessage: string;
  webhookUrl: string;
  lastWebhook: WebhookLog;
  lastWebhookStatus: "loading" | "never" | "found" | "error";
}) {
  const statusConfig: Record<string, { label: string; cls: string; desc: string }> = {
    loading:        { label: "...",        cls: "bg-slate-100 text-slate-500 border-slate-200", desc: "確認中..." },
    no_credentials: { label: "未設定",     cls: "bg-slate-100 text-slate-500 border-slate-200", desc: "LINE credentials が未設定です。上のカードで設定してください。" },
    no_mapping:     { label: "未紐づけ",   cls: "bg-amber-50 text-amber-700 border-amber-200",  desc: "destination マッピングがありません。「修復」ボタンで作成してください。" },
    ok:             { label: "OK",         cls: "bg-emerald-50 text-emerald-700 border-emerald-200", desc: "正常に紐づいています。" },
    mismatch:       { label: "不一致",     cls: "bg-red-50 text-red-700 border-red-200",        desc: "マッピングが別テナントを指しています。「修復」ボタンで修正してください。" },
    error:          { label: "エラー",     cls: "bg-red-50 text-red-700 border-red-200",        desc: mapping.error ?? "診断エラー" },
  };
  const cfg = statusConfig[mapping.status] ?? statusConfig.error;
  const needsRemap = mapping.status === "no_mapping" || mapping.status === "mismatch";

  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <div className="text-base font-semibold text-slate-900">Webhook 紐づけ診断</div>
          <div className="text-sm text-slate-500">destination → tenantId マッピング状態</div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${cfg.cls}`}>
          {cfg.label}
        </span>
      </div>

      <div className="grid gap-3 px-5 py-5 text-sm">
        <div className="text-slate-600">{cfg.desc}</div>

        {mapping.botUserId && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Bot userId:</span>
            <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono">{mapping.botUserId}</code>
          </div>
        )}
        {mapping.mappedTenantId && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">マッピング先:</span>
            <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono">{mapping.mappedTenantId}</code>
            {mapping.mappedTenantId === tenantId
              ? <span className="text-emerald-600 text-xs font-semibold">= このテナント</span>
              : <span className="text-red-600 text-xs font-semibold">!= このテナント ({tenantId})</span>}
          </div>
        )}

        {/* Remap button */}
        {(needsRemap || mapping.status === "ok") && (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onRemap}
              disabled={remapping}
              className={[
                "rounded-xl px-4 py-2 text-sm font-semibold transition",
                needsRemap
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "border border-slate-300 text-slate-600 hover:bg-slate-50",
                remapping ? "opacity-50 cursor-not-allowed" : "",
              ].join(" ")}
            >
              {remapping ? "修復中..." : needsRemap ? "紐づけを修復 (Remap)" : "再マッピング"}
            </button>
            {!needsRemap && <span className="text-xs text-slate-400">問題なければ不要</span>}
          </div>
        )}

        {remapMessage && (
          <div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap">
            {remapMessage}
          </div>
        )}

        {/* Last webhook receipt */}
        <hr className="border-slate-100" />
        <div className="text-xs space-y-1">
          <div className="font-semibold text-slate-600">最後のWebhook受信:</div>
          {lastWebhookStatus === "loading" && <div className="text-slate-400">読み込み中...</div>}
          {lastWebhookStatus === "never" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
              Webhook を一度も受信していません。LINE Developers Console で Webhook URL と「Use webhook: ON」を確認してください。
            </div>
          )}
          {lastWebhookStatus === "error" && <div className="text-red-500">取得エラー</div>}
          {lastWebhookStatus === "found" && lastWebhook && (
            <div className="grid gap-1 rounded-lg border bg-slate-50 px-3 py-2 text-slate-600">
              <div><span className="text-slate-400">時刻:</span> {lastWebhook.ts}</div>
              <div><span className="text-slate-400">イベント数:</span> {lastWebhook.eventCount ?? 0}</div>
              {lastWebhook.firstEventType && <div><span className="text-slate-400">種類:</span> {lastWebhook.firstEventType}{lastWebhook.firstText ? ` — "${lastWebhook.firstText}"` : ""}</div>}
              <div>
                <span className="text-slate-400">署名:</span>{" "}
                {lastWebhook.hasSig === false
                  ? <span className="text-amber-600">なし（署名ヘッダ未送信）</span>
                  : lastWebhook.sigVerified
                    ? <span className="text-emerald-600">OK</span>
                    : <span className="text-red-600">NG（Channel Secret を確認）</span>}
                {" / "}
                <span className="text-slate-400">replyToken:</span> {lastWebhook.hasReplyToken ? "あり" : "なし"}
              </div>
              <div><span className="text-slate-400">解決方法:</span> {lastWebhook.resolvedBy}</div>
              {!lastWebhook.sigVerified && lastWebhook.hasSig && (
                <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700 text-[11px]">
                  Webhook は到達していますが署名検証に失敗しています。Channel Secret が正しいか確認してください。
                </div>
              )}
            </div>
          )}
        </div>

        {/* LINE Developer Console instructions */}
        <hr className="border-slate-100" />
        <div className="text-xs text-slate-500 space-y-1">
          <div className="font-semibold text-slate-600">LINE Developers Console で確認:</div>
          <div>1. Webhook URL を以下に設定:</div>
          <div className="flex items-center gap-2">
            <code className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono break-all">{webhookUrl}</code>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(webhookUrl).catch(() => {}); }}
              className="rounded border px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50 whitespace-nowrap"
            >
              Copy
            </button>
          </div>
          <div>2. 「Use webhook」を <strong>ON</strong> にする</div>
          <div>3. 「応答メッセージ」は OFF 推奨（AI応答と競合するため）</div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LineSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenantId } = useAdminTenantId();

  // Webhook URL to display — includes tenantId so LINE knows which tenant
  const [webhookUrl, setWebhookUrl] = React.useState("");
  React.useEffect(() => {
    setWebhookUrl(
      `${window.location.origin}/api/line/webhook`
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

  // Mapping diagnostic state
  const [mapping, setMapping] = React.useState<MappingInfo>({ status: "loading" });
  const [remapping, setRemapping] = React.useState(false);
  const [remapMessage, setRemapMessage] = React.useState("");

  // Last webhook receipt state
  const [lastWebhook, setLastWebhook] = React.useState<WebhookLog>(null);
  const [lastWebhookStatus, setLastWebhookStatus] = React.useState<"loading" | "never" | "found" | "error">("loading");

  const fetchLastWebhook = React.useCallback(async () => {
    try {
      const r = await fetch(`/api/proxy/admin/integrations/line/last-webhook?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
      if (!r.ok) { setLastWebhookStatus("error"); return; }
      const d = await r.json() as any;
      if (d.status === "never" || !d.log) {
        setLastWebhookStatus("never");
        setLastWebhook(null);
      } else {
        setLastWebhookStatus("found");
        setLastWebhook(d.log);
      }
    } catch {
      setLastWebhookStatus("error");
    }
  }, [tenantId]);

  // Fetch mapping status on mount and after save/remap
  const fetchMappingStatus = React.useCallback(async () => {
    try {
      const r = await fetch(`/api/proxy/admin/integrations/line/mapping-status?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
      if (!r.ok) { setMapping({ status: "error", error: `HTTP ${r.status}` }); return; }
      const d = await r.json() as any;
      setMapping({
        status: d.status ?? "error",
        botUserId: d.botUserId ?? null,
        mappedTenantId: d.mappedTenantId ?? null,
        hasToken: d.hasToken ?? false,
      });
    } catch (e: any) {
      setMapping({ status: "error", error: e?.message ?? "fetch failed" });
    }
  }, [tenantId]);

  React.useEffect(() => { fetchMappingStatus(); fetchLastWebhook(); }, [fetchMappingStatus, fetchLastWebhook]);

  async function onRemap() {
    setRemapping(true);
    setRemapMessage("");
    try {
      const r = await fetch(`/api/proxy/admin/integrations/line/remap?tenantId=${encodeURIComponent(tenantId)}`, {
        method: "POST",
      });
      const d = await r.json() as any;
      if (r.ok && d.ok) {
        setRemapMessage(`紐づけを修復しました (destination=${d.botUserId})${d.cleanedUpOld ? "\n旧マッピングをクリーンアップしました" : ""}`);
        await fetchMappingStatus();
      } else if (r.status === 409 && d.error === "destination_already_mapped") {
        setRemapMessage(`このLINE公式アカウントは既にテナント「${d.mappedTenantId}」に紐づいています。先にそのテナントのLINE設定を解除してください。`);
      } else {
        setRemapMessage(`修復に失敗: ${d.detail ?? d.error ?? "unknown error"}`);
      }
    } catch (e: any) {
      setRemapMessage(`エラー: ${e?.message ?? String(e)}`);
    } finally {
      setRemapping(false);
    }
  }

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
        channelId:          (creds.channelId ?? "").trim(),
        channelSecret:      (creds.channelSecret ?? "").trim(),
        channelAccessToken: (creds.channelAccessToken ?? "").trim(),
        bookingUrl:         (creds.bookingUrl ?? "").trim(),
      };

      // Step 1: save via general settings (saves channelId + onboarding flag)
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

      // Step 2: also call the dedicated save endpoint to trigger /v2/bot/info fetch
      let mappingInfo = "";
      try {
        const saveRes = await fetch(
          `/api/proxy/admin/integrations/line/messaging/save?tenantId=${encodeURIComponent(tenantId)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              channelAccessToken: payload.channelAccessToken,
              channelSecret:      payload.channelSecret,
              webhookUrl:         payload.bookingUrl || undefined,
            }),
          }
        );
        if (saveRes.ok) {
          const saveData = await saveRes.json() as any;
          if (saveData?.destinationMapped && saveData?.botUserId) {
            mappingInfo = `\nLINE チャンネルを tenantId=${tenantId} に紐づけました (destination=${saveData.botUserId})`;
          } else if (saveData?.botUserId === null) {
            mappingInfo = "\nbot info 取得に失敗しました。トークンを確認してください";
          }
        } else if (saveRes.status === 409) {
          const errData = await saveRes.json() as any;
          mappingInfo = `\nこのLINE Botは既にテナント「${errData.mappedTenantId}」に紐づいています`;
        }
      } catch {
        // best-effort — don't block the save
      }

      setMessage(`保存しました ✅${mappingInfo}`);
      setInitialCreds(payload);
      // Refresh mapping status after save
      await fetchMappingStatus();
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
      <MappingDiagnosticCard
        tenantId={tenantId}
        mapping={mapping}
        onRemap={onRemap}
        remapping={remapping}
        remapMessage={remapMessage}
        webhookUrl={webhookUrl}
        lastWebhook={lastWebhook}
        lastWebhookStatus={lastWebhookStatus}
      />
    </BookingLikeShell>
  );
}
