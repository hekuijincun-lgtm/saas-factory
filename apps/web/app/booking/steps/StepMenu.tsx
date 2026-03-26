'use client';

import { useEffect, useState } from 'react';
import { getMenu, getMenuVerticalAttrs, type MenuItem, type MenuOption } from '@/src/lib/bookingApi';
import { getVerticalPluginUI } from '@/src/lib/verticalPlugins';
import { fetchBookingSettings } from '@/src/lib/bookingApi';
import { resolveVertical } from '@/src/types/settings';

interface Props {
  tenantId: string;
  onSelect: (menu: MenuItem, selectedOptions?: MenuOption[]) => void;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
      {msg}
    </div>
  );
}

export default function StepMenu({ tenantId, onSelect }: Props) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vertical, setVertical] = useState<string>('generic');

  // オプション選択
  const [selectedMenu, setSelectedMenu] = useState<MenuItem | null>(null);
  const [selectedOptIds, setSelectedOptIds] = useState<Set<string>>(new Set());

  // フィルタ状態
  const [isFirstTime, setIsFirstTime] = useState<boolean | null>(null);
  const [genderFilter, setGenderFilter] = useState<string | null>(null);
  const [verticalFilter, setVerticalFilter] = useState<string | null>(null);

  useEffect(() => {
    let settingsImages: Record<string, string> = {};
    Promise.all([
      getMenu(tenantId),
      fetchBookingSettings(tenantId).then(s => {
        setVertical(resolveVertical(s as any));
        settingsImages = (s as any)?.images?.menus || {};
      }).catch(() => {}),
    ]).then(([data]) => {
      setItems(
        data
          .filter(m => m.active)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(m => ({
            ...m,
            imageUrl: m.imageUrl || settingsImages[m.id] || undefined,
          }))
      );
    }).catch(e => setError(e.message || 'メニューの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const vPlugin = getVerticalPluginUI(vertical);
  const filterConfig = vPlugin.menuFilterConfig;

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;

  // フィルタ検出
  const hasFirstTimeItems = items.some(m => getMenuVerticalAttrs(m)?.firstTimeOnly);
  const hasGenderItems = items.some(m => !!(getMenuVerticalAttrs(m) as any)?.genderTarget);
  const allVerticalValues = filterConfig
    ? [...new Set(items.map(m => (getMenuVerticalAttrs(m) as any)?.[filterConfig.filterKey]).filter(Boolean))]
    : [];
  const hasFilters = hasFirstTimeItems || hasGenderItems || allVerticalValues.length > 0;

  // フィルタ適用
  const filtered = items.filter(m => {
    const attrs = getMenuVerticalAttrs(m) as Record<string, any> | undefined;
    if (isFirstTime === true && !attrs?.firstTimeOnly) return false;
    if (isFirstTime === false && attrs?.firstTimeOnly) return false;
    if (genderFilter !== null) {
      const g = attrs?.genderTarget;
      if (g && g !== 'both' && g !== genderFilter) return false;
    }
    if (verticalFilter !== null && filterConfig) {
      const val = attrs?.[filterConfig.filterKey];
      if (val && val !== verticalFilter) return false;
    }
    return true;
  });

  const hasActiveFilter = isFirstTime !== null || genderFilter !== null || verticalFilter !== null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-brand-text mb-4">メニューを選択</h2>

      {/* フィルタパネル（属性付きメニューがある場合のみ表示） */}
      {hasFilters && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3 mb-2">
          <p className="text-xs font-semibold text-gray-700">{vPlugin.labels.menuFilterHeading}</p>

          {/* 初回/リピート */}
          {hasFirstTimeItems && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 w-16 shrink-0">来店回数</span>
              {([null, true, false] as (boolean | null)[]).map(val => {
                const label = val === null ? 'すべて' : val ? '初回のみ' : 'リピート';
                return (
                  <button
                    key={String(val)}
                    onClick={() => setIsFirstTime(val)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      isFirstTime === val
                        ? 'bg-brand-primary text-white border-brand-primary'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-brand-primary/50'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* 性別 */}
          {hasGenderItems && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 w-16 shrink-0">性別</span>
              {([null, 'female', 'male'] as (string | null)[]).map(val => {
                const label = val === null ? 'すべて' : val === 'female' ? '女性' : '男性';
                return (
                  <button
                    key={String(val)}
                    onClick={() => setGenderFilter(val)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      genderFilter === val
                        ? 'bg-brand-primary text-white border-brand-primary'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-brand-primary/50'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* vertical-specific フィルタ */}
          {allVerticalValues.length > 0 && filterConfig && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 w-16 shrink-0">{filterConfig.label}</span>
              <button
                onClick={() => setVerticalFilter(null)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  verticalFilter === null
                    ? 'bg-brand-primary text-white border-brand-primary'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-primary/50'
                }`}
              >
                すべて
              </button>
              {allVerticalValues.map(val => (
                <button
                  key={val}
                  onClick={() => setVerticalFilter(val)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    verticalFilter === val
                      ? 'bg-brand-primary text-white border-brand-primary'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-brand-primary/50'
                  }`}
                >
                  {filterConfig.options[val] ?? val}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-brand-muted text-center py-6">
          {hasActiveFilter
            ? '条件に合うメニューがありません'
            : 'メニューが登録されていません'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const activeOpts = (item.options ?? []).filter(o => o.active);
            const hasOptions = activeOpts.length > 0;
            return (
            <button
              key={item.id}
              onClick={() => {
                if (hasOptions) {
                  setSelectedMenu(item);
                  setSelectedOptIds(new Set());
                } else {
                  onSelect(item);
                }
              }}
              className="w-full text-left p-4 bg-white border border-brand-border rounded-2xl hover:border-brand-primary hover:shadow-md transition-all group"
            >
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-32 object-cover rounded-xl mb-3"
                  onError={e => (e.currentTarget.style.display = 'none')}
                />
              )}
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-brand-text group-hover:text-brand-primary transition-colors">
                    {item.name}
                  </p>
                  <p className="text-sm text-brand-muted mt-0.5">{item.durationMin}分</p>
                  {(() => {
                    const a = getMenuVerticalAttrs(item) as Record<string, any> | undefined;
                    if (!a) return null;
                    const badges: Array<{ label: string; color: string }> = [];
                    if (a.firstTimeOnly) badges.push({ label: '初回限定', color: 'bg-pink-50 text-pink-600 border-pink-200' });
                    if (a.genderTarget && a.genderTarget !== 'both') {
                      badges.push({ label: a.genderTarget === 'female' ? '女性向け' : '男性向け', color: 'bg-purple-50 text-purple-600 border-purple-200' });
                    }
                    if (filterConfig) {
                      const val = a[filterConfig.filterKey];
                      if (val) badges.push({ label: filterConfig.options[val] ?? val, color: 'bg-blue-50 text-blue-600 border-blue-200' });
                    }
                    if (badges.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {badges.map((b, i) => (
                          <span key={i} className={`text-xs ${b.color} border rounded-full px-2 py-0.5`}>
                            {b.label}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <span className="text-brand-primary font-semibold ml-4 flex-shrink-0">
                  ¥{item.price.toLocaleString()}
                </span>
              </div>
            </button>
            );
          })}
        </div>
      )}

      {/* オプション選択パネル */}
      {selectedMenu && (() => {
        const activeOpts = (selectedMenu.options ?? []).filter(o => o.active);
        const optionsPrice = activeOpts.filter(o => selectedOptIds.has(o.id)).reduce((s, o) => s + o.price, 0);
        const optionsDuration = activeOpts.filter(o => selectedOptIds.has(o.id)).reduce((s, o) => s + o.durationMin, 0);
        return (
          <div className="mt-4 bg-white border border-brand-primary rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-brand-text">追加オプション</h3>
              <button
                onClick={() => setSelectedMenu(null)}
                className="text-xs text-brand-muted hover:text-brand-text"
              >
                戻る
              </button>
            </div>
            <p className="text-xs text-brand-muted">{selectedMenu.name} のオプションを選択してください（任意）</p>

            <div className="space-y-2">
              {activeOpts.map(opt => (
                <label
                  key={opt.id}
                  className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all ${
                    selectedOptIds.has(opt.id)
                      ? 'border-brand-primary bg-brand-primary/5'
                      : 'border-gray-200 hover:border-brand-primary/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedOptIds.has(opt.id)}
                    onChange={() => {
                      setSelectedOptIds(prev => {
                        const next = new Set(prev);
                        if (next.has(opt.id)) next.delete(opt.id);
                        else next.add(opt.id);
                        return next;
                      });
                    }}
                    className="w-4 h-4 text-brand-primary border-brand-border rounded focus:ring-brand-primary"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-brand-text">{opt.name}</span>
                    <span className="text-xs text-brand-muted ml-2">
                      {opt.durationMin > 0 && `+${opt.durationMin}分`}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-brand-primary">
                    +¥{opt.price.toLocaleString()}
                  </span>
                </label>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-brand-muted">合計金額</span>
                <span className="font-semibold text-brand-text">
                  ¥{(selectedMenu.price + optionsPrice).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-muted">合計時間</span>
                <span className="font-semibold text-brand-text">
                  {selectedMenu.durationMin + optionsDuration}分
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                const selected = activeOpts.filter(o => selectedOptIds.has(o.id));
                onSelect(selectedMenu, selected.length > 0 ? selected : undefined);
                setSelectedMenu(null);
              }}
              className="w-full py-3 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md transition-all"
            >
              このメニューで予約する
            </button>
          </div>
        );
      })()}
    </div>
  );
}
