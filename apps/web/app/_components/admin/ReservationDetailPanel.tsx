'use client';

import { useState, useEffect } from 'react';
import { Scissors } from 'lucide-react';
import { compressImage, MAX_UPLOAD_BYTES } from '@/src/lib/compressImage';
import { detectAuthError } from '@/src/lib/adminAuthError';
import type { Reservation, ReservationMeta, Staff } from '@/src/lib/bookingApi';
import { getReservationVerticalData } from '@/src/lib/bookingApi';

import { useVertical } from '../../admin/_lib/useVertical';
import { getVerticalConfig } from '@/src/types/settings';
import { getVerticalPluginUI } from '@/src/lib/verticalPlugins';

type DetailTab = 'basic' | 'karte' | 'consent' | 'image' | 'survey';

interface Props {
  reservation: Reservation;
  staffList: Staff[];
  tenantId: string;
  mounted: boolean;
  onClose: () => void;
  onRefresh: () => void;
  /** If provided, shows Cancel button on the basic tab */
  onCancelReservation?: (reservation: Reservation) => void;
  isCancelling?: boolean;
}

export default function ReservationDetailPanel({
  reservation,
  staffList,
  tenantId,
  mounted,
  onClose,
  onRefresh,
  onCancelReservation,
  isCancelling,
}: Props) {
  const { vertical } = useVertical(tenantId);
  // Phase 4: registry 経由で labels / flags を取得
  const vPlugin = getVerticalPluginUI(vertical);

  const ALL_TABS: { id: DetailTab; label: string; icon?: boolean }[] = [
    { id: 'basic',   label: '基本情報' },
    { id: 'karte',   label: vPlugin.labels.karteTab, icon: true },
    { id: 'consent', label: '同意ログ',   icon: true },
    { id: 'image',   label: '画像',       icon: true },
    { id: 'survey',  label: 'アンケート' },
  ];
  const TABS = vPlugin.flags.hasKarte ? ALL_TABS : ALL_TABS.filter(t => t.id !== 'karte');
  const [tab, setTab] = useState<DetailTab>('basic');
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', note: '', staffId: 'any' });
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [metaForm, setMetaForm] = useState<ReservationMeta>({});
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [beforeUploading, setBeforeUploading] = useState(false);
  const [afterUploading, setAfterUploading] = useState(false);
  const [authError, setAuthError] = useState<{ message: string; loginUrl: string } | null>(null);

  // Sync metaForm when reservation changes (e.g. after refresh)
  useEffect(() => {
    setMetaForm(reservation.meta ?? {});
    setTab('basic');
    setEditMode(false);
    setEditError(null);
    setMetaError(null);
  }, [reservation.reservationId]);

  const startEdit = () => {
    setEditForm({
      name: reservation.name,
      phone: reservation.phone || '',
      note: reservation.note || '',
      staffId: reservation.staffId || 'any',
    });
    setEditError(null);
    setEditMode(true);
  };

  const handleEdit = async () => {
    if (!editForm.name.trim()) { setEditError('お名前は必須です'); return; }
    setEditing(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/proxy/admin/reservations/${reservation.reservationId}?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name:    editForm.name.trim(),
          phone:   editForm.phone.trim() || null,
          note:    editForm.note.trim() || null,
          staffId: editForm.staffId === 'any' ? null : editForm.staffId,
        }),
      });
      const ae = detectAuthError(res, tenantId);
      if (ae) { setAuthError({ message: ae.message, loginUrl: ae.loginUrl }); return; }
      const json = await res.json() as any;
      if (!json.ok) throw new Error(json.error || '更新に失敗しました');
      setEditMode(false);
      onRefresh();
      onClose();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '更新に失敗しました');
    } finally {
      setEditing(false);
    }
  };

  const handleMetaSave = async () => {
    setMetaSaving(true);
    setMetaError(null);
    try {
      const res = await fetch(`/api/proxy/admin/reservations/${reservation.reservationId}?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ meta: metaForm }),
      });
      const ae = detectAuthError(res, tenantId);
      if (ae) { setAuthError({ message: ae.message, loginUrl: ae.loginUrl }); return; }
      const json = await res.json() as any;
      if (!json.ok) throw new Error(json.error || '保存に失敗しました');
      onRefresh();
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setMetaSaving(false);
    }
  };

  const handleImageUpload = async (kind: 'before' | 'after', file: File) => {
    kind === 'before' ? setBeforeUploading(true) : setAfterUploading(true);
    setMetaError(null);
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append('file', compressed);
      const res = await fetch(
        `/api/proxy/admin/reservations/${reservation.reservationId}/image?tenantId=${encodeURIComponent(tenantId)}&kind=${kind}`,
        { method: 'POST', body: fd }
      );
      // Auth error detection: 401/403 → show login redirect instead of generic error
      const ae = detectAuthError(res, tenantId);
      if (ae) { setAuthError({ message: ae.message, loginUrl: ae.loginUrl }); return; }
      const json = await res.json() as any;
      if (!json.ok) {
        const msg = json.error === 'file_too_large'
          ? `画像サイズが上限（${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB）を超えています`
          : (json.error || 'アップロードに失敗しました');
        throw new Error(msg);
      }
      const urlKey = kind === 'before' ? 'beforeUrl' : 'afterUrl';
      setMetaForm(m => ({ ...m, [urlKey]: json.imageUrl }));
      onRefresh();
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'アップロードに失敗しました');
    } finally {
      kind === 'before' ? setBeforeUploading(false) : setAfterUploading(false);
    }
  };

  const surveyAnswers = reservation.meta?.surveyAnswers;
  const hasSurvey = !!surveyAnswers && Object.keys(surveyAnswers).length > 0;

  // questionId → label map (Phase 1b: verticalConfig → eyebrow legacy 経由で取得)
  const [qMap, setQMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/proxy/admin/settings?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const s = json?.data ?? json;
        const vc = getVerticalConfig(s);
        const qs: Array<{ id: string; label: string }> = vc.surveyQuestions ?? [];
        const map: Record<string, string> = {};
        for (const q of qs) { if (q.id && q.label) map[q.id] = q.label; }
        setQMap(map);
      })
      .catch(() => {});
  }, [tenantId]);

  const staffName = (() => {
    const sid = reservation.staffId || 'any';
    if (sid === 'any') return '指名なし';
    const s = staffList.find(x => x.id === sid);
    return s ? s.name : sid;
  })();

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={() => { onClose(); setEditMode(false); }}
    >
      <div
        className="bg-white rounded-2xl shadow-soft max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-brand-text">
              {editMode ? '予約を編集' : '予約詳細'}
            </h2>
            <p className="text-sm text-brand-muted mt-1">予約ID: {reservation.reservationId}</p>
          </div>
          <button
            onClick={() => { onClose(); setEditMode(false); }}
            className="p-2 text-brand-muted hover:text-brand-text hover:bg-brand-bg rounded-lg transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Auth error banner ── */}
        {authError && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
            <p className="text-sm font-medium text-amber-800">{authError.message}</p>
            <a
              href={authError.loginUrl}
              className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              ログインページへ
            </a>
          </div>
        )}

        {/* ── Tabs ── */}
        {!editMode && (
          <div className="flex gap-1 border-b border-gray-100 pb-0 flex-wrap">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-all flex items-center gap-1 ${
                  tab === t.id
                    ? 'bg-pink-50 text-pink-700 border-b-2 border-pink-500'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.icon && <Scissors className="w-3 h-3" />}
                {t.label}
                {t.id === 'survey' && hasSurvey && (
                  <span className="ml-1 w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── Edit mode ── */}
        {editMode && (
          <div className="space-y-4">
            {editError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{editError}</div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-brand-muted mb-1">日付（変更不可）</p>
                <p className="text-base text-brand-text">{reservation.date}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-brand-muted mb-1">時間（変更不可）</p>
                <p className="text-base text-brand-text">{reservation.time}</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1">
                お名前 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1">電話番号</label>
              <input
                type="tel"
                value={editForm.phone}
                onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="090-0000-0000"
                className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1">担当スタッフ</label>
              <select
                value={editForm.staffId}
                onChange={e => setEditForm(f => ({ ...f, staffId: e.target.value }))}
                className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary bg-white text-sm"
              >
                <option value="any">指名なし</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1">備考</label>
              <textarea
                value={editForm.note}
                onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleEdit}
                disabled={editing}
                className="flex-1 px-4 py-3 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
              >
                {editing ? '保存中...' : '保存する'}
              </button>
              <button
                onClick={() => { setEditMode(false); setEditError(null); }}
                className="px-4 py-3 text-sm font-medium text-brand-text bg-white border border-brand-border rounded-xl hover:shadow-md transition-all"
              >
                戻る
              </button>
            </div>
          </div>
        )}

        {/* ── 基本情報 ── */}
        {!editMode && tab === 'basic' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-brand-muted mb-1">日付</p>
                <p className="text-base text-brand-text">{reservation.date}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-brand-muted mb-1">時間</p>
                <p className="text-base text-brand-text">{reservation.time}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-brand-muted mb-1">お名前</p>
              <p className="text-base text-brand-text">{reservation.name}</p>
            </div>
            {reservation.phone && (
              <div>
                <p className="text-sm font-medium text-brand-muted mb-1">電話番号</p>
                <p className="text-base text-brand-text">{reservation.phone}</p>
              </div>
            )}
            {reservation.note && (
              <div>
                <p className="text-sm font-medium text-brand-muted mb-1">備考</p>
                <p className="text-base text-brand-text">{reservation.note}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-brand-muted mb-1">作成日時</p>
              <p className="text-base text-brand-text">
                {mounted ? (() => {
                  try { return new Date(reservation.createdAt).toLocaleString('ja-JP'); }
                  catch { return reservation.createdAt; }
                })() : reservation.createdAt}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-brand-muted mb-1">ステータス</p>
              <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 border border-green-200">
                予約済み
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-brand-muted mb-1">担当者</p>
              <p className="text-base text-brand-text">{staffName}</p>
            </div>
            {reservation.meta?.menuName && (
              <div>
                <p className="text-sm font-medium text-brand-muted mb-1">メニュー</p>
                <p className="text-base text-brand-text">{reservation.meta.menuName}</p>
              </div>
            )}
          </div>
        )}

        {/* ── 眉毛カルテ ── */}
        {!editMode && tab === 'karte' && (
          <div className="space-y-3">
            {metaError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{metaError}</div>}
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'template',         label: 'スタイルテンプレ', placeholder: '例: ナチュラル' },
                { key: 'thickness',        label: '太さ',             placeholder: '例: やや太め' },
                { key: 'angle',            label: '角度',             placeholder: '例: 平行' },
                { key: 'arch',             label: 'アーチ形状',       placeholder: '例: ゆるやか' },
                { key: 'skinnessReaction', label: '赤み反応',         placeholder: '例: なし' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                  <input
                    type="text"
                    value={(getReservationVerticalData(metaForm) as any)?.[f.key] ?? ''}
                    onChange={e => {
                      const patch = { [f.key]: e.target.value };
                      setMetaForm(m => ({
                        ...m,
                        eyebrowDesign: { ...m.eyebrowDesign, ...patch },
                        verticalData:  { ...m.verticalData,  ...patch },
                      }));
                    }}
                    placeholder={f.placeholder}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-400"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">カルテメモ</label>
              <textarea
                rows={3}
                value={getReservationVerticalData(metaForm)?.memo ?? ''}
                onChange={e => setMetaForm(m => ({
                  ...m,
                  eyebrowDesign: { ...m.eyebrowDesign, memo: e.target.value },
                  verticalData:  { ...m.verticalData,  memo: e.target.value },
                }))}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-400 resize-none"
              />
            </div>
            <button onClick={handleMetaSave} disabled={metaSaving}
              className="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg hover:bg-pink-600 disabled:opacity-50 transition-all">
              {metaSaving ? '保存中...' : 'カルテを保存'}
            </button>
          </div>
        )}

        {/* ── 同意ログ ── */}
        {!editMode && tab === 'consent' && (
          <div className="space-y-3">
            {metaError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{metaError}</div>}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">同意日時（ISO）</label>
              <input
                type="text"
                value={metaForm.consentLog?.acceptedAt ?? ''}
                onChange={e => setMetaForm(m => ({ ...m, consentLog: { ...m.consentLog, acceptedAt: e.target.value } }))}
                placeholder="例: 2026-03-02T12:00:00+09:00"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-400"
              />
              <button
                type="button"
                onClick={() => setMetaForm(m => ({ ...m, consentLog: { ...m.consentLog, acceptedAt: new Date().toISOString() } }))}
                className="mt-1 text-xs text-pink-600 hover:underline"
              >
                現在時刻を入力
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">同意文バージョンハッシュ</label>
              <input
                type="text"
                value={metaForm.consentLog?.consentVersionHash ?? ''}
                onChange={e => setMetaForm(m => ({ ...m, consentLog: { ...m.consentLog, consentVersionHash: e.target.value } }))}
                placeholder="例: v1_20260302"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-400"
              />
            </div>
            {reservation.meta?.consentLog?.acceptedAt && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                <div className="font-medium">保存済み同意ログ</div>
                <div>同意日時: {reservation.meta.consentLog.acceptedAt}</div>
                {reservation.meta.consentLog.consentVersionHash && (
                  <div>バージョン: {reservation.meta.consentLog.consentVersionHash}</div>
                )}
              </div>
            )}
            <button onClick={handleMetaSave} disabled={metaSaving}
              className="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg hover:bg-pink-600 disabled:opacity-50 transition-all">
              {metaSaving ? '保存中...' : '同意ログを保存'}
            </button>
          </div>
        )}

        {/* ── 画像 ── */}
        {!editMode && tab === 'image' && (
          <div className="space-y-3">
            {metaError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{metaError}</div>}
            {/* Before */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Before画像</label>
              {metaForm.beforeUrl && (
                <img src={metaForm.beforeUrl} alt="before" className="mb-2 max-h-32 rounded-lg object-cover"
                  onError={e => (e.currentTarget.style.display = 'none')} />
              )}
              <label className={`flex items-center justify-center gap-2 px-3 py-2 text-sm border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                beforeUploading
                  ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                  : 'border-pink-300 bg-pink-50 text-pink-600 hover:border-pink-400'
              }`}>
                {beforeUploading ? 'アップロード中...' : metaForm.beforeUrl ? '画像を変更' : '画像をアップロード'}
                <input type="file" accept="image/*" className="hidden" disabled={beforeUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload('before', f); e.target.value = ''; }} />
              </label>
            </div>
            {/* After */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">After画像</label>
              {metaForm.afterUrl && (
                <img src={metaForm.afterUrl} alt="after" className="mb-2 max-h-32 rounded-lg object-cover"
                  onError={e => (e.currentTarget.style.display = 'none')} />
              )}
              <label className={`flex items-center justify-center gap-2 px-3 py-2 text-sm border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                afterUploading
                  ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                  : 'border-pink-300 bg-pink-50 text-pink-600 hover:border-pink-400'
              }`}>
                {afterUploading ? 'アップロード中...' : metaForm.afterUrl ? '画像を変更' : '画像をアップロード'}
                <input type="file" accept="image/*" className="hidden" disabled={afterUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload('after', f); e.target.value = ''; }} />
              </label>
            </div>
            {/* SNS consent */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="rdp_snsPublishOk"
                checked={metaForm.snsPublishOk ?? false}
                onChange={e => setMetaForm(m => ({ ...m, snsPublishOk: e.target.checked }))}
                className="w-4 h-4 text-pink-500 border-gray-300 rounded"
              />
              <label htmlFor="rdp_snsPublishOk" className="text-sm text-gray-700">SNS掲載同意あり</label>
            </div>
            <button onClick={handleMetaSave} disabled={metaSaving}
              className="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg hover:bg-pink-600 disabled:opacity-50 transition-all">
              {metaSaving ? '保存中...' : 'SNS情報を保存'}
            </button>
          </div>
        )}

        {/* ── アンケート ── */}
        {!editMode && tab === 'survey' && (
          <div className="space-y-3">
            {!hasSurvey ? (
              <div className="py-10 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-xl">
                  📋
                </div>
                <p className="text-sm text-gray-500 font-medium">アンケート未回答</p>
                <p className="text-xs text-gray-400 mt-1">この予約にはアンケート回答がありません</p>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(surveyAnswers!).map(([key, value], idx) => (
                  <div key={key} className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-medium text-gray-500 mb-0.5">
                      <span className="text-gray-300 mr-1">{idx + 1}.</span>
                      {qMap[key] || key}
                    </p>
                    <p className="text-sm text-gray-800 font-medium">
                      {typeof value === 'boolean'
                        ? (value ? '✓ はい' : '— いいえ')
                        : String(value) || '（未入力）'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Action buttons (basic tab only, not edit mode) ── */}
        {!editMode && tab === 'basic' && (
          <div className="flex items-center gap-2 pt-4 border-t border-brand-border">
            <button
              onClick={startEdit}
              className="px-4 py-2 text-sm font-medium text-brand-text bg-white border border-brand-border rounded-xl hover:shadow-md transition-all"
            >
              編集
            </button>
            {onCancelReservation && (
              <button
                onClick={() => onCancelReservation(reservation)}
                disabled={isCancelling}
                className="px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isCancelling ? 'キャンセル中...' : 'キャンセル'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
