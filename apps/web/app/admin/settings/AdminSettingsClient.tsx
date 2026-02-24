// Admin settings client for /admin/settings
"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Briefcase, CalendarDays, Building2, Link as LinkIcon, CheckCircle, AlertCircle, RefreshCw, Save } from 'lucide-react';
import DebugHydration from './DebugHydration';
import {
  fetchAdminSettings,
  saveAdminSettings,
  type AdminSettings,
  fetchLineStatus,
  fetchLineAuthUrl,
  type LineStatusResponse,
  fetchMessagingStatus,
  saveMessagingConfig,
  deleteMessagingConfig,
  type MessagingStatusResponse
} from '../../lib/adminApi';
import { ApiClientError } from '../../lib/apiClient';

// ============================================================
// Types
// ============================================================

type VerticalType = 'hair-salon' | 'lash-salon' | 'nail-salon' | 'sauna' | 'gym';

interface VerticalConfig {
  id: VerticalType;
  displayName: string;
  themeColor: string;
  terminology: {
    staff: string;
    menu: string;
    customer: string;
  };
  features: {
    enableStaffSelection: boolean;
    enableSeatSelection?: boolean;
  };
}

// localStorageベースのテナント設定（API移行前の暫定）
interface LocalTenant {
  id: string;
  vertical: VerticalType;
  contactEmail: string;
  workDays: number[];
  bookingWindow: number;
}

const INITIAL_LOCAL_TENANT: LocalTenant = {
  id: 'tenant-001',
  vertical: 'hair-salon',
  contactEmail: 'info@lumiere.demo',
  workDays: [0, 1, 3, 4, 5, 6],
  bookingWindow: 14,
};

const VERTICAL_CONFIGS: Record<VerticalType, VerticalConfig> = {
  'hair-salon': {
    id: 'hair-salon',
    displayName: '美容室',
    themeColor: 'slate',
    terminology: { staff: 'スタイリスト', menu: 'メニュー', customer: 'お客様' },
    features: { enableStaffSelection: true }
  },
  'lash-salon': {
    id: 'lash-salon',
    displayName: 'まつげサロン',
    themeColor: 'pink',
    terminology: { staff: 'アイリスト', menu: 'コース', customer: 'お客様' },
    features: { enableStaffSelection: true }
  },
  'nail-salon': {
    id: 'nail-salon',
    displayName: 'ネイルサロン',
    themeColor: 'rose',
    terminology: { staff: 'ネイリスト', menu: 'デザイン', customer: 'お客様' },
    features: { enableStaffSelection: true }
  },
  'sauna': {
    id: 'sauna',
    displayName: '個室サウナ',
    themeColor: 'stone',
    terminology: { staff: '個室', menu: 'プラン', customer: '会員様' },
    features: { enableStaffSelection: false }
  },
  'gym': {
    id: 'gym',
    displayName: 'パーソナルジム',
    themeColor: 'orange',
    terminology: { staff: 'トレーナー', menu: 'セッション', customer: '会員様' },
    features: { enableStaffSelection: true }
  }
};

const THEME_COLOR_CLASSES: Record<string, string> = {
  'slate': 'bg-slate-500',
  'pink': 'bg-pink-500',
  'rose': 'bg-rose-500',
  'stone': 'bg-stone-500',
  'orange': 'bg-orange-500',
};

const FALLBACK_STORE_NAME = 'Lumiere 表参道';

// ============================================================
// normalizeLineStatus
// ============================================================

function normalizeLineStatus(input: any): LineStatusResponse | null {
  if (!input || typeof input !== 'object') return null;
  const kind = String((input as any).kind ?? '');
  if (kind === 'linked') {
    return { ...(input as any), kind: 'connected' } as LineStatusResponse;
  }
  return input as LineStatusResponse;
}

// ============================================================
// Component
// ============================================================

