'use client';

import { useState, useEffect } from 'react';
import { getStaff, createStaff, updateStaff, type Staff } from '@/src/lib/bookingApi';
import { ApiClientError } from '@/src/lib/apiClient';
import Card from '../ui/Card';
import PageHeader from '../ui/PageHeader';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import { Plus, Edit2, X, Calendar } from 'lucide-react';
import StaffShiftEditor from './StaffShiftEditor';
import type { StaffShift } from '@/src/types/shift';

export default function StaffManager() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [showShiftEditor, setShowShiftEditor] = useState<boolean>(false);
  const [shiftEditorStaffId, setShiftEditorStaffId] = useState<string>('');
  const [shiftEditorStaffName, setShiftEditorStaffName] = useState<string>('');
  const [formData, setFormData] = useState<{ name: string; role: string; active: boolean; sortOrder: number }>({
    name: '',
    role: '',
    active: true,
    sortOrder: 0,
  });

  const fetchStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const staff = await getStaff();
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

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleCreate = () => {
    setEditingStaff(null);
    setFormData({ name: '', role: '', active: true, sortOrder: staffList.length });
    setShowModal(true);
  };

  const handleEdit = (staff: Staff) => {
    setEditingStaff(staff);
    setFormData({
      name: staff.name,
      role: staff.role || '',
      active: staff.active,
      sortOrder: staff.sortOrder,
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
      if (editingStaff) {
        await updateStaff(editingStaff.id, {
          name: formData.name.trim(),
          role: formData.role.trim() || undefined,
          active: formData.active,
          sortOrder: formData.sortOrder,
        });
      } else {
        await createStaff({
          name: formData.name.trim(),
          role: formData.role.trim() || undefined,
          active: formData.active,
          sortOrder: formData.sortOrder,
        });
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
      await updateStaff(staff.id, { active: !staff.active });
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
      <PageHeader
        title="スタッフ管理"
        subtitle="スタッフの追加・編集を行います。"
        right={
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md transition-all flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span>追加</span>
          </button>
        }
      />

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
            headers={['名前', '役職', '状態', '操作']}
            rows={staffList.map((staff) => [
              staff.name,
              staff.role || '-',
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-soft max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-brand-text">
              {editingStaff ? 'スタッフを編集' : 'スタッフを追加'}
            </h2>

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

            <div className="flex gap-2 pt-4">
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
            // 将来的にAPI呼び出しをここに追加
          }}
        />
      )}
    </div>
  );
}
