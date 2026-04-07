'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface ButtonConfig {
  buttonIndex: number;
  label: string;
  actionType: 'uri' | 'message';
  actionValue: string;
}

const TEMPLATES = [
  { key: 'pet-default', label: 'ペットサロン（デフォルト）', description: '予約・メニュー・クーポン等の6分割レイアウト', buttons: 6 },
];

function defaultButtons(tenantId: string): ButtonConfig[] {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return [
    { buttonIndex: 0, label: '予約する', actionType: 'uri', actionValue: `${base}/booking?tenantId=${tenantId}` },
    { buttonIndex: 1, label: 'メニュー', actionType: 'message', actionValue: 'メニューを見たい' },
    { buttonIndex: 2, label: 'クーポン', actionType: 'message', actionValue: 'クーポンを確認する' },
    { buttonIndex: 3, label: 'カルテ', actionType: 'message', actionValue: 'カルテを見たい' },
    { buttonIndex: 4, label: '予約履歴', actionType: 'message', actionValue: '予約履歴を見たい' },
    { buttonIndex: 5, label: 'インスタグラム', actionType: 'uri', actionValue: 'https://www.instagram.com/' },
  ];
}

const GRID_LABELS = [
  '上段・左', '上段・中', '上段・右',
  '下段・左', '下段・中', '下段・右',
];

