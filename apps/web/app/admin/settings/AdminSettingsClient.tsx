// Admin settings client for /admin/settings
"use client";

import { useState, useEffect } from 'react';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import { CalendarDays, Building2, Clock, Link as LinkIcon, AlertCircle, RefreshCw, Save, Scissors, Plus, Trash2 } from 'lucide-react';
import type { EyebrowSurveyQuestion } from '@/src/types/settings';
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
  const { tenantId } = useAdminTenantId();

  // --- localStorageベースのテナント設定（営業日・予約窓 等） ---
  const [localTenant, setLocalTenant] = useState<LocalTenant>(INITIAL_LOCAL_TENANT);
  const [savedLocalTenant, setSavedLocalTenant] = useState<LocalTenant>(INITIAL_LOCAL_TENANT);

  // --- API由来の storeName ---
  const [storeName, setStoreName] = useState(FALLBACK_STORE_NAME);
  const [storeNameInput, setStoreNameInput] = useState(FALLBACK_STORE_NAME);
  const [contactEmail, setContactEmail] = useState('info@lumiere.demo');
  // storeAddress: storeName と同階層のフラットフィールドとして保存（Workers deepMerge で透過保存）
  const [storeAddress, setStoreAddress] = useState('');
  const [savedStoreAddress, setSavedStoreAddress] = useState('');
  // consentText: 予約確認画面の同意チェックボックス文言
  const DEFAULT_CONSENT = '予約内容を確認し、同意の上で予約を確定します';
  const [consentText, setConsentText] = useState(DEFAULT_CONSENT);
  const [savedConsentText, setSavedConsentText] = useState(DEFAULT_CONSENT);

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

  // --- 眉毛施術設定 ---
  const DEFAULT_EYEBROW_CONSENT = '施術前に肌状態を確認し、アレルギー等のリスクをご理解の上ご予約ください';
  const [eyebrowConsentText, setEyebrowConsentText] = useState(DEFAULT_EYEBROW_CONSENT);
  const [savedEyebrowConsentText, setSavedEyebrowConsentText] = useState(DEFAULT_EYEBROW_CONSENT);
  const [eyebrowRepeatEnabled, setEyebrowRepeatEnabled] = useState(false);
  const [savedEyebrowRepeatEnabled, setSavedEyebrowRepeatEnabled] = useState(false);
  const [eyebrowIntervalDays, setEyebrowIntervalDays] = useState(42);
  const [savedEyebrowIntervalDays, setSavedEyebrowIntervalDays] = useState(42);
  const [eyebrowTemplate, setEyebrowTemplate] = useState('前回のご来店からそろそろ{interval}週が経ちます。眉毛のリタッチはいかがでしょうか？');
  const [savedEyebrowTemplate, setSavedEyebrowTemplate] = useState('前回のご来店からそろそろ{interval}週が経ちます。眉毛のリタッチはいかがでしょうか？');
  // NEW: ベッド数
  const [eyebrowBedCount, setEyebrowBedCount] = useState(1);
  const [savedEyebrowBedCount, setSavedEyebrowBedCount] = useState(1);
  // NEW: 事前アンケート
  const [eyebrowSurveyEnabled, setEyebrowSurveyEnabled] = useState(false);
  const [savedEyebrowSurveyEnabled, setSavedEyebrowSurveyEnabled] = useState(false);
  const [eyebrowSurveyQuestions, setEyebrowSurveyQuestions] = useState<EyebrowSurveyQuestion[]>([]);
  const [savedEyebrowSurveyQuestions, setSavedEyebrowSurveyQuestions] = useState<EyebrowSurveyQuestion[]>([]);

  // --- 管理者ログイン許可 LINE userId ---
  const [allowedAdminLineUserIds, setAllowedAdminLineUserIds] = useState<string[]>([]);
  const [savedAllowedAdminLineUserIds, setSavedAllowedAdminLineUserIds] = useState<string[]>([]);
  const [currentAdminUserId, setCurrentAdminUserId] = useState<string | null>(null);

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

  // Backfill UI state
  interface BackfillResult {
    scanned: number; updatedCount: number; skippedCount: number; hasMore: boolean; dryRun: boolean;
  }
  const [bfDays, setBfDays] = useState<30 | 90 | 365>(90);
  const [bfRunning, setBfRunning] = useState(false);
  const [bfResult, setBfResult] = useState<BackfillResult | null>(null);
  const [bfError, setBfError] = useState<string | null>(null);
  const [bfConfirmed, setBfConfirmed] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  // --- LINE リマインド設定 ---
  const DEFAULT_REMINDER_TEMPLATE = '【{storeName}】明日 {date} {time} のご予約があります。\n\nメニュー: {menuName}\nスタッフ: {staffName}\n\n{address}\n\n当日お会いできるのを楽しみにしております！\n\n予約管理: {manageUrl}';
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [savedReminderEnabled, setSavedReminderEnabled] = useState(false);
  const [reminderSendAtHour, setReminderSendAtHour] = useState(18);
  const [savedReminderSendAtHour, setSavedReminderSendAtHour] = useState(18);
  const [reminderTemplate, setReminderTemplate] = useState(DEFAULT_REMINDER_TEMPLATE);
  const [savedReminderTemplate, setSavedReminderTemplate] = useState(DEFAULT_REMINDER_TEMPLATE);

  // Repeat promotion UI state
  interface RepeatTarget {
    customerKey: string;
    lineUserId: string | null;
    lastReservationAt: string;
    lastMenuSummary: string | null;
    staffId: string | null;
    styleType: string | null;
    recommendedMessage: string;
  }
  interface RepeatSendResult {
    dryRun: boolean; sentCount: number; skippedCount: number; total: number;
    cooldownDays?: number;
    message?: string; samples?: Array<{ customerKey: string; lineUserId: string; status?: string }>;
    skippedReasons?: Array<{ customerKey: string; reason: string }>;
  }
  const [rpDays, setRpDays] = useState<28 | 42 | 60 | 90>(42);
  // J2 controls
  const [rpMaxPerDay, setRpMaxPerDay] = useState<10 | 20 | 50 | 100>(50);
  const [rpOrder, setRpOrder] = useState<'oldest' | 'newest'>('oldest');
  const [rpExcludeDays, setRpExcludeDays] = useState<0 | 3 | 7 | 14 | 30>(7);
  const [rpTodaySentCount, setRpTodaySentCount] = useState<number | null>(null);
  const [rpRemainingCapacity, setRpRemainingCapacity] = useState<number | null>(null);
  const [rpExcludedCount, setRpExcludedCount] = useState<number | null>(null);
  const [rpRunning, setRpRunning] = useState(false);
  const [rpTargets, setRpTargets] = useState<RepeatTarget[] | null>(null);
  const [rpError, setRpError] = useState<string | null>(null);
  const [rpSelected, setRpSelected] = useState<Set<string>>(new Set());
  const [rpConfirmed, setRpConfirmed] = useState(false);
  const [rpSending, setRpSending] = useState(false);
  const [rpSendResult, setRpSendResult] = useState<RepeatSendResult | null>(null);
  const [rpSendError, setRpSendError] = useState<string | null>(null);


  // ============================================================
  // Backfill: customerKey 補完
  // ============================================================
  const runBackfill = async (dryRun: boolean) => {
    setBfRunning(true);
    setBfError(null);
    try {
      const res = await fetch(
        `/api/proxy/admin/kpi/backfill-customer-key?tenantId=${encodeURIComponent(tenantId)}&days=${bfDays}&dryRun=${dryRun ? '1' : '0'}`,
        { method: 'POST', headers: { 'Content-Length': '0' } }
      );
      const json = await res.json() as any;
      if (!json.ok) throw new Error(json.error || 'バックフィル失敗');
      setBfResult({ scanned: json.scanned, updatedCount: json.updatedCount, skippedCount: json.skippedCount, hasMore: json.hasMore, dryRun: json.dryRun });
      if (!dryRun) setBfConfirmed(false); // apply後は確認チェックをリセット
    } catch (e) {
      setBfError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setBfRunning(false);
    }
  };

  // ============================================================
  // Repeat promotion: 対象抽出 / 送信
  // ============================================================
  const runRepeatTargets = async () => {
    setRpRunning(true);
    setRpError(null);
    setRpTargets(null);
    setRpSelected(new Set());
    setRpConfirmed(false);
    setRpSendResult(null);
    setRpSendError(null);
    try {
      // J2: pass maxPerDay, order, excludeSentWithinDays params
      const params = new URLSearchParams({
        tenantId,
        days: String(rpDays),
        limit: '200',
        maxPerDay: String(rpMaxPerDay),
        order: rpOrder,
        excludeSentWithinDays: String(rpExcludeDays),
      });
      const res = await fetch(`/api/proxy/admin/repeat-targets?${params.toString()}`);
      const json = await res.json() as any;
      if (!json.ok) throw new Error(json.error || '対象抽出失敗');
      setRpTargets(json.targets || []);
      // J2: capture meta
      setRpTodaySentCount(json.todaySentCount ?? null);
      setRpRemainingCapacity(json.remainingCapacity ?? null);
      setRpExcludedCount(json.excludedCount ?? null);
      // デフォルト: LINE可能な対象を全選択
      const lineAble = new Set<string>((json.targets as RepeatTarget[]).filter(t => t.lineUserId).map(t => t.customerKey));
      setRpSelected(lineAble);
    } catch (e) {
      setRpError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setRpRunning(false);
    }
  };

  const runRepeatSend = async (dryRun: boolean) => {
    setRpSending(true);
    setRpSendError(null);
    setRpSendResult(null);
    try {
      const customerKeys = Array.from(rpSelected);
      const res = await fetch(
        `/api/proxy/admin/repeat-send?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerKeys, dryRun }),
        }
      );
      const json = await res.json() as any;
      if (!json.ok) throw new Error(json.error || '送信失敗');
      setRpSendResult({ dryRun: json.dryRun, sentCount: json.sentCount, skippedCount: json.skippedCount, total: json.total, cooldownDays: json.cooldownDays, message: json.message, samples: json.samples, skippedReasons: json.skippedReasons });
      if (!dryRun) setRpConfirmed(false);
    } catch (e) {
      setRpSendError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setRpSending(false);
    }
  };

  // ============================================================
  // API: 設定取得
  // ============================================================

  // --- 事前アンケートヘルパー ---
  const addSurveyQuestion = () => {
    const newQ: EyebrowSurveyQuestion = {
      id: `q_${Date.now()}`,
      label: '',
      type: 'text',
      enabled: true,
    };
    setEyebrowSurveyQuestions(prev => [...prev, newQ]);
  };

  const updateSurveyQuestion = (id: string, patch: Partial<EyebrowSurveyQuestion>) => {
    setEyebrowSurveyQuestions(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q));
  };

  const removeSurveyQuestion = (id: string) => {
    setEyebrowSurveyQuestions(prev => prev.filter(q => q.id !== id));
  };

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
      const sa = raw.storeAddress || '';
      setStoreAddress(sa); setSavedStoreAddress(sa);
      const cv = raw.consentText || DEFAULT_CONSENT;
      setConsentText(cv); setSavedConsentText(cv);
      // 眉毛施術設定
      const eyebrow = raw.eyebrow || {};
      const ec = eyebrow.consentText || DEFAULT_EYEBROW_CONSENT;
      setEyebrowConsentText(ec); setSavedEyebrowConsentText(ec);
      const re = eyebrow.repeat?.enabled ?? false;
      setEyebrowRepeatEnabled(re); setSavedEyebrowRepeatEnabled(re);
      const ri = eyebrow.repeat?.intervalDays ?? 42;
      setEyebrowIntervalDays(ri); setSavedEyebrowIntervalDays(ri);
      const rt = eyebrow.repeat?.template || '前回のご来店からそろそろ{interval}週が経ちます。眉毛のリタッチはいかがでしょうか？';
      setEyebrowTemplate(rt); setSavedEyebrowTemplate(rt);
      const bc = eyebrow.bedCount ?? 1;
      setEyebrowBedCount(bc); setSavedEyebrowBedCount(bc);
      const se = eyebrow.surveyEnabled ?? false;
      setEyebrowSurveyEnabled(se); setSavedEyebrowSurveyEnabled(se);
      const sq: EyebrowSurveyQuestion[] = Array.isArray(eyebrow.surveyQuestions) ? eyebrow.surveyQuestions : [];
      setEyebrowSurveyQuestions(sq); setSavedEyebrowSurveyQuestions(sq);
      const al: string[] = Array.isArray(raw.allowedAdminLineUserIds) ? raw.allowedAdminLineUserIds : [];
      setAllowedAdminLineUserIds(al); setSavedAllowedAdminLineUserIds(al);
      // LINE リマインド設定
      const lr = raw.notifications?.lineReminder || {};
      const lre = lr.enabled ?? false;
      setReminderEnabled(lre); setSavedReminderEnabled(lre);
      const lrh = typeof lr.sendAtHour === 'number' ? lr.sendAtHour : 18;
      setReminderSendAtHour(lrh); setSavedReminderSendAtHour(lrh);
      const lrt = lr.template || DEFAULT_REMINDER_TEMPLATE;
      setReminderTemplate(lrt); setSavedReminderTemplate(lrt);
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
    // Fetch current admin's LINE userId from session
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: any) => { if (data?.ok && data.userId) setCurrentAdminUserId(data.userId); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // 保存処理
  // ============================================================

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // API に storeName + 営業時間設定 + 住所 + 同意文 + 眉毛設定を保存
      await saveAdminSettings({
        storeName: storeNameInput,
        openTime,
        closeTime,
        slotIntervalMin,
        storeAddress,
        consentText,
        eyebrow: {
          consentText: eyebrowConsentText,
          repeat: {
            enabled: eyebrowRepeatEnabled,
            intervalDays: eyebrowIntervalDays,
            template: eyebrowTemplate,
          },
          bedCount: eyebrowBedCount,
          surveyEnabled: eyebrowSurveyEnabled,
          surveyQuestions: eyebrowSurveyQuestions,
        },
        allowedAdminLineUserIds,
        notifications: {
          lineReminder: {
            enabled: reminderEnabled,
            sendAtHour: reminderSendAtHour,
            template: reminderTemplate,
          },
        },
      } as any, tenantId);
      setStoreName(storeNameInput);
      setSavedOpenTime(openTime);
      setSavedCloseTime(closeTime);
      setSavedSlotIntervalMin(slotIntervalMin);
      setSavedStoreAddress(storeAddress);
      setSavedConsentText(consentText);
      setSavedEyebrowConsentText(eyebrowConsentText);
      setSavedEyebrowRepeatEnabled(eyebrowRepeatEnabled);
      setSavedEyebrowIntervalDays(eyebrowIntervalDays);
      setSavedEyebrowTemplate(eyebrowTemplate);
      setSavedEyebrowBedCount(eyebrowBedCount);
      setSavedEyebrowSurveyEnabled(eyebrowSurveyEnabled);
      setSavedEyebrowSurveyQuestions(eyebrowSurveyQuestions);
      setSavedAllowedAdminLineUserIds(allowedAdminLineUserIds);
      setSavedReminderEnabled(reminderEnabled);
      setSavedReminderSendAtHour(reminderSendAtHour);
      setSavedReminderTemplate(reminderTemplate);

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
    setStoreAddress(savedStoreAddress);
    setConsentText(savedConsentText);
    setEyebrowConsentText(savedEyebrowConsentText);
    setEyebrowRepeatEnabled(savedEyebrowRepeatEnabled);
    setEyebrowIntervalDays(savedEyebrowIntervalDays);
    setEyebrowTemplate(savedEyebrowTemplate);
    setEyebrowBedCount(savedEyebrowBedCount);
    setEyebrowSurveyEnabled(savedEyebrowSurveyEnabled);
    setEyebrowSurveyQuestions(savedEyebrowSurveyQuestions);
    setAllowedAdminLineUserIds(savedAllowedAdminLineUserIds);
    setReminderEnabled(savedReminderEnabled);
    setReminderSendAtHour(savedReminderSendAtHour);
    setReminderTemplate(savedReminderTemplate);
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

            {/* 住所（storeAddress: storeName と同階層で KV に保存） */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                店舗住所
              </label>
              <input
                type="text"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                value={storeAddress}
                onChange={e => setStoreAddress(e.target.value)}
                placeholder="例: 東京都渋谷区神宮前1-2-3"
              />
            </div>

            {/* 同意文（consentText: 予約確認画面のチェックボックス文言） */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                予約確認の同意文
                <span className="ml-1 text-xs text-indigo-600 font-normal">（予約フローの確認画面に表示）</span>
              </label>
              <textarea
                rows={2}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
                value={consentText}
                onChange={e => setConsentText(e.target.value)}
                placeholder="予約内容を確認し、同意の上で予約を確定します"
              />
              <p className="mt-1 text-xs text-gray-400">未入力の場合はデフォルト文言を使用します</p>
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
            {/* ---- LINE 予約リンク ---- */}
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                <div className="font-semibold text-sm text-gray-900">LINE 予約リンク</div>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                このURLをLINE公式アカウントのリッチメニューや友だち追加メッセージに設定してください。<br />
                LINEのWebhookから開かれた場合は <code className="bg-white border border-gray-200 px-1 rounded">?lu=&lt;lineUserId&gt;</code> が自動付与され、顧客キーが保存されます。
              </p>
              {isMounted && (
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white border border-green-300 rounded-lg px-3 py-2 text-gray-700 break-all select-all">
                    {`${window.location.origin}/booking?tenantId=${encodeURIComponent(tenantId)}`}
                  </code>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/booking?tenantId=${encodeURIComponent(tenantId)}`;
                      navigator.clipboard.writeText(url).then(() => {
                        setUrlCopied(true);
                        setTimeout(() => setUrlCopied(false), 2000);
                      }).catch(() => {});
                    }}
                    className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg border border-green-400 text-green-700 bg-white hover:bg-green-50 transition-colors"
                  >
                    {urlCopied ? '✓ コピー済み' : 'コピー'}
                  </button>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">
                ※ QRコード生成はブラウザの「共有」機能または外部サービスをご利用ください。
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================
            LINE 1日前リマインド設定
        ============================================================ */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-green-100 rounded-lg shrink-0">
              <CalendarDays className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">LINE 1日前リマインド</h2>
              <p className="text-xs text-gray-500">予約の前日に顧客へ LINE で自動リマインドメッセージを送信します</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* ON/OFF トグル */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700">リマインド送信</div>
                <div className="text-xs text-gray-400 mt-0.5">LINE Messaging API 連携が必要です</div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={reminderEnabled}
                    onChange={e => setReminderEnabled(e.target.checked)}
                  />
                  <div className={`w-10 h-6 rounded-full transition-colors ${reminderEnabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${reminderEnabled ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-xs text-gray-600">{reminderEnabled ? 'ON' : 'OFF'}</span>
              </label>
            </div>

            {reminderEnabled && (
              <div className="space-y-4 pl-0">
                {/* 送信時刻 */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 whitespace-nowrap">前日の送信時刻</label>
                  <select
                    value={reminderSendAtHour}
                    onChange={e => setReminderSendAtHour(Number(e.target.value))}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-400 focus:border-green-400 outline-none"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-400">JST</span>
                </div>

                {/* テンプレート */}
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    メッセージテンプレ
                  </label>
                  <textarea
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-400 focus:border-green-400 outline-none resize-none font-mono"
                    value={reminderTemplate}
                    onChange={e => setReminderTemplate(e.target.value)}
                    placeholder={DEFAULT_REMINDER_TEMPLATE}
                  />
                  <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                    利用可能な変数: <code className="bg-gray-100 px-1 rounded">{'{storeName}'}</code> 店舗名 /
                    {' '}<code className="bg-gray-100 px-1 rounded">{'{date}'}</code> 予約日 /
                    {' '}<code className="bg-gray-100 px-1 rounded">{'{time}'}</code> 予約時刻 /
                    {' '}<code className="bg-gray-100 px-1 rounded">{'{menuName}'}</code> メニュー名 /
                    {' '}<code className="bg-gray-100 px-1 rounded">{'{staffName}'}</code> スタッフ名 /
                    {' '}<code className="bg-gray-100 px-1 rounded">{'{address}'}</code> 店舗住所 /
                    {' '}<code className="bg-gray-100 px-1 rounded">{'{manageUrl}'}</code> 予約管理URL
                  </p>
                </div>

                {/* 送信の仕組みの説明 */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700 space-y-1">
                  <p className="font-semibold">動作の仕組み</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Workers の定期ジョブ（5分ごと）が「前日の指定時刻」に一致したときに実行されます</li>
                    <li>翌日の予約を検索し、LINE userId が登録済みの顧客にのみ送信します</li>
                    <li>同じ予約への重複送信は自動で防止されます（<code className="bg-green-100 px-1 rounded">reminder_logs</code> テーブルで管理）</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================
            眉毛施術設定（眉毛サロン特化）
        ============================================================ */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-pink-100 rounded-lg shrink-0">
              <Scissors className="w-5 h-5 text-pink-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">眉毛施術設定</h2>
              <p className="text-xs text-gray-500">眉毛サロン特化の同意文・リピート施策を設定します</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* 施術同意文 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                施術同意文
                <span className="ml-1 text-xs text-pink-600 font-normal">（予約確認時に表示するリスク説明文）</span>
              </label>
              <textarea
                rows={3}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-400 focus:border-pink-400 outline-none transition-all resize-none"
                value={eyebrowConsentText}
                onChange={e => setEyebrowConsentText(e.target.value)}
                placeholder="施術前に肌状態を確認し、アレルギー等のリスクをご理解の上ご予約ください"
              />
              <p className="mt-1 text-xs text-gray-400">予約カルテの同意ログに保存されます</p>
            </div>

            {/* リピート自動化 */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-medium text-gray-700">リピート施策（自動化）</div>
                  <div className="text-xs text-gray-400 mt-0.5">設定した間隔でリピート促進メッセージを送信します</div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={eyebrowRepeatEnabled}
                      onChange={e => setEyebrowRepeatEnabled(e.target.checked)}
                    />
                    <div className={`w-10 h-6 rounded-full transition-colors ${eyebrowRepeatEnabled ? 'bg-pink-500' : 'bg-gray-300'}`} />
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${eyebrowRepeatEnabled ? 'translate-x-4' : ''}`} />
                  </div>
                  <span className="text-xs text-gray-600">{eyebrowRepeatEnabled ? 'ON' : 'OFF'}</span>
                </label>
              </div>

              {eyebrowRepeatEnabled && (
                <div className="space-y-3 pl-0">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 whitespace-nowrap">推奨リピート間隔</label>
                    <input
                      type="number"
                      min="7"
                      max="180"
                      step="7"
                      className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-pink-400 focus:border-pink-400 outline-none"
                      value={eyebrowIntervalDays}
                      onChange={e => setEyebrowIntervalDays(Number(e.target.value))}
                    />
                    <span className="text-sm text-gray-600">日ごと</span>
                    <span className="text-xs text-gray-400">（目安：42日 ≒ 6週）</span>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">メッセージテンプレ</label>
                    <textarea
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-400 focus:border-pink-400 outline-none resize-none"
                      value={eyebrowTemplate}
                      onChange={e => setEyebrowTemplate(e.target.value)}
                      placeholder="前回のご来店からそろそろ{interval}週が経ちます。眉毛のリタッチはいかがでしょうか？"
                    />
                    <p className="mt-1 text-xs text-gray-400">{`{interval}` + ' はリピート間隔（週数）に自動置換されます'}</p>
                  </div>
                </div>
              )}
            </div>

            {/* ベッド数 */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">ベッド数（同時施術キャパ）</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-pink-400 focus:border-pink-400 outline-none"
                  value={eyebrowBedCount}
                  onChange={e => setEyebrowBedCount(Math.max(1, Number(e.target.value)))}
                />
                <span className="text-sm text-gray-600">台</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">同一時間帯に受け付ける最大同時予約数に影響します</p>
            </div>

            {/* 事前アンケート */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-medium text-gray-700">事前アンケート</div>
                  <div className="text-xs text-gray-400 mt-0.5">予約時に顧客へ質問を表示します</div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={eyebrowSurveyEnabled}
                      onChange={e => setEyebrowSurveyEnabled(e.target.checked)}
                    />
                    <div className={`w-10 h-6 rounded-full transition-colors ${eyebrowSurveyEnabled ? 'bg-pink-500' : 'bg-gray-300'}`} />
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${eyebrowSurveyEnabled ? 'translate-x-4' : ''}`} />
                  </div>
                  <span className="text-xs text-gray-600">{eyebrowSurveyEnabled ? 'ON' : 'OFF'}</span>
                </label>
              </div>

              {eyebrowSurveyEnabled && (
                <div className="space-y-2">
                  {eyebrowSurveyQuestions.map((q, idx) => (
                    <div key={q.id} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                      <span className="text-xs text-gray-400 mt-2 w-4 shrink-0">{idx + 1}</span>
                      <div className="flex-1 space-y-1.5">
                        <input
                          type="text"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-pink-400 focus:border-pink-400 outline-none"
                          placeholder="質問文"
                          value={q.label}
                          onChange={e => updateSurveyQuestion(q.id, { label: e.target.value })}
                        />
                        <div className="flex items-center gap-2">
                          <select
                            className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-pink-400"
                            value={q.type}
                            onChange={e => updateSurveyQuestion(q.id, { type: e.target.value as EyebrowSurveyQuestion['type'] })}
                          >
                            <option value="text">テキスト（1行）</option>
                            <option value="textarea">テキスト（複数行）</option>
                            <option value="checkbox">チェックボックス</option>
                          </select>
                          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={q.enabled}
                              onChange={e => updateSurveyQuestion(q.id, { enabled: e.target.checked })}
                              className="w-3.5 h-3.5"
                            />
                            有効
                          </label>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSurveyQuestion(q.id)}
                        className="mt-1.5 p-1 text-gray-400 hover:text-red-500 transition-colors"
                        aria-label="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addSurveyQuestion}
                    className="flex items-center gap-1.5 text-sm text-pink-600 hover:text-pink-700 font-medium mt-1"
                  >
                    <Plus className="w-4 h-4" />
                    質問を追加
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================
            運用ツール: 顧客キー補完（Backfill）
        ============================================================ */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-gray-700">運用ツール：顧客キー補完</h2>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-500">
              過去の予約データに <code className="bg-gray-100 px-1 rounded">customerKey</code> を付与し、KPI転換率の精度を向上させます。
              LINE IDまたは電話番号がある予約のみ対象です。
            </p>

            {/* 対象期間 */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600 whitespace-nowrap">対象期間</label>
              <select
                value={bfDays}
                onChange={e => { setBfDays(Number(e.target.value) as 30 | 90 | 365); setBfResult(null); setBfError(null); }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value={30}>直近30日</option>
                <option value={90}>直近90日</option>
                <option value={365}>直近365日</option>
              </select>
            </div>

            {/* Dry Run ボタン */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => { setBfResult(null); setBfError(null); runBackfill(true); }}
                disabled={bfRunning}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg text-sm font-medium hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {bfRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                ドライラン（確認のみ）
              </button>
            </div>

            {/* エラー表示 */}
            {bfError && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {bfError}
              </div>
            )}

            {/* 結果表示 */}
            {bfResult && (
              <div className={`rounded-xl border p-4 space-y-3 ${bfResult.dryRun ? 'bg-indigo-50 border-indigo-200' : 'bg-green-50 border-green-200'}`}>
                <p className="text-xs font-semibold text-gray-600">
                  {bfResult.dryRun ? '🔍 ドライラン結果（実際の更新はされていません）' : '✅ 適用完了'}
                </p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-white rounded-lg p-2 border border-gray-100">
                    <div className="text-lg font-bold text-gray-800">{bfResult.scanned}</div>
                    <div className="text-xs text-gray-500">スキャン件数</div>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-gray-100">
                    <div className="text-lg font-bold text-indigo-600">{bfResult.updatedCount}</div>
                    <div className="text-xs text-gray-500">{bfResult.dryRun ? '付与可能件数' : '更新件数'}</div>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-gray-100">
                    <div className="text-lg font-bold text-gray-400">{bfResult.skippedCount}</div>
                    <div className="text-xs text-gray-500">スキップ件数</div>
                  </div>
                </div>

                {/* hasMore */}
                {bfResult.hasMore && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
                    ⚠ 200件以上の対象データがあります。「続き実行」で残りを処理できます。
                  </div>
                )}

                {/* Apply セクション（dryRun 結果後に表示） */}
                {bfResult.dryRun && bfResult.updatedCount > 0 && (
                  <div className="border-t border-indigo-200 pt-3 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bfConfirmed}
                        onChange={e => setBfConfirmed(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <span className="text-xs text-gray-700">
                        上記 <strong>{bfResult.updatedCount}件</strong> のcustomerKeyを実際に付与することを確認しました
                      </span>
                    </label>
                    <button
                      onClick={() => runBackfill(false)}
                      disabled={!bfConfirmed || bfRunning}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                    >
                      {bfRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                      適用する（{bfDays}日分）
                    </button>
                  </div>
                )}

                {/* hasMore 続き実行（apply後） */}
                {!bfResult.dryRun && bfResult.hasMore && (
                  <button
                    onClick={() => runBackfill(false)}
                    disabled={bfRunning}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {bfRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                    続き実行
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ============================================================
            運用ツール: リピート促進（LINE）
        ============================================================ */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Scissors className="w-4 h-4 text-pink-500" />
            <h2 className="text-sm font-semibold text-gray-700">運用ツール：リピート促進（LINE）</h2>
          </div>
          <div className="p-5 space-y-4">
            {/* 現在の設定サマリ */}
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              <span>自動化: <strong className={eyebrowRepeatEnabled ? 'text-green-600' : 'text-gray-400'}>{eyebrowRepeatEnabled ? 'ON' : 'OFF'}</strong></span>
              <span>推奨間隔: <strong className="text-gray-700">{eyebrowIntervalDays}日</strong></span>
              <span className="truncate max-w-xs">テンプレ: <em className="text-gray-600">{eyebrowTemplate.slice(0, 40)}{eyebrowTemplate.length > 40 ? '…' : ''}</em></span>
            </div>
            <p className="text-xs text-gray-500">
              最終来店から指定日数以上経過しており、将来予約のない顧客を抽出し、LINEでリピート促進メッセージを送信します。
            </p>

            {/* 抽出条件 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 whitespace-nowrap">最終来店から</label>
                <select
                  value={rpDays}
                  onChange={e => { setRpDays(Number(e.target.value) as 28 | 42 | 60 | 90); setRpTargets(null); setRpSendResult(null); }}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                >
                  <option value={28}>28日以上</option>
                  <option value={42}>42日以上（6週）</option>
                  <option value={60}>60日以上</option>
                  <option value={90}>90日以上</option>
                </select>
                <span className="text-sm text-gray-600 whitespace-nowrap">経過</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 whitespace-nowrap">並び順</label>
                <select
                  value={rpOrder}
                  onChange={e => { setRpOrder(e.target.value as 'oldest' | 'newest'); setRpTargets(null); }}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                >
                  <option value="oldest">古い順（優先度高）</option>
                  <option value="newest">新しい順</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 whitespace-nowrap">1日上限</label>
                <select
                  value={rpMaxPerDay}
                  onChange={e => { setRpMaxPerDay(Number(e.target.value) as 10 | 20 | 50 | 100); setRpTargets(null); }}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                >
                  <option value={10}>10件/日</option>
                  <option value={20}>20件/日</option>
                  <option value={50}>50件/日</option>
                  <option value={100}>100件/日</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 whitespace-nowrap">除外（送信済み）</label>
                <select
                  value={rpExcludeDays}
                  onChange={e => { setRpExcludeDays(Number(e.target.value) as 0 | 3 | 7 | 14 | 30); setRpTargets(null); }}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                >
                  <option value={0}>除外なし</option>
                  <option value={3}>3日以内</option>
                  <option value={7}>7日以内（推奨）</option>
                  <option value={14}>14日以内</option>
                  <option value={30}>30日以内</option>
                </select>
              </div>
            </div>

            {/* J2: 本日送信済み / 残余容量 */}
            {rpTodaySentCount !== null && (
              <div className="flex flex-wrap gap-3 text-xs text-gray-500 px-1">
                <span>本日送信済み: <strong className="text-gray-700">{rpTodaySentCount}件</strong></span>
                {rpRemainingCapacity !== null && (
                  <span>本日残り: <strong className={rpRemainingCapacity > 0 ? 'text-green-600' : 'text-red-500'}>{rpRemainingCapacity}件</strong></span>
                )}
                {rpExcludedCount !== null && rpExcludedCount > 0 && (
                  <span>除外済み（連投防止）: <strong className="text-orange-600">{rpExcludedCount}件</strong></span>
                )}
              </div>
            )}

            {/* 対象抽出ボタン */}
            <button
              onClick={runRepeatTargets}
              disabled={rpRunning}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-pink-300 text-pink-700 bg-pink-50 rounded-lg text-sm font-medium hover:bg-pink-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {rpRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              対象抽出
            </button>

            {/* エラー */}
            {rpError && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {rpError}
              </div>
            )}

            {/* 対象リスト */}
            {rpTargets !== null && (
              <div className="space-y-3">
                {rpTargets.length === 0 ? (
                  <p className="text-sm text-gray-400">対象顧客はいません</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500">
                        {rpTargets.length}件 / LINE可: {rpTargets.filter(t => t.lineUserId).length}件
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setRpSelected(new Set(rpTargets.filter(t => t.lineUserId).map(t => t.customerKey)))}
                          className="text-xs text-pink-600 hover:text-pink-800 underline"
                        >全選択</button>
                        <button
                          onClick={() => setRpSelected(new Set())}
                          className="text-xs text-gray-500 hover:text-gray-700 underline"
                        >全解除</button>
                      </div>
                    </div>
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-3 py-2 text-left font-medium text-gray-500 w-8"></th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">顧客キー</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">最終来店</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">スタイル</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">LINE</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {rpTargets.map(t => (
                            <tr key={t.customerKey} className={rpSelected.has(t.customerKey) ? 'bg-pink-50' : 'hover:bg-gray-50'}>
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={rpSelected.has(t.customerKey)}
                                  disabled={!t.lineUserId}
                                  onChange={e => {
                                    const next = new Set(rpSelected);
                                    if (e.target.checked) next.add(t.customerKey);
                                    else next.delete(t.customerKey);
                                    setRpSelected(next);
                                    setRpConfirmed(false);
                                    setRpSendResult(null);
                                  }}
                                  className="w-3.5 h-3.5 text-pink-600 border-gray-300 rounded focus:ring-pink-500 disabled:opacity-30"
                                />
                              </td>
                              <td className="px-3 py-2 font-mono text-gray-700 max-w-[140px] truncate">{t.customerKey}</td>
                              <td className="px-3 py-2 text-gray-600 tabular-nums">{t.lastReservationAt ? t.lastReservationAt.slice(0, 10) : '—'}</td>
                              <td className="px-3 py-2 text-gray-500">{t.styleType || '—'}</td>
                              <td className="px-3 py-2">
                                {t.lineUserId
                                  ? <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">可</span>
                                  : <span className="px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded text-xs">不可</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* DryRun */}
                    {rpSelected.size > 0 && (
                      <div className="space-y-3">
                        <button
                          onClick={() => { setRpSendResult(null); setRpSendError(null); runRepeatSend(true); }}
                          disabled={rpSending || rpSelected.size === 0}
                          className="inline-flex items-center gap-1.5 px-4 py-2 border border-pink-300 text-pink-700 bg-pink-50 rounded-lg text-sm font-medium hover:bg-pink-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          {rpSending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                          ドライラン（{rpSelected.size}件 確認のみ）
                        </button>

                        {/* 送信エラー */}
                        {rpSendError && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {rpSendError}
                          </div>
                        )}

                        {/* DryRun結果 */}
                        {rpSendResult && rpSendResult.dryRun && (
                          <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 space-y-3">
                            <p className="text-xs font-semibold text-gray-600">🔍 ドライラン結果（未送信）</p>
                            <div className="grid grid-cols-3 gap-3 text-center">
                              <div className="bg-white rounded-lg p-2 border border-gray-100">
                                <div className="text-lg font-bold text-pink-600">{rpSendResult.sentCount}</div>
                                <div className="text-xs text-gray-500">送信可能</div>
                              </div>
                              <div className="bg-white rounded-lg p-2 border border-gray-100">
                                <div className="text-lg font-bold text-gray-400">{rpSendResult.skippedCount}</div>
                                <div className="text-xs text-gray-500">スキップ</div>
                              </div>
                              <div className="bg-white rounded-lg p-2 border border-gray-100">
                                <div className="text-lg font-bold text-gray-700">{rpSendResult.total}</div>
                                <div className="text-xs text-gray-500">合計</div>
                              </div>
                            </div>
                            {rpSendResult.message && (
                              <div className="text-xs text-gray-600 bg-white rounded-lg p-2 border border-gray-100">
                                <span className="font-medium">送信テキスト: </span>{rpSendResult.message}
                              </div>
                            )}
                            {/* 二段階確認 → 実送信 */}
                            {rpSendResult.sentCount > 0 && (
                              <div className="border-t border-pink-200 pt-3 space-y-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={rpConfirmed}
                                    onChange={e => setRpConfirmed(e.target.checked)}
                                    className="w-4 h-4 text-pink-600 border-gray-300 rounded focus:ring-pink-500"
                                  />
                                  <span className="text-xs text-gray-700">
                                    上記 <strong>{rpSendResult.sentCount}件</strong> にLINEメッセージを実際に送信することを確認しました
                                  </span>
                                </label>
                                <button
                                  onClick={() => runRepeatSend(false)}
                                  disabled={!rpConfirmed || rpSending}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                                >
                                  {rpSending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                                  送信する（{rpSendResult.sentCount}件）
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 実送信結果 */}
                        {rpSendResult && !rpSendResult.dryRun && (
                          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                            <p className="text-xs font-semibold text-gray-600">✅ 送信完了</p>
                            <div className="grid grid-cols-2 gap-3 text-center">
                              <div className="bg-white rounded-lg p-2 border border-gray-100">
                                <div className="text-lg font-bold text-green-600">{rpSendResult.sentCount}</div>
                                <div className="text-xs text-gray-500">送信成功</div>
                              </div>
                              <div className="bg-white rounded-lg p-2 border border-gray-100">
                                <div className="text-lg font-bold text-gray-400">{rpSendResult.skippedCount}</div>
                                <div className="text-xs text-gray-500">スキップ</div>
                              </div>
                            </div>
                            {rpSendResult.cooldownDays != null && rpSendResult.cooldownDays > 0 && (
                              <p className="text-xs text-gray-500">連投防止: {rpSendResult.cooldownDays}日以内に送信済みの顧客はスキップ</p>
                            )}
                            {rpSendResult.skippedReasons && rpSendResult.skippedReasons.length > 0 && (
                              <details className="text-xs text-gray-500">
                                <summary className="cursor-pointer hover:text-gray-700">スキップ詳細 ({rpSendResult.skippedReasons.length}件)</summary>
                                <ul className="mt-1 space-y-0.5 pl-2">
                                  {rpSendResult.skippedReasons.map((r, i) => (
                                    <li key={i}>{r.customerKey}: {r.reason}</li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ============================================================
            管理者ログイン許可（LINE userId）
        ============================================================ */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔐</span>
            <h2 className="text-base font-semibold text-gray-800">管理者ログイン許可（LINE userId）</h2>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            管理画面へのログインを許可するLINEアカウントのuserIdを1行1件で入力してください。
            リストが空の場合、初回ログイン時のアカウントが自動的に追加（セルフシード）されます。
          </p>

          {currentAdminUserId && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-1">
              <p className="text-xs font-medium text-indigo-700">現在ログイン中のuserId</p>
              <code className="text-xs font-mono text-indigo-800 break-all">{currentAdminUserId}</code>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">許可リスト（1行1 userId）</label>
            <textarea
              rows={5}
              value={allowedAdminLineUserIds.join('\n')}
              onChange={e => {
                const lines = e.target.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                setAllowedAdminLineUserIds(lines);
              }}
              placeholder={'U1234567890abcdef\nUabcdef1234567890'}
              className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
            <p className="text-xs text-gray-400">
              {allowedAdminLineUserIds.length === 0
                ? '現在のリストは空です。初回ログイン時のアカウントが自動で追加されます。'
                : `${allowedAdminLineUserIds.length}件のuserIdが許可されています`}
            </p>
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
