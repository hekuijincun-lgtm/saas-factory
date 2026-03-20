'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../_components/ui/AdminTopBar';

interface ColorFormula {
  id: string;
  customerName: string;
  date: string;
  formulaName: string;
  products: string;
  ratio: string;
  processingTime: string;
  notes: string;
}

type FormData = Omit<ColorFormula, 'id'>;

const EMPTY_FORM: FormData = {
  customerName: '',
  date: new Date().toISOString().slice(0, 10),
  formulaName: '',
  products: '',
  ratio: '',
  processingTime: '',
  notes: '',
};

export default function ColorFormulaPage() {
  const { tenantId, status } = useAdminTenantId();
  const [records, setRecords] = useState<ColorFormula[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRecords = () => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(`/api/proxy/admin/special-features/colorFormula?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const list: ColorFormula[] = json?.data ?? json?.records ?? [];
        setRecords(list);
      })
      .catch(() => {
        setRecords([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tenantId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.trim().toLowerCase();
    return records.filter((r) => r.customerName.toLowerCase().includes(q));
  }, [records, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== 'ready') return;
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/admin/special-features/colorFormula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, ...form }),
      });
      if (!res.ok) throw new Error('save failed');
      setShowForm(false);
      setForm(EMPTY_FORM);
      fetchRecords();
    } catch {
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このレシピを削除しますか？')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/proxy/admin/special-features/colorFormula/${id}?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('delete failed');
      fetchRecords();
    } catch {
      alert('削除に失敗しました');
    } finally {
      setDeletingId(null);
    }
  };

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminTopBar title="カラー調合レシピ" subtitle="お客様ごとのカラーレシピを管理" />

      <div className="px-6 pb-8 max-w-5xl mx-auto space-y-6">
        {/* Search + Add Button */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <input
            type="text"
            placeholder="お客様名で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72 px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            onClick={() => { setShowForm(true); setForm(EMPTY_FORM); }}
            className="shrink-0 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
          >
            + 新規レシピ追加
          </button>
        </div>

        {/* New Recipe Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">新規レシピ</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="お客様名" value={form.customerName} onChange={(v) => updateField('customerName', v)} required />
              <Field label="日付" type="date" value={form.date} onChange={(v) => updateField('date', v)} required />
              <Field label="色名" value={form.formulaName} onChange={(v) => updateField('formulaName', v)} placeholder="例: アッシュベージュ 7トーン" required />
              <Field label="放置時間" value={form.processingTime} onChange={(v) => updateField('processingTime', v)} placeholder="例: 25分" />
            </div>
            <Field label="使用薬剤" value={form.products} onChange={(v) => updateField('products', v)} placeholder="例: イルミナ オーシャン6:クリスタル = 1:1" required />
            <Field label="配合比" value={form.ratio} onChange={(v) => updateField('ratio', v)} placeholder="例: 1剤60g + 2剤60g" />
            <FieldTextarea label="備考" value={form.notes} onChange={(v) => updateField('notes', v)} placeholder="仕上がりや次回の提案など" />
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                キャンセル
              </button>
              <button type="submit" disabled={saving} className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <p className="mt-3 text-sm text-gray-500">読み込み中...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && records.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <div className="text-4xl mb-3">🎨</div>
            <p className="text-gray-600 font-medium">レシピがまだありません</p>
            <p className="text-sm text-gray-400 mt-1">「新規レシピ追加」からカラーレシピを登録しましょう</p>
          </div>
        )}

        {/* No search results */}
        {!loading && records.length > 0 && filtered.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
            <p className="text-gray-500">「{search}」に一致するレシピが見つかりません</p>
          </div>
        )}

        {/* Cards */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-base font-semibold text-gray-800">{r.customerName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{r.date}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={deletingId === r.id}
                    className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors"
                  >
                    {deletingId === r.id ? '削除中...' : '削除'}
                  </button>
                </div>

                <div className="px-3 py-2 bg-indigo-50 rounded-xl">
                  <p className="text-sm font-medium text-indigo-700">{r.formulaName}</p>
                </div>

                <dl className="space-y-1.5 text-sm">
                  <DetailRow label="使用薬剤" value={r.products} />
                  {r.ratio && <DetailRow label="配合比" value={r.ratio} />}
                  {r.processingTime && <DetailRow label="放置時間" value={r.processingTime} />}
                  {r.notes && <DetailRow label="備考" value={r.notes} />}
                </dl>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Reusable sub-components ── */

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
    </label>
  );
}

function FieldTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
      />
    </label>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-gray-400 w-16">{label}</dt>
      <dd className="text-gray-700">{value}</dd>
    </div>
  );
}
