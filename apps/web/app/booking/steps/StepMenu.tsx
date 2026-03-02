'use client';

import { useEffect, useState } from 'react';
import { getMenu, type MenuItem } from '@/src/lib/bookingApi';

interface Props {
  tenantId: string;
  onSelect: (menu: MenuItem) => void;
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

type StyleType = 'natural' | 'sharp' | 'korean' | 'custom';
type GenderTarget = 'male' | 'female' | 'both';

export default function StepMenu({ tenantId, onSelect }: Props) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 眉毛フィルタ状態
  const [isFirstTime, setIsFirstTime] = useState<boolean | null>(null); // null=全て
  const [genderFilter, setGenderFilter] = useState<GenderTarget | null>(null); // null=全て
  const [styleFilter, setStyleFilter] = useState<StyleType | null>(null); // null=全て

  useEffect(() => {
    getMenu(tenantId)
      .then(data =>
        setItems(
          data
            .filter(m => m.active)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        )
      )
      .catch(e => setError(e.message || 'メニューの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;

  // 眉毛属性を持つメニューがあるか判定
  const hasFirstTimeItems = items.some(m => m.eyebrow?.firstTimeOnly);
  const hasGenderItems = items.some(m => !!m.eyebrow?.genderTarget);
  const allStyleTypes = [...new Set(
    items.map(m => m.eyebrow?.styleType).filter((s): s is StyleType => !!s)
  )];
  const hasEyebrowFilters = hasFirstTimeItems || hasGenderItems || allStyleTypes.length > 0;

  // フィルタ適用
  const filtered = items.filter(m => {
    // 初回/リピートフィルタ
    if (isFirstTime === true && !m.eyebrow?.firstTimeOnly) return false;
    if (isFirstTime === false && m.eyebrow?.firstTimeOnly) return false;
    // 性別フィルタ（'both' は両性向けなので female/male どちらでも表示）
    if (genderFilter !== null) {
      const g = m.eyebrow?.genderTarget;
      if (g && g !== 'both' && g !== genderFilter) return false;
    }
    // スタイルフィルタ
    if (styleFilter !== null) {
      const s = m.eyebrow?.styleType;
      if (s && s !== styleFilter) return false;
    }
    return true;
  });

  const hasActiveFilter = isFirstTime !== null || genderFilter !== null || styleFilter !== null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-brand-text mb-4">メニューを選択</h2>

      {/* 眉毛フィルタ（属性付きメニューがある場合のみ表示） */}
      {hasEyebrowFilters && (
        <div className="bg-pink-50 border border-pink-100 rounded-2xl p-4 space-y-3 mb-2">
          <p className="text-xs font-semibold text-pink-700">✦ 眉毛メニュー絞り込み</p>

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
                        ? 'bg-pink-500 text-white border-pink-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-pink-300'
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
              {([null, 'female', 'male'] as (GenderTarget | null)[]).map(val => {
                const label = val === null ? 'すべて' : val === 'female' ? '女性' : '男性';
                return (
                  <button
                    key={String(val)}
                    onClick={() => setGenderFilter(val)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      genderFilter === val
                        ? 'bg-pink-500 text-white border-pink-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-pink-300'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* スタイルタイプ */}
          {allStyleTypes.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 w-16 shrink-0">スタイル</span>
              <button
                onClick={() => setStyleFilter(null)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  styleFilter === null
                    ? 'bg-pink-500 text-white border-pink-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-pink-300'
                }`}
              >
                すべて
              </button>
              {allStyleTypes.map(st => {
                const label: Record<StyleType, string> = {
                  natural: 'ナチュラル', sharp: 'シャープ', korean: '韓国風', custom: 'カスタム',
                };
                return (
                  <button
                    key={st}
                    onClick={() => setStyleFilter(st)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      styleFilter === st
                        ? 'bg-pink-500 text-white border-pink-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-pink-300'
                    }`}
                  >
                    {label[st] ?? st}
                  </button>
                );
              })}
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
          {filtered.map(item => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className="w-full text-left p-4 bg-white border border-brand-border rounded-2xl hover:border-brand-primary hover:shadow-md transition-all group"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-brand-text group-hover:text-brand-primary transition-colors">
                    {item.name}
                  </p>
                  <p className="text-sm text-brand-muted mt-0.5">{item.durationMin}分</p>
                  {/* 眉毛属性バッジ */}
                  {(item.eyebrow?.firstTimeOnly || item.eyebrow?.genderTarget || item.eyebrow?.styleType) && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {item.eyebrow?.firstTimeOnly && (
                        <span className="text-xs bg-pink-50 text-pink-600 border border-pink-200 rounded-full px-2 py-0.5">
                          初回限定
                        </span>
                      )}
                      {item.eyebrow?.genderTarget && (
                        <span className="text-xs bg-purple-50 text-purple-600 border border-purple-200 rounded-full px-2 py-0.5">
                          {item.eyebrow.genderTarget === 'female' ? '女性向け'
                           : item.eyebrow.genderTarget === 'male' ? '男性向け' : '両性向け'}
                        </span>
                      )}
                      {item.eyebrow?.styleType && (
                        <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">
                          {({ natural: 'ナチュラル', sharp: 'シャープ', korean: '韓国風', custom: 'カスタム' } as Record<StyleType, string>)[item.eyebrow.styleType] ?? item.eyebrow.styleType}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-brand-primary font-semibold ml-4 flex-shrink-0">
                  ¥{item.price.toLocaleString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
