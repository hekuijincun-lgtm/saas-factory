'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface ImageState {
  hero?: string;
  richMenuBg?: string;
  menus?: Record<string, string>;
}

function ImageCard({ label, imageUrl, generating, onGenerate, customPrompt, setCustomPrompt }: {
  label: string; imageUrl?: string; generating: boolean;
  onGenerate: () => void; customPrompt: string; setCustomPrompt: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900">{label}</h3>
        <button onClick={onGenerate} disabled={generating}
          className="px-4 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
          {generating ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              生成中...
            </span>
          ) : imageUrl ? '再生成' : 'AI生成'}
        </button>
      </div>
      {imageUrl ? (
        <img src={imageUrl} alt={label} className="w-full h-48 object-cover rounded-xl border border-gray-100" />
      ) : (
        <div className="w-full h-48 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 text-sm border border-dashed border-gray-200">
          未設定 — AI生成ボタンで画像を作成
        </div>
      )}
      <details className="mt-3">
        <summary className="text-xs text-gray-400 cursor-pointer">カスタムプロンプト（任意）</summary>
        <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
          placeholder="画像の説明を入力（空欄で自動生成）"
          className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400" rows={2} />
      </details>
    </div>
  );
}

export default function ImagesPage() {
  const { tenantId, status } = useAdminTenantId();
  const [images, setImages] = useState<ImageState>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [heroPrompt, setHeroPrompt] = useState('');
  const [rmPrompt, setRmPrompt] = useState('');
  const [menus, setMenus] = useState<{ id: string; name: string; imageUrl?: string }[]>([]);
  const [menuPrompts, setMenuPrompts] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    if (status !== 'ready') return;
    setLoading(true);
    try {
      const [imgRes, menuRes] = await Promise.all([
        fetch(`/api/proxy/admin/ai/images?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' }),
        fetch(`/api/proxy/admin/menu?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' }),
      ]);
      const imgJson: any = await imgRes.json().catch(() => ({}));
      if (imgJson.ok) setImages(imgJson.images || {});
      const menuJson: any = await menuRes.json().catch(() => ({}));
      const menuList = menuJson.menus || menuJson.data || [];
      setMenus(Array.isArray(menuList) ? menuList.map((m: any) => ({ id: m.id, name: m.name, imageUrl: m.imageUrl })) : []);
    } catch {}
    setLoading(false);
  }, [tenantId, status]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const generate = async (type: string, prompt?: string, menuId?: string, menuName?: string) => {
    const key = menuId ? `menu-${menuId}` : type;
    setGenerating(prev => ({ ...prev, [key]: true }));
    try {
      const body: any = { type, vertical: 'pet', shopName: 'ペットサロン' };
      if (prompt) body.prompt = prompt;
      if (menuId) body.menuId = menuId;
      if (menuName) body.menuName = menuName;
      const res = await fetch(`/api/proxy/admin/ai/generate-image?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const json: any = await res.json();
      if (json.ok) {
        if (type === 'hero') setImages(prev => ({ ...prev, hero: json.imageUrl }));
        else if (type === 'richmenu') setImages(prev => ({ ...prev, richMenuBg: json.imageUrl }));
        else if (type === 'menu-thumbnail' && menuId) {
          setImages(prev => ({ ...prev, menus: { ...(prev.menus || {}), [menuId]: json.imageUrl } }));
          setMenus(prev => prev.map(m => m.id === menuId ? { ...m, imageUrl: json.imageUrl } : m));
        }
      } else {
        alert(`生成失敗: ${json.error || json.detail || '不明なエラー'}`);
      }
    } catch (e: any) {
      alert(`エラー: ${e.message}`);
    }
    setGenerating(prev => ({ ...prev, [key]: false }));
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="画像管理" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="画像管理" subtitle="DALL-E 3でLP・リッチメニュー・メニューの画像をAI生成" />

      <div className="px-6 pb-8 space-y-6">
        {/* Hero */}
        <ImageCard label="ヒーロー画像（LP・予約ページ上部）" imageUrl={images.hero}
          generating={!!generating.hero} onGenerate={() => generate('hero', heroPrompt || undefined)}
          customPrompt={heroPrompt} setCustomPrompt={setHeroPrompt} />

        {/* Rich Menu BG */}
        <ImageCard label="リッチメニュー背景" imageUrl={images.richMenuBg}
          generating={!!generating.richmenu} onGenerate={() => generate('richmenu', rmPrompt || undefined)}
          customPrompt={rmPrompt} setCustomPrompt={setRmPrompt} />

        {/* Menu Thumbnails */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">メニューサムネイル</h3>
          {menus.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">メニューが登録されていません</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {menus.map(menu => {
                const menuImg = images.menus?.[menu.id] || menu.imageUrl;
                const isGen = !!generating[`menu-${menu.id}`];
                return (
                  <div key={menu.id} className="border border-gray-100 rounded-xl overflow-hidden">
                    {menuImg ? (
                      <img src={menuImg} alt={menu.name} className="w-full h-32 object-cover" />
                    ) : (
                      <div className="w-full h-32 bg-gray-50 flex items-center justify-center text-3xl">🐾</div>
                    )}
                    <div className="p-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 truncate">{menu.name}</span>
                      <button onClick={() => generate('menu-thumbnail', menuPrompts[menu.id] || undefined, menu.id, menu.name)}
                        disabled={isGen}
                        className="px-3 py-1 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
                        {isGen ? '生成中...' : menuImg ? '再生成' : 'AI生成'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
