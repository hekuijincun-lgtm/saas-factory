'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

type Tone = '丁寧' | 'カジュアル' | 'プロフェッショナル';

interface AiConfig {
  enabled: boolean;
  tone: Tone;
  afterHoursMessage: string;
  followupEnabled: boolean;
  followupDelayHours: number;
}

const DEFAULT_CONFIG: AiConfig = {
  enabled: false,
  tone: '丁寧',
  afterHoursMessage: 'ただいま営業時間外です。営業時間内に改めてご連絡いたします。ご予約はオンラインからも承っております。',
  followupEnabled: false,
  followupDelayHours: 24,
};

const TONE_OPTIONS: { value: Tone; label: string; desc: string }[] = [
  { value: '丁寧', label: '丁寧', desc: 'フォーマルで丁寧な応答' },
  { value: 'カジュアル', label: 'カジュアル', desc: '親しみやすいフレンドリーな応答' },
  { value: 'プロフェッショナル', label: 'プロフェッショナル', desc: '専門的で信頼感のある応答' },
];

export default function PetAiConfigPage() {
  const { tenantId, status } = useAdminTenantId();
  const [config, setConfig] = useState<AiConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(`/api/proxy/admin/settings?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const s = json?.data ?? json;
        const ai = s?.verticalConfig?.pet?.aiConfig;
        if (ai) {
          setConfig({
            enabled: ai.enabled ?? DEFAULT_CONFIG.enabled,
            tone: ai.tone ?? DEFAULT_CONFIG.tone,
            afterHoursMessage: ai.afterHoursMessage ?? DEFAULT_CONFIG.afterHoursMessage,
            followupEnabled: ai.followupEnabled ?? DEFAULT_CONFIG.followupEnabled,
            followupDelayHours: ai.followupDelayHours ?? DEFAULT_CONFIG.followupDelayHours,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/admin/settings?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          verticalConfig: {
            pet: {
              aiConfig: config,
            },
          },
        }),
      });
      if (!res.ok) throw new Error('save failed');
      setMessage({ type: 'success', text: '保存しました' });
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました。もう一度お試しください。' });
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="AI応答設定" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="AI応答設定" subtitle="ペットサロン向けAI自動応答の動作を設定します。" />

      <div className="px-6 pb-8 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href={withTenant('/admin/pet', tenantId)} className="hover:text-orange-600 transition-colors">
            ペットサロン
          </Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">AI設定</span>
        </div>

        <div className="max-w-2xl space-y-6">
          {/* AI toggle */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">AI自動応答</h2>
                <p className="text-xs text-gray-500 mt-0.5">ONにすると、LINEからの問い合わせにAIが自動応答します。</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.enabled}
                onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={[
                  'relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                  config.enabled ? 'bg-orange-600' : 'bg-gray-200',
                ].join(' ')}
              >
                <span
                  className={[
                    'pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    config.enabled ? 'translate-x-5' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
            </div>

            {/* Tone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">応答トーン</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {TONE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, tone: opt.value }))}
                    className={[
                      'rounded-xl border p-3 text-left transition-all',
                      config.tone === opt.value
                        ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-400'
                        : 'border-gray-200 bg-white hover:border-orange-300',
                    ].join(' ')}
                  >
                    <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* After-hours message */}
            <div>
              <label htmlFor="afterHoursMsg" className="block text-sm font-medium text-gray-700 mb-1.5">
                営業時間外メッセージ
              </label>
              <textarea
                id="afterHoursMsg"
                rows={4}
                value={config.afterHoursMessage}
                onChange={e => setConfig(prev => ({ ...prev, afterHoursMessage: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none transition-colors resize-none"
                placeholder="営業時間外に表示するメッセージを入力してください"
              />
            </div>
          </div>

          {/* Followup section */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">フォローアップ</h2>
                <p className="text-xs text-gray-500 mt-0.5">予約後に自動フォローアップメッセージを送信します。</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.followupEnabled}
                onClick={() => setConfig(prev => ({ ...prev, followupEnabled: !prev.followupEnabled }))}
                className={[
                  'relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                  config.followupEnabled ? 'bg-orange-600' : 'bg-gray-200',
                ].join(' ')}
              >
                <span
                  className={[
                    'pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    config.followupEnabled ? 'translate-x-5' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
            </div>

            {config.followupEnabled && (
              <div>
                <label htmlFor="followupDelay" className="block text-sm font-medium text-gray-700 mb-1.5">
                  送信タイミング（予約後）
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="followupDelay"
                    type="number"
                    min={1}
                    max={168}
                    value={config.followupDelayHours}
                    onChange={e => setConfig(prev => ({ ...prev, followupDelayHours: parseInt(e.target.value) || 24 }))}
                    className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm text-right focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none transition-colors"
                  />
                  <span className="text-sm text-gray-500">時間後</span>
                </div>
              </div>
            )}
          </div>

          {/* Save */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-orange-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? '保存中...' : '保存する'}
            </button>
            {message && (
              <span className={`text-sm font-medium ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {message.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
