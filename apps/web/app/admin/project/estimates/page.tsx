'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../_components/ui/AdminTopBar';

interface Estimate {
  id: string;
  title: string;
  projectName?: string;
  amount: number;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  createdAt: string;
}

interface Invoice {
  id: string;
  title: string;
  amount: number;
  status: 'unpaid' | 'paid' | 'overdue';
  dueDate: string;
  createdAt: string;
}

const ESTIMATE_STATUS_LABELS: Record<string, string> = {
  draft: '下書き',
  sent: '送付済',
  accepted: '承認済',
  rejected: '不採用',
};

const ESTIMATE_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  unpaid: '未入金',
  paid: '入金済',
  overdue: '延滞',
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  unpaid: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
};

const DEMO_ESTIMATES: Estimate[] = [
  { id: 'e1', title: '外壁塗装工事 見積書', projectName: '山田邸 外壁塗装工事', amount: 980000, status: 'accepted', createdAt: '2026-03-10T10:00:00' },
  { id: 'e2', title: '防水工事 見積書', projectName: '佐藤ビル 防水工事', amount: 450000, status: 'sent', createdAt: '2026-03-18T14:00:00' },
  { id: 'e3', title: '屋根修繕 見積書', projectName: '田中邸 屋根修繕', amount: 320000, status: 'accepted', createdAt: '2026-01-20T09:00:00' },
  { id: 'e4', title: '大規模修繕 概算見積', projectName: '鈴木マンション 大規模修繕', amount: 12500000, status: 'draft', createdAt: '2026-03-19T16:00:00' },
];

