"use client";

import { useState, useEffect } from "react";
import { Plus, AlertCircle, RefreshCw, Link as LinkIcon } from "lucide-react";
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
    if (!tenantId) return; // wait until tenantId is resolved
    fetchAll();
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
            onClick={fetchAll}
            disabled={loading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="再読み込み"
          >
            <RefreshCw
              className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`}
            />
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
