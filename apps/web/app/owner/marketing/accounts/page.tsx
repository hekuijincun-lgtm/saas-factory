"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Instagram,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ArrowLeft,
} from "lucide-react";

interface IgAccount {
  vertical: string;
  igUserId: string;
  accessToken: string;
  tokenExpiresAt: number;
  autoPost: boolean;
  postTimes: string[];
  abTestEnabled: boolean;
}

const VERTICAL_OPTIONS = [
  { value: "eyebrow", label: "眉毛サロン" }, { value: "nail", label: "ネイルサロン" },
  { value: "hair", label: "美容室" }, { value: "dental", label: "歯科医院" },
  { value: "esthetic", label: "エステサロン" }, { value: "cleaning", label: "クリーニング" },
  { value: "handyman", label: "便利屋" }, { value: "pet", label: "ペットサロン" },
  { value: "seitai", label: "整体院" }, { value: "gym", label: "ジム" },
  { value: "school", label: "スクール" }, { value: "food", label: "飲食店" },
];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // Form state
  const [formVertical, setFormVertical] = useState("");
  const [formIgUserId, setFormIgUserId] = useState("");
  const [formToken, setFormToken] = useState("");
  const [formAutoPost, setFormAutoPost] = useState(true);
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy/owner/marketing/accounts", { credentials: "same-origin", cache: "no-store" });
      const data = (await res.json()) as any;
      setAccounts(data.accounts ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleAdd = async () => {
    if (!formVertical || !formIgUserId || !formToken) {
      showToast("全項目を入力してください", "err");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/proxy/owner/marketing/accounts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vertical: formVertical,
          igUserId: formIgUserId,
          accessToken: formToken,
          autoPost: formAutoPost,
        }),
      });
      const data = (await res.json()) as any;
      if (data.ok) {
        showToast("アカウントを追加しました");
        setShowForm(false);
        setFormVertical("");
        setFormIgUserId("");
        setFormToken("");
        fetchAccounts();
      } else {
        showToast(data.error || "追加に失敗しました", "err");
      }
    } catch { showToast("追加に失敗しました", "err"); } finally { setSaving(false); }
  };

  const handleDelete = async (vertical: string) => {
    if (!confirm(`${vertical} のアカウントを削除しますか？`)) return;
    try {
      const res = await fetch(`/api/proxy/owner/marketing/accounts/${vertical}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = (await res.json()) as any;
      if (data.ok) {
        showToast("削除しました");
        fetchAccounts();
      } else {
        showToast(data.error || "削除に失敗しました", "err");
      }
    } catch { showToast("削除に失敗しました", "err"); }
  };

  const handleRefreshToken = async (vertical: string) => {
    try {
      const res = await fetch(`/api/proxy/owner/marketing/token-refresh/${vertical}`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as any;
      if (data.ok) {
        showToast("トークンを更新しました");
        fetchAccounts();
      } else {
        showToast(data.error || "更新に失敗しました", "err");
      }
    } catch { showToast("更新に失敗しました", "err"); }
  };

  const registeredVerticals = new Set(accounts.map((a) => a.vertical));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/owner/marketing" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">IGアカウント管理</h1>
            <p className="text-sm text-gray-500 mt-0.5">バーティカル別Instagramアカウントの登録・管理</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          追加
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">新規アカウント追加</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">バーティカル</label>
              <select
                value={formVertical}
                onChange={(e) => setFormVertical(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">選択してください</option>
                {VERTICAL_OPTIONS.filter((v) => !registeredVerticals.has(v.value)).map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IG User ID</label>
              <input
                type="text"
                value={formIgUserId}
                onChange={(e) => setFormIgUserId(e.target.value)}
                placeholder="17841400..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">アクセストークン</label>
              <input
                type="password"
                value={formToken}
                onChange={(e) => setFormToken(e.target.value)}
                placeholder="EAAxxxx..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoPost"
                checked={formAutoPost}
                onChange={(e) => setFormAutoPost(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="autoPost" className="text-sm text-gray-700">自動投稿を有効にする</label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? "保存中..." : "追加する"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Account List */}
      <div className="space-y-3">
        {accounts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Instagram className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">登録されたアカウントはありません</p>
          </div>
        ) : (
          accounts.map((acc) => {
            const tokenOk = acc.tokenExpiresAt > Date.now();
            const daysLeft = Math.ceil((acc.tokenExpiresAt - Date.now()) / (1000 * 60 * 60 * 24));
            const label = VERTICAL_OPTIONS.find((v) => v.value === acc.vertical)?.label || acc.vertical;
            return (
              <div key={acc.vertical} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                    <Instagram className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{label}</div>
                    <div className="text-xs text-gray-500">IG ID: {acc.igUserId}</div>
                    <div className="flex items-center gap-3 mt-1">
                      {tokenOk ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="w-3 h-3" /> 有効（残り{daysLeft}日）
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600">
                          <XCircle className="w-3 h-3" /> 期限切れ
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {acc.autoPost ? "自動投稿ON" : "自動投稿OFF"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRefreshToken(acc.vertical)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="トークン更新"
                  >
                    <RefreshCw className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    onClick={() => handleDelete(acc.vertical)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                    title="削除"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
