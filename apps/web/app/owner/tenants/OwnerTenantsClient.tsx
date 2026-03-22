"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Building2,
  Search,
  RefreshCw,
  ExternalLink,
  CalendarPlus,
  Users,
  ShoppingBag,
  Hammer,
  X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface Tenant {
  tenantId: string;
  storeName: string;
  vertical: string;
  verticalLabel: string;
  verticalCore: string;
  lineConnected: boolean;
  reservationsToday: number;
  subscriptionStatus: string;
  planId: string | null;
  monthlyAmount: number;
  ownerName: string;
  ownerEmail: string;
  createdAt: string;
}

interface Stats {
  totalCount: number;
  thisMonthNew: number;
  byVertical: Record<string, number>;
  byCore: Record<string, number>;
  byPlan: Record<string, number>;
  verticalLabels: Record<string, string>;
}

type CoreFilter = "all" | "reservation" | "subscription" | "ec" | "project";

// ── Vertical badge color (static Tailwind classes) ─────────────────────

const VERTICAL_BADGE_COLORS: Record<string, string> = {
  eyebrow: "bg-rose-100 text-rose-700",
  nail: "bg-pink-100 text-pink-700",
  hair: "bg-violet-100 text-violet-700",
  dental: "bg-sky-100 text-sky-700",
  esthetic: "bg-purple-100 text-purple-700",
  cleaning: "bg-emerald-100 text-emerald-700",
  handyman: "bg-amber-100 text-amber-700",
  pet: "bg-orange-100 text-orange-700",
  seitai: "bg-teal-100 text-teal-700",
  gym: "bg-blue-100 text-blue-700",
  school: "bg-indigo-100 text-indigo-700",
  shop: "bg-red-100 text-red-700",
  food: "bg-yellow-100 text-yellow-700",
  handmade: "bg-pink-100 text-pink-700",
  construction: "bg-amber-100 text-amber-700",
  reform: "bg-teal-100 text-teal-700",
  equipment: "bg-orange-100 text-orange-700",
  generic: "bg-slate-100 text-slate-700",
};

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700",
  pro: "bg-blue-100 text-blue-700",
  enterprise: "bg-purple-100 text-purple-700",
  free: "bg-gray-50 text-gray-500",
};

const CORE_LABELS: Record<string, { label: string; icon: typeof Building2 }> = {
  reservation: { label: "予約", icon: CalendarPlus },
  subscription: { label: "サブスク", icon: Users },
  ec: { label: "EC", icon: ShoppingBag },
  project: { label: "建設", icon: Hammer },
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  trialing: "bg-blue-100 text-blue-700",
  past_due: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
  unknown: "bg-gray-50 text-gray-400",
};

// ── Component ──────────────────────────────────────────────────────────

export default function OwnerTenantsClient() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [coreFilter, setCoreFilter] = useState<CoreFilter>("all");
  const [verticalFilter, setVerticalFilter] = useState<string>("all");
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [tenantsRes, statsRes] = await Promise.all([
        fetch("/api/proxy/owner/tenants", { credentials: "same-origin" }),
        fetch("/api/proxy/owner/tenants/stats", { credentials: "same-origin" }),
      ]);
      const tenantsData = (await tenantsRes.json()) as any;
      const statsData = (await statsRes.json()) as any;
      if (!tenantsData.ok) throw new Error(tenantsData.error || "Failed to load tenants");
      setTenants(tenantsData.tenants ?? []);
      if (statsData.ok) setStats(statsData);
    } catch (e: any) {
      setError(e.message || "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtered tenants
  const filtered = useMemo(() => {
    let list = tenants;
    if (coreFilter !== "all") {
      list = list.filter((t) => t.verticalCore === coreFilter);
    }
    if (verticalFilter !== "all") {
      list = list.filter((t) => t.vertical === verticalFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.tenantId.toLowerCase().includes(q) ||
          t.storeName.toLowerCase().includes(q) ||
          t.ownerName.toLowerCase().includes(q) ||
          t.ownerEmail.toLowerCase().includes(q)
      );
    }
    return list;
  }, [tenants, coreFilter, verticalFilter, search]);

  // Available verticals for current core filter
  const availableVerticals = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.byVertical)
      .filter(([v]) => coreFilter === "all" || (stats && getCore(v) === coreFilter))
      .sort((a, b) => b[1] - a[1]);
  }, [stats, coreFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">テナント管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">バーティカル別テナント一覧</p>
        </div>
        <button
          onClick={() => { fetchData(); showToast("更新しました"); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          更新
        </button>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <SummaryCard label="総テナント" value={stats.totalCount} />
          <SummaryCard label="今月新規" value={stats.thisMonthNew} accent />
          {Object.entries(CORE_LABELS).map(([key, { label, icon: Icon }]) => (
            <button
              key={key}
              onClick={() => { setCoreFilter(coreFilter === key ? "all" : key as CoreFilter); setVerticalFilter("all"); }}
              className={[
                "bg-white rounded-xl border p-3 text-left transition-all hover:shadow-sm",
                coreFilter === key ? "border-amber-400 ring-1 ring-amber-200" : "border-gray-200",
              ].join(" ")}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-500">{label}</span>
              </div>
              <span className="text-lg font-bold text-gray-900">{stats.byCore[key] || 0}</span>
            </button>
          ))}
        </div>
      )}

      {/* Vertical Filter Tabs */}
      {availableVerticals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setVerticalFilter("all")}
            className={[
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              verticalFilter === "all"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            ].join(" ")}
          >
            全て ({coreFilter === "all" ? tenants.length : tenants.filter(t => t.verticalCore === coreFilter).length})
          </button>
          {availableVerticals.map(([v, count]) => (
            <button
              key={v}
              onClick={() => setVerticalFilter(verticalFilter === v ? "all" : v)}
              className={[
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                verticalFilter === v
                  ? "bg-gray-900 text-white"
                  : VERTICAL_BADGE_COLORS[v] || "bg-gray-100 text-gray-600",
                verticalFilter !== v ? "hover:opacity-80" : "",
              ].join(" ")}
            >
              {stats?.verticalLabels[v] || v} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="テナント名 / テナントID / メールで検索..."
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-gray-500">{filtered.length} 件表示</p>

      {/* Tenant Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-gray-600">業種</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">テナント名</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">プラン</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ステータス</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">登録日</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    テナントが見つかりません
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.tenantId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${VERTICAL_BADGE_COLORS[t.vertical] || VERTICAL_BADGE_COLORS.generic}`}>
                        {t.verticalLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 truncate max-w-[200px]">{t.storeName}</div>
                      <div className="text-xs text-gray-400 truncate max-w-[200px]">{t.ownerEmail || t.tenantId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[t.planId || "free"]}`}>
                        {t.planId || "free"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.subscriptionStatus] || STATUS_COLORS.unknown}`}>
                        {t.subscriptionStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString("ja-JP") : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/admin?tenantId=${t.tenantId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
                      >
                        管理 <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${accent ? "text-amber-600" : "text-gray-900"}`}>
        {value}
      </div>
    </div>
  );
}

function getCore(vertical: string): string {
  const map: Record<string, string> = {
    eyebrow: "reservation", nail: "reservation", hair: "reservation",
    dental: "reservation", esthetic: "reservation", cleaning: "reservation",
    handyman: "reservation", pet: "reservation", seitai: "reservation",
    gym: "subscription", school: "subscription",
    shop: "ec", food: "ec", handmade: "ec",
    construction: "project", reform: "project", equipment: "project",
    generic: "reservation",
  };
  return map[vertical] || "reservation";
}
