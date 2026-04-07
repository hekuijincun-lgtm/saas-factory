'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface Karte {
  id: string;
  tenant_id: string;
  customer_id: string;
  customer_name: string | null;
  pet_name: string | null;
  pet_breed: string | null;
  pet_age: string | null;
  pet_weight: string | null;
  allergies: string | null;
  cut_style: string | null;
  notes: string | null;
  first_visit_date: string | null;
  pet_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PetProfileSummary {
  id: string;
  name: string;
  breed?: string;
  age?: number;
  weight?: number;
  allergies?: string;
  ownerName?: string;
}

interface KartePhoto {
  id: string;
  customer_id: string;
  photo_url: string;
  visit_date: string;
  ai_description: string | null;
  trimmer_notes: string | null;
  is_sent_to_customer: number;
  created_at: string;
}

const EMPTY_FORM = {
  customerName: '',
  petName: '',
  petBreed: '',
  petAge: '',
  petWeight: '',
  allergies: '',
  cutStyle: '',
  notes: '',
  firstVisitDate: '',
  petProfileId: '',
};

export default function KartePage() {
  const { tenantId, status } = useAdminTenantId();
  const [kartes, setKartes] = useState<Karte[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [showList, setShowList] = useState(true);
  const [petProfiles, setPetProfiles] = useState<PetProfileSummary[]>([]);

  // Visual Karte state
  const [kartePhotos, setKartePhotos] = useState<KartePhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lineModal, setLineModal] = useState<KartePhoto | null>(null);
  const [lineMessage, setLineMessage] = useState('');
  const [lineSending, setLineSending] = useState(false);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [editNotesText, setEditNotesText] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchKartes = useCallback(async () => {
    if (status !== 'ready') return;
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/admin/kartes?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
      const json: any = await res.json();
      if (json.ok) setKartes(json.data ?? []);
    } catch {}
    setLoading(false);
  }, [tenantId, status]);

  useEffect(() => { fetchKartes(); }, [fetchKartes]);

  // Fetch pet profiles for selector
  useEffect(() => {
    if (status !== 'ready') return;
    fetch(`/api/proxy/admin/pets?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((json: any) => {
        const pets = json.data ?? json.pets ?? [];
        setPetProfiles(pets.map((p: any) => ({
          id: p.id, name: p.name, breed: p.breed, age: p.age, weight: p.weight,
          allergies: p.allergies, ownerName: p.ownerName,
        })));
      })
      .catch(() => {});
  }, [tenantId, status]);

  const selectKarte = (k: Karte) => {
    setSelected(k.customer_id);
    setForm({
      customerName: k.customer_name ?? '',
      petName: k.pet_name ?? '',
      petBreed: k.pet_breed ?? '',
      petAge: k.pet_age ?? '',
      petWeight: k.pet_weight ?? '',
      allergies: k.allergies ?? '',
      cutStyle: k.cut_style ?? '',
      notes: k.notes ?? '',
      firstVisitDate: k.first_visit_date ?? '',
      petProfileId: k.pet_profile_id ?? '',
    });
    setShowList(false);
  };

  const selectedKarte = kartes.find(k => k.customer_id === selected);

  // Fetch karte photos when customer selected
  const fetchKartePhotos = useCallback(async (customerId: string) => {
    if (status !== 'ready' || !customerId) { setKartePhotos([]); return; }
    try {
      const res = await fetch(`/api/proxy/admin/karte-photos?tenantId=${encodeURIComponent(tenantId)}&customerId=${encodeURIComponent(customerId)}`, { cache: 'no-store' });
      const json: any = await res.json();
      if (json.ok) setKartePhotos(json.photos ?? []);
    } catch { setKartePhotos([]); }
  }, [tenantId, status]);

  useEffect(() => {
    if (selected) fetchKartePhotos(selected);
    else setKartePhotos([]);
  }, [selected, fetchKartePhotos]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setUploading(true);
    setUploadStatus('📤 アップロード中...');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('customer_id', selected);
      fd.append('visit_date', new Date().toISOString().split('T')[0]);
      const res = await fetch(`/api/proxy/admin/karte-photos?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        body: fd,
      });
      setUploadStatus('🤖 AIが解析中...');
      const json: any = await res.json();
      if (json.ok) {
        showToast('写真をアップロードしました');
        fetchKartePhotos(selected);
      } else {
        alert(`アップロード失敗: ${json.error || '不明なエラー'}`);
      }
    } catch (err: any) {
      alert(`エラー: ${err.message}`);
    }
    setUploading(false);
    setUploadStatus('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveNotes = async (photoId: string) => {
    try {
      const res = await fetch(`/api/proxy/admin/karte-photos/${encodeURIComponent(photoId)}?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trimmerNotes: editNotesText }),
      });
      const json: any = await res.json();
      if (json.ok) {
        showToast('申し送りを保存しました');
        setEditingNotes(null);
        if (selected) fetchKartePhotos(selected);
      }
    } catch {}
  };

  const handleSendLine = async (photo: KartePhoto) => {
    if (!selected) return;
    setLineSending(true);
    try {
      // customer_id is the LINE userId in this system
      const res = await fetch(`/api/proxy/admin/karte-photos/${encodeURIComponent(photo.id)}/send-line?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineUserId: selected,
          petName: form.petName || selectedKarte?.pet_name || '',
          customMessage: lineMessage || undefined,
        }),
      });
      const json: any = await res.json();
      if (json.ok) {
        showToast('✅ LINEに送りました');
        setLineModal(null);
        setLineMessage('');
        fetchKartePhotos(selected);
      } else {
        alert(`LINE送信失敗: ${json.error || '不明なエラー'}`);
      }
    } catch (err: any) {
      alert(`エラー: ${err.message}`);
    }
    setLineSending(false);
  };

  const handleNew = () => {
    const customerId = prompt('顧客ID（LINE userId）を入力してください');
    if (!customerId?.trim()) return;
    setSelected(customerId.trim());
    setForm(EMPTY_FORM);
    setShowList(false);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/proxy/admin/kartes?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: selected, ...form, petProfileId: form.petProfileId || null }),
      });
      const json: any = await res.json();
      if (json.ok) {
        showToast('保存しました');
        fetchKartes();
      } else {
        alert(`保存失敗: ${json.error || '不明なエラー'}`);
      }
    } catch (e: any) {
      alert(`エラー: ${e.message}`);
    }
    setSaving(false);
  };

  const handleDelete = async (karteId: string) => {
    if (!confirm('このカルテを削除しますか？')) return;
    try {
      const res = await fetch(`/api/proxy/admin/kartes/${encodeURIComponent(karteId)}?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'DELETE',
      });
      const json: any = await res.json();
      if (json.ok) {
        showToast('削除しました');
        setSelected(null);
        setShowList(true);
        fetchKartes();
      }
    } catch {}
  };

  const filtered = kartes.filter(k => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (k.customer_name ?? '').toLowerCase().includes(q) ||
      (k.pet_name ?? '').toLowerCase().includes(q) ||
      k.customer_id.toLowerCase().includes(q)
    );
  });

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="カルテ管理" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="カルテ管理" subtitle="顧客ごとのペット情報・カルテを管理" />

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      <div className="px-4 sm:px-6 pb-8">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          {/* Left: Customer List */}
          <div className={`lg:w-80 shrink-0 ${!showList ? 'hidden lg:block' : ''}`}>
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">顧客一覧</h3>
                  <button onClick={handleNew}
                    className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">
                    + 新規
                  </button>
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="名前・ペット名・IDで検索"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                />
              </div>
              <div className="max-h-[calc(100vh-320px)] overflow-y-auto divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-400">
                    {kartes.length === 0 ? 'カルテがありません' : '該当なし'}
                  </div>
                ) : (
                  filtered.map(k => (
                    <button
                      key={k.customer_id}
                      onClick={() => selectKarte(k)}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        selected === k.customer_id ? 'bg-orange-50 border-l-4 border-orange-500' : 'hover:bg-gray-50 border-l-4 border-transparent'
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {k.customer_name || k.customer_id.slice(0, 12)}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">
                        {k.pet_name ? `${k.pet_name}${k.pet_breed ? ` (${k.pet_breed})` : ''}` : '未登録'}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        更新: {k.updated_at ? new Date(k.updated_at).toLocaleDateString('ja-JP') : '-'}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right: Karte Edit Form */}
          <div className={`flex-1 ${showList && !selected ? 'hidden lg:block' : ''}`}>
            {selected ? (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">カルテ編集</h3>
                    <p className="text-xs text-gray-400 mt-0.5">ID: {selected.slice(0, 20)}...</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setShowList(true); setSelected(null); }}
                      className="lg:hidden text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg">
                      一覧に戻る
                    </button>
                    {selectedKarte && (
                      <button onClick={() => handleDelete(selectedKarte.id)}
                        className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 border border-red-200 rounded-lg">
                        削除
                      </button>
                    )}
                  </div>
                </div>

                {/* Pet profile selector */}
                {petProfiles.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">登録済みペットから選択</label>
                    <select
                      value={form.petProfileId}
                      onChange={e => {
                        const petId = e.target.value;
                        setForm(f => ({ ...f, petProfileId: petId }));
                        if (petId) {
                          const p = petProfiles.find(pp => pp.id === petId);
                          if (p) {
                            setForm(f => ({
                              ...f,
                              petProfileId: petId,
                              petName: p.name || f.petName,
                              petBreed: p.breed || f.petBreed,
                              petAge: p.age != null ? `${p.age}歳` : f.petAge,
                              petWeight: p.weight != null ? `${p.weight}kg` : f.petWeight,
                              allergies: p.allergies || f.allergies,
                              customerName: p.ownerName || f.customerName,
                            }));
                          }
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                    >
                      <option value="">-- 選択しない（手動入力）--</option>
                      {petProfiles.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.breed ? `（${p.breed}）` : ''}{p.ownerName ? ` — ${p.ownerName}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="お客様名" value={form.customerName} onChange={v => setForm(f => ({ ...f, customerName: v }))} />
                  <Field label="ペット名" value={form.petName} onChange={v => setForm(f => ({ ...f, petName: v }))} />
                  <Field label="犬種" value={form.petBreed} onChange={v => setForm(f => ({ ...f, petBreed: v }))} />
                  <Field label="年齢" value={form.petAge} onChange={v => setForm(f => ({ ...f, petAge: v }))} placeholder="例: 3歳" />
                  <Field label="体重" value={form.petWeight} onChange={v => setForm(f => ({ ...f, petWeight: v }))} placeholder="例: 5.2kg" />
                  <Field label="初回来店日" value={form.firstVisitDate} onChange={v => setForm(f => ({ ...f, firstVisitDate: v }))} type="date" />
                </div>

                <TextAreaField label="アレルギー・禁忌" value={form.allergies} onChange={v => setForm(f => ({ ...f, allergies: v }))} placeholder="例: 鶏肉アレルギー、耳が敏感" />
                <TextAreaField label="いつものカットスタイル" value={form.cutStyle} onChange={v => setForm(f => ({ ...f, cutStyle: v }))} placeholder="例: テディベアカット、足バリカン3mm" />
                <TextAreaField label="備考" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="その他メモ" />

                <button onClick={handleSave} disabled={saving}
                  className="w-full sm:w-auto px-6 py-2.5 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
                  {saving ? '保存中...' : '保存'}
                </button>

                {/* ── Visual Karte Section ── */}
                <div className="border-t border-gray-200 pt-5 mt-5">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">📸 ビジュアルカルテ（施術写真）</h4>

                  {/* Upload button */}
                  <div className="mb-4">
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" id="karte-photo-upload" />
                    <label htmlFor="karte-photo-upload"
                      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors cursor-pointer ${
                        uploading ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}>
                      {uploading ? uploadStatus : '📷 写真を追加'}
                    </label>
                  </div>

                  {/* Photo cards */}
                  {kartePhotos.length > 0 && (
                    <div className="space-y-4">
                      {kartePhotos.map(photo => (
                        <div key={photo.id} className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                          <div className="flex flex-col sm:flex-row">
                            {/* Thumbnail */}
                            <div className="sm:w-40 h-40 sm:h-auto shrink-0 bg-gray-200">
                              <img src={photo.photo_url} alt="施術写真" className="w-full h-full object-cover" />
                            </div>
                            {/* Info */}
                            <div className="flex-1 p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-gray-500">{photo.visit_date}</span>
                                {photo.is_sent_to_customer === 1 && (
                                  <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">LINE送信済み</span>
                                )}
                              </div>
                              {/* AI Description */}
                              {photo.ai_description && (
                                <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{photo.ai_description}</p>
                              )}
                              {/* Trimmer Notes */}
                              {photo.trimmer_notes && (
                                <div className="text-xs text-blue-700 bg-blue-50 rounded-lg p-2">
                                  <span className="font-medium">申し送り:</span> {photo.trimmer_notes}
                                </div>
                              )}
                              {/* Edit notes */}
                              {editingNotes === photo.id ? (
                                <div className="space-y-1">
                                  <textarea value={editNotesText} onChange={e => setEditNotesText(e.target.value)}
                                    className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-orange-400"
                                    rows={2} placeholder="次回への申し送りメモ" />
                                  <div className="flex gap-2">
                                    <button onClick={() => handleSaveNotes(photo.id)}
                                      className="text-xs px-3 py-1 bg-orange-500 text-white rounded-lg hover:bg-orange-600">保存</button>
                                    <button onClick={() => setEditingNotes(null)}
                                      className="text-xs px-3 py-1 text-gray-500 hover:text-gray-700">キャンセル</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-2 pt-1">
                                  <button onClick={() => { setEditingNotes(photo.id); setEditNotesText(photo.trimmer_notes || ''); }}
                                    className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
                                    ✏️ 申し送りを追加
                                  </button>
                                  <button onClick={() => { setLineModal(photo); setLineMessage(''); }}
                                    className="text-xs px-3 py-1.5 border border-green-300 rounded-lg text-green-700 hover:bg-green-50 transition-colors">
                                    ✉️ LINE送信
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {kartePhotos.length === 0 && !uploading && (
                    <p className="text-xs text-gray-400">施術写真はまだありません</p>
                  )}
                </div>
              </div>

            ) : (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-10 text-center text-gray-400 text-sm">
                左の一覧から顧客を選択するか、「+ 新規」でカルテを作成してください
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LINE Send Modal */}
      {lineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setLineModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h4 className="text-sm font-semibold text-gray-900">✉️ トリミング報告をLINEで送信</h4>
            <div className="flex gap-3 items-start">
              <img src={lineModal.photo_url} alt="" className="w-20 h-20 object-cover rounded-lg" />
              <div className="text-xs text-gray-500 space-y-1">
                <p>{lineModal.visit_date}</p>
                <p className="line-clamp-3">{(lineModal.trimmer_notes || lineModal.ai_description || '').substring(0, 80)}...</p>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ペット名</label>
              <input type="text" readOnly value={form.petName || selectedKarte?.pet_name || ''} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">一言メッセージ（任意）</label>
              <textarea value={lineMessage} onChange={e => setLineMessage(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-orange-400"
                rows={2} placeholder="例: 次回は耳を少し短めにしましょう！" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setLineModal(null)}
                className="text-xs px-4 py-2 text-gray-500 hover:text-gray-700">キャンセル</button>
              <button onClick={() => handleSendLine(lineModal)} disabled={lineSending}
                className="text-xs px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
                {lineSending ? '送信中...' : '送信する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400" />
    </div>
  );
}

function TextAreaField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 resize-none" />
    </div>
  );
}
