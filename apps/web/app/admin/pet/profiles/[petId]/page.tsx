'use client';

export const runtime = 'edge';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../../_components/ui/AdminTopBar';

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
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;
}

interface PetProfile {
  id: string;
  name: string;
  species: string;
  breed: string;
  size: string;
  age?: number;
  weight?: number;
  color?: string;
  gender?: string;
  allergies?: string;
  notes?: string;
  photoUrl?: string;
  ownerName?: string;
  customerKey?: string;
  vaccines?: VaccineRecord[];
  groomingHistory?: GroomingRecord[];
}

type TabKey = 'profile' | 'grooming' | 'vaccines';

const VACCINE_PRESETS = ['狂犬病', '混合ワクチン5種', '混合ワクチン8種', 'フィラリア', 'ノミ・ダニ'];

function vaccineDateStatus(expiresAt: string): 'expired' | 'expiring' | 'ok' {
  if (!expiresAt) return 'ok';
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  if (exp < now) return 'expired';
  if (exp - now <= 30 * 24 * 60 * 60 * 1000) return 'expiring';
  return 'ok';
}

export default function PetProfileDetailPage() {
  const { petId } = useParams<{ petId: string }>();
  const { tenantId, status } = useAdminTenantId();
  const [pet, setPet] = useState<PetProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabKey>('profile');
  const [toast, setToast] = useState('');

  // Profile edit state
  const [form, setForm] = useState({
    name: '', species: '', breed: '', size: '', age: '', weight: '',
    color: '', gender: '', allergies: '', notes: '', photoUrl: '',
  });

  // Grooming add form
  const [showGroomingForm, setShowGroomingForm] = useState(false);
  const [groomingForm, setGroomingForm] = useState({
    date: '', course: '', staffName: '', cutStyle: '', weight: '', notes: '',
  });
  const [groomingSaving, setGroomingSaving] = useState(false);

  // Vaccine add form
  const [showVaccineForm, setShowVaccineForm] = useState(false);
  const [vaccineForm, setVaccineForm] = useState({
    name: '', date: '', expiresAt: '', vetClinic: '',
  });
  const [vaccineSaving, setVaccineSaving] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  // Fetch pet
  useEffect(() => {
    if (status !== 'ready' || !petId) return;
    setLoading(true);
    fetch(`/api/proxy/admin/pets/${encodeURIComponent(petId)}?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const p: PetProfile = json?.data ?? json;
        setPet(p);
        setForm({
          name: p.name || '', species: p.species || '', breed: p.breed || '',
          size: p.size || '', age: p.age?.toString() || '', weight: p.weight?.toString() || '',
          color: p.color || '', gender: p.gender || '', allergies: p.allergies || '',
          notes: p.notes || '', photoUrl: p.photoUrl || '',
        });
      })
      .catch(() => setPet(null))
      .finally(() => setLoading(false));
  }, [tenantId, status, petId]);

  // Save profile
  const handleSaveProfile = async () => {
    if (!pet) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        age: form.age ? parseInt(form.age) : undefined,
        weight: form.weight ? parseFloat(form.weight) : undefined,
        tenantId,
      };
      const res = await fetch(`/api/proxy/admin/pets/${encodeURIComponent(pet.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('save failed');
      showToast('保存しました');
    } catch {
      showToast('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // Add grooming record
  const handleAddGrooming = async () => {
    if (!pet) return;
    setGroomingSaving(true);
    try {
      const body = {
        ...groomingForm,
        weight: groomingForm.weight ? parseFloat(groomingForm.weight) : undefined,
        tenantId,
      };
      const res = await fetch(`/api/proxy/admin/pets/${encodeURIComponent(pet.id)}/grooming`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('save failed');
      const json = await res.json() as any;
      const newRecord: GroomingRecord = json?.data ?? json;
      setPet(prev => prev ? {
        ...prev,
        groomingHistory: [newRecord, ...(prev.groomingHistory || [])],
      } : prev);
      setGroomingForm({ date: '', course: '', staffName: '', cutStyle: '', weight: '', notes: '' });
      setShowGroomingForm(false);
      showToast('施術記録を追加しました');
    } catch {
      showToast('追加に失敗しました');
    } finally {
      setGroomingSaving(false);
    }
  };

  // Add vaccine record
  const handleAddVaccine = async () => {
    if (!pet) return;
    setVaccineSaving(true);
    try {
      const body = { ...vaccineForm, tenantId };
      const res = await fetch(`/api/proxy/admin/pets/${encodeURIComponent(pet.id)}/vaccine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('save failed');
      const json = await res.json() as any;
      const newRecord: VaccineRecord = json?.data ?? json;
      setPet(prev => prev ? {
        ...prev,
        vaccines: [...(prev.vaccines || []), newRecord],
      } : prev);
      setVaccineForm({ name: '', date: '', expiresAt: '', vetClinic: '' });
      setShowVaccineForm(false);
      showToast('ワクチン記録を追加しました');
    } catch {
      showToast('追加に失敗しました');
    } finally {
      setVaccineSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="ペットカルテ" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (!pet) {
    return (
      <>
        <AdminTopBar title="ペットカルテ" />
        <div className="px-6 py-16 text-center">
          <p className="text-gray-500">ペットが見つかりませんでした。</p>
          <Link
            href={withTenant('/admin/pet/profiles', tenantId)}
            className="mt-4 inline-block text-orange-600 hover:text-orange-700 font-medium text-sm"
          >
            一覧に戻る
          </Link>
        </div>
      </>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'profile', label: 'プロフィール' },
    { key: 'grooming', label: 'カルテ（施術履歴）' },
    { key: 'vaccines', label: 'ワクチン記録' },
  ];

  return (
    <>
      <AdminTopBar
        title={pet.name}
        subtitle="ペットカルテ詳細"
        right={
          <Link
            href={withTenant('/admin/pet/profiles', tenantId)}
            className="text-sm text-orange-600 hover:text-orange-700 font-medium"
          >
            一覧に戻る
          </Link>
        }
      />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="px-6 pb-8">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Profile */}
        {tab === 'profile' && (
          <div className="space-y-6 max-w-2xl">
            {/* Photo */}
            <div className="flex items-center gap-4">
              {form.photoUrl ? (
                <img src={form.photoUrl} alt={pet.name} className="w-24 h-24 rounded-2xl object-cover" />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-orange-50 flex items-center justify-center">
                  <svg className="w-12 h-12 text-orange-200" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4.5 11.5c-1 0-2-.5-2-2s1.5-3 2.5-3 1.5 1 1.5 2.5-1 2.5-2 2.5zm15 0c-1 0-2-1-2-2.5s.5-2.5 1.5-2.5 2.5 1.5 2.5 3-1 2-2 2zm-12.5 1c-1 0-2-1-2-2.5S5.5 7 6.5 7 9 8.5 9 10s-1 2.5-2 2.5zm10 0c-1 0-2-1-2-2.5S15.5 7 16.5 7s2 1.5 2 3-1 2.5-2 2.5zM12 22c-3.5 0-6-2-7-4 0-2 4.5-3 7-3s7 1 7 3c-1 2-3.5 4-7 4z" />
                  </svg>
                </div>
              )}
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">写真URL</label>
                <input
                  type="text"
                  value={form.photoUrl}
                  onChange={e => setForm(f => ({ ...f, photoUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
            </div>

            {/* Owner info (read-only) */}
            {(pet.ownerName || pet.customerKey) && (
              <div className="rounded-xl bg-orange-50 p-4">
                <p className="text-xs font-medium text-orange-600 mb-1">飼い主情報</p>
                {pet.ownerName && <p className="text-sm text-gray-700">{pet.ownerName}</p>}
                {pet.customerKey && <p className="text-xs text-gray-400 mt-0.5">顧客キー: {pet.customerKey}</p>}
              </div>
            )}

            {/* Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">名前 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">種別</label>
                <select
                  value={form.species}
                  onChange={e => setForm(f => ({ ...f, species: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="">選択してください</option>
                  <option value="dog">犬</option>
                  <option value="cat">猫</option>
                  <option value="other">その他</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">犬種・猫種</label>
                <input
                  type="text"
                  value={form.breed}
                  onChange={e => setForm(f => ({ ...f, breed: e.target.value }))}
                  placeholder="トイプードル"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">サイズ</label>
                <select
                  value={form.size}
                  onChange={e => setForm(f => ({ ...f, size: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="">選択してください</option>
                  <option value="small">小型</option>
                  <option value="medium">中型</option>
                  <option value="large">大型</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">年齢</label>
                <input
                  type="number"
                  value={form.age}
                  onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
                  placeholder="3"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">体重 (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.weight}
                  onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                  placeholder="5.2"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">毛色</label>
                <input
                  type="text"
                  value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  placeholder="アプリコット"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">性別</label>
                <select
                  value={form.gender}
                  onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="">選択してください</option>
                  <option value="male">オス</option>
                  <option value="female">メス</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">アレルギー</label>
              <input
                type="text"
                value={form.allergies}
                onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))}
                placeholder="鶏肉アレルギーなど"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">備考</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="気になることやメモ"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
              />
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={saving || !form.name.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存する'}
            </button>
          </div>
        )}

        {/* Tab: Grooming History */}
        {tab === 'grooming' && (
          <div className="space-y-6">
            <button
              onClick={() => setShowGroomingForm(f => !f)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-orange-600 transition-colors"
            >
              {showGroomingForm ? 'キャンセル' : '+ 施術記録を追加'}
            </button>

            {showGroomingForm && (
              <div className="rounded-2xl border border-orange-200 bg-white p-5 max-w-2xl space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">施術記録を追加</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">日付 *</label>
                    <input
                      type="date"
                      value={groomingForm.date}
                      onChange={e => setGroomingForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">コース *</label>
                    <input
                      type="text"
                      value={groomingForm.course}
                      onChange={e => setGroomingForm(f => ({ ...f, course: e.target.value }))}
                      placeholder="トリミングコース"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">担当スタッフ</label>
                    <input
                      type="text"
                      value={groomingForm.staffName}
                      onChange={e => setGroomingForm(f => ({ ...f, staffName: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">カットスタイル</label>
                    <input
                      type="text"
                      value={groomingForm.cutStyle}
                      onChange={e => setGroomingForm(f => ({ ...f, cutStyle: e.target.value }))}
                      placeholder="テディベアカット"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">体重 (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={groomingForm.weight}
                      onChange={e => setGroomingForm(f => ({ ...f, weight: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">メモ</label>
                  <textarea
                    value={groomingForm.notes}
                    onChange={e => setGroomingForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
                  />
                </div>
                <button
                  onClick={handleAddGrooming}
                  disabled={groomingSaving || !groomingForm.date || !groomingForm.course}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                  {groomingSaving ? '保存中...' : '追加する'}
                </button>
              </div>
            )}

            {/* Grooming list */}
            {(!pet.groomingHistory || pet.groomingHistory.length === 0) && !showGroomingForm && (
              <p className="text-sm text-gray-400 py-8 text-center">施術履歴はまだありません。</p>
            )}
            {pet.groomingHistory && pet.groomingHistory.length > 0 && (
              <div className="space-y-3">
                {pet.groomingHistory.map((g, i) => (
                  <div key={g.id || i} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{g.course}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{g.date}{g.staffName ? ` / 担当: ${g.staffName}` : ''}</p>
                      </div>
                      {g.cutStyle && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                          {g.cutStyle}
                        </span>
                      )}
                    </div>
                    {g.weight && <p className="text-xs text-gray-500 mt-2">体重: {g.weight}kg</p>}
                    {g.notes && <p className="text-sm text-gray-600 mt-2">{g.notes}</p>}
                    {(g.beforePhotoUrl || g.afterPhotoUrl) && (
                      <div className="flex gap-3 mt-3">
                        {g.beforePhotoUrl && (
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Before</p>
                            <img src={g.beforePhotoUrl} alt="before" className="w-24 h-24 rounded-lg object-cover" />
                          </div>
                        )}
                        {g.afterPhotoUrl && (
                          <div>
                            <p className="text-xs text-gray-400 mb-1">After</p>
                            <img src={g.afterPhotoUrl} alt="after" className="w-24 h-24 rounded-lg object-cover" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Vaccines */}
        {tab === 'vaccines' && (
          <div className="space-y-6">
            <button
              onClick={() => setShowVaccineForm(f => !f)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-orange-600 transition-colors"
            >
              {showVaccineForm ? 'キャンセル' : '+ ワクチン記録を追加'}
            </button>

            {showVaccineForm && (
              <div className="rounded-2xl border border-orange-200 bg-white p-5 max-w-2xl space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">ワクチン記録を追加</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">ワクチン名 *</label>
                    <select
                      value={vaccineForm.name}
                      onChange={e => setVaccineForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    >
                      <option value="">選択してください</option>
                      {VACCINE_PRESETS.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">接種日 *</label>
                    <input
                      type="date"
                      value={vaccineForm.date}
                      onChange={e => setVaccineForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">有効期限 *</label>
                    <input
                      type="date"
                      value={vaccineForm.expiresAt}
                      onChange={e => setVaccineForm(f => ({ ...f, expiresAt: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">動物病院</label>
                    <input
                      type="text"
                      value={vaccineForm.vetClinic}
                      onChange={e => setVaccineForm(f => ({ ...f, vetClinic: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddVaccine}
                  disabled={vaccineSaving || !vaccineForm.name || !vaccineForm.date || !vaccineForm.expiresAt}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                  {vaccineSaving ? '保存中...' : '追加する'}
                </button>
              </div>
            )}

            {/* Vaccine table */}
            {(!pet.vaccines || pet.vaccines.length === 0) && !showVaccineForm && (
              <p className="text-sm text-gray-400 py-8 text-center">ワクチン記録はまだありません。</p>
            )}
            {pet.vaccines && pet.vaccines.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-5 py-3">ワクチン名</th>
                        <th className="px-5 py-3">接種日</th>
                        <th className="px-5 py-3">有効期限</th>
                        <th className="px-5 py-3">動物病院</th>
                        <th className="px-5 py-3">ステータス</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pet.vaccines.map((v, i) => {
                        const st = vaccineDateStatus(v.expiresAt);
                        return (
                          <tr
                            key={v.id || i}
                            className={`border-b border-gray-50 ${
                              st === 'expired' ? 'bg-red-50' : st === 'expiring' ? 'bg-amber-50' : ''
                            }`}
                          >
                            <td className="px-5 py-3 font-medium text-gray-900">{v.name}</td>
                            <td className="px-5 py-3 text-gray-700">{v.date}</td>
                            <td className="px-5 py-3 text-gray-700">{v.expiresAt}</td>
                            <td className="px-5 py-3 text-gray-500">{v.vetClinic || '-'}</td>
                            <td className="px-5 py-3">
                              {st === 'expired' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">期限切れ</span>
                              )}
                              {st === 'expiring' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">要更新</span>
                              )}
                              {st === 'ok' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">有効</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
