"use client";

import { useEffect, useState, useCallback } from "react";
import { useOwnerTenantId } from "@/src/lib/useOwnerTenantId";
import { fetchDebugPipeline } from "@/app/lib/outreachApi";
import { RefreshCw } from "lucide-react";

export default function OutreachDebugClient() {
  const { tenantId, loading: tenantLoading } = useOwnerTenantId();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const d = await fetchDebugPipeline(tenantId, 15);
      setData(d);
    } catch (err: any) {
      setError(err.message || "Failed to load debug data");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  if (!tenantId || tenantLoading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  const Badge = ({ text, color }: { text: string; color: string }) => (
    <span className={`px-1.5 py-0.5 rounded text-xs ${color}`}>{text}</span>
  );

  const intentColor = (intent: string | null) => {
    if (!intent) return "bg-gray-100 text-gray-600";
    const m: Record<string, string> = {
      interested: "bg-green-100 text-green-700", pricing: "bg-purple-100 text-purple-700",
      demo: "bg-emerald-100 text-emerald-700", question: "bg-blue-100 text-blue-700",
      unsubscribe: "bg-orange-100 text-orange-700", not_interested: "bg-red-100 text-red-700",
      later: "bg-yellow-100 text-yellow-700",
    };
    return m[intent] || "bg-gray-100 text-gray-600";
  };

  const statusColor = (s: string) => {
    const m: Record<string, string> = {
      open: "bg-red-100 text-red-700", resolved: "bg-green-100 text-green-700",
      sent: "bg-green-100 text-green-700", failed: "bg-red-100 text-red-700",
      skipped: "bg-yellow-100 text-yellow-700", auto_sent: "bg-green-100 text-green-700",
      escalated: "bg-amber-100 text-amber-700", suggested: "bg-blue-100 text-blue-700",
    };
    return m[s] || "bg-gray-100 text-gray-600";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pipeline Debug</h1>
          <p className="text-sm text-gray-500">直近の受信→分類→返信→Close→Handoff を確認</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> 更新
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {data && (
        <>
          {/* Recent Replies (Inbound) */}
          <Section title={`受信返信 (${data.replies?.length || 0})`}>
            {(data.replies?.length ?? 0) === 0 ? <Empty /> : (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-gray-500 border-b">
                  <th className="py-1.5 pr-2">日時</th><th className="pr-2">店舗</th><th className="pr-2">From</th>
                  <th className="pr-2">件名</th><th className="pr-2">Intent</th><th className="pr-2">信頼度</th>
                  <th className="pr-2">Status</th><th className="pr-2">AI返信</th><th className="pr-2">Close</th>
                  <th>Handoff</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {data.replies.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="py-1.5 pr-2 text-gray-400">{fmt(r.created_at)}</td>
                      <td className="pr-2">{r.store_name || "—"}</td>
                      <td className="pr-2 text-gray-400">{r.from_email || "—"}</td>
                      <td className="pr-2 max-w-32 truncate">{r.subject || "—"}</td>
                      <td className="pr-2"><Badge text={r.intent || "—"} color={intentColor(r.intent)} /></td>
                      <td className="pr-2">{r.intent_confidence != null ? `${Math.round(r.intent_confidence * 100)}%` : "—"}</td>
                      <td className="pr-2"><Badge text={r.status || "—"} color={statusColor(r.status)} /></td>
                      <td className="pr-2">{r.ai_response_sent ? "✓" : r.ai_handled ? "△" : "—"}</td>
                      <td className="pr-2">{r.close_intent ? <Badge text={r.close_intent} color="bg-purple-50 text-purple-700" /> : "—"}</td>
                      <td>{r.handoff_required ? "⚠" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Close Logs */}
          <Section title={`Close ログ (${data.closeLogs?.length || 0})`}>
            {(data.closeLogs?.length ?? 0) === 0 ? <Empty /> : (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-gray-500 border-b">
                  <th className="py-1.5 pr-2">日時</th><th className="pr-2">Close Intent</th><th className="pr-2">信頼度</th>
                  <th className="pr-2">温度</th><th className="pr-2">推奨</th><th className="pr-2">実行</th>
                  <th className="pr-2">Variant</th><th>Handoff</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {data.closeLogs.map((l: any) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="py-1.5 pr-2 text-gray-400">{fmt(l.created_at)}</td>
                      <td className="pr-2"><Badge text={l.close_intent || "—"} color="bg-purple-50 text-purple-700" /></td>
                      <td className="pr-2">{Math.round((l.close_confidence || 0) * 100)}%</td>
                      <td className="pr-2">{l.deal_temperature || "—"}</td>
                      <td className="pr-2">{l.suggested_action || "—"}</td>
                      <td className="pr-2"><Badge text={l.execution_status || "—"} color={statusColor(l.execution_status)} /></td>
                      <td className="pr-2">{l.close_variant_key || "—"}</td>
                      <td>{l.handoff_required ? "⚠" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Reply Audit Logs */}
          <Section title={`Reply Audit (${data.replyLogs?.length || 0})`}>
            {(data.replyLogs?.length ?? 0) === 0 ? <Empty /> : (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-gray-500 border-b">
                  <th className="py-1.5 pr-2">日時</th><th className="pr-2">判断</th><th className="pr-2">実行</th><th>エラー</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {data.replyLogs.map((l: any) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="py-1.5 pr-2 text-gray-400">{fmt(l.created_at)}</td>
                      <td className="pr-2">{l.ai_decision}</td>
                      <td className="pr-2"><Badge text={l.execution_status} color={statusColor(l.execution_status)} /></td>
                      <td className="text-red-500">{l.error_message || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Delivery Events + Handoffs + Booking Events in a row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Section title={`Delivery (${data.deliveryEvents?.length || 0})`}>
              {(data.deliveryEvents?.length ?? 0) === 0 ? <Empty /> : (
                <div className="space-y-1">
                  {data.deliveryEvents.map((e: any) => (
                    <div key={e.id} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400">{fmt(e.created_at)}</span>
                      <Badge text={e.event_type} color={statusColor(e.status)} />
                      <span className="text-gray-500">{e.channel}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
            <Section title={`Handoffs (${data.handoffs?.length || 0})`}>
              {(data.handoffs?.length ?? 0) === 0 ? <Empty /> : (
                <div className="space-y-1">
                  {data.handoffs.map((h: any) => (
                    <div key={h.id} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400">{fmt(h.created_at)}</span>
                      <Badge text={h.priority} color={h.priority === "urgent" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"} />
                      <span>{h.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
            <Section title={`Booking (${data.bookingEvents?.length || 0})`}>
              {(data.bookingEvents?.length ?? 0) === 0 ? <Empty /> : (
                <div className="space-y-1">
                  {data.bookingEvents.map((b: any) => (
                    <div key={b.id} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400">{fmt(b.created_at)}</span>
                      <Badge text={b.event_type} color={b.event_type === "booked" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"} />
                      {b.variant_key && <span className="text-gray-400">v:{b.variant_key}</span>}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-gray-400 py-4 text-center">データなし</p>;
}

function fmt(iso: string) {
  try { return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
