'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface Coupon {
  id: string;
  title: string;
  description: string | null;
  discountType: 'amount' | 'percent' | 'free';
  discountValue: number;
  targetMenuId: string | null;
  validFrom: string;
  validUntil: string;
  maxUses: number | null;
  usedCount: number;
  triggerType: 'manual' | 'follow' | 'birthday' | 'revisit';
  isActive: boolean;
  createdAt: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: '手動配信',
  follow: '友だち追加時',
  birthday: '誕生日',
  revisit: '再来店促進',
};

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  amount: '金額割引',
  percent: '割引率',
  free: '無料',
};

function formatDiscount(type: string, value: number) {
  if (type === 'amount') return `¥${value.toLocaleString()} OFF`;
  if (type === 'percent') return `${value}% OFF`;
  return '無料';
}

export default function CouponsPage() {
  const { tenantId, status } = useAdminTenantId();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'amount' | 'percent' | 'free'>('amount');
  const [discountValue, setDiscountValue] = useState(1000);
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [triggerType, setTriggerType] = useState<'manual' | 'follow' | 'birthday' | 'revisit'>('manual');
  const [maxUses, setMaxUses] = useState<string>('');
  const [isActive, setIsActive] = useState(true);

  const fetchCoupons = useCallback(async () => {
    if (status !== 'ready') return;
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/admin/coupons?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
      const json: any = await res.json();
      if (json.ok) setCoupons(json.coupons || []);
    } catch {}
    setLoading(false);
  }, [tenantId, status]);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const resetForm = () => {
    setTitle(''); setDescription(''); setDiscountType('amount'); setDiscountValue(1000);
    setValidFrom(new Date().toISOString().slice(0, 10));
    setValidUntil(new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
    setTriggerType('manual'); setMaxUses(''); setIsActive(true);
    setEditingCoupon(null);
  };

  const openCreate = () => { resetForm(); setShowForm(true); };

  const openEdit = (c: Coupon) => {
    setEditingCoupon(c);
    setTitle(c.title); setDescription(c.description || ''); setDiscountType(c.discountType);
    setDiscountValue(c.discountValue); setValidFrom(c.validFrom); setValidUntil(c.validUntil);
    setTriggerType(c.triggerType); setMaxUses(c.maxUses?.toString() || ''); setIsActive(c.isActive);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!title || !validFrom || !validUntil) return;
    setSaving(true);
    try {
      const body = {
        title, description: description || null, discountType,
        discountValue: discountType === 'free' ? 0 : discountValue,
        validFrom, validUntil, triggerType,
        maxUses: maxUses ? parseInt(maxUses) : null,
        isActive,
      };
      const url = editingCoupon
        ? `/api/proxy/admin/coupons/${editingCoupon.id}?tenantId=${encodeURIComponent(tenantId)}`
        : `/api/proxy/admin/coupons?tenantId=${encodeURIComponent(tenantId)}`;
      const method = editingCoupon ? 'PUT' : 'POST';
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setShowForm(false);
      fetchCoupons();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このクーポンを削除しますか？')) return;
    await fetch(`/api/proxy/admin/coupons/${id}?tenantId=${encodeURIComponent(tenantId)}`, { method: 'DELETE' });
    fetchCoupons();
  };

  const handleToggleActive = async (c: Coupon) => {
    await fetch(`/api/proxy/admin/coupons/${c.id}?tenantId=${encodeURIComponent(tenantId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...c, isActive: !c.isActive }),
    });
    fetchCoupons();
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="クーポン管理" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar title="クーポン管理" subtitle="クーポンの作成・配信・利用状況を管理" />

      <div className="px-6 pb-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{coupons.length}件のクーポン</p>
          <button onClick={openCreate}
            className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors">
            + 新規クーポン
          </button>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingCoupon ? 'クーポンを編集' : '新規クーポン作成'}
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">タイトル *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="例: 初回限定1,000円割引"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="クーポンの詳細説明"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400" rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">割引タイプ *</label>
                    <select value={discountType} onChange={e => setDiscountType(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400">
                      <option value="amount">金額割引 (円)</option>
                      <option value="percent">割引率 (%)</option>
                      <option value="free">無料</option>
                    </select>
                  </div>
                  {discountType !== 'free' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {discountType === 'amount' ? '割引額 (円)' : '割引率 (%)'}
                      </label>
                      <input type="number" value={discountValue} onChange={e => setDiscountValue(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400" />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">開始日 *</label>
                    <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">終了日 *</label>
                    <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">配信トリガー</label>
                    <select value={triggerType} onChange={e => setTriggerType(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400">
                      <option value="manual">手動配信</option>
                      <option value="follow">友だち追加時</option>
                      <option value="birthday">誕生日</option>
                      <option value="revisit">再来店促進</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">最大使用回数</label>
                    <input type="number" value={maxUses} onChange={e => setMaxUses(e.target.value)}
                      placeholder="無制限"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
                    className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-400" />
                  <label className="text-sm text-gray-700">有効にする</label>
                </div>
              </div>
              <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                <button onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">キャンセル</button>
                <button onClick={handleSave} disabled={saving || !title || !validFrom || !validUntil}
                  className="px-6 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
                  {saving ? '保存中...' : editingCoupon ? '更新' : '作成'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Coupon list */}
        {coupons.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🎫</p>
            <p className="text-gray-500 text-sm">クーポンがまだありません</p>
            <button onClick={openCreate}
              className="mt-4 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors">
              最初のクーポンを作成
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {coupons.map(c => {
              const now = new Date().toISOString().slice(0, 10);
              const isExpired = c.validUntil < now;
              const isNotStarted = c.validFrom > now;
              const statusLabel = !c.isActive ? '無効' : isExpired ? '期限切れ' : isNotStarted ? '開始前' : '有効';
              const statusColor = !c.isActive ? 'bg-gray-100 text-gray-600' : isExpired ? 'bg-red-50 text-red-600' : isNotStarted ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600';

              return (
                <div key={c.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-gray-900">{c.title}</h3>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColor}`}>{statusLabel}</span>
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-50 text-orange-600">
                          {TRIGGER_LABELS[c.triggerType] || c.triggerType}
                        </span>
                      </div>
                      {c.description && <p className="text-sm text-gray-500 mb-2">{c.description}</p>}
                      <div className="flex items-center gap-4 text-sm">
                        <span className="font-bold text-orange-600 text-lg">{formatDiscount(c.discountType, c.discountValue)}</span>
                        <span className="text-gray-400">|</span>
                        <span className="text-gray-500">{c.validFrom} ~ {c.validUntil}</span>
                        <span className="text-gray-400">|</span>
                        <span className="text-gray-500">使用: {c.usedCount}{c.maxUses ? `/${c.maxUses}` : ''}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button onClick={() => handleToggleActive(c)}
                        className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
                          c.isActive ? 'border-gray-300 text-gray-600 hover:bg-gray-50' : 'border-green-300 text-green-600 hover:bg-green-50'
                        }`}>
                        {c.isActive ? '無効化' : '有効化'}
                      </button>
                      <button onClick={() => openEdit(c)}
                        className="px-3 py-1 text-xs font-medium rounded-lg border border-orange-300 text-orange-600 hover:bg-orange-50 transition-colors">
                        編集
                      </button>
                      <button onClick={() => handleDelete(c.id)}
                        className="px-3 py-1 text-xs font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors">
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