export default function AdminSettingsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // --- localStorageベースのテナント設定（業種・営業日・予約窓 等） ---
  const [localTenant, setLocalTenant] = useState<LocalTenant>(INITIAL_LOCAL_TENANT);
  const [savedLocalTenant, setSavedLocalTenant] = useState<LocalTenant>(INITIAL_LOCAL_TENANT);

  // --- API由来の storeName ---
  const [storeName, setStoreName] = useState(FALLBACK_STORE_NAME);
  const [storeNameInput, setStoreNameInput] = useState(FALLBACK_STORE_NAME);
  const [contactEmail, setContactEmail] = useState('info@lumiere.demo');

  const [isMounted, setIsMounted] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [isSaving, setIsSaving] = useState(false);

  // --- 設定全体の状態 ---
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  // --- LINE連携 ---
  const [lineStatus, setLineStatus] = useState<LineStatusResponse | null>(null);
  const [lineLoading, setLineLoading] = useState(false);
  const [lineConnecting, setLineConnecting] = useState(false);
  const [lineError, setLineError] = useState<string | null>(null);
  const [isFetchingLineStatus, setIsFetchingLineStatus] = useState(false);

  // --- Messaging API ---
  const [messagingStatus, setMessagingStatus] = useState<MessagingStatusResponse | null>(null);
  const [messagingLoading, setMessagingLoading] = useState(false);
  const [messagingError, setMessagingError] = useState<string | null>(null);
  const [isMessagingFormOpen, setIsMessagingFormOpen] = useState(false);
  const [messagingFormData, setMessagingFormData] = useState({
    channelAccessToken: '',
    channelSecret: '',
    webhookUrl: '',
  });

  // tenantId は URL クエリから取得
  const tenantId = searchParams?.get('tenantId') || 'default';

  // ============================================================
  // API: 設定取得
  // ============================================================

  const fetchSettings = async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const settings = await fetchAdminSettings(tenantId);
      setAdminSettings(settings);
      // storeName を API から反映
      if (settings.storeName) {
        setStoreName(settings.storeName);
        setStoreNameInput(settings.storeName);
      }
    } catch (error) {
      const msg = error instanceof ApiClientError
        ? error.message
        : error instanceof Error ? error.message : '設定の取得に失敗しました';
      setSettingsError(msg);
      setAdminSettings(null);
    } finally {
      setSettingsLoading(false);
    }
  };

  // ============================================================
  // API: LINE ステータス取得
  // ============================================================

  const fetchLineStatusState = async () => {
    if (isFetchingLineStatus) return;
    setIsFetchingLineStatus(true);
    setLineLoading(true);
    setLineError(null);
    try {
      const status = await fetchLineStatus(tenantId);
      setLineStatus(normalizeLineStatus(status));
    } catch (error) {
      const msg = error instanceof ApiClientError ? error.message
        : error instanceof Error ? error.message : 'LINE連携ステータスの取得に失敗しました';
      setLineError(msg);
    } finally {
      setLineLoading(false);
      setIsFetchingLineStatus(false);
    }
  };

  // ============================================================
  // API: Messaging API ステータス取得
  // ============================================================

  const fetchMessagingStatusState = async () => {
    setMessagingLoading(true);
    setMessagingError(null);
    try {
      const status = await fetchMessagingStatus(tenantId);
      setMessagingStatus(status);
    } catch (error) {
      const msg = error instanceof ApiClientError ? error.message
        : error instanceof Error ? error.message : 'Messaging API ステータスの取得に失敗しました';
      setMessagingError(msg);
    } finally {
      setMessagingLoading(false);
    }
  };

  // ============================================================
  // LINE OAuth 連携開始
  // ============================================================

  const handleLineConnect = async () => {
    setLineError(null);
    setLineConnecting(true);
    try {
      const authUrlResponse = await fetchLineAuthUrl(tenantId);
      if (authUrlResponse.ok && authUrlResponse.url) {
        window.location.href = authUrlResponse.url;
      } else {
        const msg = authUrlResponse.error || authUrlResponse.message || 'LINE連携の認証URL生成に失敗しました';
        setLineError(msg);
        showToast(`エラー: ${msg}`, 'error');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'LINE連携の認証URL生成に失敗しました';
      setLineError(msg);
      showToast(`エラー: ${msg}`, 'error');
    } finally {
      setLineConnecting(false);
    }
  };

  // ============================================================
  // Messaging API 保存 / 削除
  // ============================================================

  const handleMessagingSave = async () => {
    if (!messagingFormData.channelAccessToken || !messagingFormData.channelSecret) {
      setMessagingError('長期アクセストークンとチャネルシークレットは必須です');
      return;
    }
    setMessagingLoading(true);
    setMessagingError(null);
    try {
      const status = await saveMessagingConfig(
        {
          channelAccessToken: messagingFormData.channelAccessToken,
          channelSecret: messagingFormData.channelSecret,
          webhookUrl: messagingFormData.webhookUrl || undefined,
        },
        tenantId
      );
      setMessagingStatus(status);
      setIsMessagingFormOpen(false);
      setMessagingFormData({ channelAccessToken: '', channelSecret: '', webhookUrl: '' });
      showToast('Messaging API 連携を保存しました', 'success');
    } catch (error) {
      const msg = error instanceof ApiClientError ? error.message
        : error instanceof Error ? error.message : 'Messaging API 設定の保存に失敗しました';
      setMessagingError(msg);
    } finally {
      setMessagingLoading(false);
    }
  };

  const handleMessagingDelete = async () => {
    if (!confirm('Messaging API 連携を解除しますか？')) return;
    setMessagingLoading(true);
    setMessagingError(null);
    try {
      const status = await deleteMessagingConfig(tenantId);
      setMessagingStatus(status);
      setIsMessagingFormOpen(false);
      setMessagingFormData({ channelAccessToken: '', channelSecret: '', webhookUrl: '' });
      showToast('Messaging API 連携を解除しました', 'success');
    } catch (error) {
      const msg = error instanceof ApiClientError ? error.message
        : error instanceof Error ? error.message : 'Messaging API 設定の削除に失敗しました';
      setMessagingError(msg);
    } finally {
      setMessagingLoading(false);
    }
  };

  // ============================================================
  // トースト表示ヘルパー
  // ============================================================

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ============================================================
  // Mount 時初期化
  // ============================================================

  useEffect(() => {
    setIsMounted(true);

    // localStorage からローカル設定を読み込む（業種・営業日等）
    try {
      const saved = localStorage.getItem('adminLocalTenant');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<LocalTenant>;
        const merged = { ...INITIAL_LOCAL_TENANT, ...parsed };
        setLocalTenant(merged);
        setSavedLocalTenant(merged);
      }
    } catch { /* ignore */ }

    fetchSettings();
    fetchLineStatusState();
    fetchMessagingStatusState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // LINE callback パラメータ処理
  useEffect(() => {
    const line = searchParams?.get('line');
    if (!line) return;
    if (line === 'linked') {
      showToast('LINE連携が完了しました！', 'success');
      fetchLineStatusState();
    } else {
      const reason =
        line === 'error_secret' ? 'secret' :
        line === 'error_missing' ? 'missing_env' :
        line === 'ok' ? 'ok' : 'unknown';
      router.replace(`/admin/line-setup?reason=${encodeURIComponent(reason)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  // ============================================================
  // 保存処理
  // ============================================================

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // API に storeName を保存
      await saveAdminSettings({ storeName: storeNameInput }, tenantId);
      setStoreName(storeNameInput);

      // localStorage にローカル設定を保存（業種・営業日等）
      try {
        localStorage.setItem('adminLocalTenant', JSON.stringify(localTenant));
        setSavedLocalTenant(localTenant);
      } catch { /* ignore */ }

      showToast('設定を保存しました', 'success');
    } catch (error) {
      const msg = error instanceof ApiClientError ? error.message
        : error instanceof Error ? error.message : '設定の保存に失敗しました';
      showToast(`保存失敗: ${msg}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setStoreNameInput(storeName);
    setLocalTenant(savedLocalTenant);
  };

  const toggleDay = (dayIndex: number) => {
    const current = localTenant.workDays || [];
    if (current.includes(dayIndex)) {
      setLocalTenant({ ...localTenant, workDays: current.filter(d => d !== dayIndex) });
    } else {
      setLocalTenant({ ...localTenant, workDays: [...current, dayIndex].sort() });
    }
  };

  // ============================================================
  // Render guard
  // ============================================================

  if (!isMounted) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  const verticals: VerticalType[] = ['hair-salon', 'lash-salon', 'nail-salon', 'sauna', 'gym'];
  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

  // ============================================================
  // Render
  // ============================================================

  return (
    <>
      <DebugHydration name="AdminSettingsClient" />

      {/* Toast */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm text-white transition-all
            ${toastType === 'error' ? 'bg-red-500' : 'bg-green-500'}`}
        >
          {toastMessage}
        </div>
      )}

      {/* ======================================================
          Page content — max-w-5xl に揃える（menu/staff と統一）
      ====================================================== */}
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ---- Header ---- */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">管理者設定</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              システム設定とテナント情報を管理します
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSettings}
              disabled={settingsLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${settingsLoading ? 'animate-spin' : ''}`} />
              再読込
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
            >
              <Save className="w-4 h-4" />
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        {/* ---- エラー表示 ---- */}
        {settingsError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">設定の読み込みに失敗しました</div>
              <div className="mt-0.5">{settingsError}</div>
            </div>
          </div>
        )}

        {/* ============================================================
            店舗情報カード（storeName は API 連携）
        ============================================================ */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-purple-100 rounded-lg shrink-0">
              <Building2 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">店舗情報</h2>
              <p className="text-xs text-gray-500">サイドバー・ヘッダに反映される店舗名を設定します</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 店舗名（API 保存） */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                店舗名 <span className="text-red-500">*</span>
                <span className="ml-1 text-xs text-indigo-600 font-normal">（サイドバーに表示）</span>
              </label>
              <input
                type="text"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                value={storeNameInput}
                onChange={e => setStoreNameInput(e.target.value)}
                placeholder="例: Lumiere 表参道"
              />
              <p className="mt-1 text-xs text-gray-400">変更後は「保存」ボタンでAPIに反映されます</p>
            </div>

            {/* 連絡先メール */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                連絡先メールアドレス
              </label>
              <input
                type="email"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                placeholder="info@example.com"
              />
            </div>
          </div>
        </div>

        {/* ============================================================
            業種 (Vertical) 設定
        ============================================================ */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-blue-100 rounded-lg shrink-0">
              <Briefcase className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">業種 (Vertical) 設定</h2>
              <p className="text-xs text-gray-500">予約システムのUIと専門用語を切り替えます</p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5">
            <p className="text-xs text-blue-800">
              <span className="font-semibold">※重要:</span>{' '}
              業種を変更すると予約システムのUI・専門用語・ビジネスロジックが切り替わります。
              変更後は「保存」ボタンを押してください。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {verticals.map(v => {
              const config = VERTICAL_CONFIGS[v];
              const isSelected = localTenant.vertical === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setLocalTenant({ ...localTenant, vertical: v })}
                  className={`relative p-4 border-2 rounded-xl transition-all duration-200 text-left
                    ${isSelected
                      ? 'border-indigo-600 bg-indigo-50 shadow-md ring-2 ring-indigo-200'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle className="w-5 h-5 text-indigo-600" />
                    </div>
                  )}
                  <div className="font-semibold text-sm text-gray-900 mb-2">{config.displayName}</div>
                  <div
                    className={`h-1 rounded-full ${THEME_COLOR_CLASSES[config.themeColor] || 'bg-gray-500'} mb-2`}
                    suppressHydrationWarning
                  />
                  <div className="text-xs text-gray-500">
                    {config.terminology.staff} / {config.terminology.menu}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ============================================================
            営業・予約設定
        ============================================================ */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-green-100 rounded-lg shrink-0">
              <CalendarDays className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">営業・予約設定</h2>
              <p className="text-xs text-gray-500">営業日と予約受付範囲を設定します</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* 営業日 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">営業日</label>
              <div className="flex flex-wrap gap-2">
                {weekDays.map((day, i) => {
                  const isActive = localTenant.workDays?.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`w-10 h-10 rounded-xl text-sm font-bold transition-all duration-150
                        ${isActive
                          ? 'bg-indigo-600 text-white shadow-md scale-105'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:scale-105'
                        }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                ※選択されていない曜日は予約画面で選択不可になります
              </p>
            </div>

            {/* 予約受付範囲 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">予約受付範囲</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">今日から</span>
                <input
                  type="number"
                  min="1"
                  max="90"
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  value={localTenant.bookingWindow || 14}
                  onChange={e => setLocalTenant({ ...localTenant, bookingWindow: Number(e.target.value) })}
                />
                <span className="text-sm text-gray-600">日後まで公開</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">お客様が予約可能な日数を設定します（1〜90日）</p>
            </div>
          </div>
        </div>

        {/* ============================================================
            外部連携
        ============================================================ */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-orange-100 rounded-lg shrink-0">
              <LinkIcon className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">外部連携</h2>
              <p className="text-xs text-gray-500">外部サービスとの連携を設定します</p>
            </div>
          </div>

          <div className="space-y-3">
            {/* LINE連携 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    lineLoading ? 'bg-yellow-400 animate-pulse'
                      : lineStatus?.kind === 'connected' ? 'bg-green-500'
                      : 'bg-gray-400'
                  }`} />
                  <div className="font-semibold text-sm text-gray-900">LINE連携</div>
                </div>
                <div className="text-xs text-gray-500">
                  {lineLoading ? '取得中...'
                    : lineStatus?.kind === 'connected'
                      ? lineStatus.line?.displayName
                        ? `LINE連携済み (${lineStatus.line.displayName})`
                        : 'LINE連携済み'
                      : 'LINE未連携'}
                </div>
                {lineError && (
                  <div className="flex items-start gap-1.5 mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">ステータス取得に失敗</div>
                      <div className="mt-0.5">{lineError}</div>
                      <button
                        onClick={fetchLineStatusState}
                        className="mt-1 px-2 py-0.5 bg-red-100 hover:bg-red-200 rounded text-xs font-medium transition-colors"
                      >
                        再取得
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                <button
                  onClick={handleLineConnect}
                  disabled={lineConnecting || lineLoading}
                  className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium transition-all"
                >
                  {lineConnecting ? '処理中...'
                    : lineStatus?.kind === 'connected' ? '再連携'
                    : lineLoading ? '取得中...' : 'LINEと連携する'}
                </button>
              </div>
            </div>

            {/* Messaging API */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    messagingLoading ? 'bg-yellow-400 animate-pulse'
                      : messagingStatus?.kind === 'linked' ? 'bg-green-500'
                      : messagingStatus?.kind === 'partial' ? 'bg-yellow-400'
                      : 'bg-gray-400'
                  }`} />
                  <div className="font-semibold text-sm text-gray-900">Messaging API 連携</div>
                </div>
                <div className="text-xs text-gray-500">
                  {messagingLoading ? '取得中...'
                    : messagingStatus?.kind === 'linked' ? '連携済み（トークン・Webhook OK）'
                    : messagingStatus?.kind === 'partial' ? '部分連携（Webhook 未受信）'
                    : messagingStatus?.kind === 'unconfigured' ? '未連携'
                    : messagingError ? 'エラー' : '状態不明'}
                </div>
                {messagingError && (
                  <div className="flex items-start gap-1.5 mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div>{messagingError}</div>
                  </div>
                )}
                {isMessagingFormOpen && (
                  <div className="mt-3 p-3 bg-white border border-gray-200 rounded-lg space-y-2">
                    <input
                      type="text"
                      placeholder="長期アクセストークン"
                      value={messagingFormData.channelAccessToken}
                      onChange={e => setMessagingFormData({ ...messagingFormData, channelAccessToken: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                    <input
                      type="text"
                      placeholder="チャネルシークレット"
                      value={messagingFormData.channelSecret}
                      onChange={e => setMessagingFormData({ ...messagingFormData, channelSecret: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Webhook URL（オプション）"
                      value={messagingFormData.webhookUrl}
                      onChange={e => setMessagingFormData({ ...messagingFormData, webhookUrl: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleMessagingSave}
                        disabled={messagingLoading}
                        className="flex-1 px-2 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50 transition-all"
                      >
                        {messagingLoading ? '保存中...' : '保存'}
                      </button>
                      <button
                        onClick={() => {
                          setIsMessagingFormOpen(false);
                          setMessagingFormData({ channelAccessToken: '', channelSecret: '', webhookUrl: '' });
                        }}
                        className="px-2 py-1.5 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200 transition-all"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                {messagingStatus?.kind === 'unconfigured' ? (
                  <button
                    onClick={() => setIsMessagingFormOpen(true)}
                    disabled={messagingLoading}
                    className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-xs font-medium transition-all"
                  >
                    連携を開始
                  </button>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={fetchMessagingStatusState}
                      disabled={messagingLoading}
                      className="w-full sm:w-auto px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 text-xs font-medium transition-all"
                    >
                      再チェック
                    </button>
                    <button
                      onClick={() => setIsMessagingFormOpen(true)}
                      disabled={messagingLoading}
                      className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-xs font-medium transition-all"
                    >
                      設定変更
                    </button>
                    <button
                      onClick={handleMessagingDelete}
                      disabled={messagingLoading}
                      className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-xs font-medium transition-all"
                    >
                      解除
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Stripe */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-purple-400 rounded-full shrink-0" />
                <div>
                  <div className="font-semibold text-sm text-gray-900">Stripe 決済連携</div>
                  <div className="text-xs text-gray-500">オンライン決済を有効化</div>
                </div>
              </div>
              <button
                onClick={() => showToast('Stripe決済APIキー設定画面へ遷移します（デモ動作）', 'success')}
                className="w-full sm:w-auto px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 text-xs font-medium transition-all"
              >
                設定する
              </button>
            </div>
          </div>
        </div>

        {/* ============================================================
            フッタ ボタン
        ============================================================ */}
        <div className="flex justify-end gap-3 pt-2 pb-6 border-t border-gray-200">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-all"
          >
            リセット
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
          >
            <Save className="w-4 h-4" />
            {isSaving ? '保存中...' : '変更を保存して適用'}
          </button>
        </div>
      </div>
    </>
  );
}
