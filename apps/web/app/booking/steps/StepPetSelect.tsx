'use client';

import { useEffect, useState } from 'react';

interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string;
  size: string;
  photoUrl?: string;
}

interface KarteData {
  pet_name?: string;
  pet_breed?: string;
  pet_age?: string;
  pet_weight?: string;
  customer_name?: string;
  allergies?: string;
  cut_style?: string;
}

interface StepPetSelectProps {
  tenantId: string;
  customerKey?: string;
  onComplete: (answers: Record<string, string | boolean>) => void;
  onBack?: () => void;
}

const SPECIES_OPTIONS = [
  { value: 'dog', label: '犬' },
  { value: 'cat', label: '猫' },
  { value: 'other', label: 'その他' },
];

const SIZE_OPTIONS = [
  { value: 'small', label: '小型' },
  { value: 'medium', label: '中型' },
  { value: 'large', label: '大型' },
];

function PawIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-8 h-8 text-orange-300"
      aria-hidden="true"
    >
      <path d="M12 17c-1.5 2-5 2.5-5 5h10c0-2.5-3.5-3-5-5zm-4.5-5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm9 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-4.5-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm-6.5 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
    </svg>
  );
}

export default function StepPetSelect({ tenantId, customerKey, onComplete, onBack }: StepPetSelectProps) {
  const [registeredPets, setRegisteredPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showNewForm, setShowNewForm] = useState(false);
  const [karte, setKarte] = useState<KarteData | null>(null);
  const [useKarte, setUseKarte] = useState(false);

  // New pet form state
  const [newName, setNewName] = useState('');
  const [newSpecies, setNewSpecies] = useState('dog');
  const [newBreed, setNewBreed] = useState('');
  const [newSize, setNewSize] = useState('small');
  const [newAge, setNewAge] = useState('');

  useEffect(() => {
    if (!customerKey) {
      setLoading(false);
      setShowNewForm(true);
      return;
    }

    let petsLoaded = false;
    let karteLoaded = false;
    let resolvedPets: Pet[] = [];
    let resolvedKarte: KarteData | null = null;

    const checkDone = () => {
      if (!petsLoaded || !karteLoaded) return;
      setRegisteredPets(resolvedPets);
      if (resolvedKarte?.pet_name) {
        setKarte(resolvedKarte);
        setUseKarte(true);
      } else if (resolvedPets.length === 0) {
        setShowNewForm(true);
      }
      setLoading(false);
    };

    // Fetch registered pet profiles
    fetch(`/api/proxy/admin/pets?tenantId=${encodeURIComponent(tenantId)}&customerKey=${encodeURIComponent(customerKey)}`)
      .then(r => r.ok ? r.json() : { pets: [] })
      .then((data: any) => {
        resolvedPets = Array.isArray(data.pets) ? data.pets : [];
      })
      .catch(() => {})
      .finally(() => { petsLoaded = true; checkDone(); });

    // Fetch karte data
    fetch(`/api/proxy/public/karte?tenantId=${encodeURIComponent(tenantId)}&userId=${encodeURIComponent(customerKey)}`)
      .then(r => r.ok ? r.json() : { data: null })
      .then((data: any) => {
        if (data.ok && data.data) resolvedKarte = data.data;
      })
      .catch(() => {})
      .finally(() => { karteLoaded = true; checkDone(); });
  }, [tenantId, customerKey]);

  const togglePet = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmitExisting = () => {
    if (selectedIds.size === 0) return;
    const selected = registeredPets.filter(p => selectedIds.has(p.id));
    const first = selected[0];
    const answers: Record<string, string | boolean> = {
      pet_name: selected.map(p => p.name).join('、'),
      pet_breed: selected.map(p => p.breed).filter(Boolean).join('、'),
      pet_size: first.size || '',
      pet_count: String(selected.length),
      pet_ids: selected.map(p => p.id).join(','),
    };
    onComplete(answers);
  };

  const handleSubmitNew = () => {
    if (!newName.trim()) return;
    const answers: Record<string, string | boolean> = {
      pet_name: newName.trim(),
      pet_breed: newBreed.trim(),
      pet_size: newSize,
      pet_count: '1',
      pet_ids: '',
    };
    if (newAge.trim()) {
      answers.pet_age = newAge.trim();
    }
    const speciesLabel = SPECIES_OPTIONS.find(s => s.value === newSpecies)?.label ?? newSpecies;
    answers.pet_species = speciesLabel;
    onComplete(answers);
  };

  const handleKarteSubmit = () => {
    if (!karte) return;
    const answers: Record<string, string | boolean> = {
      pet_name: karte.pet_name || '',
      pet_breed: karte.pet_breed || '',
      pet_size: '',
      pet_count: '1',
      pet_ids: '',
      karte_used: true,
    };
    if (karte.pet_age) answers.pet_age = karte.pet_age;
    if (karte.pet_weight) answers.pet_weight = karte.pet_weight;
    if (karte.allergies) answers.allergies = karte.allergies;
    if (karte.cut_style) answers.cut_style = karte.cut_style;
    onComplete(answers);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Karte registered — show confirmation with auto-filled data
  if (useKarte && karte?.pet_name) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="p-1 text-brand-muted hover:text-brand-text transition-colors" aria-label="戻る">&#x2190;</button>
          )}
          <h2 className="text-lg font-semibold text-brand-text">ペット情報</h2>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-green-600 text-lg">&#x2705;</span>
            <span className="text-sm font-bold text-green-700">カルテ情報が登録されています</span>
          </div>
          <div className="space-y-1.5 text-sm text-gray-700">
            {karte.customer_name && <p><span className="font-medium text-gray-500">飼い主:</span> {karte.customer_name}</p>}
            <p><span className="font-medium text-gray-500">ペット名:</span> {karte.pet_name}{karte.pet_breed ? `（${karte.pet_breed}）` : ''}</p>
            {karte.pet_age && <p><span className="font-medium text-gray-500">年齢:</span> {karte.pet_age}</p>}
            {karte.pet_weight && <p><span className="font-medium text-gray-500">体重:</span> {karte.pet_weight}</p>}
            {karte.allergies && <p><span className="font-medium text-gray-500">アレルギー:</span> {karte.allergies}</p>}
            {karte.cut_style && <p><span className="font-medium text-gray-500">カットスタイル:</span> {karte.cut_style}</p>}
          </div>
          <p className="text-xs text-gray-400">&#x203B; 情報を変更する場合はカルテから編集してください</p>
        </div>

        <button
          onClick={handleKarteSubmit}
          className="w-full py-4 bg-brand-primary text-white rounded-2xl font-semibold hover:shadow-md transition-all"
        >
          この情報で次へ &#x2192;
        </button>

        <button
          type="button"
          onClick={() => setUseKarte(false)}
          className="w-full py-3 text-sm text-brand-muted hover:text-brand-text transition-colors"
        >
          別のペットで予約する
        </button>
      </div>
    );
  }

  // No registered pets — show new pet form
  if (showNewForm && registeredPets.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="p-1 text-brand-muted hover:text-brand-text transition-colors" aria-label="戻る">←</button>
          )}
          <h2 className="text-lg font-semibold text-brand-text">ペット情報の入力</h2>
        </div>
        <p className="text-sm text-brand-muted">予約するペットの情報を入力してください</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5">
              お名前 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="ポチ"
              className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5">種別</label>
            <div className="flex gap-2">
              {SPECIES_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setNewSpecies(opt.value)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    newSpecies === opt.value
                      ? 'bg-brand-primary text-white'
                      : 'bg-brand-bg text-brand-muted hover:text-brand-text'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5">犬種・猫種</label>
            <input
              type="text"
              value={newBreed}
              onChange={e => setNewBreed(e.target.value)}
              placeholder="トイプードル"
              className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5">サイズ</label>
            <div className="flex gap-2">
              {SIZE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setNewSize(opt.value)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    newSize === opt.value
                      ? 'bg-brand-primary text-white'
                      : 'bg-brand-bg text-brand-muted hover:text-brand-text'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5">年齢</label>
            <input
              type="text"
              value={newAge}
              onChange={e => setNewAge(e.target.value)}
              placeholder="3歳"
              className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-colors"
            />
          </div>
        </div>

        <button
          onClick={handleSubmitNew}
          disabled={!newName.trim()}
          className="w-full py-4 bg-brand-primary text-white rounded-2xl font-semibold hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          次へ
        </button>
      </div>
    );
  }

  // Has registered pets — show selection grid
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="p-1 text-brand-muted hover:text-brand-text transition-colors" aria-label="戻る">←</button>
          )}
          <h2 className="text-lg font-semibold text-brand-text">ペットを選択</h2>
        </div>
      <p className="text-sm text-brand-muted">予約するペットを選択してください（複数選択可）</p>

      <div className="grid grid-cols-2 gap-3">
        {registeredPets.map(pet => {
          const selected = selectedIds.has(pet.id);
          return (
            <button
              key={pet.id}
              type="button"
              onClick={() => togglePet(pet.id)}
              className={`relative p-4 rounded-2xl border-2 text-left transition-all ${
                selected
                  ? 'border-brand-primary bg-brand-primary/5 shadow-sm'
                  : 'border-brand-border bg-white hover:border-brand-primary/30'
              }`}
            >
              {selected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-brand-primary rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">&#10003;</span>
                </div>
              )}
              <div className="flex flex-col items-center gap-2">
                {pet.photoUrl ? (
                  <img
                    src={pet.photoUrl}
                    alt={pet.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center">
                    <PawIcon />
                  </div>
                )}
                <span className="text-sm font-semibold text-brand-text">{pet.name}</span>
                {pet.breed && (
                  <span className="text-xs text-brand-muted">{pet.breed}</span>
                )}
              </div>
            </button>
          );
        })}

        {/* Add new pet button */}
        <button
          type="button"
          onClick={() => {
            setShowNewForm(true);
            setRegisteredPets([]);
          }}
          className="p-4 rounded-2xl border-2 border-dashed border-brand-border bg-white hover:border-brand-primary/30 transition-all"
        >
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
              <span className="text-2xl text-brand-muted">+</span>
            </div>
            <span className="text-sm font-medium text-brand-muted">新しいペットを追加</span>
          </div>
        </button>
      </div>

      {selectedIds.size >= 2 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
          <span className="shrink-0">&#x1f43e;</span>
          <span>{selectedIds.size}匹分の予約枠を確保します</span>
        </div>
      )}

      <button
        onClick={handleSubmitExisting}
        disabled={selectedIds.size === 0}
        className="w-full py-4 bg-brand-primary text-white rounded-2xl font-semibold hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        次へ
      </button>
    </div>
  );
}
