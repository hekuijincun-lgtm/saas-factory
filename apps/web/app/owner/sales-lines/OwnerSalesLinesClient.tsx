"use client";

import { useState, useEffect } from "react";
import { Plus, AlertCircle, RefreshCw, Link as LinkIcon, Activity } from "lucide-react";
import type {
  LineAccount,
  LineAccountPurpose,
  LineAccountIndustry,
  LineRouting,
} from "@/src/types/settings";
import {
  fetchLineAccounts,
  createLineAccount,
  updateLineAccount,
  deleteLineAccount,
  fetchLineRouting,
  saveLineRouting,
} from "../../lib/adminApi";
import { ApiClientError } from "../../lib/apiClient";

// ── Constants ───────────────────────────────────────────────────────────────

const INDUSTRIES = ["eyebrow", "hair", "nail", "esthetic", "dental"] as const;

const INDUSTRY_LABELS: Record<string, string> = {
  eyebrow: "眉毛",
  hair: "ヘア",
  nail: "ネイル",
  esthetic: "エステ",
  dental: "歯科",
  shared: "共通",
};

const PURPOSE_LABELS: Record<string, string> = {
  booking: "予約",
  sales: "営業",
  support: "サポート",
  broadcast: "配信",
  internal: "社内",
};

// ── Component ───────────────────────────────────────────────────────────────

