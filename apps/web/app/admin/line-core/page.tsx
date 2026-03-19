'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';

interface LineCoreStatus {
  configured: boolean;
  enabled: boolean;
  hasToken: boolean;
  hasSecret: boolean;
  agentRouting: boolean;
  recentLogCount: number;
}

interface LineCoreSettingsData {
  enabled: boolean;
  agentRoutingEnabled: boolean;
  loggingEnabled: boolean;
  defaultReplyMode: string;
  dedupWindowSec: number;
}

interface LineLogEntry {
  id: string;
  direction: 'inbound' | 'outbound';
  eventType: string;
  messageType?: string;
  success: boolean;
  userId?: string;
  requestType?: string;
  timestamp: string;
  errorMessage?: string;
}

export default function LineCoreAdminPage() {
  const { tenantId, status: tenantStatus } = useAdminTenantId();
  const [status, setStatus] = useState<LineCoreStatus | null>(null);
  const [coreSettings, setCoreSettings] = useState<LineCoreSettingsData | null>(null);
  const [logs, setLogs] = useState<LineLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [testUserId, setTestUserId] = useState('');
  const [testText, setTestText] = useState('LINE Core テスト送信');
  const [testResult, setTestResult] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (tenantStatus !== 'ready') return;
    try {
      const res = await fetch(`/api/proxy/admin/line-core/status?tenantId=${encodeURIComponent(tenantId)}`);
      const json: any = await res.json();
      if (json.ok) {
        setStatus(json.status);
        setCoreSettings(json.coreSettings);
      }
    } catch { /* silent */ }
  }, [tenantId, tenantStatus]);

  const fetchLogs = useCallback(async () => {
    if (tenantStatus !== 'ready') return;
    try {
      const res = await fetch(`/api/proxy/admin/line-core/logs?tenantId=${encodeURIComponent(tenantId)}&limit=30`);
      const json: any = await res.json();
      if (json.ok && Array.isArray(json.logs)) {
        setLogs(json.logs);
      }
    } catch { /* silent */ }
  }, [tenantId, tenantStatus]);

  useEffect(() => {
    Promise.all([fetchStatus(), fetchLogs()]).finally(() => setLoading(false));
  }, [fetchStatus, fetchLogs]);

  const handleTestPush = async () => {
    if (!testUserId.trim()) return;
    setTestResult(null);
    try {
      const res = await fetch(`/api/proxy/admin/line-core/test-push?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: testUserId.trim(), text: testText.trim() }),
      });
      const json: any = await res.json();
      setTestResult(json.result?.success ? '送信成功' : `送信失敗: ${json.result?.error ?? json.error ?? '不明'}`);
      fetchLogs();
    } catch (err: any) {
      setTestResult(`エラー: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="p-6 text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">LINE Core 管理</h1>
        <Link href="/admin/line-setup" className="text-sm text-indigo-600 hover:underline">
          LINE設定 →
        </Link>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">接続状態</h2>
        {!status ? (
          <p className="text-gray-400 text-sm">ステータスを取得できませんでした</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatusBadge label="設定済み" ok={status.configured} />
            <StatusBadge label="有効" ok={status.enabled} />
            <StatusBadge label="Access Token" ok={status.hasToken} />
            <StatusBadge label="Channel Secret" ok={status.hasSecret} />
            <StatusBadge label="Agent Routing" ok={status.agentRouting} />
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-500">ログ数</span>
              <span className="font-mono text-sm font-medium">{status.recentLogCount}</span>
            </div>
          </div>
        )}
      </div>

      {/* Core Settings Card */}
      {coreSettings && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">LINE Core 設定</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">有効:</span> <span className="font-medium">{coreSettings.enabled ? 'ON' : 'OFF'}</span></div>
            <div><span className="text-gray-500">Agent Routing:</span> <span className="font-medium">{coreSettings.agentRoutingEnabled ? 'ON' : 'OFF'}</span></div>
            <div><span className="text-gray-500">ログ記録:</span> <span className="font-medium">{coreSettings.loggingEnabled ? 'ON' : 'OFF'}</span></div>
            <div><span className="text-gray-500">返信モード:</span> <span className="font-medium">{coreSettings.defaultReplyMode}</span></div>
            <div><span className="text-gray-500">Dedup窓:</span> <span className="font-medium">{coreSettings.dedupWindowSec}秒</span></div>
          </div>
        </div>
      )}

      {/* Test Push Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">テスト送信</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">LINE User ID</label>
            <input
              value={testUserId}
              onChange={(e) => setTestUserId(e.target.value)}
              placeholder="Uxxxxxxxxxx..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">メッセージ</label>
            <input
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <button
            onClick={handleTestPush}
            disabled={!testUserId.trim()}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Push送信テスト
          </button>
          {testResult && (
            <p className={`text-sm ${testResult.includes('成功') ? 'text-green-600' : 'text-red-600'}`}>
              {testResult}
            </p>
          )}
        </div>
      </div>

      {/* Recent Logs Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">最近のログ</h2>
          <button onClick={fetchLogs} className="text-xs text-indigo-600 hover:underline">更新</button>
        </div>
        {logs.length === 0 ? (
          <p className="text-gray-400 text-sm">ログがありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="pb-2 pr-3">方向</th>
                  <th className="pb-2 pr-3">種別</th>
                  <th className="pb-2 pr-3">結果</th>
                  <th className="pb-2 pr-3">User</th>
                  <th className="pb-2">日時</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(-30).reverse().map((log) => (
                  <tr key={log.id} className="border-b border-gray-50">
                    <td className="py-1.5 pr-3">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${log.direction === 'inbound' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                        {log.direction === 'inbound' ? '受信' : '送信'}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-gray-600">
                      {log.eventType}{log.requestType ? ` (${log.requestType})` : ''}
                    </td>
                    <td className="py-1.5 pr-3">
                      {log.success
                        ? <span className="text-green-600">OK</span>
                        : <span className="text-red-500" title={log.errorMessage}>NG</span>
                      }
                    </td>
                    <td className="py-1.5 pr-3 text-gray-400 font-mono">{log.userId?.slice(0, 8) ?? '-'}</td>
                    <td className="py-1.5 text-gray-400">{new Date(log.timestamp).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${ok ? 'bg-green-50' : 'bg-red-50'}`}>
      <span className={`w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-400'}`} />
      <span className="text-xs text-gray-700">{label}</span>
    </div>
  );
}
