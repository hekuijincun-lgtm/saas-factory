"use client";

import { useEffect, useState, useCallback } from "react";
import AdminTopBar from "../../_components/ui/AdminTopBar";
import { Bot, Plus, Trash2, Save, RefreshCw, ChevronDown, ChevronUp, MessageSquare, TrendingUp, Clock, Send, ExternalLink } from "lucide-react";
import { useAdminTenantId } from "@/src/lib/useAdminTenantId";

// ─── Defaults ─────────────────────────────────────────────────────────────
const DEFAULT_HARD_RULES =
  "公式情報を確認せずに料金・空き状況を断定しない\n医療・違法行為の助言はしない\n予約が作成されたと断言しない（予約はフォーム入力のみ）";

// ─── Types ─────────────────────────────────────────────────────────────────

interface AISettings {
  enabled: boolean;
  voice: string;
  answerLength: string;
  character: string;
}

interface AIPolicy {
  prohibitedTopics: string[];
  hardRules: string[];
}

interface AIRetention {
  enabled: boolean;
  templates: any[];
  followupDelayMin: number;
  followupTemplate: string;
  nextRecommendationDaysByMenu: Record<string, number>;
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  enabled: boolean;
  updatedAt: number;
}

interface UpsellItem {
  id: string;
  keyword: string;
  message: string;
  enabled: boolean;
}

interface AIUpsell {
  enabled: boolean;
  items: UpsellItem[];
}

interface FollowupEntry {
  id: string;
  line_user_id: string | null;
  customer_name: string | null;
  slot_start: string | null;
  followup_at: string | null;
  followup_status: string | null;
  followup_sent_at: string | null;
  followup_error: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function apiBase(path: string, tenantId: string): string {
  return `/api/proxy/${path}?tenantId=${encodeURIComponent(tenantId)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("ja-JP"); } catch { return iso; }
}

// ─── UI Primitives ─────────────────────────────────────────────────────────

function SectionCard({
  title,
  icon,
  children,
  collapsible = false,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
      <button
        type="button"
        onClick={() => collapsible && setOpen((v) => !v)}
        className={[
          "w-full flex items-center justify-between px-6 py-4 border-b border-gray-100",
          collapsible ? "cursor-pointer hover:bg-gray-50 transition-colors" : "cursor-default",
        ].join(" ")}
      >
        <div className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
          {icon}
          {title}
        </div>
        {collapsible && (open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />)}
      </button>
      {open && <div className="px-6 py-5">{children}</div>}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={[
          "relative w-10 h-5 rounded-full transition-colors duration-200",
          checked ? "bg-indigo-500" : "bg-gray-300",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 border-b border-gray-50 last:border-0">
      <label className="text-sm font-medium text-gray-600 sm:w-44 shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function SaveButton({ saving, onClick, label = "保存" }: { saving: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      disabled={saving}
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-colors"
    >
      {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
      {saving ? "保存中..." : label}
    </button>
  );
}

function StatusBanner({ msg, kind }: { msg: string; kind: "success" | "error" | null }) {
  if (!msg || !kind) return null;
  return (
    <div
      className={[
        "px-4 py-2 rounded-lg text-sm font-medium mb-4",
        kind === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200",
      ].join(" ")}
    >
      {msg}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    pending:  "bg-yellow-100 text-yellow-800",
    sent:     "bg-green-100 text-green-800",
    skipped:  "bg-gray-100 text-gray-600",
    failed:   "bg-red-100 text-red-700",
  };
  const cls = map[status ?? ""] ?? "bg-gray-100 text-gray-500";
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${cls}`}>{status ?? "—"}</span>;
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function AdminAIClient() {
  const { status: tenantStatus, tenantId } = useAdminTenantId();

  // --- data state ---
  const [settings, setSettings] = useState<AISettings>({
    enabled: false, voice: "friendly", answerLength: "normal", character: "",
  });
  const [policy, setPolicy] = useState<AIPolicy>({ prohibitedTopics: [], hardRules: [] });
  const [retention, setRetention] = useState<AIRetention>({
    enabled: false, templates: [],
    followupDelayMin: 43200,
    followupTemplate: "{{customerName}}様、先日はご来店ありがとうございました！またのご来店をお待ちしております。",
    nextRecommendationDaysByMenu: {},
  });
  const [faq, setFaq] = useState<FAQItem[]>([]);
  const [upsell, setUpsell] = useState<AIUpsell>({ enabled: false, items: [] });
  const [followups, setFollowups] = useState<FollowupEntry[]>([]);

  // --- form state for new FAQ ---
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");

  // --- form state for new Upsell item ---
  const [newUkw, setNewUkw] = useState("");
  const [newUmsg, setNewUmsg] = useState("");

  // --- UI state ---
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingRetention, setSavingRetention] = useState(false);
  const [savingUpsell, setSavingUpsell] = useState(false);
  const [addingFaq, setAddingFaq] = useState(false);
  const [deletingFaqId, setDeletingFaqId] = useState<string | null>(null);
  const [addingUpsell, setAddingUpsell] = useState(false);
  const [deletingUpsellId, setDeletingUpsellId] = useState<string | null>(null);
  const [loadingFollowups, setLoadingFollowups] = useState(false);
  const [banner, setBanner] = useState<{ msg: string; kind: "success" | "error" } | null>(null);

