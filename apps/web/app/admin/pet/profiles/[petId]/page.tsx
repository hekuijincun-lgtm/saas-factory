'use client';

export const runtime = 'edge';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../../_components/ui/AdminTopBar';
import CustomerPicker from '../../_components/CustomerPicker';
import { compressImage } from '@/src/lib/compressImage';

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
    ownerName: '', customerKey: '',
  });

  // Grooming add form
  const [showGroomingForm, setShowGroomingForm] = useState(false);
  const [groomingForm, setGroomingForm] = useState({
    date: '', course: '', staffName: '', cutStyle: '', weight: '', notes: '',
    beforePhotoUrl: '', afterPhotoUrl: '',
  });
  const [groomingSaving, setGroomingSaving] = useState(false);

  // Vaccine add form
  const [showVaccineForm, setShowVaccineForm] = useState(false);
  const [vaccineForm, setVaccineForm] = useState({
    name: '', date: '', expiresAt: '', vetClinic: '',
  });
  const [vaccineSaving, setVaccineSaving] = useState(false);

  const [photoUploading, setPhotoUploading] = useState(false);
  const [groomingPhotoUploading, setGroomingPhotoUploading] = useState<'before' | 'after' | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const handlePhotoUpload = async (file: File) => {
    if (!pet) return;
    setPhotoUploading(true);
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append('file', compressed);
      const res = await fetch(
        `/api/proxy/admin/pets/${encodeURIComponent(pet.id)}/image?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'POST', body: fd }
      );
      if (!res.ok) throw new Error('upload failed');
      const json = await res.json() as any;
      if (!json.ok) throw new Error(json.error || 'upload failed');
      setForm(f => ({ ...f, photoUrl: json.imageUrl }));
      setPet(prev => prev ? { ...prev, photoUrl: json.imageUrl } : prev);
      showToast('写真をアップロードしました');
    } catch {
      showToast('写真のアップロードに失敗しました');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleGroomingPhotoUpload = async (kind: 'before' | 'after', file: File) => {
    if (!pet) return;
    setGroomingPhotoUploading(kind);
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append('file', compressed);
      const res = await fetch(
        `/api/proxy/admin/pets/${encodeURIComponent(pet.id)}/image?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'POST', body: fd }
      );
      if (!res.ok) throw new Error('upload failed');
      const json = await res.json() as any;
      if (!json.ok) throw new Error(json.error || 'upload failed');
      const urlKey = kind === 'before' ? 'beforePhotoUrl' : 'afterPhotoUrl';
      setGroomingForm(f => ({ ...f, [urlKey]: json.imageUrl }));
      showToast(`${kind === 'before' ? 'Before' : 'After'}写真をアップロードしました`);
    } catch {
      showToast('写真のアップロードに失敗しました');
    } finally {
      setGroomingPhotoUploading(null);
    }
  };

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
          ownerName: p.ownerName || '', customerKey: p.customerKey || '',
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
      const res = await fetch(`/api/proxy/admin/pets/${encodeURIComponent(pet.id)}?tenantId=${encodeURIComponent(tenantId)}`, {
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
      const { beforePhotoUrl, afterPhotoUrl, ...groomingRest } = groomingForm;
      const body = {
        ...groomingRest,
        weight: groomingForm.weight ? parseFloat(groomingForm.weight) : undefined,
        beforeUrl: beforePhotoUrl || undefined,
        afterUrl: afterPhotoUrl || undefined,
        tenantId,
      };
      const res = await fetch(`/api/proxy/admin/pets/${encodeURIComponent(pet.id)}/grooming?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('save failed');
      const json = await res.json() as any;
      const newRecord: GroomingRecord = json?.data ?? json?.note ?? json;
      setPet(prev => prev ? {
        ...prev,
        groomingHistory: [newRecord, ...(prev.groomingHistory || [])],
      } : prev);
      setGroomingForm({ date: '', course: '', staffName: '', cutStyle: '', weight: '', notes: '', beforePhotoUrl: '', afterPhotoUrl: '' });
      setShowGroomingForm(false);
      showToast('施術記録を追加しました');
    } catch {
      showToast('追加に失敗しました');
    } finally {
      setGroomingSaving(false);
    }
  };

  // Delete grooming record
  const handleDeleteGrooming = async (groomingId: string) => {
    if (!pet || !groomingId) return;
    if (!confirm('この施術記録を削除しますか？')) return;
    try {
      const res = await fetch(
        `/api/proxy/admin/pets/${encodeURIComponent(pet.id)}/grooming?tenantId=${encodeURIComponent(tenantId)}&groomingId=${encodeURIComponent(groomingId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('delete failed');
      setPet(prev => prev ? {
        ...prev,
        groomingHistory: (prev.groomingHistory || []).filter(g => g.id !== groomingId),
      } : prev);
      showToast('施術記録を削除しました');
    } catch {
      showToast('削除に失敗しました');
    }
  };

  // Delete vaccine record
  const handleDeleteVaccine = async (vaccineId: string) => {
    if (!pet || !vaccineId) return;
    if (!confirm('このワクチン記録を削除しますか？')) return;
    try {
      const res = await fetch(
        `/api/proxy/admin/pets/${encodeURIComponent(pet.id)}/vaccine?tenantId=${encodeURIComponent(tenantId)}&vaccineId=${encodeURIComponent(vaccineId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('delete failed');
      setPet(prev => prev ? {
        ...prev,
        vaccines: (prev.vaccines || []).filter(v => v.id !== vaccineId),
      } : prev);
      showToast('ワクチン記録を削除しました');
    } catch {
      showToast('削除に失敗しました');
    }
  };

  // Add vaccine record
  const handleAddVaccine = async () => {
    if (!pet) return;
    setVaccineSaving(true);
    try {
      const body = { ...vaccineForm, tenantId };
      const res = await fetch(`/api/proxy/admin/pets/${encodeURIComponent(pet.id)}/vaccine?tenantId=${encodeURIComponent(tenantId)}`, {
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const shareUrl = `${window.location.origin}/pet/history/${petId}?tenantId=${encodeURIComponent(tenantId)}`;
                navigator.clipboard.writeText(shareUrl).then(() => {
                  showToast('リンクをコピーしました');
                }).catch(() => {
                  showToast('コピーに失敗しました');
                });
              }}
              className="inline-flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700 font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              共有リンク
            </button>
            <Link
              href={withTenant('/admin/pet/profiles', tenantId)}
              className="text-sm text-orange-600 hover:text-orange-700 font-medium"
            >
              一覧に戻る
            </Link>
          </div>
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
              <div className="flex-1 space-y-2">
                <label className="block text-xs font-medium text-gray-500">写真</label>
                <label
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors ${
                    photoUploading
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={photoUploading}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handlePhotoUpload(f);
                      e.target.value = '';
                    }}
                  />
                  {photoUploading ? '送信中...' : '写真を選択'}
                </label>
                {form.photoUrl && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, photoUrl: '' }))}
                    className="ml-2 text-xs text-gray-400 hover:text-red-500"
                  >
                    削除
                  </button>
                )}
              </div>
            </div>

            {/* Owner info */}
            <div className="border-t border-gray-100 pt-4">
              <CustomerPicker
                tenantId={tenantId}
                ownerName={form.ownerName}
                customerKey={form.customerKey}
                onChange={(ownerName, customerKey) => setForm(f => ({ ...f, ownerName, customerKey }))}
              />
            </div>

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
                {/* Before / After photo uploads */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Before写真</label>
                    {groomingForm.beforePhotoUrl ? (
                      <div className="relative inline-block">
                        <img src={groomingForm.beforePhotoUrl} alt="before" className="w-24 h-24 rounded-lg object-cover" />
                        <button
                          type="button"
                          onClick={() => setGroomingForm(f => ({ ...f, beforePhotoUrl: '' }))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center hover:bg-red-500 transition-colors"
                        >
                          &times;
                        </button>
                      </div>
                    ) : (
                      <label
                        className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors ${
                          groomingPhotoUploading === 'before'
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                        }`}
                      >
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={groomingPhotoUploading !== null}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handleGroomingPhotoUpload('before', f);
                            e.target.value = '';
                          }}
                        />
                        {groomingPhotoUploading === 'before' ? '送信中...' : '写真を選択'}
                      </label>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">After写真</label>
                    {groomingForm.afterPhotoUrl ? (
                      <div className="relative inline-block">
                        <img src={groomingForm.afterPhotoUrl} alt="after" className="w-24 h-24 rounded-lg object-cover" />
                        <button
                          type="button"
                          onClick={() => setGroomingForm(f => ({ ...f, afterPhotoUrl: '' }))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center hover:bg-red-500 transition-colors"
                        >
                          &times;
                        </button>
                      </div>
                    ) : (
                      <label
                        className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors ${
                          groomingPhotoUploading === 'after'
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                        }`}
                      >
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={groomingPhotoUploading !== null}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handleGroomingPhotoUpload('after', f);
                            e.target.value = '';
                          }}
                        />
                        {groomingPhotoUploading === 'after' ? '送信中...' : '写真を選択'}
                      </label>
                    )}
                  </div>
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
                      <div className="flex items-center gap-2">
                        {g.cutStyle && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                            {g.cutStyle}
                          </span>
                        )}
                        {g.id && (
                          <button
                            onClick={() => handleDeleteGrooming(g.id!)}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            title="削除"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
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
                        <th className="px-5 py-3"></th>
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
                            <td className="px-5 py-3">
                              {v.id && (
                                <button
                                  onClick={() => handleDeleteVaccine(v.id!)}
                                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
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
            )}
          </div>
        )}
      </div>
    </>
  );
}
