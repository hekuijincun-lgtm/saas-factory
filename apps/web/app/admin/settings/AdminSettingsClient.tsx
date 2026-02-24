// Admin settings client for /admin/settings
"use client";

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarDays, Building2, Clock, Link as LinkIcon, AlertCircle, RefreshCw, Save } from 'lucide-react';
import DebugHydration from './DebugHydration';
import {
  fetchAdminSettings,
  saveAdminSettings,
  type AdminSettings,
  fetchMessagingStatus,
  saveMessagingConfig,
  deleteMessagingConfig,
  type MessagingStatusResponse
} from '../../lib/adminApi';
import { ApiClientError } from '../../lib/apiClient';

// ============================================================
// Types
// ============================================================

// localStorageベースのテナント設定（API移行前の暫定）
interface LocalTenant {
  id: string;
  contactEmail: string;
  workDays: number[];
  bookingWindow: number;
}

const INITIAL_LOCAL_TENANT: LocalTenant = {
  id: 'tenant-001',
  contactEmail: 'info@lumiere.demo',
  workDays: [0, 1, 3, 4, 5, 6],
  bookingWindow: 14,
};

const FALLBACK_STORE_NAME = 'Lumiere 表参道';

// ============================================================
// Component
// ============================================================

export default function AdminSettingsClient() {
  const searchParams = useSearchParams();

  // --- localStorageベースのテナント設定（営業日・予約窓 等） ---
  const [localTenant, setLocalTenant] = useState<LocalTenant>(INITIAL_LOCAL_TENANT);
  const [savedLocalTenant, setSavedLocalTenant] = useState<LocalTenant>(INITIAL_LOCAL_TENANT);

  // --- API由来の storeName ---
  const [storeName, setStoreName] = useState(FALLBACK_STORE_NAME);
  const [storeNameInput, setStoreNameInput] = useState(FALLBACK_STORE_NAME);
  const [contactEmail, setContactEmail] = useState('info@lumiere.demo');

  // --- API由来の営業時間設定 ---
  const [openTime, setOpenTime] = useState('10:00');
  const [savedOpenTime, setSavedOpenTime] = useState('10:00');
  const [closeTime, setCloseTime] = useState('19:00');
  const [savedCloseTime, setSavedCloseTime] = useState('19:00');
  const [slotIntervalMin, setSlotIntervalMin] = useState(30);
  const [savedSlotIntervalMin, setSavedSlotIntervalMin] = useState(30);

  const [isMounted, setIsMounted] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [isSaving, setIsSaving] = useState(false);

  // --- 設定全体の状態 ---
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

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
      // storeName を API から反映
      if (settings.storeName) {
        setStoreName(settings.storeName);
        setStoreNameInput(settings.storeName);
      }
      // 営業時間設定を API から反映（API は flat 構造: openTime, closeTime, slotIntervalMin）
      const raw = settings as any;
      const ot = raw.openTime || '10:00';
      const ct = raw.closeTime || '19:00';
      const si = Number(raw.slotIntervalMin) || 30;
      setOpenTime(ot); setSavedOpenTime(ot);
      setCloseTime(ct); setSavedCloseTime(ct);
      setSlotIntervalMin(si); setSavedSlotIntervalMin(si);
    } catch (error) {
      const msg = error instanceof ApiClientError
        ? error.message
        : error instanceof Error ? error.message : '設定の取得に失敗しました';
      setSettingsError(msg);
    } finally {
      setSettingsLoading(false);
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

    // localStorage からローカル設定を読み込む（営業日等）
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
    fetchMessagingStatusState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // 保存処理
  // ============================================================

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // API に storeName + 営業時間設定を保存
      await saveAdminSettings({ storeName: storeNameInput, openTime, closeTime, slotIntervalMin } as any, tenantId);
      setStoreName(storeNameInput);
      setSavedOpenTime(openTime);
      setSavedCloseTime(closeTime);
      setSavedSlotIntervalMin(slotIntervalMin);

      // localStorage にローカル設定を保存（営業日等）
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
    setOpenTime(savedOpenTime);
    setCloseTime(savedCloseTime);
    setSlotIntervalMin(savedSlotIntervalMin);
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
            営業時間設定（API連携）
        ============================================================ */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-green-100 rounded-lg shrink-0">
              <Clock className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">営業時間設定</h2>
              <p className="text-xs text-gray-500">予約スロット生成の基準となる時間帯を設定します</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                営業開始時間
              </label>
              <input
                type="time"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                value={openTime}
                onChange={e => setOpenTime(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                営業終了時間
              </label>
              <input
                type="time"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                value={closeTime}
                onChange={e => setCloseTime(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                予約間隔（分）
              </label>
              <input
                type="number"
                step="15"
                min="15"
                max="120"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                value={slotIntervalMin}
                onChange={e => setSlotIntervalMin(Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-gray-400">スロット表示間隔（15・30・60分など）</p>
            </div>
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
            外部連携（Messaging API のみ）
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
