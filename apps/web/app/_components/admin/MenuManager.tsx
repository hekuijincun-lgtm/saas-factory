'use client';

import { useState, useEffect, useRef } from 'react';
import { getMenu, deleteMenuItem, getMenuVerticalAttrs, type MenuItem, type MenuItemEyebrow } from '@/src/lib/bookingApi';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import { ApiClientError } from '@/src/lib/apiClient';
import { compressImage, MAX_UPLOAD_BYTES } from '@/src/lib/compressImage';
import Card from '../ui/Card';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import { Plus, Edit2, Trash2, Scissors, ImageIcon, X } from 'lucide-react';
import { useVertical } from '../../admin/_lib/useVertical';

export default function MenuManager({ tenantId: tenantIdProp }: { tenantId?: string }) {
  const { tenantId: sessionTenantId } = useAdminTenantId();
  const tenantId = tenantIdProp ?? sessionTenantId;
  const { vertical } = useVertical(tenantId);
  const isEyebrow = vertical === 'eyebrow';

  const [menuList, setMenuList] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState<{
    name: string; price: string; durationMin: string; active: boolean; sortOrder: number;
    eyebrow: MenuItemEyebrow;
    imageKey?: string;
    imageUrl?: string;
  }>({
    name: '',
    price: '0',
    durationMin: '60',
    active: true,
    sortOrder: 0,
    eyebrow: { firstTimeOnly: false, genderTarget: 'both', styleType: undefined },
  });

  // 画像アップロード用
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMenu = async () => {
    setLoading(true);
    setError(null);
    try {
      const menu = await getMenu(tenantId);
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
      }
    } catch (err) {
      const errorMessage =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to fetch menu';
      setError(errorMessage);
      setMenuList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  const resetImageState = () => {
    if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImageFile(null);
    setImagePreviewUrl(null);
  };

  const handleCreate = () => {
    setEditingItem(null);
    resetImageState();
    setFormData({
      name: '', price: '0', durationMin: '60', active: true,
      sortOrder: menuList.length,
      eyebrow: { firstTimeOnly: false, genderTarget: 'both', styleType: undefined },
    });
    setShowModal(true);
  };

  const handleEdit = (item: MenuItem) => {
    setEditingItem(item);
    resetImageState();
    // 既存画像があればプレビューに表示（blob URL ではなく imageUrl をそのまま使う）
    setImagePreviewUrl(item.imageUrl ?? null);
    // Phase 2a: verticalAttributes → eyebrow の優先順位で読む
    const attrs = getMenuVerticalAttrs(item);
    setFormData({
      name: item.name,
      price: String(item.price),
      durationMin: String(item.durationMin),
      active: item.active,
      sortOrder: item.sortOrder,
      eyebrow: {
        firstTimeOnly: attrs?.firstTimeOnly ?? false,
        genderTarget: attrs?.genderTarget ?? 'both',
        styleType: attrs?.styleType,
      },
      imageKey: item.imageKey,
      imageUrl: item.imageUrl,
    });
    setShowModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImageFile(file);
    setImagePreviewUrl(file ? URL.createObjectURL(file) : (formData.imageUrl ?? null));
  };

  const handleClearImage = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    resetImageState();
    setFormData(prev => ({ ...prev, imageKey: undefined, imageUrl: undefined }));
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
      let imageUrl = formData.imageUrl;

      // 新しいファイルが選択されていれば圧縮してから R2 にアップロード
      if (imageFile) {
        const compressed = await compressImage(imageFile);
        const fd = new FormData();
        fd.append('file', compressed);
        const upRes = await fetch(
          `/api/proxy/admin/menu/image?tenantId=${encodeURIComponent(tenantId)}&menuId=${encodeURIComponent(editingItem?.id ?? 'new')}`,
          { method: 'POST', body: fd }
        );
        const upData = await upRes.json().catch(() => ({})) as any;
        if (!upRes.ok || !upData.imageUrl) {
          const msg = upData.error === 'file_too_large'
            ? `画像サイズが上限（${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB）を超えています`
            : (upData.error || '画像アップロードに失敗しました');
          throw new Error(msg);
        }
        imageUrl = upData.imageUrl;
      }

      // Phase 2a: eyebrow テナントのみ eyebrow + verticalAttributes を dual-write
      // 非 eyebrow テナントでは eyebrow を送らない（汚染防止）
      const itemPayload: Record<string, any> = {
        name: formData.name.trim(),
        price: Number(formData.price),
        durationMin: Number(formData.durationMin),
        active: formData.active,
        sortOrder: formData.sortOrder,
        imageUrl: imageUrl ?? null, // null = 削除指示（Workers PATCH が !imageUrl で delete）
      };
      if (isEyebrow) {
        itemPayload.eyebrow = formData.eyebrow;
        itemPayload.verticalAttributes = formData.eyebrow;
      }

      // tenantId を URL に含めて fetch（updateMenuItem/createMenuItem は tenantId 非対応）
      let saved: any;
      if (editingItem) {
        const res = await fetch(
          `/api/proxy/admin/menu/${encodeURIComponent(editingItem.id)}?tenantId=${encodeURIComponent(tenantId)}`,
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itemPayload) }
        );
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((resData as any).error || `保存に失敗しました (${res.status})`);
        saved = (resData as any).data ?? resData;
      } else {
        const res = await fetch(
          `/api/proxy/admin/menu?tenantId=${encodeURIComponent(tenantId)}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itemPayload) }
        );
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((resData as any).error || `保存に失敗しました (${res.status})`);
        saved = (resData as any).data ?? resData;
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
        await fetchMenu();
      }

      resetImageState();
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
      const res = await fetch(
        `/api/proxy/admin/menu/${encodeURIComponent(item.id)}?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !item.active }) }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as any;
        throw new Error(d.error || `Failed to toggle active (${res.status})`);
      }
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

  const handleDelete = async (id: string) => {
    try {
      await deleteMenuItem(tenantId, id);
      await fetchMenu();
      setMenuList(prev => prev.filter(x => x?.id !== id));
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message :
        err instanceof Error ? err.message :
        'メニューの削除に失敗しました';
      alert(msg);
    }
  };

  return (
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
            headers={['', 'メニュー名', '価格', '所要時間', '状態', '操作']}
            rows={menuList.map((item) => [
              /* サムネイル */
              item.imageUrl ? (
                <img
                  key="thumb"
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-10 h-10 rounded-lg object-cover"
                />
              ) : (
                <div key="thumb-placeholder" className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4 text-gray-400" />
                </div>
              ),
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
                  onClick={() => handleDelete(item.id)}
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
          <div
            className="bg-white rounded-2xl shadow-soft max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-brand-text">
              {editingItem ? 'メニューを編集' : 'メニューを追加'}
            </h2>

            {/* メニュー名 */}
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

            {/* 価格 */}
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

            {/* 所要時間 */}
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

            {/* 有効チェック */}
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

            {/* 画像アップロード */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <ImageIcon className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-gray-700">メニュー画像</span>
                <span className="text-xs text-gray-400">（自動圧縮、任意）</span>
              </div>

              {/* プレビュー */}
              {imagePreviewUrl ? (
                <div className="relative w-24 h-24 mb-3">
                  <img
                    src={imagePreviewUrl}
                    alt="preview"
                    className="w-24 h-24 rounded-xl object-cover border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={handleClearImage}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                    title="画像を削除"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-24 h-24 rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center mb-3">
                  <ImageIcon className="w-8 h-8 text-gray-300" />
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="menu-image-input"
              />
              <label
                htmlFor="menu-image-input"
                className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
              >
                <ImageIcon className="w-4 h-4 text-gray-500" />
                {imagePreviewUrl ? '画像を変更' : '画像を選択'}
              </label>
            </div>

            {/* 眉毛設定セクション（eyebrow vertical のみ表示） */}
            {isEyebrow && (
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Scissors className="w-4 h-4 text-pink-500" />
                <span className="text-sm font-medium text-gray-700">眉毛設定</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="firstTimeOnly"
                    checked={formData.eyebrow.firstTimeOnly ?? false}
                    onChange={(e) => setFormData({ ...formData, eyebrow: { ...formData.eyebrow, firstTimeOnly: e.target.checked } })}
                    className="w-4 h-4 text-pink-500 border-gray-300 rounded"
                  />
                  <label htmlFor="firstTimeOnly" className="text-sm text-gray-700">初回限定メニュー</label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">性別ターゲット</label>
                  <div className="flex gap-2">
                    {(['both', 'female', 'male'] as const).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFormData({ ...formData, eyebrow: { ...formData.eyebrow, genderTarget: v } })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          formData.eyebrow.genderTarget === v
                            ? 'bg-pink-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {v === 'both' ? '全性別' : v === 'female' ? 'レディース' : 'メンズ'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">スタイル種別</label>
                  <div className="flex flex-wrap gap-2">
                    {([undefined, 'natural', 'sharp', 'korean', 'custom'] as const).map(v => (
                      <button
                        key={v ?? 'none'}
                        type="button"
                        onClick={() => setFormData({ ...formData, eyebrow: { ...formData.eyebrow, styleType: v } })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          formData.eyebrow.styleType === v
                            ? 'bg-pink-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {v === undefined ? '指定なし' : v === 'natural' ? 'ナチュラル' : v === 'sharp' ? 'シャープ' : v === 'korean' ? '韓国風' : 'カスタム'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            )}

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
