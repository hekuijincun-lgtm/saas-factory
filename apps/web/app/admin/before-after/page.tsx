'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../_components/ui/AdminTopBar';

interface BeforeAfterRecord {
  id: string;
  customerName: string;
  date: string;
  menuName: string;
  beforeUrl: string;
  afterUrl: string;
  notes: string;
}

interface FormState {
  customerName: string;
  date: string;
  menuName: string;
  notes: string;
}

const emptyForm: FormState = {
  customerName: '',
  date: '',
  menuName: '',
  notes: '',
};

export default function BeforeAfterPage() {
  const { tenantId, status } = useAdminTenantId();
  const [records, setRecords] = useState<BeforeAfterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [beforePreview, setBeforePreview] = useState<string>('');
  const [afterPreview, setAfterPreview] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [toast, setToast] = useState('');
  const [filterName, setFilterName] = useState('');

  const beforeInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const fetchRecords = useCallback(() => {
    if (status !== 'ready') return;
    setLoading(true);
    setError(null);
    fetch(`/api/proxy/admin/special-features/beforeAfterPhoto?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        setRecords(json?.data ?? json?.records ?? []);
      })
      .catch(() => setError('データの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const resetForm = () => {
    setForm(emptyForm);
    setBeforeFile(null);
    setAfterFile(null);
    if (beforePreview) URL.revokeObjectURL(beforePreview);
    if (afterPreview) URL.revokeObjectURL(afterPreview);
    setBeforePreview('');
    setAfterPreview('');
    setUploadStatus('');
  };

  const handleFileSelect = (kind: 'before' | 'after', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    if (kind === 'before') {
      if (beforePreview) URL.revokeObjectURL(beforePreview);
      setBeforeFile(file);
      setBeforePreview(previewUrl);
    } else {
      if (afterPreview) URL.revokeObjectURL(afterPreview);
      setAfterFile(file);
      setAfterPreview(previewUrl);
    }
  };

  const uploadFile = async (file: File, kind: 'before' | 'after'): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(
      `/api/proxy/admin/special-features/before-after/upload?tenantId=${encodeURIComponent(tenantId)}&kind=${kind}`,
      { method: 'POST', body: formData },
    );
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const data = (await res.json()) as { imageUrl: string };
    return data.imageUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName || !form.date || !form.menuName) return;
    setSaving(true);
    try {
      let beforeUrl = '';
      let afterUrl = '';

      if (beforeFile) {
        setUploadStatus('ビフォー写真をアップロード中...');
        beforeUrl = await uploadFile(beforeFile, 'before');
      }
      if (afterFile) {
        setUploadStatus('アフター写真をアップロード中...');
        afterUrl = await uploadFile(afterFile, 'after');
      }

      setUploadStatus('保存中...');
      const res = await fetch(
        `/api/proxy/admin/special-features/beforeAfterPhoto?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, beforeUrl, afterUrl }),
        },
      );
      if (!res.ok) throw new Error();
      showToast('登録しました');
      resetForm();
      setShowForm(false);
      fetchRecords();
    } catch {
      showToast('保存に失敗しました');
    } finally {
      setSaving(false);
      setUploadStatus('');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('この記録を削除しますか？')) return;
    try {
      await fetch(
        `/api/proxy/admin/special-features/beforeAfterPhoto/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'DELETE' },
      );
      showToast('削除しました');
      fetchRecords();
    } catch {
      showToast('削除に失敗しました');
    }
  };

  const filteredRecords = filterName
    ? records.filter(r => r.customerName.includes(filterName))
    : records;

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="ビフォーアフター写真" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="ビフォーアフター写真" subtitle="施術前後の写真を記録・管理します。" />

      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="px-6 pb-8 space-y-6">
        {/* Actions row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 max-w-xs">
            <input
              type="text"
              placeholder="顧客名で絞り込み..."
              value={filterName}
              onChange={e => setFilterName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            {showForm ? 'キャンセル' : '新規追加'}
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">顧客名 *</label>
                <input type="text" required value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">施術日 *</label>
                <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">メニュー名 *</label>
                <input type="text" required value={form.menuName} onChange={e => setForm({ ...form, menuName: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              {/* Before photo upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ビフォー写真</label>
                <input
                  ref={beforeInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handleFileSelect('before', e)}
                />
                <div className="space-y-2">
                  {beforePreview ? (
                    <div className="relative group">
                      <img src={beforePreview} alt="Before preview" className="w-32 h-32 object-cover rounded-lg border border-gray-200" />
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(beforePreview);
                          setBeforeFile(null);
                          setBeforePreview('');
                          if (beforeInputRef.current) beforeInputRef.current.value = '';
                        }}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        &times;
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => beforeInputRef.current?.click()}
                      className="w-32 h-32 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
                    >
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-xs font-medium">写真を選択</span>
                    </button>
                  )}
                </div>
              </div>

              {/* After photo upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">アフター写真</label>
                <input
                  ref={afterInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handleFileSelect('after', e)}
                />
                <div className="space-y-2">
                  {afterPreview ? (
                    <div className="relative group">
                      <img src={afterPreview} alt="After preview" className="w-32 h-32 object-cover rounded-lg border border-gray-200" />
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(afterPreview);
                          setAfterFile(null);
                          setAfterPreview('');
                          if (afterInputRef.current) afterInputRef.current.value = '';
                        }}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        &times;
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => afterInputRef.current?.click()}
                      className="w-32 h-32 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
                    >
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-xs font-medium">写真を選択</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              {uploadStatus && (
                <span className="text-sm text-indigo-600 flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  {uploadStatus}
                </span>
              )}
              <button type="submit" disabled={saving}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? 'アップロード中...' : '登録する'}
              </button>
            </div>
          </form>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-10">
            <p className="text-sm text-red-500">{error}</p>
            <button onClick={fetchRecords} className="mt-3 text-xs text-gray-500 underline">再読み込み</button>
          </div>
        )}

        {/* Empty state */}
        {!error && filteredRecords.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">
              {filterName ? `「${filterName}」に一致する記録がありません` : 'ビフォーアフター写真がありません'}
            </p>
            <p className="text-xs text-gray-400 mt-1">「新規追加」ボタンから写真を登録してください</p>
          </div>
        )}

        {/* Photo grid */}
        {!error && filteredRecords.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredRecords
              .sort((a, b) => b.date.localeCompare(a.date))
              .map(r => (
                <div key={r.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Photo pair */}
                  <div className="grid grid-cols-2 gap-px bg-gray-100">
                    <div className="bg-white p-2">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1 text-center">Before</p>
                      {r.beforeUrl ? (
                        <img src={r.beforeUrl} alt="Before" className="w-full h-40 object-cover rounded-lg" />
                      ) : (
                        <div className="w-full h-40 bg-gray-50 rounded-lg flex items-center justify-center">
                          <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="bg-white p-2">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1 text-center">After</p>
                      {r.afterUrl ? (
                        <img src={r.afterUrl} alt="After" className="w-full h-40 object-cover rounded-lg" />
                      ) : (
                        <div className="w-full h-40 bg-gray-50 rounded-lg flex items-center justify-center">
                          <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Info */}
                  <div className="px-4 py-3 flex items-start justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-900">{r.customerName}</span>
                        <span className="text-xs text-gray-400 tabular-nums">{r.date}</span>
                      </div>
                      <p className="text-xs text-indigo-600 font-medium">{r.menuName}</p>
                      {r.notes && <p className="text-xs text-gray-400 mt-1">{r.notes}</p>}
                    </div>
                    <button onClick={() => handleDelete(r.id)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0 ml-3">
                      削除
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );
}
