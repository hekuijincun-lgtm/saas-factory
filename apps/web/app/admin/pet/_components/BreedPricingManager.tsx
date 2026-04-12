'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getMenu, type MenuItem } from '@/src/lib/bookingApi';

interface Breed {
  id: string;
  name: string;
  default_size: string;
  category: string;
}

interface PricingRule {
  id: string;
  menuId: string;
  breed: string;
  size: string;
  price: number;
  durationMinutes: number;
  notes: string | null;
}

interface CellEdit {
  breed: string;
  size: string;
  price: string;
  duration: string;
  notes: string;
}

const SIZE_OPTIONS = [
  { value: 'small', label: '小型' },
  { value: 'medium', label: '中型' },
  { value: 'large', label: '大型' },
];

export default function BreedPricingManager({ tenantId }: { tenantId: string }) {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // Editable cells: key = `${breed}::${size}`
  const [cells, setCells] = useState<Record<string, CellEdit>>({});
  const [customBreed, setCustomBreed] = useState('');

  // AI / image input state
  const [aiLoading, setAiLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const priceImageRef = useRef<HTMLInputElement>(null);

  // Active breed list (from master + existing rules with custom breeds)
  const [activeBreeds, setActiveBreeds] = useState<string[]>([]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  // Fetch menus
  useEffect(() => {
    getMenu(tenantId)
      .then(items => {
        const active = items.filter(m => m.active);
        setMenus(active);
        if (active.length > 0 && !selectedMenuId) {
          setSelectedMenuId(active[0].id);
        }
      })
      .catch(() => setMenus([]))
      .finally(() => setLoading(false));
  }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch breeds master
  useEffect(() => {
    fetch(`/api/proxy/admin/breeds-master?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        if (json?.ok) setBreeds(json.breeds ?? []);
      })
      .catch(() => {});
  }, [tenantId]);

  // Fetch rules for selected menu
  const fetchRules = useCallback(() => {
    if (!selectedMenuId) return;
    fetch(`/api/proxy/admin/breed-pricing?tenantId=${encodeURIComponent(tenantId)}&menuId=${encodeURIComponent(selectedMenuId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        if (json?.ok) setRules(json.rules ?? []);
      })
      .catch(() => setRules([]));
  }, [tenantId, selectedMenuId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  // Build active breed list from master + any custom breeds in rules
  useEffect(() => {
    const masterNames = breeds.map(b => b.name);
    const ruleBreeds = rules.map(r => r.breed);
    const all = [...new Set([...masterNames, ...ruleBreeds])];
    setActiveBreeds(all);
  }, [breeds, rules]);

  // Build cells from rules
  useEffect(() => {
    const newCells: Record<string, CellEdit> = {};
    // Initialize all breed×size combos as empty
    for (const breed of activeBreeds) {
      for (const s of SIZE_OPTIONS) {
        const key = `${breed}::${s.value}`;
        newCells[key] = { breed, size: s.value, price: '', duration: '', notes: '' };
      }
    }
    // Fill in existing rules
    for (const r of rules) {
      const key = `${r.breed}::${r.size}`;
      newCells[key] = {
        breed: r.breed,
        size: r.size,
        price: String(r.price),
        duration: String(r.durationMinutes),
        notes: r.notes ?? '',
      };
    }
    setCells(newCells);
  }, [rules, activeBreeds]);

  const selectedMenu = useMemo(() => menus.find(m => m.id === selectedMenuId), [menus, selectedMenuId]);

  const handleCellChange = (breed: string, size: string, field: 'price' | 'duration' | 'notes', value: string) => {
    const key = `${breed}::${size}`;
    setCells(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleAddCustomBreed = () => {
    const name = customBreed.trim();
    if (!name) return;
    if (activeBreeds.includes(name)) {
      showToast('この犬種は既に追加されています');
      return;
    }
    setActiveBreeds(prev => [...prev, name]);
    // Initialize cells for new breed
    setCells(prev => {
      const next = { ...prev };
      for (const s of SIZE_OPTIONS) {
        const key = `${name}::${s.value}`;
        next[key] = { breed: name, size: s.value, price: '', duration: '', notes: '' };
      }
      return next;
    });
    setCustomBreed('');
  };

  const handleBulkSave = async () => {
    if (!selectedMenuId) return;
    setSaving(true);
    try {
      // Collect all cells that have price + duration set
      const rulesToSave = Object.values(cells)
        .filter(c => c.price.trim() !== '' && c.duration.trim() !== '')
        .map(c => ({
          breed: c.breed,
          size: c.size,
          price: parseInt(c.price),
          durationMinutes: parseInt(c.duration),
          notes: c.notes || null,
        }));

      const res = await fetch(
        `/api/proxy/admin/breed-pricing/bulk?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ menuId: selectedMenuId, rules: rulesToSave }),
        }
      );
      const json = await res.json() as any;
      if (!json.ok) throw new Error(json.error || 'save failed');
      showToast(`${json.count}件の料金設定を保存しました`);
      fetchRules(); // Refresh
    } catch {
      showToast('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleAiSuggest = async () => {
    if (!selectedMenuId) {
      alert('先にメニューを選択してください');
      return;
    }
    setAiLoading(true);
    try {
      const menu = menus.find(m => m.id === selectedMenuId);
      const res = await fetch(
        `/api/proxy/admin/breed-pricing/ai-suggest?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            menuId: selectedMenuId,
            menuName: menu?.name,
            menuPrice: menu?.price,
            breeds: breeds.map(b => ({ name: b.name, defaultSize: b.default_size })),
          }),
        }
      );
      const data: any = await res.json();
      if (data?.suggestions && Array.isArray(data.suggestions)) {
        setCells(prev => {
          const next = { ...prev };
          for (const s of data.suggestions) {
            for (const size of ['small', 'medium', 'large'] as const) {
              const key = `${s.breed}::${size}`;
              const priceVal = s[size]?.price ?? menu?.price ?? 0;
              const durVal = s[size]?.duration ?? menu?.durationMin ?? 60;
              next[key] = {
                breed: s.breed,
                size,
                price: String(priceVal),
                duration: String(durVal),
                notes: prev[key]?.notes ?? '',
              };
            }
          }
          return next;
        });
        // Make sure AI-suggested breeds appear in the table even if not in master
        setActiveBreeds(prev => {
          const set = new Set(prev);
          for (const s of data.suggestions) set.add(s.breed);
          return Array.from(set);
        });
        alert(`${data.suggestions.length}犬種の料金をAIが提案しました。確認後「保存」してください。`);
      } else {
        alert('AI提案の形式が不正です');
      }
    } catch {
      alert('AI提案に失敗しました');
    } finally {
      setAiLoading(false);
    }
  };

  const handlePriceImageUpload = async (file: File) => {
    if (!selectedMenuId) {
      alert('先にメニューを選択してください');
      return;
    }
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tenantId', tenantId);
      formData.append('menuId', selectedMenuId);

      const res = await fetch(
        `/api/proxy/admin/breed-pricing/parse-image?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          body: formData,
        }
      );
      const data: any = await res.json();
      if (data?.extracted && Array.isArray(data.extracted)) {
        const menu = menus.find(m => m.id === selectedMenuId);
        setCells(prev => {
          const next = { ...prev };
          for (const row of data.extracted) {
            for (const size of ['small', 'medium', 'large'] as const) {
              if (row[size]) {
                const key = `${row.breed}::${size}`;
                next[key] = {
                  breed: row.breed,
                  size,
                  price: String(row[size].price),
                  duration: String(row[size].duration ?? menu?.durationMin ?? 60),
                  notes: prev[key]?.notes ?? '',
                };
              }
            }
          }
          return next;
        });
        setActiveBreeds(prev => {
          const set = new Set(prev);
          for (const row of data.extracted) set.add(row.breed);
          return Array.from(set);
        });
        alert(`${data.extracted.length}行の料金データを読み取りました。確認後「保存」してください。`);
      } else {
        alert('画像読み取りの形式が不正です');
      }
    } catch {
      alert('画像読み取りに失敗しました');
    } finally {
      setImageUploading(false);
    }
  };

  const handleDeleteBreedRules = async (breed: string) => {
    if (!confirm(`「${breed}」の全サイズの料金設定を削除しますか？`)) return;
    const toDelete = rules.filter(r => r.breed === breed);
    try {
      await Promise.all(
        toDelete.map(r =>
          fetch(`/api/proxy/admin/breed-pricing/${encodeURIComponent(r.id)}?tenantId=${encodeURIComponent(tenantId)}`, { method: 'DELETE' })
        )
      );
      showToast(`「${breed}」の料金設定を削除しました`);
      // Remove from active breeds if it's a custom breed (not in master)
      if (!breeds.some(b => b.name === breed)) {
        setActiveBreeds(prev => prev.filter(b => b !== breed));
      }
      fetchRules();
    } catch {
      showToast('削除に失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (menus.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-gray-500">有効なメニューがありません。</p>
        <p className="text-xs text-gray-400 mt-1">メニュー管理タブでメニューを追加してください。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Menu selector */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
        <div className="flex-1 max-w-sm">
          <label className="block text-xs font-medium text-gray-500 mb-1">メニュー選択</label>
          <select
            value={selectedMenuId}
            onChange={e => setSelectedMenuId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-300"
          >
            {menus.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} — ¥{m.price.toLocaleString()} / {m.durationMin}分
              </option>
            ))}
          </select>
        </div>
        {selectedMenu && (
          <div className="text-xs text-gray-400">
            デフォルト料金: <strong className="text-gray-700">¥{selectedMenu.price.toLocaleString()}</strong> / {selectedMenu.durationMin}分
            <br />
            犬種別料金が未設定の場合、このデフォルト料金が使われます。
          </div>
        )}
      </div>

      {/* AI / image input buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleAiSuggest}
          disabled={aiLoading || !selectedMenuId}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors"
        >
          {aiLoading ? '⏳ AI提案中...' : '🤖 AIにお任せ設定'}
        </button>
        <button
          onClick={() => priceImageRef.current?.click()}
          disabled={imageUploading || !selectedMenuId}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          {imageUploading ? '⏳ 読み取り中...' : '📷 料金表画像から入力'}
        </button>
        <input
          ref={priceImageRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handlePriceImageUpload(file);
            e.target.value = '';
          }}
        />
      </div>

      {/* Add custom breed */}
      <div className="flex items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">カスタム犬種を追加</label>
          <input
            type="text"
            value={customBreed}
            onChange={e => setCustomBreed(e.target.value)}
            placeholder="犬種名を入力"
            onKeyDown={e => { if (e.key === 'Enter') handleAddCustomBreed(); }}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 w-56"
          />
        </div>
        <button
          onClick={handleAddCustomBreed}
          disabled={!customBreed.trim()}
          className="px-4 py-2 rounded-lg bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          追加
        </button>
      </div>

      {/* Matrix table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider sticky left-0 bg-gray-50 min-w-[160px]">
                  犬種
                </th>
                {SIZE_OPTIONS.map(s => (
                  <th key={s.value} colSpan={2} className="text-center px-2 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    {s.label}
                  </th>
                ))}
                <th className="px-2 py-3 w-10"></th>
              </tr>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="sticky left-0 bg-gray-50/50"></th>
                {SIZE_OPTIONS.map(s => (
                  <th key={s.value + '_sub'} colSpan={1} className="text-center px-2 py-1.5 text-[10px] font-medium text-gray-400">
                    料金(円)
                  </th>
                )).flatMap((el, i) => [
                  el,
                  <th key={`dur_${i}`} className="text-center px-2 py-1.5 text-[10px] font-medium text-gray-400">時間(分)</th>,
                ])}
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {activeBreeds.map(breed => {
                const isMaster = breeds.some(b => b.name === breed);
                const hasRules = rules.some(r => r.breed === breed);
                return (
                  <tr key={breed} className="hover:bg-orange-50/30 transition-colors">
                    <td className="px-4 py-2 sticky left-0 bg-white">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 text-sm">{breed}</span>
                        {!isMaster && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">カスタム</span>
                        )}
                      </div>
                    </td>
                    {SIZE_OPTIONS.map(s => {
                      const key = `${breed}::${s.value}`;
                      const cell = cells[key];
                      if (!cell) return [
                        <td key={`${key}_p`} className="px-1 py-1.5"></td>,
                        <td key={`${key}_d`} className="px-1 py-1.5"></td>,
                      ];
                      return [
                        <td key={`${key}_p`} className="px-1 py-1.5">
                          <input
                            type="number"
                            value={cell.price}
                            onChange={e => handleCellChange(breed, s.value, 'price', e.target.value)}
                            placeholder={selectedMenu ? String(selectedMenu.price) : '—'}
                            className="w-20 px-2 py-1.5 rounded border border-gray-200 text-sm text-right focus:outline-none focus:ring-1 focus:ring-orange-300 tabular-nums placeholder:text-gray-300"
                          />
                        </td>,
                        <td key={`${key}_d`} className="px-1 py-1.5">
                          <input
                            type="number"
                            value={cell.duration}
                            onChange={e => handleCellChange(breed, s.value, 'duration', e.target.value)}
                            placeholder={selectedMenu ? String(selectedMenu.durationMin) : '—'}
                            className="w-16 px-2 py-1.5 rounded border border-gray-200 text-sm text-right focus:outline-none focus:ring-1 focus:ring-orange-300 tabular-nums placeholder:text-gray-300"
                          />
                        </td>,
                      ];
                    }).flat()}
                    <td className="px-2 py-1.5">
                      {hasRules && (
                        <button
                          onClick={() => handleDeleteBreedRules(breed)}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                          title="削除"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hint */}
      <p className="text-xs text-gray-400">
        空欄の犬種×サイズは保存されません（メニューのデフォルト料金が適用されます）。
      </p>

      {/* Save button */}
      <button
        onClick={handleBulkSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors disabled:opacity-50"
      >
        {saving ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            保存中...
          </>
        ) : (
          '一括保存'
        )}
      </button>
    </div>
  );
}