  // --- test chat state ---
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "ai"; text: string; suggestedActions?: { type?: string; label?: string; url?: string }[]; intent?: string }[]
  >([]);
  const [chatSending, setChatSending] = useState(false);

  // policy form: textarea helpers（未保存時は日本語デフォルトを表示）
  const [hardRulesText, setHardRulesText] = useState(DEFAULT_HARD_RULES);
  const [prohibitedText, setProhibitedText] = useState("");

  // retention JSON textarea (legacy templates)
  const [retentionTemplatesText, setRetentionTemplatesText] = useState("[]");

  // --- Load ---
  const loadAll = useCallback(async (tid: string) => {
    setLoading(true);
    setLoadErr(null);
    try {
      const [mainRes, faqRes, upsellRes] = await Promise.all([
        fetch(apiBase("admin/ai", tid)),
        fetch(apiBase("admin/ai/faq", tid)),
        fetch(apiBase("admin/ai/upsell", tid)),
      ]);
      const main = await mainRes.json() as any;
      const faqData = await faqRes.json() as any;
      const upsellData = await upsellRes.json() as any;

      if (main?.settings) setSettings({ ...main.settings });
      if (main?.policy) {
        setPolicy({ ...main.policy });
        const rules = main.policy.hardRules || [];
        setHardRulesText(rules.length > 0 ? rules.join("\n") : DEFAULT_HARD_RULES);
        setProhibitedText((main.policy.prohibitedTopics || []).join(", "));
      }
      if (main?.retention) {
        setRetention((r) => ({ ...r, ...main.retention }));
        setRetentionTemplatesText(JSON.stringify(main.retention.templates || [], null, 2));
      }
      if (Array.isArray(faqData?.faq)) setFaq(faqData.faq);
      if (upsellData?.upsell) setUpsell({ enabled: false, items: [], ...upsellData.upsell });
    } catch (e: any) {
      setLoadErr("データ読み込みに失敗しました: " + String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFollowups = useCallback(async (tid: string) => {
    setLoadingFollowups(true);
    try {
      const res = await fetch(apiBase("admin/ai/followups", tid));
      const data = await res.json() as any;
      if (Array.isArray(data?.followups)) setFollowups(data.followups);
    } catch { /* ignore */ } finally {
      setLoadingFollowups(false);
    }
  }, []);

  useEffect(() => {
    if (tenantStatus === "loading") return;
    loadAll(tenantId);
  }, [loadAll, tenantId, tenantStatus]);

  const flash = (msg: string, kind: "success" | "error") => {
    setBanner({ msg, kind });
    setTimeout(() => setBanner(null), 3500);
  };

  // ── Test Chat ──────────────────────────────────────────────────────────

  const sendTestChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatSending) return;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: msg }]);
    setChatSending(true);
    try {
      const r = await fetch(apiBase("ai/chat", tenantId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg, tenantId }),
      });
      const j = await r.json() as any;
      if (j?.ok && j?.answer) {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text: j.answer,
            suggestedActions: Array.isArray(j.suggestedActions) ? j.suggestedActions : [],
            intent: j.intent ?? undefined,
          },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          { role: "ai", text: `[エラー] ${j?.error ?? "応答なし"}` },
        ]);
      }
    } catch (e: any) {
      setChatMessages((prev) => [
        ...prev,
        { role: "ai", text: `[通信エラー] ${String(e?.message ?? e)}` },
      ]);
    } finally {
      setChatSending(false);
    }
  };

  // ── Save: Settings ─────────────────────────────────────────────────────

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const r = await fetch(apiBase("admin/ai", tenantId), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const j = await r.json() as any;
      if (j?.ok) flash("基本設定を保存しました", "success");
      else flash("保存失敗: " + (j?.error || "unknown"), "error");
    } catch (e: any) {
      flash("保存エラー: " + String(e?.message ?? e), "error");
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Save: Policy ───────────────────────────────────────────────────────

  const savePolicy = async () => {
    setSavingPolicy(true);
    const hardRules = hardRulesText.split("\n").map((s) => s.trim()).filter(Boolean);
    const prohibitedTopics = prohibitedText.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      const r = await fetch(apiBase("admin/ai", tenantId), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ policy: { hardRules, prohibitedTopics } }),
      });
      const j = await r.json() as any;
      if (j?.ok) flash("ポリシーを保存しました", "success");
      else flash("保存失敗: " + (j?.error || "unknown"), "error");
    } catch (e: any) {
      flash("保存エラー: " + String(e?.message ?? e), "error");
    } finally {
      setSavingPolicy(false);
    }
  };

  // ── Save: Retention ────────────────────────────────────────────────────

  const saveRetention = async () => {
    setSavingRetention(true);
    let templates: any[] = [];
    try {
      templates = JSON.parse(retentionTemplatesText);
    } catch {
      flash("テンプレートのJSONが不正です", "error");
      setSavingRetention(false);
      return;
    }
    try {
      const r = await fetch(apiBase("admin/ai", tenantId), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ retention: { ...retention, templates } }),
      });
      const j = await r.json() as any;
      if (j?.ok) flash("リピート促進設定を保存しました", "success");
      else flash("保存失敗: " + (j?.error || "unknown"), "error");
    } catch (e: any) {
      flash("保存エラー: " + String(e?.message ?? e), "error");
    } finally {
      setSavingRetention(false);
    }
  };

  // ── Save: Upsell ──────────────────────────────────────────────────────

  const saveUpsell = async (updated?: AIUpsell) => {
    setSavingUpsell(true);
    const payload = updated ?? upsell;
    try {
      const r = await fetch(apiBase("admin/ai/upsell", tenantId), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json() as any;
      if (j?.ok) {
        if (j.upsell) setUpsell(j.upsell);
        flash("アップセル設定を保存しました", "success");
      } else {
        flash("保存失敗: " + (j?.error || "unknown"), "error");
      }
    } catch (e: any) {
      flash("保存エラー: " + String(e?.message ?? e), "error");
    } finally {
      setSavingUpsell(false);
    }
  };

  // ── Add FAQ ────────────────────────────────────────────────────────────

  const addFaq = async () => {
    if (!newQ.trim() || !newA.trim()) { flash("質問と回答を入力してください", "error"); return; }
    setAddingFaq(true);
    try {
      const r = await fetch(apiBase("admin/ai/faq", tenantId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: newQ.trim(), answer: newA.trim() }),
      });
      const j = await r.json() as any;
      if (j?.ok && j?.item) {
        setFaq((prev) => [...prev, j.item]);
        setNewQ(""); setNewA("");
        flash("FAQを追加しました", "success");
      } else {
        flash("追加失敗: " + (j?.error || "unknown"), "error");
      }
    } catch (e: any) {
      flash("追加エラー: " + String(e?.message ?? e), "error");
    } finally {
      setAddingFaq(false);
    }
  };

  // ── Delete FAQ ─────────────────────────────────────────────────────────

  const deleteFaq = async (id: string) => {
    setDeletingFaqId(id);
    try {
      const r = await fetch(
        `/api/proxy/admin/ai/faq/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`,
        { method: "DELETE" }
      );
      const j = await r.json() as any;
      if (j?.ok) { setFaq((prev) => prev.filter((f) => f.id !== id)); flash("FAQを削除しました", "success"); }
      else flash("削除失敗: " + (j?.error || "unknown"), "error");
    } catch (e: any) {
      flash("削除エラー: " + String(e?.message ?? e), "error");
    } finally {
      setDeletingFaqId(null);
    }
  };

  // ── Add Upsell item ────────────────────────────────────────────────────

  const addUpsellItem = async () => {
    if (!newUkw.trim() || !newUmsg.trim()) { flash("キーワードとメッセージを入力してください", "error"); return; }
    setAddingUpsell(true);
    const newItem: UpsellItem = {
      id: crypto.randomUUID(),
      keyword: newUkw.trim(),
      message: newUmsg.trim(),
      enabled: true,
    };
    const updated = { ...upsell, items: [...upsell.items, newItem] };
    setUpsell(updated);
    setNewUkw(""); setNewUmsg("");
    await saveUpsell(updated);
    setAddingUpsell(false);
  };

  // ── Delete Upsell item ─────────────────────────────────────────────────

  const deleteUpsellItem = async (id: string) => {
    setDeletingUpsellId(id);
    const updated = { ...upsell, items: upsell.items.filter((x) => x.id !== id) };
    setUpsell(updated);
    await saveUpsell(updated);
    setDeletingUpsellId(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <AdminTopBar title="AI接客設定" subtitle="AIチャットボットの動作・FAQ・ポリシーを管理します。" />
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> 読み込み中...
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="AI接客設定" subtitle="AIチャットボットの動作・FAQ・ポリシーを管理します。" />

      <div className="max-w-3xl mx-auto">
        {loadErr && (
          <div className="mb-4 px-4 py-3 bg-red-50 text-red-800 border border-red-200 rounded-lg text-sm">{loadErr}</div>
        )}

        <StatusBanner msg={banner?.msg ?? ""} kind={banner?.kind ?? null} />

        {/* ── 1. 基本設定 ──────────────────────────────────────────── */}
        <SectionCard title="基本設定" icon={<Bot className="w-4 h-4 text-indigo-500" />}>
          <div className="space-y-1">
            <FieldRow label="AI接客を有効化">
              <Toggle
                checked={settings.enabled}
                onChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
                label={settings.enabled ? "有効" : "無効"}
              />
            </FieldRow>
            <FieldRow label="トーン（voice）">
              <select
                value={settings.voice}
                onChange={(e) => setSettings((s) => ({ ...s, voice: e.target.value }))}
                className="w-full sm:w-56 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="friendly">フレンドリー（friendly）</option>
                <option value="formal">フォーマル（formal）</option>
                <option value="casual">カジュアル（casual）</option>
                <option value="professional">プロフェッショナル（professional）</option>
              </select>
            </FieldRow>
            <FieldRow label="回答の長さ">
              <select
                value={settings.answerLength}
                onChange={(e) => setSettings((s) => ({ ...s, answerLength: e.target.value }))}
                className="w-full sm:w-56 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="short">短め（short）</option>
                <option value="normal">普通（normal）</option>
                <option value="detailed">詳細（detailed）</option>
              </select>
            </FieldRow>
            <FieldRow label="キャラクター設定">
              <input
                type="text"
                value={settings.character}
                onChange={(e) => setSettings((s) => ({ ...s, character: e.target.value }))}
                placeholder="例: 丁寧で明るい女性スタッフ"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </FieldRow>
          </div>
          <div className="mt-4 flex justify-end">
            <SaveButton saving={savingSettings} onClick={saveSettings} />
          </div>
        </SectionCard>

        {/* ── 2. ポリシー ──────────────────────────────────────────── */}
        <SectionCard title="禁止事項・ポリシー" collapsible>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ハードルール（1行1ルール）</label>
              <textarea
                rows={5}
                value={hardRulesText}
                onChange={(e) => setHardRulesText(e.target.value)}
                placeholder={"例:\nDo not confirm prices or availability without checking official info.\nDo not provide medical/illegal advice."}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y"
              />
              <p className="text-xs text-gray-400 mt-1">1行に1つのルールを記述してください。</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">禁止トピック（カンマ区切り）</label>
              <input
                type="text"
                value={prohibitedText}
                onChange={(e) => setProhibitedText(e.target.value)}
                placeholder="例: 政治, 宗教, 競合他社"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <SaveButton saving={savingPolicy} onClick={savePolicy} label="ポリシーを保存" />
          </div>
        </SectionCard>

        {/* ── 3. FAQ ───────────────────────────────────────────────── */}
        <SectionCard title={`FAQ管理（${faq.length}件）`} icon={<MessageSquare className="w-4 h-4 text-indigo-500" />} collapsible>
          {/* 追加フォーム */}
          <div className="bg-gray-50 rounded-lg p-4 mb-5 border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">新規FAQ追加</p>
            <div className="space-y-2">
              <input
                type="text"
                value={newQ}
                onChange={(e) => setNewQ(e.target.value)}
                placeholder="質問（例: 予約のキャンセルはできますか？）"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <textarea
                rows={2}
                value={newA}
                onChange={(e) => setNewA(e.target.value)}
                placeholder="回答（例: はい、予約日の2日前までキャンセル可能です。）"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={addingFaq}
                onClick={addFaq}
                className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {addingFaq ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                追加
              </button>
            </div>
          </div>
          {/* FAQ一覧 */}
          {faq.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">FAQがまだありません。上のフォームから追加してください。</p>
          ) : (
            <div className="space-y-3">
              {faq.map((item) => (
                <div key={item.id} className="flex gap-3 p-4 bg-white border border-gray-100 rounded-lg shadow-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 mb-1 break-words">Q: {item.question}</p>
                    <p className="text-sm text-gray-600 break-words">A: {item.answer}</p>
                    <p className="text-[10px] text-gray-300 mt-1 font-mono">{item.id.slice(0, 8)}</p>
                  </div>
                  <button
                    type="button"
                    disabled={deletingFaqId === item.id}
                    onClick={() => deleteFaq(item.id)}
                    className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
                    aria-label="削除"
                  >
                    {deletingFaqId === item.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── 4. アップセル ────────────────────────────────────────── */}
        <SectionCard title="アップセル設定" icon={<TrendingUp className="w-4 h-4 text-emerald-500" />} collapsible>
          <div className="mb-4">
            <Toggle
              checked={upsell.enabled}
              onChange={(v) => setUpsell((u) => ({ ...u, enabled: v }))}
              label="アップセルメッセージを有効化"
            />
            <p className="text-xs text-gray-400 mt-2">
              キーワードがユーザーの発言またはAI回答に含まれる場合、指定メッセージを回答末尾に追記します。
            </p>
          </div>

          {/* 追加フォーム */}
          <div className="bg-gray-50 rounded-lg p-4 mb-5 border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">新規アップセル追加</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={newUkw}
                onChange={(e) => setNewUkw(e.target.value)}
                placeholder="キーワード（例: カット, ヘアカラー）"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <input
                type="text"
                value={newUmsg}
                onChange={(e) => setNewUmsg(e.target.value)}
                placeholder="追加メッセージ（例: セットもお得です！）"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={addingUpsell}
                onClick={addUpsellItem}
                className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {addingUpsell ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                追加
              </button>
            </div>
          </div>

          {/* アップセル一覧 */}
          {upsell.items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">アップセル設定がありません。上のフォームから追加してください。</p>
          ) : (
            <div className="space-y-2 mb-4">
              {upsell.items.map((item) => (
                <div key={item.id} className="flex gap-3 items-center p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                  <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-2">
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded truncate">
                      🔑 {item.keyword}
                    </span>
                    <span className="text-xs text-gray-600 truncate">{item.message}</span>
                  </div>
                  <button
                    type="button"
                    disabled={deletingUpsellId === item.id}
                    onClick={() => deleteUpsellItem(item.id)}
                    className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
                    aria-label="削除"
                  >
                    {deletingUpsellId === item.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <SaveButton saving={savingUpsell} onClick={() => saveUpsell()} label="アップセル設定を保存" />
          </div>
        </SectionCard>

        {/* ── 5. リピート促進 ──────────────────────────────────────── */}
        <SectionCard title="リピート促進・フォローアップ" collapsible>
          <div className="space-y-4">
            <Toggle
              checked={retention.enabled}
              onChange={(v) => setRetention((r) => ({ ...r, enabled: v }))}
              label="フォローアップLINE送信を有効化"
            />

            <FieldRow label="送信タイミング（日後）">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={Math.round((retention.followupDelayMin || 43200) / 1440)}
                  onChange={(e) => {
                    const days = Math.max(1, Math.min(365, Number(e.target.value) || 30));
                    setRetention((r) => ({ ...r, followupDelayMin: days * 1440 }));
                  }}
                  className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <span className="text-sm text-gray-500">日後に送信</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">予約完了から指定日数後にLINEメッセージを送信します。</p>
            </FieldRow>

            <FieldRow label="フォローアップ文面">
              <textarea
                rows={3}
                value={retention.followupTemplate}
                onChange={(e) => setRetention((r) => ({ ...r, followupTemplate: e.target.value }))}
                placeholder={"{{customerName}}様、先日はご来店ありがとうございました！またのご来店をお待ちしております。"}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y"
              />
              <p className="text-xs text-gray-400 mt-1">
                変数: <code className="bg-gray-100 px-1 rounded">{"{{customerName}}"}</code> <code className="bg-gray-100 px-1 rounded">{"{{visitDate}}"}</code>
              </p>
            </FieldRow>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                旧テンプレート設定（JSON・後方互換）
              </label>
              <textarea
                rows={4}
                value={retentionTemplatesText}
                onChange={(e) => setRetentionTemplatesText(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y"
                placeholder={'[\n  {"id":"t1","triggerDays":7,"message":"またのご来店をお待ちしています！"}\n]'}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <SaveButton saving={savingRetention} onClick={saveRetention} label="リピート促進設定を保存" />
          </div>
        </SectionCard>

        {/* ── 6. テストチャット ──────────────────────────────────── */}
        <SectionCard title="テストチャット" icon={<Send className="w-4 h-4 text-blue-500" />} collapsible>
          <p className="text-xs text-gray-400 mb-3">
            AI接客の動作確認ができます。suggestedActions がボタンとして表示されます。
          </p>

          {/* メッセージ履歴 */}
          {chatMessages.length > 0 && (
            <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={[
                      "max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words",
                      m.role === "user"
                        ? "bg-indigo-500 text-white"
                        : "bg-gray-100 text-gray-800",
                    ].join(" ")}
                  >
                    {m.text}
                  </div>
                  {m.intent && (
                    <span className="text-[10px] text-gray-400 mt-0.5 px-1">intent: {m.intent}</span>
                  )}
                  {/* suggestedActions チップ */}
                  {m.suggestedActions && m.suggestedActions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {m.suggestedActions.map((a, j) => (
                        a.url ? (
                          <a
                            key={j}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-600 text-xs font-medium rounded-full hover:bg-indigo-50 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {a.label || "リンクを開く"}
                          </a>
                        ) : (
                          <button
                            key={j}
                            type="button"
                            onClick={() => {
                              setChatInput(a.label || "");
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-medium rounded-full hover:bg-gray-50 transition-colors"
                          >
                            {a.label || "送信"}
                          </button>
                        )
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 入力欄 */}
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && sendTestChat()}
              placeholder="メッセージを入力（例: 予約できますか？）"
              disabled={chatSending}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-50"
            />
            <button
              type="button"
              disabled={chatSending || !chatInput.trim()}
              onClick={sendTestChat}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
            >
              {chatSending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              送信
            </button>
          </div>
          {chatMessages.length > 0 && (
            <button
              type="button"
              onClick={() => setChatMessages([])}
              className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              履歴をクリア
            </button>
          )}
        </SectionCard>

        {/* ── 7. フォローアップ履歴 ────────────────────────────────── */}
        <SectionCard
          title="フォローアップ履歴"
          icon={<Clock className="w-4 h-4 text-violet-500" />}
          collapsible
        >
          <div className="flex justify-end mb-3">
            <button
              type="button"
              onClick={() => loadFollowups(tenantId)}
              disabled={loadingFollowups}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingFollowups ? "animate-spin" : ""}`} />
              更新
            </button>
          </div>

          {followups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              フォローアップ履歴がありません。「更新」ボタンで読み込んでください。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-3 py-2 font-medium text-gray-500 whitespace-nowrap">お客様名</th>
                    <th className="px-3 py-2 font-medium text-gray-500 whitespace-nowrap">来店日</th>
                    <th className="px-3 py-2 font-medium text-gray-500 whitespace-nowrap">送信予定</th>
                    <th className="px-3 py-2 font-medium text-gray-500 whitespace-nowrap">ステータス</th>
                    <th className="px-3 py-2 font-medium text-gray-500 whitespace-nowrap">送信日時</th>
                    <th className="px-3 py-2 font-medium text-gray-500 whitespace-nowrap">エラー</th>
                  </tr>
                </thead>
                <tbody>
                  {followups.map((f) => (
                    <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{f.customer_name || "—"}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(f.slot_start)}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(f.followup_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><StatusBadge status={f.followup_status} /></td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(f.followup_sent_at)}</td>
                      <td className="px-3 py-2 text-red-500 max-w-[160px] truncate">{f.followup_error || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