export default function OwnerSalesLinesClient() {
  // Resolve tenantId from URL query param synchronously (lazy initializer)
  const [tenantId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("tenantId") || "";
  });

  // --- State ---
  const [accounts, setAccounts] = useState<
    (LineAccount & { synthesized?: boolean })[]
  >([]);
  const [synthesized, setSynthesized] = useState(false);
  const [routing, setRouting] = useState<LineRouting>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<
    (LineAccount & { synthesized?: boolean }) | null
  >(null);
  const [form, setForm] = useState({
    name: "",
    key: "",
    purpose: "sales" as LineAccountPurpose,
    industry: "shared" as LineAccountIndustry,
    channelId: "",
    channelSecret: "",
    channelAccessToken: "",
    basicId: "",
    inviteUrl: "",
  });
  const [saving, setSaving] = useState(false);

  // Diagnostics
  const [diag, setDiag] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [simText, setSimText] = useState("");
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);

  const fetchDiagnostics = async () => {
    if (!tenantId) return;
    setDiagLoading(true);
    try {
      const r = await fetch(`/api/line/webhook/diagnostics?tenantId=${encodeURIComponent(tenantId)}`);
      setDiag(await r.json());
    } catch (e: any) {
      setDiag({ ok: false, error: e?.message });
    } finally {
      setDiagLoading(false);
    }
  };

  const runSimulate = async () => {
    if (!tenantId || !simText.trim()) return;
    setSimLoading(true);
    try {
      const r = await fetch(`/api/line/webhook/debug-simulate?tenantId=${encodeURIComponent(tenantId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: simText.trim() }),
      });
      setSimResult(await r.json());
    } catch (e: any) {
      setSimResult({ ok: false, error: e?.message });
    } finally {
      setSimLoading(false);
    }
  };

  // Toast
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // --- Fetch ---
  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [acctRes, routingRes] = await Promise.all([
        fetchLineAccounts(tenantId),
        fetchLineRouting(tenantId),
      ]);
      setAccounts(acctRes.accounts || []);
      setSynthesized(acctRes.synthesized);
      setRouting(routingRes.routing || {});
    } catch (e: any) {
      setError(e?.message || "データ取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!tenantId) return;
    fetchAll();
    fetchDiagnostics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // --- Modal ---
  const openModal = (acct?: LineAccount & { synthesized?: boolean }) => {
    if (acct && !acct.synthesized) {
      setEditing(acct);
      setForm({
        name: acct.name,
        key: acct.key,
        purpose: acct.purpose,
        industry: acct.industry,
        channelId: acct.channelId,
        channelSecret: acct.channelSecret,
        channelAccessToken: acct.channelAccessToken,
        basicId: acct.basicId || "",
        inviteUrl: acct.inviteUrl || "",
      });
    } else {
      setEditing(null);
      setForm({
        name: "",
        key: "",
        purpose: "sales",
        industry: "shared",
        channelId: "",
        channelSecret: "",
        channelAccessToken: "",
        basicId: "",
        inviteUrl: "",
      });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.channelAccessToken || !form.channelSecret) {
      setError("名前、アクセストークン、チャネルシークレットは必須です");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateLineAccount(editing.id, form, tenantId);
      } else {
        await createLineAccount(form, tenantId);
      }
      setModalOpen(false);
      await fetchAll();
      showToast(
        editing ? "アカウントを更新しました" : "アカウントを追加しました"
      );
    } catch (e: any) {
      setError(e?.message || "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このLINEアカウントを無効化しますか？")) return;
    setLoading(true);
    try {
      await deleteLineAccount(id, tenantId);
      await fetchAll();
      showToast("アカウントを無効化しました");
    } catch (e: any) {
      setError(e?.message || "無効化に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleRoutingChange = async (patch: Partial<LineRouting>) => {
    setLoading(true);
    try {
      await saveLineRouting(patch, tenantId);
      await fetchAll();
      showToast("ルーティングを更新しました");
    } catch (e: any) {
      setError(e?.message || "ルーティング保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // --- Derived ---
  const salesAccounts = accounts.filter(
    (a) => a.purpose === "sales" && a.status === "active" && !a.synthesized
  );
  const salesMap = ((routing.sales || {}) as Record<string, string>);

  if (!tenantId) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center text-gray-500">
        <p>tenantId が指定されていません。URLに ?tenantId=xxx を追加してください。</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">営業LINE管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            LP CTA に使用する営業用LINEアカウントとルーティングを管理します
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchAll(); fetchDiagnostics(); }}
            disabled={loading || diagLoading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="再読み込み"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading || diagLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => openModal()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            アカウント追加
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[60] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2 ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Migration banner */}
      {synthesized && accounts.length > 0 && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          既存のMessaging API設定が検出されました。「アカウント追加」から正式に登録すると、マルチアカウント管理が有効になります。
        </div>
      )}

      {/* ─── Webhook Diagnostics ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-900">Webhook 診断</h2>
          </div>
          <button
            onClick={fetchDiagnostics}
            disabled={diagLoading}
            className="text-xs text-amber-600 hover:text-amber-700 disabled:opacity-50"
          >
            {diagLoading ? "診断中..." : "再診断"}
          </button>
        </div>
        <div className="p-5 space-y-4">
          {diag ? (
            <>
              {/* Status badges */}
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  diag.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}>
                  {diag.ok ? "Ready" : "Not Ready"}
                </span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  diag.config?.hasSecret ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}>
                  Secret: {diag.config?.hasSecret ? "OK" : "Missing"}
                </span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  diag.config?.hasToken ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}>
                  Token: {diag.config?.hasToken ? "OK" : "Missing"}
                </span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  diag.destination?.mapped ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                }`}>
                  Dest Map: {diag.destination?.mapped ? "OK" : "未設定"}
                </span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  diag.ai?.salesFlowAvailable ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                }`}>
                  {diag.ai?.salesFlowAvailable ? "Sales Flow" : "AI Flow"}
                </span>
              </div>

              {/* Problems */}
              {diag.problems?.length > 0 && (
                <div className="space-y-1">
                  {diag.problems.map((p: string, i: number) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-red-600">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Last webhook */}
              {diag.lastWebhook && (
                <div className="text-xs text-gray-500 space-y-0.5">
                  <div className="font-medium text-gray-700">最終受信:</div>
                  <div>時刻: {diag.lastWebhook.ts}</div>
                  <div>署名検証: {diag.lastWebhook.sigVerified ? "OK" : "NG"}</div>
                  <div>テキスト: {diag.lastWebhook.firstText || "(なし)"}</div>
                </div>
              )}

              {/* Last result */}
              {diag.lastResult && (
                <div className="text-xs text-gray-500 space-y-0.5">
                  <div className="font-medium text-gray-700">最終処理結果:</div>
                  <div>時刻: {diag.lastResult.ts}</div>
                  <div>分岐: {diag.lastResult.branch}</div>
                  <div>返信: {diag.lastResult.replyOk ? `成功 (${diag.lastResult.replyStatus})` : `失敗 (${diag.lastResult.replyStatus})`}</div>
                  {diag.lastResult.errorReason && <div className="text-red-600">エラー: {diag.lastResult.errorReason}</div>}
                  <div>テキスト: {diag.lastResult.messageText || "(なし)"}</div>
                </div>
              )}
            </>
          ) : diagLoading ? (
            <div className="text-sm text-gray-400">診断中...</div>
          ) : (
            <div className="text-sm text-gray-400">データなし</div>
          )}

          {/* Simulate */}
          <div className="border-t border-gray-100 pt-4">
            <div className="text-xs font-medium text-gray-700 mb-2">分岐シミュレーション</div>
            <div className="flex gap-2">
              <input
                value={simText}
                onChange={(e) => setSimText(e.target.value)}
                placeholder="テストテキスト (例: こんにちは, 1, 予約)"
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                onKeyDown={(e) => e.key === "Enter" && runSimulate()}
              />
              <button
                onClick={runSimulate}
                disabled={simLoading || !simText.trim()}
                className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {simLoading ? "..." : "実行"}
              </button>
            </div>
            {simResult && (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs font-mono space-y-0.5">
                <div>branch: <span className="text-amber-700 font-semibold">{simResult.branch}</span></div>
                <div>aiEnabled: {String(simResult.aiEnabled)}</div>
                <div>wouldReply: {String(simResult.wouldReply)}</div>
                {simResult.salesLabel && <div>salesLabel: {simResult.salesLabel}</div>}
                <div>replyContent: {simResult.replyContent}</div>
                {simResult.problems?.length > 0 && (
                  <div className="text-red-600">problems: {simResult.problems.join(", ")}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Account Table ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-900">
            LINEアカウント一覧
          </h2>
          <span className="ml-auto text-xs text-gray-400">
            {accounts.length} 件
          </span>
        </div>

        {loading && accounts.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center">
            読み込み中...
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">
            LINEアカウントが登録されていません
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-5 py-3 font-medium">名前</th>
                  <th className="px-5 py-3 font-medium">用途</th>
                  <th className="px-5 py-3 font-medium">業種</th>
                  <th className="px-5 py-3 font-medium">ステータス</th>
                  <th className="px-5 py-3 font-medium">Basic ID</th>
                  <th className="px-5 py-3 font-medium">招待URL</th>
                  <th className="px-5 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accounts.map((acct) => (
                  <tr key={acct.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {acct.name}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {PURPOSE_LABELS[acct.purpose] || acct.purpose}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {INDUSTRY_LABELS[acct.industry] || acct.industry}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          acct.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            acct.status === "active"
                              ? "bg-green-500"
                              : "bg-gray-400"
                          }`}
                        />
                        {acct.status === "active" ? "有効" : "無効"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 font-mono text-xs">
                      {acct.basicId || "-"}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs max-w-[180px] truncate">
                      {acct.inviteUrl || (
                        <span className="text-amber-500">未設定</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        {!acct.synthesized ? (
                          <>
                            <button
                              onClick={() => openModal(acct)}
                              className="px-2.5 py-1 text-indigo-600 hover:bg-indigo-50 rounded text-xs font-medium"
                            >
                              編集
                            </button>
                            {acct.status === "active" && (
                              <button
                                onClick={() => handleDelete(acct.id)}
                                className="px-2.5 py-1 text-red-600 hover:bg-red-50 rounded text-xs font-medium"
                              >
                                無効化
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400 text-xs">移行前</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Sales Routing ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            営業ルーティング（業種別）
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            LP の「LINEで無料診断する」CTA のリンク先を業種ごとに設定します。該当アカウントの inviteUrl が使用されます。
          </p>
        </div>
        <div className="p-5 space-y-3">
          {salesAccounts.length === 0 ? (
            <p className="text-sm text-gray-400">
              用途が「営業 (sales)」のアクティブなアカウントを追加すると、ここで業種別ルーティングを設定できます。
            </p>
          ) : (
            INDUSTRIES.map((ind) => (
              <div key={ind} className="flex items-center gap-3">
                <span className="w-20 text-sm text-gray-600 font-medium">
                  {INDUSTRY_LABELS[ind] || ind}
                </span>
                <select
                  value={salesMap[ind] || ""}
                  onChange={(e) =>
                    handleRoutingChange({
                      sales: { ...salesMap, [ind]: e.target.value },
                    })
                  }
                  className="flex-1 max-w-xs px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                >
                  <option value="">未設定（env fallback）</option>
                  {salesAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.industry !== "shared"
                        ? ` (${INDUSTRY_LABELS[a.industry] || a.industry})`
                        : ""}
                    </option>
                  ))}
                </select>
                {salesMap[ind] && (
                  <span className="text-xs text-green-600 font-medium">
                    設定済み
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── Booking Routing (for reference) ─── */}
      {accounts.filter(
        (a) =>
          a.purpose === "booking" && a.status === "active" && !a.synthesized
      ).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">
              予約用デフォルトアカウント
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              予約・Webhook・AI・リマインド等に使用されるアカウントです
            </p>
          </div>
          <div className="p-5">
            <select
              value={routing.booking?.default || ""}
              onChange={(e) =>
                handleRoutingChange({ booking: { default: e.target.value } })
              }
              className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            >
              <option value="">未選択</option>
              {accounts
                .filter(
                  (a) =>
                    a.purpose === "booking" &&
                    a.status === "active" &&
                    !a.synthesized
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      {/* ─── Account Modal ─── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-900 mb-5">
              {editing ? "LINEアカウント編集" : "LINEアカウント追加"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  表示名 *
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  placeholder="例: 営業用 eyebrow"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    用途
                  </label>
                  <select
                    value={form.purpose}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        purpose: e.target.value as LineAccountPurpose,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  >
                    <option value="sales">営業 (sales)</option>
                    <option value="booking">予約 (booking)</option>
                    <option value="support">サポート (support)</option>
                    <option value="broadcast">配信 (broadcast)</option>
                    <option value="internal">社内 (internal)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    業種
                  </label>
                  <select
                    value={form.industry}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        industry: e.target.value as LineAccountIndustry,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  >
                    <option value="shared">共通 (shared)</option>
                    <option value="hair">ヘア (hair)</option>
                    <option value="nail">ネイル (nail)</option>
                    <option value="eyebrow">眉毛 (eyebrow)</option>
                    <option value="esthetic">エステ (esthetic)</option>
                    <option value="dental">歯科 (dental)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  スラッグキー
                </label>
                <input
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none font-mono"
                  placeholder="sales-eyebrow (自動生成可)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Channel ID
                </label>
                <input
                  value={form.channelId}
                  onChange={(e) =>
                    setForm({ ...form, channelId: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Channel Secret *
                </label>
                <input
                  value={form.channelSecret}
                  onChange={(e) =>
                    setForm({ ...form, channelSecret: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Channel Access Token *
                </label>
                <input
                  value={form.channelAccessToken}
                  onChange={(e) =>
                    setForm({ ...form, channelAccessToken: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Basic ID
                  </label>
                  <input
                    value={form.basicId}
                    onChange={(e) =>
                      setForm({ ...form, basicId: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    placeholder="@xxx"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    招待URL
                  </label>
                  <input
                    value={form.inviteUrl}
                    onChange={(e) =>
                      setForm({ ...form, inviteUrl: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    placeholder="https://line.me/ti/p/@xxx"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "保存中..." : editing ? "更新" : "追加"}
              </button>
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
