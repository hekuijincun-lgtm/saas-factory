'use client';

export const runtime = 'edge';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

interface VaccineRecord {
  id?: string;
  name: string;
  date: string;
  expiresAt: string;
  vetClinic?: string;
}

interface GroomingRecord {
  id?: string;
  date: string;
  course: string;
  staffName?: string;
  cutStyle?: string;
  weight?: number;
  notes?: string;
  beforeUrl?: string;
  afterUrl?: string;
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;
}

interface PetData {
  id: string;
  name: string;
  species: string;
  breed?: string;
  size?: string;
  age?: number | string;
  weight?: number;
  color?: string;
  gender?: string;
  photoUrl?: string;
  ownerName?: string;
  allergies?: string;
  vaccines?: VaccineRecord[];
  vaccinations?: VaccineRecord[];
  groomingHistory?: GroomingRecord[];
}

function vaccineDateStatus(expiresAt: string): 'expired' | 'expiring' | 'ok' {
  if (!expiresAt) return 'ok';
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  if (exp < now) return 'expired';
  if (exp - now <= 30 * 24 * 60 * 60 * 1000) return 'expiring';
  return 'ok';
}

function speciesLabel(species: string): string {
  if (species === 'dog') return 'わんちゃん';
  if (species === 'cat') return 'ねこちゃん';
  return species;
}

function sizeLabel(size?: string): string {
  if (size === 'small') return '小型';
  if (size === 'medium') return '中型';
  if (size === 'large') return '大型';
  return size || '';
}

function genderLabel(gender?: string): string {
  if (gender === 'male') return 'オス';
  if (gender === 'female') return 'メス';
  return '';
}

