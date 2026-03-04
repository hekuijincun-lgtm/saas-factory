'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchAdminMembers, saveAdminMembers } from '../../lib/adminApi';
import type { AdminMember, AdminMembersStore, MemberRole } from '../../lib/adminApi';

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'オーナー',
  admin: '管理者',
  viewer: '閲覧者',
};

const ROLE_OPTIONS: MemberRole[] = ['owner', 'admin', 'viewer'];

export default function AdminMembersManager() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenantId') ?? undefined;

  const [store, setStore] = useState<AdminMembersStore>({ version: 1, members: [] });
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 追加フォーム
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<MemberRole>('admin');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchAdminMembers(tenantId),
      fetch('/api/auth/me').then((r) => r.json() as Promise<any>),
    ])
      .then(([membersStore, meData]) => {
        if (cancelled) return;
        setStore(membersStore);
        if (meData?.ok) {
          setMyUserId(meData.userId ?? null);
          setMyRole(meData.role ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setError('データの取得に失敗しました');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenantId]);

  const isOwner = myRole === 'owner';

  function handleRoleChange(lineUserId: string, role: MemberRole) {
    setStore((prev) => ({
      ...prev,
      members: prev.members.map((m) =>
        m.lineUserId === lineUserId ? { ...m, role } : m
      ),
    }));
  }

  function handleToggleEnabled(lineUserId: string) {
    setStore((prev) => ({
      ...prev,
      members: prev.members.map((m) =>
        m.lineUserId === lineUserId ? { ...m, enabled: !m.enabled } : m
      ),
    }));
  }

  function handleRemove(lineUserId: string) {
    setStore((prev) => ({
      ...prev,
      members: prev.members.filter((m) => m.lineUserId !== lineUserId),
    }));
  }

  function handleAdd() {
    const uid = newUserId.trim();
    if (!uid) return;
    if (store.members.some((m) => m.lineUserId === uid)) {
      setError('この LINE userId は既に登録されています');
      return;
    }
    setStore((prev) => ({
      ...prev,
      members: [
        ...prev.members,
        {
          lineUserId: uid,
          role: newRole,
          enabled: true,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    setNewUserId('');
    setNewRole('admin');
    setError(null);
  }

  async function handleSave() {
    if (!myUserId) return;
    // クライアント側バリデーション: enabled owner が最低 1 人
    const enabledOwners = store.members.filter((m) => m.role === 'owner' && m.enabled);
    if (enabledOwners.length === 0) {
      setError('少なくとも 1 人の有効なオーナーが必要です');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await saveAdminMembers(store, myUserId, tenantId);
      setStore(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      setError(e?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-500 py-8 text-center">読み込み中…</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* メンバー一覧 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">管理者一覧</h2>
          {!isOwner && (
            <p className="text-xs text-gray-500 mt-0.5">
              変更を行うにはオーナー権限が必要です
            </p>
          )}
        </div>

        {store.members.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-400 text-center">
            管理者が登録されていません
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">LINE userId</th>
                  <th className="px-4 py-3 text-left">表示名</th>
                  <th className="px-4 py-3 text-left">権限</th>
                  <th className="px-4 py-3 text-center">有効</th>
                  {isOwner && <th className="px-4 py-3 text-center">削除</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {store.members.map((m) => (
                  <tr key={m.lineUserId} className={m.enabled ? '' : 'opacity-50'}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-[160px] truncate">
                      {m.lineUserId}
                      {m.lineUserId === myUserId && (
                        <span className="ml-1 text-[10px] text-indigo-600 font-semibold">(自分)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {m.displayName ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={m.role}
                        disabled={!isOwner}
                        onChange={(e) => handleRoleChange(m.lineUserId, e.target.value as MemberRole)}
                        className="border border-gray-200 rounded px-2 py-1 text-xs bg-white disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        disabled={!isOwner}
                        onClick={() => handleToggleEnabled(m.lineUserId)}
                        className={[
                          'inline-flex items-center justify-center w-10 h-6 rounded-full text-xs font-medium transition-colors',
                          m.enabled
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-200 text-gray-500',
                          !isOwner ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                        ].join(' ')}
                        title={m.enabled ? '無効にする' : '有効にする'}
                      >
                        {m.enabled ? 'ON' : 'OFF'}
                      </button>
                    </td>
                    {isOwner && (
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemove(m.lineUserId)}
                          className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors"
                        >
                          削除
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 追加フォーム（オーナーのみ） */}
      {isOwner && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">管理者を追加</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="LINE userId (U から始まる文字列)"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as MemberRole)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newUserId.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              追加
            </button>
          </div>
        </div>
      )}

      {/* エラー / 成功メッセージ */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
          保存しました
        </div>
      )}

      {/* 保存ボタン（オーナーのみ） */}
      {isOwner && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      )}
    </div>
  );
}
