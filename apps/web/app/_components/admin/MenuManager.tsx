'use client';

import { useState, useEffect } from 'react';
import { getMenu, createMenuItem, updateMenuItem, type MenuItem } from '@/src/lib/bookingApi';
import { ApiClientError } from '@/src/lib/apiClient';
import Card from '../ui/Card';
import PageHeader from '../ui/PageHeader';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import { Plus, Edit2, X } from 'lucide-react';

export default function MenuManager() {
  const [menuList, setMenuList] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState<{ name: string; price: number; durationMin: number; active: boolean; sortOrder: number }>({
    name: '',
    price: 0,
    durationMin: 60,
    active: true,
    sortOrder: 0,
  });

  const fetchMenu = async () => {
    setLoading(true);
    setError(null);
    try {
            const tenantId = new URLSearchParams(window.location.search).get('tenantId') ?? 'default';
      const menu = await getMenu(tenantId);
      // 配列チェック
      if (Array.isArray(menu)) {
        setMenuList(menu);
      } else {
        console.warn('fetchMenu: menu is not an array, setting to empty array');
        setMenuList([]);
      }
    } catch (err) {
      const errorMessage =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to fetch menu';
      setError(errorMessage);
      setMenuList([]); // エラー時は空配列にフォールバック
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  const handleCreate = () => {
    setEditingItem(null);
    setFormData({ name: '', price: 0, durationMin: 60, active: true, sortOrder: menuList.length });
    setShowModal(true);
  };

  const handleEdit = (item: MenuItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      price: item.price,
      durationMin: item.durationMin,
      active: item.active,
      sortOrder: item.sortOrder,
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError('メニュー名は必須です');
      return;
    }
    if (formData.price < 0) {
      setError('価格は0以上である必要があります');
      return;
    }
    if (formData.durationMin <= 0) {
      setError('所要時間は1分以上である必要があります');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (editingItem) {
        await updateMenuItem(editingItem.id, {
          name: formData.name.trim(),
          price: formData.price,
          durationMin: formData.durationMin,
          active: formData.active,
          sortOrder: formData.sortOrder,
        });
      } else {
        await createMenuItem({
          name: formData.name.trim(),
          price: formData.price,
          durationMin: formData.durationMin,
          active: formData.active,
          sortOrder: formData.sortOrder,
        });
      }
      await fetchMenu();
      setShowModal(false);
    } catch (err) {
      const errorMessage =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to save menu item';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (item: MenuItem) => {
    setLoading(true);
    setError(null);
    try {
      await updateMenuItem(item.id, { active: !item.active });
      await fetchMenu();
    } catch (err) {
      const errorMessage =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to update menu item';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="メニュー管理"
        subtitle="メニューの追加・編集を行います。"
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
        {loading && menuList.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
            <span className="ml-3 text-sm text-brand-muted">読み込み中...</span>
          </div>
        ) : (
          <DataTable
            headers={['メニュー名', '価格', '所要時間', '状態', '操作']}
            rows={menuList.map((item) => [
              item.name,
              `¥${item.price.toLocaleString()}`,
              `${item.durationMin}分`,
              <Badge key="status" variant={item.active ? 'success' : 'muted'}>
                {item.active ? '有効' : '無効'}
              </Badge>,
              <div key="actions" className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(item)}
                  className="p-2 text-brand-primary hover:bg-brand-bg rounded-lg transition-all"
                  title="編集"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleToggleActive(item)}
                  className="p-2 text-brand-muted hover:bg-brand-bg rounded-lg transition-all"
                  title={item.active ? '無効化' : '有効化'}
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
              {editingItem ? 'メニューを編集' : 'メニューを追加'}
            </h2>

            <div>
              <label className="block text-sm font-medium text-brand-text mb-2">メニュー名 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                placeholder="メニュー名"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-text mb-2">価格 *</label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                min="0"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-text mb-2">所要時間（分） *</label>
              <input
                type="number"
                value={formData.durationMin}
                onChange={(e) => setFormData({ ...formData, durationMin: parseInt(e.target.value) || 60 })}
                className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                min="1"
                placeholder="60"
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
    </div>
  );
}

