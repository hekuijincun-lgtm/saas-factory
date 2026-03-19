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

interface StepPetSelectProps {
  tenantId: string;
  customerKey?: string;
  onComplete: (answers: Record<string, string | boolean>) => void;
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

export default function StepPetSelect({ tenantId, customerKey, onComplete }: StepPetSelectProps) {
  const [registeredPets, setRegisteredPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showNewForm, setShowNewForm] = useState(false);

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
    fetch(`/api/proxy/admin/pets?tenantId=${encodeURIComponent(tenantId)}&customerKey=${encodeURIComponent(customerKey)}`)
      .then(r => r.ok ? r.json() : { pets: [] })
      .then((data: any) => {
        const pets: Pet[] = Array.isArray(data.pets) ? data.pets : [];
        setRegisteredPets(pets);
        if (pets.length === 0) setShowNewForm(true);
      })
      .catch(() => {
        setShowNewForm(true);
      })
      .finally(() => setLoading(false));
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No registered pets — show new pet form
  if (showNewForm && registeredPets.length === 0) {
    return (
      <div className="space-y-5">
        <h2 className="text-lg font-semibold text-brand-text">ペット情報の入力</h2>
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
      <h2 className="text-lg font-semibold text-brand-text">ペットを選択</h2>
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
