'use client';

import { useState, useEffect } from 'react';
import { getMenu, createMenuItem, updateMenuItem, deleteMenuItem, type MenuItem } from '@/src/lib/bookingApi';
import { ApiClientError } from '@/src/lib/apiClient';
import Card from '../ui/Card';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import { Plus, Edit2, X, Trash2 } from 'lucide-react';

export default function MenuManager({ tenantId: tenantIdProp }: { tenantId?: string }) {
  // tenantId (safe): read from query string, fallback to "default"
  const tenantId = tenantIdProp ?? (typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("tenantId") || undefined)
      : undefined) ?? "default";
const [menuList, setMenuList] = useState<MenuItem[]>([]);
const [loading, setLoading] = useState<boolean>(false);
const [error, setError] = useState<string | null>(null);
const [showModal, setShowModal] = useState<boolean>(false);
const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
const [formData, setFormData] = useState<{ name: string; price: string; durationMin: string; active: boolean; sortOrder: number }>({
name: '',
    price: '0',
    durationMin: '60',
    active: true,
    sortOrder: 0,
  });

  const fetchMenu = async () => {
    setLoading(true);
    setError(null);
    try {
            const tenantId = tenantIdProp ?? new URLSearchParams(window.location.search).get('tenantId') ?? 'default';
      const menu = await getMenu(tenantId);      // 配列 or { data: [...] } の両対応
      const items = Array.isArray(menu)
        ? menu
        : Array.isArray((menu as any)?.data)
          ? (menu as any).data
          : [];
      if (!Array.isArray(items)) {
        console.warn('fetchMenu: menu is not an array, setting to empty array');
        setMenuList([]);
      } else {
        setMenuList(items);
      }} catch (err) {
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
    setFormData({ name: '', price: '0', durationMin: '60', active: true, sortOrder: menuList.length });
    setShowModal(true);
  };

  const handleEdit = (item: MenuItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      price: String(item.price),
      durationMin: String(item.durationMin),
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
  if (Number(formData.price) < 0) {
    setError('価格は0以上である必要があります');
    return;
  }
  if (Number(formData.durationMin) <= 0) {
    setError('所要時間は1分以上である必要があります');
    return;
  }

  setLoading(true);
  setError(null);

  try {
    let saved: any;

    if (editingItem) {
      const id = editingItem.id;
      saved = await updateMenuItem(id, {
        name: formData.name.trim(),
        price: Number(formData.price),
        durationMin: Number(formData.durationMin),
        active: formData.active,
        sortOrder: formData.sortOrder,
      });
    } else {
      saved = await createMenuItem({
        name: formData.name.trim(),
        price: Number(formData.price),
        durationMin: Number(formData.durationMin),
        active: formData.active,
        sortOrder: formData.sortOrder,
      });
    }

    // API が MenuItem を返す場合 / { ok, data } を返す場合の両対応
    const item = (saved && (saved as any).data) ? (saved as any).data : saved;
    if (item && item.id) {
      setMenuList(prev => {
        const idx = prev.findIndex(x => x.id === item.id);
        if (idx >= 0) {
          const next = prev.slice();
          next[idx] = { ...prev[idx], ...item };
          return next;
        }
        return [...prev, item];
      });
    } else {
      // 念のため: 形が予想外なら再取得にフォールバック（でも基本ここには来ない）
      await fetchMenu();
    }

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

  const handleDelete = async (id: string, name?: string) => {
    // ✅ 最小: state 触らずに削除だけ。失敗したら alert でOK（まず動かす）
    try {
      await deleteMenuItem(tenantId, id);


      

      await fetchMenu();
// UI: remove immediately
      setMenuList(prev => prev.filter(x => x?.id !== id));
      // 再取得関数がこのファイルに無い/名前が違うので、
      // まずはローカルから消して即反映させる（確実）
      setMenuList((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message :
        err instanceof Error ? err.message :
        'メニューの削除に失敗しました';
      alert(msg);
    }
  };

return(
    <div className="space-y-6">
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
            onClick={() => handleDelete(item.id, item.name)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
            title="削除"
          >
            <Trash2 className="w-4 h-4" />
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
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, durationMin: e.target.value })}
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
