export default function RichMenuPage() {
  const { tenantId, status } = useAdminTenantId();
  const [selectedTemplate, setSelectedTemplate] = useState('pet-default');
  const [richMenuBg, setRichMenuBg] = useState<string | undefined>();
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [buttons, setButtons] = useState<ButtonConfig[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [designPrompt, setDesignPrompt] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    if (status !== 'ready') return;
    setLoading(true);
    try {
      const [imgRes, btnRes] = await Promise.all([
        fetch(`/api/proxy/admin/ai/images?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' }),
        fetch(`/api/proxy/admin/line/rich-menu/buttons?tenantId=${encodeURIComponent(tenantId)}&template=${selectedTemplate}`, { cache: 'no-store' }),
      ]);
      const imgJson: any = await imgRes.json().catch(() => ({}));
      if (imgJson.ok) setRichMenuBg(imgJson.images?.richMenuBg);

      const btnJson: any = await btnRes.json().catch(() => ({}));
      if (btnJson.ok && btnJson.buttons?.length > 0) {
        setButtons(btnJson.buttons.map((b: any) => ({
          buttonIndex: b.button_index,
          label: b.label,
          actionType: b.action_type,
          actionValue: b.action_value,
        })));
      } else {
        setButtons(defaultButtons(tenantId));
      }
    } catch {}
    setLoading(false);
  }, [tenantId, status, selectedTemplate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const parseDesignTheme = (prompt: string) => {
    const p = prompt.toLowerCase();
    if (p.includes('ピンク') || p.includes('かわいい'))
      return { bg: '#FFF0F5', cells: ['#E8A0B4','#F0B8C8','#D4889E','#C8E0C0','#A0C8D8','#D0A8C0'], text: '#FFFFFF', accent: '#E8A0B4' };
    if (p.includes('白') || p.includes('シンプル') || p.includes('ミニマル'))
      return { bg: '#F5F5F0', cells: ['#FFFFFF','#F0F0EB','#FAFAF7','#E8E8E4','#F0F0EB','#FFFFFF'], text: '#1C1C1C', accent: '#888888' };
    if (p.includes('青') || p.includes('クール'))
      return { bg: '#E8F0F8', cells: ['#4A7FB5','#6A9FD5','#3A6FA5','#80B8A0','#5A8FBA','#7090C0'], text: '#FFFFFF', accent: '#4A7FB5' };
    if (p.includes('緑') || p.includes('森') || p.includes('ナチュラル'))
      return { bg: '#F0F5E8', cells: ['#7AB87A','#90C890','#6AA06A','#A0C8B0','#80B090','#6AA07A'], text: '#FFFFFF', accent: '#6BB06B' };
    if (p.includes('黒') || p.includes('シック') || p.includes('金'))
      return { bg: '#1C1C1C', cells: ['#2A2A2A','#222222','#2A2A2A','#222222','#2A2A2A','#222222'], text: '#FFFFFF', accent: '#C9A96E' };
    // デフォルト: ペットサロン暖色系
    return { bg: '#FFF8F0', cells: ['#D4845A','#E8A87C','#C17750','#B8D4A8','#8BB8C4','#D4A0B0'], text: '#FFFFFF', accent: '#D4845A' };
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const W = 2500, H = 1686;
      const cols = 3, rows = 2;
      const colW = Math.floor(W / cols), rowH = Math.floor(H / rows);
      const theme = parseDesignTheme(designPrompt);

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, W, H);

      const currentButtons = buttons.length > 0 ? buttons : defaultButtons(tenantId);

      for (let i = 0; i < 6; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const x = col * colW, y = row * rowH;
        const margin = 12;
        const color = theme.cells[i] || theme.cells[0];
        const label = currentButtons[i]?.label || '';

        // 角丸ボタン背景
        const rx = x + margin, ry = y + margin;
        const rw = colW - margin * 2, rh = rowH - margin * 2;
        const radius = 30;
        ctx.beginPath();
        ctx.moveTo(rx + radius, ry);
        ctx.lineTo(rx + rw - radius, ry);
        ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
        ctx.lineTo(rx + rw, ry + rh - radius);
        ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
        ctx.lineTo(rx + radius, ry + rh);
        ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
        ctx.lineTo(rx, ry + radius);
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();

        // アクセントライン（下部）
        ctx.fillStyle = theme.accent;
        ctx.fillRect(rx + 40, ry + rh - 16, rw - 80, 6);

        // ラベル描画
        const cx = x + colW / 2;
        const cy = y + rowH / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 80px "Helvetica Neue", "Hiragino Sans", "Yu Gothic", sans-serif';
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = theme.text;
        ctx.fillText(label, cx, cy);
        ctx.shadowBlur = 0;
      }

      // Canvas → Blob → アップロード
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) { alert('画像生成に失敗しました'); setGenerating(false); return; }

      const formData = new FormData();
      formData.append('file', blob, 'rich-menu.png');
      const res = await fetch(`/api/proxy/admin/images/upload?tenantId=${encodeURIComponent(tenantId)}&type=richmenu`, {
        method: 'POST', body: formData,
      });
      const json: any = await res.json();
      if (json.ok && json.imageUrl) {
        setRichMenuBg(json.imageUrl);
        showToast('ボタン入り背景画像を生成しました');
      } else {
        alert(`アップロード失敗: ${json.error || '不明なエラー'}`);
      }
    } catch (e: any) { alert(`エラー: ${e.message}`); }
    setGenerating(false);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/proxy/admin/images/upload?tenantId=${encodeURIComponent(tenantId)}&type=richmenu`, {
        method: 'POST', body: formData,
      });
      const json: any = await res.json();
      if (json.ok && json.imageUrl) { setRichMenuBg(json.imageUrl); showToast('背景画像をアップロードしました'); }
      else alert(`アップロード失敗: ${json.error || '不明なエラー'}`);
    } catch (e: any) { alert(`エラー: ${e.message}`); }
    setUploading(false);
  };

  const updateButton = (idx: number, field: keyof ButtonConfig, value: string) => {
    setButtons(prev => prev.map(b => b.buttonIndex === idx ? { ...b, [field]: value } : b));
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      // 1. Save buttons
      const saveRes = await fetch(`/api/proxy/admin/line/rich-menu/buttons?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: selectedTemplate, buttons }),
      });
      const saveJson: any = await saveRes.json();
      if (!saveJson.ok) {
        alert(`ボタン保存失敗: ${saveJson.error || '不明なエラー'}`);
        setPublishing(false);
        return;
      }

      // 2. Publish to LINE
      const pubRes = await fetch(`/api/proxy/admin/integrations/line/richmenu?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateKey: selectedTemplate }),
      });
      const pubJson: any = await pubRes.json();
      if (pubJson.ok) {
        showToast('LINEに反映しました');
      } else {
        alert(`LINE反映失敗: ${pubJson.error || pubJson.detail || '不明なエラー'}`);
      }
    } catch (e: any) {
      alert(`エラー: ${e.message}`);
    }
    setPublishing(false);
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="リッチメニュー設定" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="リッチメニュー設定" subtitle="テンプレート・背景画像・ボタンを設定してLINEに反映" />

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      <div className="px-6 pb-8 space-y-6">
        {/* Section 1: Template */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">テンプレート選択</h3>
          <div className="space-y-3">
            {TEMPLATES.map(t => (
              <label key={t.key}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                  selectedTemplate === t.key ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                <input type="radio" name="template" value={t.key} checked={selectedTemplate === t.key}
                  onChange={() => setSelectedTemplate(t.key)} className="mt-1 accent-orange-500" />
                <div>
                  <div className="font-medium text-gray-900 text-sm">{t.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Section 2: Background Image */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">背景画像</h3>
            <div className="flex items-center gap-2">
              <button onClick={handleGenerate} disabled={generating || uploading}
                className="px-4 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
                {generating ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    生成中...
                  </span>
                ) : '画像生成'}
              </button>
              <label className={`px-4 py-1.5 text-sm font-medium rounded-lg border border-gray-300 cursor-pointer transition-colors inline-flex items-center gap-2 ${
                uploading ? 'opacity-50 pointer-events-none' : 'hover:bg-gray-50 text-gray-700'
              }`}>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); if (fileRef.current) fileRef.current.value = ''; }}
                  disabled={uploading} />
                {uploading ? '保存中...' : '📁 アップロード'}
              </label>
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">デザイン指示（任意）</label>
            <textarea
              value={designPrompt}
              onChange={e => setDesignPrompt(e.target.value)}
              placeholder="例: ピンク系でかわいく / 黒×金でシックに / 白でシンプルに / 青でクールに / 緑でナチュラルに"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
            />
          </div>
          {richMenuBg ? (
            <div className="relative w-full" style={{ aspectRatio: '2500/1686' }}>
              <img src={richMenuBg} alt="リッチメニュー背景" className="w-full h-full object-cover rounded-xl border border-gray-100" />
              {/* ボタンラベルオーバーレイ（グリッド確認用） */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 pointer-events-none">
                {[0,1,2,3,4,5].map(i => {
                  const btn = buttons.find(b => b.buttonIndex === i);
                  return (
                    <div key={i} className="border border-white/20 flex items-center justify-center">
                      <span className="text-white/60 text-[10px] font-bold drop-shadow-sm">{btn?.label || ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="w-full bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 text-sm border border-dashed border-gray-200" style={{ aspectRatio: '2500/1686' }}>
              未設定 —「画像生成」で背景画像を作成
            </div>
          )}
        </section>

        {/* Section 3: Button Grid */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">ボタン設定（6ボタン）</h3>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[0, 1, 2, 3, 4, 5].map(idx => {
              const btn = buttons.find(b => b.buttonIndex === idx);
              const isEditing = editingIdx === idx;
              return (
                <div key={idx}
                  onClick={() => setEditingIdx(isEditing ? null : idx)}
                  className={`border-2 rounded-xl p-3 cursor-pointer transition-all min-h-[80px] flex flex-col items-center justify-center text-center ${
                    isEditing ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                  }`}>
                  <div className="text-[10px] text-gray-400 mb-1">{GRID_LABELS[idx]}</div>
                  <div className="text-sm font-semibold text-gray-800">{btn?.label || '未設定'}</div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {btn?.actionType === 'uri' ? '🔗 URL' : '💬 メッセージ'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Edit panel */}
          {editingIdx !== null && (() => {
            const btn = buttons.find(b => b.buttonIndex === editingIdx);
            if (!btn) return null;
            return (
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700">{GRID_LABELS[editingIdx]} を編集</h4>
                  <button onClick={() => setEditingIdx(null)} className="text-xs text-gray-400 hover:text-gray-600">閉じる</button>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">ラベル</label>
                  <input type="text" value={btn.label}
                    onChange={e => updateButton(editingIdx, 'label', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">アクションタイプ</label>
                  <select value={btn.actionType}
                    onChange={e => updateButton(editingIdx, 'actionType', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="uri">URL遷移</option>
                    <option value="message">メッセージ送信</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {btn.actionType === 'uri' ? 'URL' : 'メッセージテキスト'}
                  </label>
                  <input type="text" value={btn.actionValue}
                    onChange={e => updateButton(editingIdx, 'actionValue', e.target.value)}
                    placeholder={btn.actionType === 'uri' ? 'https://...' : 'テキストを入力'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
            );
          })()}
        </section>

        {/* Section 4: Publish */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">公開設定</h3>
          <p className="text-sm text-gray-500 mb-4">
            ボタン設定を保存し、背景画像とともにLINEリッチメニューを更新します。
          </p>
          <button onClick={handlePublish} disabled={publishing}
            className="w-full sm:w-auto px-6 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
            {publishing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                反映中...
              </span>
            ) : '保存してLINEに反映する'}
          </button>
        </section>
      </div>
    </>
  );
}
