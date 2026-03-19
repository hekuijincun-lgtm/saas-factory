// route: /admin/onboarding
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminTopBar from '../../_components/ui/AdminTopBar';
import { saveAdminSettings } from '../../lib/adminApi';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import { clearAdminSettingsCache } from '../_lib/useAdminSettings';

interface CheckItem {
  id: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
  loading: boolean;
}

async function checkLineConnected(tenantId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/proxy/admin/settings?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const json = await res.json() as any;
    const s = json?.data ?? json;
    return !!(s?.onboarding?.lineConnected);
  } catch { return false; }
}

async function checkMenuExists(tenantId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/proxy/admin/menu?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const json = await res.json() as any;
    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    return list.length > 0;
  } catch { return false; }
}

async function checkStaffExists(tenantId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/proxy/admin/staff?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const json = await res.json() as any;
    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    return list.filter((s: any) => s.active !== false).length > 0;
  } catch { return false; }
}

async function checkSlotsAvailable(tenantId: string): Promise<boolean> {
  try {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const date = `${y}-${m}-${d}`;
    const res = await fetch(`/api/proxy/slots?tenantId=${encodeURIComponent(tenantId)}&date=${date}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const json = await res.json() as any;
    const slots = Array.isArray(json?.slots) ? json.slots : [];
    return slots.some((s: any) => s.available);
  } catch { return false; }
}

interface MemberMe {
  displayName?: string;
  role?: string;
  authMethods?: string[];
  hasPassword?: boolean;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { status: tenantStatus, tenantId } = useAdminTenantId();
  const [completing, setCompleting] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [memberMe, setMemberMe] = useState<MemberMe | null>(null);
  const onboardingReturn = encodeURIComponent(`/admin/onboarding?tenantId=${tenantId}`);
  const [items, setItems] = useState<CheckItem[]>([
    { id: 'line', label: 'LINE Messaging API を設定', description: 'チャンネルIDとアクセストークンを登録してください', href: `/admin/line-setup?returnTo=${onboardingReturn}`, done: false, loading: true },
    { id: 'menu', label: 'メニューを確認・編集', description: '業種テンプレートで自動登録済み。必要に応じて編集してください', href: '/admin/menu', done: false, loading: true },
    { id: 'staff', label: 'スタッフを確認・編集', description: '自動登録済み。名前や担当を変更してください', href: '/admin/staff', done: false, loading: true },
    { id: 'slots', label: '予約可能な時間帯を確認', description: '本日の予約可能スロットが存在することを確認してください', href: '/admin/dashboard', done: false, loading: true },
  ]);

  useEffect(() => {
    if (tenantStatus === 'loading') return;

    // Fetch settings for storeName + owner email
    fetch(`/api/proxy/admin/settings?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((json: any) => {
        const s = json?.data ?? json;
        if (s?.storeName) setStoreName(s.storeName);
        if (s?.tenant?.email) setOwnerEmail(s.tenant.email);
      })
      .catch(() => {});

    // Fetch current member info (auth methods, password status)
    fetch(`/api/proxy/admin/members/me?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((json: any) => {
        if (json?.ok && json.data) setMemberMe(json.data);
      })
      .catch(() => {});

    Promise.all([
      checkLineConnected(tenantId),
      checkMenuExists(tenantId),
      checkStaffExists(tenantId),
      checkSlotsAvailable(tenantId),
    ]).then(([line, menu, staff, slots]) => {
      setItems(prev => prev.map(item => {
        if (item.id === 'line') return { ...item, done: line, loading: false };
        if (item.id === 'menu') return { ...item, done: menu, loading: false };
        if (item.id === 'staff') return { ...item, done: staff, loading: false };
        if (item.id === 'slots') return { ...item, done: slots, loading: false };
        return item;
      }));
    });
  }, [tenantId, tenantStatus]);

  async function handleComplete() {
    setCompleting(true);
    try {
      await saveAdminSettings({ onboarding: { onboardingCompleted: true } as any }, tenantId);
      clearAdminSettingsCache(tenantId);
      router.push('/admin?tenantId=' + encodeURIComponent(tenantId));
    } catch {
      setCompleting(false);
    }
  }

  const doneCount = items.filter(i => i.done).length;
  const allDone = doneCount === items.length;

  return (
    <>
      <AdminTopBar title="初期設定チェックリスト" subtitle="開始前に以下の項目を完了してください。" />
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Welcome header */}
        {(storeName || ownerEmail) && (
          <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-5 shadow-sm">
            <h2 className="text-base font-semibold text-indigo-900">
              {storeName ? `${storeName} へようこそ` : 'ようこそ'}
            </h2>
            {ownerEmail && (
              <p className="text-sm text-indigo-700 mt-1">
                管理者: {ownerEmail}
              </p>
            )}
            <p className="text-xs text-indigo-500 mt-2">
              以下のチェックリストを完了して、予約受付を開始しましょう。
            </p>
          </div>
        )}

        {/* Password setup CTA */}
        {memberMe && !memberMe.hasPassword && (
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 shadow-sm flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0 h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700">!</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">パスワードを設定しましょう</p>
              <p className="text-xs text-amber-600 mt-0.5">
                メールリンク以外のログイン方法として、パスワードを設定できます。（任意）
              </p>
            </div>
            <Link
              href={withTenant('/admin/settings', tenantId) + '#password'}
              className="flex-shrink-0 rounded-xl border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200 transition-colors"
            >
              設定する
            </Link>
          </div>
        )}

        {/* Progress */}
        <div className="bg-white rounded-2xl border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">進捗</span>
            <span className="text-sm font-semibold text-slate-900">{doneCount} / {items.length}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-2 bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${(doneCount / items.length) * 100}%` }}
            />
          </div>
          {allDone && (
            <p className="mt-3 text-sm text-emerald-700 font-medium">
              すべての設定が完了しました！
            </p>
          )}
        </div>

        {/* Checklist */}
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`bg-white rounded-2xl border p-4 shadow-sm flex items-start gap-4 transition-all ${
                item.done ? 'border-emerald-200' : 'border-slate-200'
              }`}
            >
              {/* Status icon */}
              <div className={`mt-0.5 flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                item.loading
                  ? 'bg-slate-100 text-slate-400'
                  : item.done
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-400'
              }`}>
                {item.loading ? '...' : item.done ? 'v' : 'o'}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${item.done ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                  {item.label}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
              </div>

              {/* Action link */}
              {!item.done && (
                <Link
                  href={withTenant(item.href, tenantId)}
                  className="flex-shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  設定する →
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Complete onboarding */}
        <div className="text-center">
          <button
            onClick={handleComplete}
            disabled={completing}
            className="inline-block rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            {completing ? '保存中...' : '完了してダッシュボードへ'}
          </button>
        </div>
      </div>
    </>
  );
}