export default function PetHistoryPublicPage() {
  const { petId } = useParams<{ petId: string }>();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenantId') || 'default';

  const [pet, setPet] = useState<PetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'vaccines'>('history');

  useEffect(() => {
    if (!petId) return;
    setLoading(true);
    fetch(`/api/proxy/pet/profile/${encodeURIComponent(petId)}?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then((json: any) => {
        if (!json.ok) throw new Error(json.error || 'not found');
        setPet(json.data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [petId, tenantId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !pet) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-orange-100 flex items-center justify-center">
            <svg className="w-10 h-10 text-orange-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4.5 11.5c-1 0-2-.5-2-2s1.5-3 2.5-3 1.5 1 1.5 2.5-1 2.5-2 2.5zm15 0c-1 0-2-1-2-2.5s.5-2.5 1.5-2.5 2.5 1.5 2.5 3-1 2-2 2zm-12.5 1c-1 0-2-1-2-2.5S5.5 7 6.5 7 9 8.5 9 10s-1 2.5-2 2.5zm10 0c-1 0-2-1-2-2.5S15.5 7 16.5 7s2 1.5 2 3-1 2.5-2 2.5zM12 22c-3.5 0-6-2-7-4 0-2 4.5-3 7-3s7 1 7 3c-1 2-3.5 4-7 4z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-800 mb-1">ペットが見つかりません</h1>
          <p className="text-sm text-gray-500">リンクが正しいかご確認ください。</p>
        </div>
      </div>
    );
  }

  const vaccines = pet.vaccines || pet.vaccinations || [];
  const groomingHistory = (pet.groomingHistory || []).sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const infoItems: { label: string; value: string }[] = [];
  if (pet.breed) infoItems.push({ label: '犬種', value: pet.breed });
  if (pet.size) infoItems.push({ label: 'サイズ', value: sizeLabel(pet.size) });
  if (pet.age) infoItems.push({ label: '年齢', value: `${pet.age}歳` });
  if (pet.weight) infoItems.push({ label: '体重', value: `${pet.weight}kg` });
  if (pet.gender) infoItems.push({ label: '性別', value: genderLabel(pet.gender) });
  if (pet.color) infoItems.push({ label: '毛色', value: pet.color });

  return (
    <div className="min-h-screen bg-orange-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-400 to-orange-500 text-white px-4 pt-8 pb-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-4">
            {pet.photoUrl ? (
              <img
                src={pet.photoUrl}
                alt={pet.name}
                className="w-20 h-20 rounded-2xl object-cover border-2 border-white/30 shadow-lg"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center border-2 border-white/30">
                <svg className="w-10 h-10 text-white/60" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4.5 11.5c-1 0-2-.5-2-2s1.5-3 2.5-3 1.5 1 1.5 2.5-1 2.5-2 2.5zm15 0c-1 0-2-1-2-2.5s.5-2.5 1.5-2.5 2.5 1.5 2.5 3-1 2-2 2zm-12.5 1c-1 0-2-1-2-2.5S5.5 7 6.5 7 9 8.5 9 10s-1 2.5-2 2.5zm10 0c-1 0-2-1-2-2.5S15.5 7 16.5 7s2 1.5 2 3-1 2.5-2 2.5zM12 22c-3.5 0-6-2-7-4 0-2 4.5-3 7-3s7 1 7 3c-1 2-3.5 4-7 4z" />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold truncate">{pet.name}</h1>
              <p className="text-orange-100 text-sm mt-0.5">{speciesLabel(pet.species)}</p>
            </div>
          </div>

          {/* Info chips */}
          {infoItems.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {infoItems.map((item) => (
                <span
                  key={item.label}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 text-xs font-medium"
                >
                  <span className="text-orange-100">{item.label}:</span>
                  <span>{item.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-lg mx-auto px-4">
        <div className="flex border-b border-orange-200 -mt-px">
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500'
            }`}
          >
            施術履歴 ({groomingHistory.length})
          </button>
          <button
            onClick={() => setActiveTab('vaccines')}
            className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
              activeTab === 'vaccines'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500'
            }`}
          >
            ワクチン ({vaccines.length})
          </button>
        </div>

        {/* Grooming History */}
        {activeTab === 'history' && (
          <div className="py-4 space-y-3">
            {groomingHistory.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-12">施術履歴はまだありません。</p>
            )}
            {groomingHistory.map((g, i) => {
              const beforePhoto = g.beforeUrl || g.beforePhotoUrl;
              const afterPhoto = g.afterUrl || g.afterPhotoUrl;
              return (
                <div key={g.id || i} className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
                  {/* Before / After photos */}
                  {(beforePhoto || afterPhoto) && (
                    <div className="flex">
                      {beforePhoto && (
                        <div className="flex-1 relative">
                          <img src={beforePhoto} alt="Before" className="w-full h-40 object-cover" />
                          <span className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
                            Before
                          </span>
                        </div>
                      )}
                      {afterPhoto && (
                        <div className="flex-1 relative">
                          <img src={afterPhoto} alt="After" className="w-full h-40 object-cover" />
                          <span className="absolute top-2 left-2 bg-orange-500/80 text-white text-xs px-2 py-0.5 rounded-full">
                            After
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{g.course}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {g.date}
                          {g.staffName ? ` / ${g.staffName}` : ''}
                        </p>
                      </div>
                      {g.cutStyle && (
                        <span className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                          {g.cutStyle}
                        </span>
                      )}
                    </div>
                    {g.weight && (
                      <p className="text-xs text-gray-500 mt-2">体重: {g.weight}kg</p>
                    )}
                    {g.notes && (
                      <p className="text-sm text-gray-600 mt-2 leading-relaxed">{g.notes}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Vaccines */}
        {activeTab === 'vaccines' && (
          <div className="py-4 space-y-3">
            {vaccines.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-12">ワクチン記録はまだありません。</p>
            )}
            {vaccines.map((v, i) => {
              const st = vaccineDateStatus(v.expiresAt);
              return (
                <div
                  key={v.id || i}
                  className={`bg-white rounded-2xl shadow-sm border overflow-hidden p-4 ${
                    st === 'expired'
                      ? 'border-red-200'
                      : st === 'expiring'
                      ? 'border-amber-200'
                      : 'border-orange-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{v.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">接種日: {v.date}</p>
                      {v.vetClinic && (
                        <p className="text-xs text-gray-500">{v.vetClinic}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {st === 'expired' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                          期限切れ
                        </span>
                      )}
                      {st === 'expiring' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                          要更新
                        </span>
                      )}
                      {st === 'ok' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                          有効
                        </span>
                      )}
                      <p className="text-xs text-gray-400 mt-1">~{v.expiresAt}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 pb-8 text-center">
        <p className="text-xs text-gray-400">
          Powered by <span className="font-medium text-orange-400">SaaS Factory</span>
        </p>
      </div>
    </div>
  );
}
