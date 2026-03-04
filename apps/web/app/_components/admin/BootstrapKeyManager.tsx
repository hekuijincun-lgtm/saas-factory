'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBootstrapKey } from '../../lib/adminApi';
import type { BootstrapKeyResponse } from '../../lib/adminApi';

export default function BootstrapKeyManager() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenantId') ?? undefined;

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [membersExist, setMembersExist] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BootstrapKeyResponse | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  useEffect(() => {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    Promise.all([
      fetch(`/api/auth/me`).then(r => r.json() as Promise<Record<string, unknown>>).catch(() => ({} as Record<string, unknown>)),
      fetch(`/api/proxy/admin/members${qs}`).then(r => r.json() as Promise<Record<string, unknown>>).catch(() => ({} as Record<string, unknown>)),
    ]).then(([me, membersRes]) => {
      setMyUserId(typeof me?.userId === 'string' ? me.userId : null);
      setMyRole(typeof me?.role === 'string' ? me.role : null);
      const data = membersRes?.data as Record<string, unknown> | undefined;
      const members = Array.isArray(data?.members) ? data.members : [];
      setMembersExist(members.length > 0);
    }).finally(() => setLoading(false));
  }, [tenantId]);

  const canIssue = !membersExist || myRole === 'owner';

  async function handleIssue() {
    if (!myUserId && membersExist) {
      setError('ログインが必要です');
      return;
    }
    setIssuing(true);
    setError(null);
    setResult(null);
    try {
      const res = await createBootstrapKey(myUserId ?? '', tenantId);
      if (!res.ok) {
        setError((res as any).error ?? '発行に失敗しました');
      } else {
        setResult(res);
        setKeyCopied(false);
        setUrlCopied(false);
      }
    } catch (e: any) {
      setError(e?.message ?? '発行に失敗しました');
    } finally {
      setIssuing(false);
    }
  }

  function getLoginUrl() {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams();
    if (tenantId) params.set('tenantId', tenantId);
    return `${origin}/login?${params.toString()}`;
  }

  async function copyText(text: string, setCopied: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="mx-6 space-y-4">
      {/* 説明カード */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Bootstrap Key 発行</h2>
          <p className="mt-1 text-sm text-gray-500">
            新しい管理者オーナーを安全に登録するための使い捨てトークンです。
            ログイン URL と招待コードを別々に共有してください。
            受け取った方が /login でメールアドレスと招待コードを入力するとオーナーとして登録されます。
          </p>
          <ul className="mt-3 text-sm text-gray-500 space-y-1 list-disc list-inside">
            <li>キーは SHA-256 ハッシュのみ保存（平文は KV に残りません）</li>
            <li>有効期限: 24 時間</li>
            <li>使い捨て（一度使用されると無効化）</li>
            <li>再発行すると旧キーは無効になります</li>
          </ul>
        </div>

        {!canIssue && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            オーナー権限が必要です。この操作はオーナーのみ実行できます。
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={handleIssue}
          disabled={issuing || !canIssue}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {issuing ? '発行中...' : 'Bootstrap Key を発行'}
        </button>
      </div>

      {/* 発行結果（ワンタイム表示） */}
      {result && (
        <div className="rounded-xl border-2 border-yellow-400 bg-yellow-50 p-6 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-yellow-800">
                ⚠️ このキーは1度だけ表示されます。今すぐコピーしてください。
              </p>
              <p className="mt-0.5 text-xs text-yellow-700">
                有効期限: {new Date(result.expiresAt).toLocaleString('ja-JP')}
              </p>
            </div>
            <button
              onClick={() => setResult(null)}
              className="shrink-0 text-yellow-600 hover:text-yellow-800 text-lg leading-none"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>

          {/* キー表示 */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Bootstrap Key</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-white border border-yellow-300 px-3 py-2 text-xs font-mono break-all text-gray-800 select-all">
                {result.bootstrapKeyPlain}
              </code>
              <button
                onClick={() => copyText(result.bootstrapKeyPlain, setKeyCopied)}
                className="shrink-0 rounded-lg border border-yellow-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-yellow-50 transition-colors"
              >
                {keyCopied ? '✓ コピー済み' : 'コピー'}
              </button>
            </div>
          </div>

          {/* ログイン URL */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">ログイン URL（招待コードは別途共有）</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-white border border-yellow-300 px-3 py-2 text-xs font-mono break-all text-gray-800 select-all">
                {getLoginUrl()}
              </code>
              <button
                onClick={() => copyText(getLoginUrl(), setUrlCopied)}
                className="shrink-0 rounded-lg border border-yellow-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-yellow-50 transition-colors"
              >
                {urlCopied ? '✓ コピー済み' : 'コピー'}
              </button>
            </div>
          </div>

          <p className="text-xs text-yellow-700">
            ログイン URL と招待コード（Bootstrap Key）を別々に相手に共有してください。
            /login でメールアドレスと招待コードを入力するとオーナーとして自動登録されます。
            キーを閉じると再表示できません（再発行が必要です）。
          </p>
        </div>
      )}
    </div>
  );
}
