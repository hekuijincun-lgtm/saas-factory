'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../../_components/ui/AdminTopBar';
import CustomerPicker from '../../_components/CustomerPicker';

export default function NewPetProfilePage() {
  const { tenantId, status } = useAdminTenantId();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    species: '',
    breed: '',
    size: '',
    age: '',
    weight: '',
    color: '',
    gender: '',
    allergies: '',
    notes: '',
    customerKey: '',
    ownerName: '',
  });

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError('名前は必須です');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        ...form,
        age: form.age ? parseInt(form.age) : undefined,
        weight: form.weight ? parseFloat(form.weight) : undefined,
        tenantId,
      };
      const res = await fetch(`/api/proxy/admin/pets?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('save failed');
      const json = await res.json() as any;
      const newId = json?.data?.id ?? json?.pet?.id ?? json?.id;
      if (newId) {
        router.push(withTenant(`/admin/pet/profiles/${newId}`, tenantId));
      } else {
        router.push(withTenant('/admin/pet/profiles', tenantId));
      }
    } catch {
      setError('保存に失敗しました。もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') {
    return (
      <>
        <AdminTopBar title="ペット新規登録" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="ペット新規登録"
        subtitle="新しいペットのプロフィールを登録します。"
        right={
          <Link
            href={withTenant('/admin/pet/profiles', tenantId)}
            className="text-sm text-orange-600 hover:text-orange-700 font-medium"
          >
            一覧に戻る
          </Link>
        }
      />

      <div className="px-6 pb-8">
        <div className="max-w-2xl space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">名前 *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="ポチ"
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

          <div className="border-t border-gray-100 pt-6">
            <CustomerPicker
              tenantId={tenantId}
              ownerName={form.ownerName}
              customerKey={form.customerKey}
              onChange={(ownerName, customerKey) => setForm(f => ({ ...f, ownerName, customerKey }))}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving || !form.name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {saving ? '登録中...' : '登録する'}
          </button>
        </div>
      </div>
    </>
  );
}
