"use client";

import { useEffect, useState, useCallback } from "react";
import AdminTopBar from "../../_components/ui/AdminTopBar";
import { Bot, Plus, Trash2, Save, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

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
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  enabled: boolean;
  updatedAt: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getTenantId(): string {
  if (typeof window === "undefined") return "default";
  const p = new URLSearchParams(window.location.search);
  return (p.get("tenantId") || "default").trim() || "default";
}

function apiBase(path: string, tenantId: string): string {
  return `/api/proxy/${path}?tenantId=${encodeURIComponent(tenantId)}`;
}

// ─── Section Card ──────────────────────────────────────────────────────────

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

// ─── Toggle ────────────────────────────────────────────────────────────────

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

// ─── Field Row ─────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 border-b border-gray-50 last:border-0">
      <label className="text-sm font-medium text-gray-600 sm:w-40 shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ─── SaveButton ────────────────────────────────────────────────────────────

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

// ─── StatusBanner ─────────────────────────────────────────────────────────

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

// ─── Main Component ────────────────────────────────────────────────────────

export default function AdminAIClient() {
  const [tenantId, setTenantId] = useState("default");

  // --- data state ---
  const [settings, setSettings] = useState<AISettings>({
    enabled: false,
    voice: "friendly",
    answerLength: "normal",
    character: "",
  });
  const [policy, setPolicy] = useState<AIPolicy>({ prohibitedTopics: [], hardRules: [] });
  const [retention, setRetention] = useState<AIRetention>({ enabled: false, templates: [] });
  const [faq, setFaq] = useState<FAQItem[]>([]);

  // --- form state for new FAQ ---
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");

  // --- UI state ---
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingRetention, setSavingRetention] = useState(false);
  const [addingFaq, setAddingFaq] = useState(false);
  const [deletingFaqId, setDeletingFaqId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ msg: string; kind: "success" | "error" } | null>(null);

  // policy form: textarea helpers
  const [hardRulesText, setHardRulesText] = useState("");
  const [prohibitedText, setProhibitedText] = useState("");

  // retention JSON textarea
  const [retentionTemplatesText, setRetentionTemplatesText] = useState("[]");

  // --- Load ---
  const loadAll = useCallback(async (tid: string) => {
    setLoading(true);
    setLoadErr(null);
    try {
      const [mainRes, faqRes] = await Promise.all([
        fetch(apiBase("admin/ai", tid)),
        fetch(apiBase("admin/ai/faq", tid)),
      ]);
      const main = await mainRes.json() as any;
      const faqData = await faqRes.json() as any;

      if (main?.settings) setSettings({ ...main.settings });
      if (main?.policy) {
        setPolicy({ ...main.policy });
        setHardRulesText((main.policy.hardRules || []).join("\n"));
        setProhibitedText((main.policy.prohibitedTopics || []).join(", "));
      }
      if (main?.retention) {
        setRetention({ ...main.retention });
        setRetentionTemplatesText(JSON.stringify(main.retention.templates || [], null, 2));
      }
      if (Array.isArray(faqData?.faq)) setFaq(faqData.faq);
    } catch (e: any) {
      setLoadErr("データ読み込みに失敗しました: " + String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tid = getTenantId();
    setTenantId(tid);
    loadAll(tid);
  }, [loadAll]);

  // --- flash banner helper ---
  const flash = (msg: string, kind: "success" | "error") => {
    setBanner({ msg, kind });
    setTimeout(() => setBanner(null), 3500);
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

  // ── Save: Retention ───────────────────────────────────────────────────

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

  // ── Add FAQ ────────────────────────────────────────────────────────────

  const addFaq = async () => {
    if (!newQ.trim() || !newA.trim()) {
      flash("質問と回答を入力してください", "error");
      return;
    }
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
        setNewQ("");
        setNewA("");
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
      if (j?.ok) {
        setFaq((prev) => prev.filter((f) => f.id !== id));
        flash("FAQを削除しました", "success");
      } else {
        flash("削除失敗: " + (j?.error || "unknown"), "error");
      }
    } catch (e: any) {
      flash("削除エラー: " + String(e?.message ?? e), "error");
    } finally {
      setDeletingFaqId(null);
    }
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
          <div className="mb-4 px-4 py-3 bg-red-50 text-red-800 border border-red-200 rounded-lg text-sm">
            {loadErr}
          </div>
        )}

        <StatusBanner msg={banner?.msg ?? ""} kind={banner?.kind ?? null} />

        {/* ── 1. 基本設定 ────────────────────────────────────────────── */}
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

        {/* ── 2. ポリシー ────────────────────────────────────────────── */}
        <SectionCard title="禁止事項・ポリシー" collapsible>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ハードルール（1行1ルール）
              </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                禁止トピック（カンマ区切り）
              </label>
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

        {/* ── 3. FAQ ─────────────────────────────────────────────────── */}
        <SectionCard title={`FAQ管理（${faq.length}件）`} collapsible>
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
                    {deletingFaqId === item.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── 4. リピート促進 ────────────────────────────────────────── */}
        <SectionCard title="リピート促進（v1: 設定のみ）" collapsible>
          <div className="space-y-4">
            <Toggle
              checked={retention.enabled}
              onChange={(v) => setRetention((r) => ({ ...r, enabled: v }))}
              label="リピート促進メッセージを有効化"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                テンプレート設定（JSON）
              </label>
              <textarea
                rows={6}
                value={retentionTemplatesText}
                onChange={(e) => setRetentionTemplatesText(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y"
                placeholder={'[\n  {"id":"t1","triggerDays":7,"message":"またのご来店をお待ちしています！"}\n]'}
              />
              <p className="text-xs text-gray-400 mt-1">
                例: <code className="bg-gray-100 px-1 rounded">{"[{\"id\":\"t1\",\"triggerDays\":7,\"message\":\"メッセージ\"}]"}</code>
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <SaveButton saving={savingRetention} onClick={saveRetention} label="保存" />
          </div>
        </SectionCard>
      </div>
    </>
  );
}