const DEMO_INVOICES: Invoice[] = [
  { id: 'i1', title: '外壁塗装工事 請求書（着手金）', amount: 490000, status: 'paid', dueDate: '2026-03-31', createdAt: '2026-03-12T10:00:00' },
  { id: 'i2', title: '屋根修繕 請求書（完了金）', amount: 320000, status: 'paid', dueDate: '2026-03-15', createdAt: '2026-03-01T09:00:00' },
  { id: 'i3', title: '外壁塗装工事 請求書（完了金）', amount: 490000, status: 'unpaid', dueDate: '2026-04-30', createdAt: '2026-03-20T14:00:00' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function EstimatesPage() {
  const { tenantId, status } = useAdminTenantId();
  const [activeTab, setActiveTab] = useState<'estimates' | 'invoices'>('estimates');
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  // New estimate modal
  const [showEstimateForm, setShowEstimateForm] = useState(false);
  const [estimateForm, setEstimateForm] = useState({ title: '', projectName: '', amount: '' });
  const [submittingEstimate, setSubmittingEstimate] = useState(false);

  // New invoice modal
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ title: '', amount: '', dueDate: '' });
  const [submittingInvoice, setSubmittingInvoice] = useState(false);

  const [toast, setToast] = useState('');
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const fetchData = useCallback(() => {
    if (status !== 'ready') return;
    setLoading(true);

    const fetchEstimates = fetch(
      `/api/proxy/admin/project/estimates?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const list = json?.data ?? json?.estimates ?? [];
        if (list.length > 0) {
          setEstimates(list);
          return true;
        }
        return false;
      })
      .catch(() => false);

    const fetchInvoices = fetch(
      `/api/proxy/admin/project/invoices?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const list = json?.data ?? json?.invoices ?? [];
        if (list.length > 0) {
          setInvoices(list);
          return true;
        }
        return false;
      })
      .catch(() => false);

    Promise.all([fetchEstimates, fetchInvoices]).then(([estOk, invOk]) => {
      if (!estOk) {
        setEstimates(DEMO_ESTIMATES);
        setIsDemo(true);
      }
      if (!invOk) {
        setInvoices(DEMO_INVOICES);
        if (!estOk) setIsDemo(true);
      }
      setLoading(false);
    });
  }, [tenantId, status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateEstimate = async () => {
    if (!estimateForm.title.trim()) return;
    if (isDemo) {
      const newEst: Estimate = {
        id: `e_${Date.now()}`,
        title: estimateForm.title,
        projectName: estimateForm.projectName || undefined,
        amount: Number(estimateForm.amount) || 0,
        status: 'draft',
        createdAt: new Date().toISOString(),
      };
      setEstimates(prev => [newEst, ...prev]);
      setShowEstimateForm(false);
      setEstimateForm({ title: '', projectName: '', amount: '' });
      showToast('見積書を作成しました（デモ）');
      return;
    }
    setSubmittingEstimate(true);
    try {
      const res = await fetch(
        `/api/proxy/admin/project/estimates?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: estimateForm.title,
            projectName: estimateForm.projectName,
            amount: Number(estimateForm.amount) || 0,
          }),
        },
      );
      if (!res.ok) throw new Error('create failed');
      setShowEstimateForm(false);
      setEstimateForm({ title: '', projectName: '', amount: '' });
      showToast('見積書を作成しました');
      fetchData();
    } catch {
      showToast('作成に失敗しました');
    } finally {
      setSubmittingEstimate(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!invoiceForm.title.trim()) return;
    if (isDemo) {
      const newInv: Invoice = {
        id: `i_${Date.now()}`,
        title: invoiceForm.title,
        amount: Number(invoiceForm.amount) || 0,
        status: 'unpaid',
        dueDate: invoiceForm.dueDate || new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
      };
      setInvoices(prev => [newInv, ...prev]);
      setShowInvoiceForm(false);
      setInvoiceForm({ title: '', amount: '', dueDate: '' });
      showToast('請求書を作成しました（デモ）');
      return;
    }
    setSubmittingInvoice(true);
    try {
      const res = await fetch(
        `/api/proxy/admin/project/invoices?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: invoiceForm.title,
            amount: Number(invoiceForm.amount) || 0,
            dueDate: invoiceForm.dueDate,
          }),
        },
      );
      if (!res.ok) throw new Error('create failed');
      setShowInvoiceForm(false);
      setInvoiceForm({ title: '', amount: '', dueDate: '' });
      showToast('請求書を作成しました');
      fetchData();
    } catch {
      showToast('作成に失敗しました');
    } finally {
      setSubmittingInvoice(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="見積・請求" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="見積・請求"
        subtitle="見積書・請求書の管理ができます。"
      />

      <div className="px-6 pb-8 space-y-6">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        )}

        {isDemo && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            デモデータ
          </div>
        )}

        {/* Tab switch */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('estimates')}
            className={`px-5 py-2.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'estimates'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-amber-300 hover:text-amber-600'
            }`}
          >
            見積書
            <span className="ml-1.5 text-xs opacity-75">{estimates.length}</span>
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-5 py-2.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'invoices'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-amber-300 hover:text-amber-600'
            }`}
          >
            請求書
            <span className="ml-1.5 text-xs opacity-75">{invoices.length}</span>
          </button>
        </div>

        {/* Estimates Tab */}
        {activeTab === 'estimates' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{estimates.length}件の見積書</p>
              <button
                onClick={() => setShowEstimateForm(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 transition-colors"
              >
                + 新規見積書
              </button>
            </div>

            {/* New estimate form */}
            {showEstimateForm && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">新規見積書</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">タイトル</label>
                    <input
                      type="text"
                      value={estimateForm.title}
                      onChange={e => setEstimateForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="例: 外壁塗装工事 見積書"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">案件名</label>
                    <input
                      type="text"
                      value={estimateForm.projectName}
                      onChange={e => setEstimateForm(f => ({ ...f, projectName: e.target.value }))}
                      placeholder="例: 山田邸 外壁塗装工事"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">金額（円）</label>
                    <input
                      type="number"
                      value={estimateForm.amount}
                      onChange={e => setEstimateForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleCreateEstimate} disabled={submittingEstimate} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 transition-colors disabled:opacity-50">
                    {submittingEstimate ? '作成中...' : '作成'}
                  </button>
                  <button onClick={() => { setShowEstimateForm(false); setEstimateForm({ title: '', projectName: '', amount: '' }); }} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 transition-colors">
                    キャンセル
                  </button>
                </div>
              </div>
            )}

            {/* Estimates table */}
            {estimates.length > 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-5 py-3">タイトル</th>
                        <th className="px-5 py-3">案件名</th>
                        <th className="px-5 py-3 text-right">金額</th>
                        <th className="px-5 py-3">ステータス</th>
                        <th className="px-5 py-3">作成日</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estimates.map(est => (
                        <tr key={est.id} className="border-b border-gray-50 hover:bg-amber-50/40 transition-colors">
                          <td className="px-5 py-3 font-medium text-gray-900">{est.title}</td>
                          <td className="px-5 py-3 text-gray-500">{est.projectName || '-'}</td>
                          <td className="px-5 py-3 text-right font-medium text-amber-600">{'\u00A5'}{est.amount.toLocaleString()}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ESTIMATE_STATUS_COLORS[est.status] || 'bg-gray-100 text-gray-500'}`}>
                              {ESTIMATE_STATUS_LABELS[est.status] || est.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-500">{formatDate(est.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg className="w-16 h-16 text-amber-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-500 font-medium">見積書はまだありません</p>
              </div>
            )}
          </>
        )}

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{invoices.length}件の請求書</p>
              <button
                onClick={() => setShowInvoiceForm(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 transition-colors"
              >
                + 新規請求書
              </button>
            </div>

            {/* New invoice form */}
            {showInvoiceForm && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">新規請求書</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">タイトル</label>
                    <input
                      type="text"
                      value={invoiceForm.title}
                      onChange={e => setInvoiceForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="例: 外壁塗装 請求書"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">金額（円）</label>
                    <input
                      type="number"
                      value={invoiceForm.amount}
                      onChange={e => setInvoiceForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">支払期日</label>
                    <input
                      type="date"
                      value={invoiceForm.dueDate}
                      onChange={e => setInvoiceForm(f => ({ ...f, dueDate: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleCreateInvoice} disabled={submittingInvoice} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 transition-colors disabled:opacity-50">
                    {submittingInvoice ? '作成中...' : '作成'}
                  </button>
                  <button onClick={() => { setShowInvoiceForm(false); setInvoiceForm({ title: '', amount: '', dueDate: '' }); }} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 transition-colors">
                    キャンセル
                  </button>
                </div>
              </div>
            )}

            {/* Invoices table */}
            {invoices.length > 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-5 py-3">タイトル</th>
                        <th className="px-5 py-3 text-right">金額</th>
                        <th className="px-5 py-3">ステータス</th>
                        <th className="px-5 py-3">期日</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map(inv => (
                        <tr key={inv.id} className="border-b border-gray-50 hover:bg-amber-50/40 transition-colors">
                          <td className="px-5 py-3 font-medium text-gray-900">{inv.title}</td>
                          <td className="px-5 py-3 text-right font-medium text-amber-600">{'\u00A5'}{inv.amount.toLocaleString()}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${INVOICE_STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-500'}`}>
                              {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-500">{formatDate(inv.dueDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg className="w-16 h-16 text-amber-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-500 font-medium">請求書はまだありません</p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
