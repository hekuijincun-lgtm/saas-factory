'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface PricingRow {
  category: string;
  small: number;
  medium: number;
  large: number;
}

interface OptionRow {
  name: string;
  price: number;
}

const DEFAULT_PRICING: PricingRow[] = [
  { category: 'トリミング', small: 5500, medium: 7000, large: 9500 },
  { category: 'シャンプー', small: 3500, medium: 4500, large: 6000 },
  { category: '部分カット', small: 2000, medium: 2500, large: 3500 },
  { category: '爪切り・耳掃除', small: 1000, medium: 1200, large: 1500 },
  { category: 'デンタルケア', small: 2500, medium: 3000, large: 3500 },
];

const DEFAULT_OPTIONS: OptionRow[] = [
  { name: '指名料', price: 500 },
  { name: '送迎', price: 1000 },
  { name: '写真撮影', price: 300 },
  { name: 'マイクロバブル', price: 1500 },
  { name: '薬浴', price: 2000 },
  { name: '毛玉取り', price: 500 },
];

export default function PetPricingPage() {
  const { tenantId, status } = useAdminTenantId();
  const [pricing, setPricing] = useState<PricingRow[]>(DEFAULT_PRICING);
  const [options, setOptions] = useState<OptionRow[]>(DEFAULT_OPTIONS);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(`/api/proxy/admin/settings?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const s = json?.data ?? json;
        const vc = s?.verticalConfig?.pet;
        if (vc?.pricing && Array.isArray(vc.pricing)) {
          setPricing(vc.pricing);
        }
        if (vc?.options && Array.isArray(vc.options)) {
          setOptions(vc.options);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId, status]);

  function updatePricing(index: number, field: 'small' | 'medium' | 'large', value: number) {
    setPricing(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }

  function updateOption(index: number, value: number) {
    setOptions(prev => prev.map((row, i) => i === index ? { ...row, price: value } : row));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/admin/settings?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          verticalConfig: {
            pet: {
              pricing,
              options,
            },
          },
        }),
      });
      if (!res.ok) throw new Error('save failed');
      setMessage({ type: 'success', text: '保存しました' });
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました。もう一度お試しください。' });
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="料金テーブル設定" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="料金テーブル設定" subtitle="ペットサロンのコース料金とオプション料金を設定します。" />

      <div className="px-6 pb-8 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href={withTenant('/admin/pet', tenantId)} className="hover:text-orange-600 transition-colors">
            ペットサロン
          </Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">料金設定</span>
        </div>

        {/* Pricing table */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">コース別料金（税込）</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">コース</th>
                  <th className="px-5 py-3 text-right">小型犬</th>
                  <th className="px-5 py-3 text-right">中型犬</th>
                  <th className="px-5 py-3 text-right">大型犬</th>
                </tr>
              </thead>
              <tbody>
                {pricing.map((row, idx) => (
                  <tr key={row.category} className="border-b border-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{row.category}</td>
                    {(['small', 'medium', 'large'] as const).map(size => (
                      <td key={size} className="px-5 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <span className="text-gray-400 text-xs">¥</span>
                          <input
                            type="number"
                            min={0}
                            step={100}
                            value={row[size]}
                            onChange={e => updatePricing(idx, size, parseInt(e.target.value) || 0)}
                            className="w-24 text-right rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none transition-colors"
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Options table */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">オプション料金（税込）</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">オプション名</th>
                  <th className="px-5 py-3 text-right">料金</th>
                </tr>
              </thead>
              <tbody>
                {options.map((opt, idx) => (
                  <tr key={opt.name} className="border-b border-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{opt.name}</td>
                    <td className="px-5 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <span className="text-gray-400 text-xs">¥</span>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={opt.price}
                          onChange={e => updateOption(idx, parseInt(e.target.value) || 0)}
                          className="w-24 text-right rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none transition-colors"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-orange-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? '保存中...' : '保存する'}
          </button>
          {message && (
            <span className={`text-sm font-medium ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {message.text}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
