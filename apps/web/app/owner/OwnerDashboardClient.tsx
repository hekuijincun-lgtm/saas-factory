"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Building2,
  CalendarCheck,
  MessageSquare,
  Wifi,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  X,
  DollarSign,
  TrendingUp,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { CopilotRecommendation, CopilotOverview } from "@/src/types/outreach";
import { RECOMMENDATION_PRIORITY_COLORS, RECOMMENDATION_TYPE_LABELS } from "@/src/types/outreach";

// ── Types ──────────────────────────────────────────────────────────────────

interface Overview {
  tenantCount: number;
  billedTenantCount: number;
  mrr: number;
  reservationsToday: number;
  lineConnected: number;
  pendingTickets: number;
}

interface Tenant {
  tenantId: string;
  storeName: string;
  lineConnected: boolean;
  reservationsToday: number;
  subscriptionStatus: string;
  planId: string | null;
  monthlyAmount: number;
}

interface Ticket {
  id: string;
  tenantId: string;
  storeName: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

type TicketStatus = "" | "new" | "reviewing" | "planned" | "closed";

const STATUS_LABELS: Record<string, string> = {
  "": "全て",
  new: "新規",
  reviewing: "対応中",
  planned: "計画中",
  closed: "完了",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-red-100 text-red-800",
  reviewing: "bg-amber-100 text-amber-800",
  planned: "bg-blue-100 text-blue-800",
  closed: "bg-gray-100 text-gray-600",
};

// ── Component ──────────────────────────────────────────────────────────────

export default function OwnerDashboardClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tenantSearch, setTenantSearch] = useState("");
  const [showAllTenants, setShowAllTenants] = useState(false);
  const [ticketFilter, setTicketFilter] = useState<TicketStatus>("");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [toast, setToast] = useState("");
  const [copilot, setCopilot] = useState<CopilotOverview | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);

  const tenantsRef = useRef<HTMLDivElement>(null);
  const ticketsRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ovRes, tRes, tkRes] = await Promise.all([
        fetch("/api/proxy/owner/overview"),
        fetch("/api/proxy/owner/tenants"),
        fetch("/api/proxy/owner/tickets"),
      ]);

      // Auth errors
      if (ovRes.status === 401 || ovRes.status === 403) {
        setError("アクセス権限がありません。オーナーアカウントでログインしてください。");
        return;
      }
      if (ovRes.status === 503) {
        setError("サービス設定に問題があります。管理者に連絡してください。");
        return;
      }

      const ovData = await ovRes.json() as any;
      const tData = await tRes.json() as any;
      const tkData = await tkRes.json() as any;

      if (ovData.ok) {
        setOverview({
          tenantCount: ovData.tenantCount,
          billedTenantCount: ovData.billedTenantCount ?? 0,
          mrr: ovData.mrr ?? 0,
          reservationsToday: ovData.reservationsToday,
          lineConnected: ovData.lineConnected,
          pendingTickets: ovData.pendingTickets,
        });
      } else {
        setError("データの取得に失敗しました。");
      }
      if (tData.ok) setTenants(tData.tenants ?? []);
      if (tkData.ok) setTickets(tkData.tickets ?? []);

      // Fetch copilot overview (non-blocking — uses first tenant for outreach context)
      fetchCopilotData();
    } catch (e) {
      console.error("Owner dashboard fetch error:", e);
      setError("通信エラーが発生しました。ページを再読込してください。");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCopilotData = useCallback(async () => {
    setCopilotLoading(true);
    try {
      const res = await fetch("/api/proxy/admin/outreach/copilot/overview?tenantId=default");
      const data = await res.json() as any;
      if (data.ok) setCopilot(data.data);
    } catch {
      // Non-critical — copilot is optional
    } finally {
      setCopilotLoading(false);
    }
  }, []);

  const handleRefreshCopilot = async () => {
    setCopilotLoading(true);
    try {
      const res = await fetch("/api/proxy/admin/outreach/copilot/recommendations/refresh?tenantId=default", { method: "POST" });
      await res.json();
      await fetchCopilotData();
      showToast("Copilot 推奨を更新しました");
    } catch {
      showToast("Copilot 更新に失敗しました");
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleCopilotAction = async (recId: string, action: "accept" | "dismiss") => {
    try {
      await fetch(`/api/proxy/admin/outreach/copilot/recommendations/${recId}/${action}?tenantId=default`, { method: "POST" });
      setCopilot((prev) => prev ? {
        ...prev,
        recommendations: prev.recommendations.filter((r) => r.id !== recId),
      } : null);
      showToast(action === "accept" ? "推奨を承認しました" : "推奨を非表示にしました");
    } catch {
      showToast("操作に失敗しました");
    }
  };

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleStatusChange = async (ticket: Ticket, newStatus: string) => {
    try {
      const res = await fetch(
        `/api/proxy/owner/tickets/${encodeURIComponent(ticket.tenantId)}/${encodeURIComponent(ticket.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      const data = await res.json() as any;
      if (data.ok) {
        // Update local state
        setTickets((prev) =>
          prev.map((t) =>
            t.id === ticket.id && t.tenantId === ticket.tenantId
              ? { ...t, status: newStatus, updatedAt: new Date().toISOString() }
              : t
          )
        );
        if (selectedTicket?.id === ticket.id) {
          setSelectedTicket({ ...selectedTicket, status: newStatus, updatedAt: new Date().toISOString() });
        }
        // Update overview pending count
        if (overview) {
          const wasPending = ticket.status === "new" || ticket.status === "reviewing";
          const isPending = newStatus === "new" || newStatus === "reviewing";
          if (wasPending && !isPending) {
            setOverview({ ...overview, pendingTickets: Math.max(0, overview.pendingTickets - 1) });
          } else if (!wasPending && isPending) {
            setOverview({ ...overview, pendingTickets: overview.pendingTickets + 1 });
          }
        }
        showToast("ステータスを更新しました");
      } else {
        showToast("更新に失敗しました: " + (data.error || "unknown"));
      }
    } catch {
      showToast("通信エラーが発生しました");
    }
  };

  // Filtered data
  const billedTenants = showAllTenants
    ? tenants
    : tenants.filter((t) => t.subscriptionStatus === "active" || t.subscriptionStatus === "trialing");
  const filteredTenants = billedTenants.filter(
    (t) =>
      !tenantSearch ||
      t.storeName.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.tenantId.toLowerCase().includes(tenantSearch.toLowerCase())
  );

  const filteredTickets = tickets.filter(
    (t) => !ticketFilter || t.status === ticketFilter
  );

  const lineDisconnectedTenants = tenants.filter((t) => !t.lineConnected);

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-red-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">エラー</h2>
        <p className="text-sm text-gray-500">{error}</p>
        <button
          onClick={fetchAll}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          再試行
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm animate-in fade-in">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">オーナーダッシュボード</h1>
        <button
          onClick={fetchAll}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          更新
        </button>
      </div>

      {/* Section 1: KPI Cards */}
      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard
            icon={<Building2 className="w-5 h-5 text-indigo-600" />}
            label="課金テナント数"
            value={`${overview.billedTenantCount} / ${overview.tenantCount}`}
            bg="bg-indigo-50"
          />
          <KpiCard
            icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
            label="MRR（月次経常収益）"
            value={`¥${overview.mrr.toLocaleString()}`}
            bg="bg-emerald-50"
          />
          <KpiCard
            icon={<TrendingUp className="w-5 h-5 text-amber-600" />}
            label="本日予約 / 未対応チケット"
            value={`${overview.reservationsToday} / ${overview.pendingTickets}`}
            bg="bg-amber-50"
          />
        </div>
      )}

      {/* Section 2: Alert Banners */}
      {overview && overview.pendingTickets > 0 && (
        <button
          onClick={() => ticketsRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-left hover:bg-red-100 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <span className="text-sm font-medium text-red-800">
            未対応チケットが {overview.pendingTickets} 件あります
          </span>
        </button>
      )}
      {lineDisconnectedTenants.length > 0 && (
        <button
          onClick={() => tenantsRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-left hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <span className="text-sm font-medium text-amber-800">
            LINE 未接続のテナントが {lineDisconnectedTenants.length} 件あります
          </span>
        </button>
      )}

      {/* Section 3: Sales Copilot */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-gray-900">Sales Copilot</h2>
          <span className="text-xs text-gray-400">今日のおすすめ営業アクション</span>
          <div className="flex-1" />
          <button
            onClick={handleRefreshCopilot}
            disabled={copilotLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${copilotLoading ? "animate-spin" : ""}`} />
            更新
          </button>
        </div>
        <div className="p-4">
          {!copilot && !copilotLoading && (
            <p className="text-sm text-gray-400 text-center py-4">
              「更新」をクリックして Copilot 推奨を生成してください
            </p>
          )}
          {copilotLoading && !copilot && (
            <div className="flex items-center justify-center py-6">
              <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          )}
          {copilot && copilot.recommendations.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              現在の推奨アクションはありません。データが蓄積されると提案が表示されます。
            </p>
          )}
          {copilot && copilot.recommendations.length > 0 && (
            <div className="space-y-3">
              {copilot.recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          RECOMMENDATION_PRIORITY_COLORS[rec.priority] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {RECOMMENDATION_TYPE_LABELS[rec.recommendation_type] ?? rec.recommendation_type}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{rec.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{rec.summary}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {rec.recommendation_type === "run_schedule_now" && (
                      <a
                        href="/owner/outreach/automation"
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="スケジューラへ"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </a>
                    )}
                    {rec.recommendation_type === "prioritize_review_queue" && (
                      <a
                        href="/owner/outreach/review"
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="レビューキューへ"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </a>
                    )}
                    {rec.recommendation_type === "recommend_campaign" && (
                      <a
                        href="/owner/outreach/analytics"
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="分析へ"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      onClick={() => handleCopilotAction(rec.id, "accept")}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="承認"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleCopilotAction(rec.id, "dismiss")}
                      className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                      title="非表示"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Schedule Health Summary */}
          {copilot && copilot.schedule_health.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">スケジュール健全性</p>
              <div className="flex flex-wrap gap-2">
                {copilot.schedule_health.map((sh) => (
                  <div
                    key={sh.schedule_id}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      sh.health_score >= 70
                        ? "bg-green-100 text-green-700"
                        : sh.health_score >= 40
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    <span>{sh.schedule_name}</span>
                    <span className="font-bold">{sh.health_score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Tenant List */}
      <div ref={tenantsRef} id="tenants-section" className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {showAllTenants ? "全テナント" : "課金テナント"}
          </h2>
          <button
            onClick={() => setShowAllTenants(!showAllTenants)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            {showAllTenants ? "課金のみ表示" : `全て表示 (${tenants.length})`}
          </button>
          <div className="flex-1" />
          <input
            type="text"
            placeholder="店舗名・テナントIDで検索..."
            value={tenantSearch}
            onChange={(e) => setTenantSearch(e.target.value)}
            className="w-full sm:w-64 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="text-left px-4 py-3 font-medium">店舗名</th>
                <th className="text-left px-4 py-3 font-medium">テナントID</th>
                <th className="text-center px-4 py-3 font-medium">プラン</th>
                <th className="text-right px-4 py-3 font-medium">月額</th>
                <th className="text-center px-4 py-3 font-medium">LINE</th>
                <th className="text-center px-4 py-3 font-medium">本日予約</th>
                <th className="text-center px-4 py-3 font-medium">アクション</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    {tenantSearch ? "検索結果なし" : "テナントがありません"}
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => (
                  <tr key={t.tenantId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{t.storeName}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{t.tenantId}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.subscriptionStatus === "active"
                            ? "bg-green-100 text-green-800"
                            : t.subscriptionStatus === "trialing"
                            ? "bg-blue-100 text-blue-800"
                            : t.subscriptionStatus === "past_due"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {t.planId ?? "—"}
                        {t.subscriptionStatus === "trialing" && " (試用)"}
                        {t.subscriptionStatus === "past_due" && " (未払)"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 font-mono text-xs">
                      {t.monthlyAmount > 0 ? `¥${t.monthlyAmount.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {t.lineConnected ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="接続済み" />
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-gray-300" title="未接続" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">{t.reservationsToday}</td>
                    <td className="px-4 py-3 text-center space-x-2">
                      <a
                        href={`/admin?tenantId=${encodeURIComponent(t.tenantId)}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                      >
                        管理画面
                      </a>
                      <button
                        onClick={() => window.open(`/booking?tenantId=${encodeURIComponent(t.tenantId)}`, "_blank")}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        予約ページ
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4: Ticket List */}
      <div ref={ticketsRef} id="tickets-section" className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">チケット一覧</h2>
          <div className="flex flex-wrap gap-2">
            {(["", "new", "reviewing", "planned", "closed"] as TicketStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setTicketFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  ticketFilter === s
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {STATUS_LABELS[s]}
                {s === "" && ` (${tickets.length})`}
                {s && ` (${tickets.filter((t) => t.status === s).length})`}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {filteredTickets.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400">
              チケットがありません
            </div>
          ) : (
            filteredTickets.map((ticket) => (
              <button
                key={`${ticket.tenantId}:${ticket.id}`}
                onClick={() => setSelectedTicket(ticket)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        STATUS_COLORS[ticket.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {STATUS_LABELS[ticket.status] ?? ticket.status}
                    </span>
                    <span className="text-xs text-gray-400">{ticket.storeName}</span>
                    <span className="text-xs text-gray-300">{ticket.category}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{ticket.subject}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{ticket.message}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0 mt-1">
                  {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString("ja-JP") : ""}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedTicket(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-4">
              {/* Modal Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_COLORS[selectedTicket.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {STATUS_LABELS[selectedTicket.status] ?? selectedTicket.status}
                    </span>
                    <span className="text-xs text-gray-400">{selectedTicket.category}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{selectedTicket.subject}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedTicket.storeName} ({selectedTicket.tenantId})
                  </p>
                </div>
                <button
                  onClick={() => setSelectedTicket(null)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Message */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedTicket.message}</p>
              </div>

              {/* Metadata */}
              <div className="text-xs text-gray-400 space-y-0.5">
                {selectedTicket.createdAt && (
                  <p>作成: {new Date(selectedTicket.createdAt).toLocaleString("ja-JP")}</p>
                )}
                {selectedTicket.updatedAt && (
                  <p>更新: {new Date(selectedTicket.updatedAt).toLocaleString("ja-JP")}</p>
                )}
              </div>

              {/* Status Change */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">ステータス変更:</label>
                <select
                  value={selectedTicket.status}
                  onChange={(e) => handleStatusChange(selectedTicket, e.target.value)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="new">新規</option>
                  <option value="reviewing">対応中</option>
                  <option value="planned">計画中</option>
                  <option value="closed">完了</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <a
                  href={`/admin?tenantId=${encodeURIComponent(selectedTicket.tenantId)}`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                >
                  管理画面を開く
                </a>
                <button
                  onClick={() => setSelectedTicket(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}
