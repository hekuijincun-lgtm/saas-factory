'use client';

import { useState, useEffect } from 'react';
import { getStaff, createStaff, updateStaff, type Staff } from '@/src/lib/bookingApi';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import { ApiClientError } from '@/src/lib/apiClient';
import Card from '../ui/Card';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import { Plus, Edit2, X, Calendar, Scissors } from 'lucide-react';
import StaffShiftEditor from './StaffShiftEditor';
import type { StaffShift, TimeStr } from '@/src/types/shift';
import { generateTimeOptions } from '@/src/lib/shiftUtils';
import { useAdminSettings, clearAdminSettingsCache } from '../../admin/_lib/useAdminSettings';
import { fetchAdminSettings, saveAdminSettings } from '../../lib/adminApi';
import { useVerticalPlugin } from '../../admin/_lib/useVerticalPlugin';

export default function StaffManager() {
  const { tenantId, status: tenantStatus } = useAdminTenantId();
  const { plugin: vPlugin } = useVerticalPlugin(tenantId);
  const { settings: bizSettings } = useAdminSettings(tenantId);
  // settings 由来の時刻選択肢（fallback: 10:00-20:00/30min）
  const settingsTimeOptions = generateTimeOptions(bizSettings.open, bizSettings.close, bizSettings.interval) as TimeStr[];

  // staffSelectionEnabled: 予約フローでスタッフ選択を表示するか
  const [staffSelectionEnabled, setStaffSelectionEnabled] = useState<boolean>(true);
  const [staffSelectionSaving, setStaffSelectionSaving] = useState<boolean>(false);

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [showShiftEditor, setShowShiftEditor] = useState<boolean>(false);
  const [shiftEditorStaffId, setShiftEditorStaffId] = useState<string>('');
  const [shiftEditorStaffName, setShiftEditorStaffName] = useState<string>('');
  const [formData, setFormData] = useState<{
    name: string; role: string; active: boolean; sortOrder: number;
    nominationFee: string;
    verticalAttrs: Record<string, unknown>;
    specialtyInput: string;
  }>({
    name: '',
    role: '',
    active: true,
    sortOrder: 0,
    nominationFee: '0',
    verticalAttrs: {},
    specialtyInput: '',
  });

  // staffSelectionEnabled の読み込み
  useEffect(() => {
    if (tenantStatus !== "ready") return;
    fetchAdminSettings(tenantId).then(s => {
      const raw = s as any;
      setStaffSelectionEnabled(raw.staffSelectionEnabled !== false);
    }).catch(() => { /* fallback: true のまま */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, tenantStatus]);

  const handleStaffSelectionToggle = async (enabled: boolean) => {
    setStaffSelectionSaving(true);
    try {
      await saveAdminSettings({ staffSelectionEnabled: enabled } as any, tenantId);
      setStaffSelectionEnabled(enabled);
      clearAdminSettingsCache(tenantId);
    } catch { /* ignore */ } finally {
      setStaffSelectionSaving(false);
    }
  };

  const fetchStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const staff = await getStaff(tenantId);
      // 配列チェック
      if (Array.isArray(staff)) {
        setStaffList(staff);
      } else {
        console.warn('fetchStaff: staff is not an array, setting to empty array');
        setStaffList([]);
      }
    } catch (err) {
      const errorMessage =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to fetch staff';
      setError(errorMessage);
      setStaffList([]); // エラー時は空配列にフォールバック
    } finally {
      setLoading(false);
    }
  };

  // tenantId が確定してから取得する（ready 前に default で読まない）
  useEffect(() => {
    if (tenantStatus !== "ready") return;
    fetchStaff();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantStatus, tenantId]);

  const handleCreate = () => {
    setEditingStaff(null);
    setFormData({ name: '', role: '', active: true, sortOrder: staffList.length, nominationFee: '0', verticalAttrs: {}, specialtyInput: '' });
    setShowModal(true);
  };

  const handleEdit = (staff: Staff) => {
    setEditingStaff(staff);
    setFormData({
      name: staff.name,
      role: staff.role || '',
      active: staff.active,
      sortOrder: staff.sortOrder,
      nominationFee: String(staff.nominationFee ?? 0),
      verticalAttrs: (staff as any).verticalAttributes ?? {},
      specialtyInput: '',
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError('名前は必須です');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Phase 11: verticalAttributes — dynamic vertical attrs
      const hasAttrs = Object.keys(formData.verticalAttrs).length > 0;
      const verticalFields: Record<string, any> = {};
      if (vPlugin.flags.hasStaffAttributes && hasAttrs) {
        verticalFields.verticalAttributes = formData.verticalAttrs;
      }

      const fee = Math.max(0, Math.floor(Number(formData.nominationFee) || 0));

      if (editingStaff) {
        await updateStaff(editingStaff.id, {
          name: formData.name.trim(),
          role: formData.role.trim() || undefined,
          active: formData.active,
          sortOrder: formData.sortOrder,
          nominationFee: fee,
          ...verticalFields,
        }, tenantId);
      } else {
        await createStaff({
          name: formData.name.trim(),
          role: formData.role.trim() || undefined,
          active: formData.active,
          sortOrder: formData.sortOrder,
          nominationFee: fee,
          ...verticalFields,
        }, tenantId);
      }
      await fetchStaff();
      setShowModal(false);
    } catch (err) {
      const errorMessage =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to save staff';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (staff: Staff) => {
    setLoading(true);
    setError(null);
    try {
      await updateStaff(staff.id, { active: !staff.active }, tenantId);
      await fetchStaff();
    } catch (err) {
      const errorMessage =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to update staff';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* スタッフ選択ON/OFFトグル */}
      <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div>
          <p className="text-sm font-semibold text-gray-900">スタッフ選択を有効にする</p>
          <p className="text-xs text-gray-500 mt-0.5">OFFにすると予約フローのスタッフ選択画面がスキップされます</p>
        </div>
        <button
          type="button"
          disabled={staffSelectionSaving}
          onClick={() => handleStaffSelectionToggle(!staffSelectionEnabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 ${
            staffSelectionEnabled ? 'bg-indigo-600' : 'bg-gray-300'
          }`}
          aria-checked={staffSelectionEnabled}
          role="switch"
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              staffSelectionEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="flex justify-end mb-6">
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md transition-all flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          <span>追加</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <Card>
        {loading && staffList.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
            <span className="ml-3 text-sm text-brand-muted">読み込み中...</span>
          </div>
        ) : (
          <DataTable
            headers={['名前', '役職', '指名料', '状態', '操作']}
            rows={staffList.map((staff) => [
              staff.name,
              staff.role || '-',
              staff.nominationFee > 0
                ? `¥${staff.nominationFee.toLocaleString()}`
                : '¥0',
              <Badge key="status" variant={staff.active ? 'success' : 'muted'}>
                {staff.active ? '有効' : '無効'}
              </Badge>,
              <div key="actions" className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShiftEditorStaffId(staff.id);
                    setShiftEditorStaffName(staff.name);
                    setShowShiftEditor(true);
                  }}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                  title="シフト設定"
                >
                  <Calendar className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleEdit(staff)}
                  className="p-2 text-brand-primary hover:bg-brand-bg rounded-lg transition-all"
                  title="編集"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleToggleActive(staff)}
                  className="p-2 text-brand-muted hover:bg-brand-bg rounded-lg transition-all"
                  title={staff.active ? '無効化' : '有効化'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>,
            ])}
          />
        )}
      </Card>

      {/* モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto" onClick={() => setShowModal(false)}>
          <div className="min-h-full flex items-start justify-center p-4 sm:p-6">
            <div
              className="w-full max-w-md rounded-2xl bg-white shadow-soft max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header — 固定 */}
              <div className="shrink-0 px-6 pt-6 pb-3 border-b border-brand-border">
                <h2 className="text-xl font-semibold text-brand-text">
                  {editingStaff ? 'スタッフを編集' : 'スタッフを追加'}
                </h2>
              </div>

              {/* Body — スクロール可能 */}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-brand-text mb-2">名前 *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                    placeholder="スタッフ名"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-brand-text mb-2">役職</label>
                  <input
                    type="text"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                    placeholder="例: Top Stylist"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-brand-text mb-2">指名料（円）</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.nominationFee}
                    onChange={(e) => setFormData({ ...formData, nominationFee: e.target.value })}
                    className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                    placeholder="0"
                  />
                  <p className="mt-1 text-xs text-brand-muted">0 の場合は指名料なしとして扱われます</p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="active"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="w-4 h-4 text-brand-primary border-brand-border rounded focus:ring-brand-primary"
                  />
                  <label htmlFor="active" className="text-sm text-brand-text">有効</label>
                </div>

                {/* Phase 11: vertical-dynamic スタッフ属性セクション */}
                {vPlugin.flags.hasStaffAttributes && (<div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Scissors className="w-4 h-4 text-pink-500" />
                    <span className="text-sm font-medium text-gray-700">{vPlugin.labels.staffSettingsHeading}</span>
                  </div>
                  <div className="space-y-3">
                    {/* 技術レベル（共通） */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">技術レベル</label>
                      <div className="flex gap-1.5">
                        {([1, 2, 3, 4, 5] as const).map(lv => (
                          <button
                            key={lv}
                            type="button"
                            onClick={() => setFormData({ ...formData, verticalAttrs: { ...formData.verticalAttrs, skillLevel: formData.verticalAttrs.skillLevel === lv ? undefined : lv } })}
                            className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                              formData.verticalAttrs.skillLevel === lv
                                ? 'bg-pink-500 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                            title={['', '初級', '初中級', '中級', '上級', 'エキスパート'][lv]}
                          >
                            {lv}
                          </button>
                        ))}
                        <span className="ml-2 text-xs text-gray-400 self-center">
                          {typeof formData.verticalAttrs.skillLevel === 'number' ? ['', '初級', '初中級', '中級', '上級', 'エキスパート'][formData.verticalAttrs.skillLevel] : '未設定'}
                        </span>
                      </div>
                    </div>
                    {/* 得意技術タグ（共通） */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">得意技術タグ</label>
                      <div className="flex gap-1.5 flex-wrap mb-2">
                        {(Array.isArray(formData.verticalAttrs.specialties) ? formData.verticalAttrs.specialties as string[] : []).map(tag => (
                          <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-pink-100 text-pink-700 rounded-full text-xs">
                            {tag}
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, verticalAttrs: { ...formData.verticalAttrs, specialties: (formData.verticalAttrs.specialties as string[]).filter((t: string) => t !== tag) } })}
                              className="text-pink-500 hover:text-pink-700"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={`例: ${vPlugin.key === 'dental' ? '矯正, インプラント' : vPlugin.key === 'hair' ? 'カラーリスト, 縮毛矯正' : 'ナチュラル, 韓国風'}`}
                          value={formData.specialtyInput}
                          onChange={e => setFormData({ ...formData, specialtyInput: e.target.value })}
                          onKeyDown={e => {
                            if ((e.key === 'Enter' || e.key === ',') && formData.specialtyInput.trim()) {
                              e.preventDefault();
                              const tag = formData.specialtyInput.trim().replace(/,$/, '');
                              const current = Array.isArray(formData.verticalAttrs.specialties) ? formData.verticalAttrs.specialties as string[] : [];
                              if (tag && !current.includes(tag)) {
                                setFormData({ ...formData, specialtyInput: '', verticalAttrs: { ...formData.verticalAttrs, specialties: [...current, tag] } });
                              }
                            }
                          }}
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-400"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const tag = formData.specialtyInput.trim();
                            const current = Array.isArray(formData.verticalAttrs.specialties) ? formData.verticalAttrs.specialties as string[] : [];
                            if (tag && !current.includes(tag)) {
                              setFormData({ ...formData, specialtyInput: '', verticalAttrs: { ...formData.verticalAttrs, specialties: [...current, tag] } });
                            }
                          }}
                          className="px-3 py-1.5 text-sm bg-pink-100 text-pink-700 rounded-lg hover:bg-pink-200 transition-all"
                        >
                          追加
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">Enter またはカンマで追加</p>
                    </div>
                  </div>
                </div>)}
              </div>

              {/* Footer — 固定 */}
              <div className="shrink-0 px-6 py-4 border-t border-brand-border bg-white flex gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 bg-white text-brand-text border border-brand-border rounded-xl font-medium hover:shadow-md transition-all"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !formData.name.trim()}
                  className="flex-1 px-4 py-3 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:bg-brand-muted disabled:cursor-not-allowed transition-all"
                >
                  {loading ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* シフト設定エディター */}
      {showShiftEditor && (
        <StaffShiftEditor
          staffId={shiftEditorStaffId}
          staffName={shiftEditorStaffName}
          onClose={() => {
            setShowShiftEditor(false);
            setShiftEditorStaffId('');
            setShiftEditorStaffName('');
          }}
          onSave={(shift: StaffShift) => {
            console.log('Shift saved:', shift);
          }}
          timeOptions={settingsTimeOptions}
          defaultOpen={bizSettings.open}
          defaultClose={bizSettings.close}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}
