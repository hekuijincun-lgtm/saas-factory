'use client';

import { useState } from 'react';
import Link from 'next/link';

const VERTICAL_OPTIONS = [
  { value: '', label: '業種を選択してください' },
  { value: 'eyebrow', label: 'アイブロウサロン' },
  { value: 'nail', label: 'ネイルサロン' },
  { value: 'hair', label: 'ヘアサロン' },
  { value: 'esthetic', label: 'エステ・リラクゼーション' },
  { value: 'dental', label: '歯科・クリニック' },
  { value: 'cleaning', label: '清掃・ハウスクリーニング' },
  { value: 'other', label: 'その他' },
] as const;

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function EnterpriseContactPage() {
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [storeCount, setStoreCount] = useState('');
  const [vertical, setVertical] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('vertical') || '';
  });
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/proxy/billing/enterprise-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company.trim(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          storeCount: storeCount.trim(),
          vertical,
          message: message.trim(),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(String(data.error || 'お問い合わせの送信に失敗しました'));
      }

      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '送信に失敗しました。しばらくしてから再度お試しください。');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl ring-1 ring-black/5 px-8 py-12 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-3">
            お問い合わせありがとうございます
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            2営業日以内にご連絡いたします。
            <br />
            担当者より <strong>{email}</strong> 宛にご連絡差し上げます。
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            トップページに戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
        {/* Header */}
        <div className="bg-slate-800 px-8 py-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl font-bold text-white tracking-tight">
              Lumi<span className="text-indigo-400">Book</span>
            </span>
          </div>
          <div className="text-xs tracking-widest text-white/60 uppercase mb-2">
            Enterprise
          </div>
          <h1 className="text-2xl font-semibold text-white">
            法人・複数店舗のお問い合わせ
          </h1>
          <p className="mt-2 text-sm text-white/70">
            専任担当がお客様に最適なプランをご提案いたします
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-8 space-y-5">
          {/* 会社名 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              会社名 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="株式会社〇〇"
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
            />
          </div>

          {/* お名前 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              お名前 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="山田 太郎"
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
            />
          </div>

          {/* メールアドレス */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              メールアドレス <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@example.co.jp"
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
            />
          </div>

          {/* 電話番号 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              電話番号 <span className="text-slate-400 text-xs font-normal">(任意)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="03-1234-5678"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
            />
          </div>

          {/* 店舗数 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              店舗数 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={storeCount}
              onChange={(e) => setStoreCount(e.target.value)}
              placeholder="例：5店舗"
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
            />
          </div>

          {/* 業種 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              業種 <span className="text-red-400">*</span>
            </label>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition bg-white"
            >
              {VERTICAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.value === ''}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* ご要望・ご質問 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              ご要望・ご質問 <span className="text-red-400">*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="ご導入の背景や、ご希望の機能などをお聞かせください"
              required
              rows={4}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition resize-none"
            />
          </div>

          {/* Error */}
          {status === 'error' && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={status === 'loading'}
            className="block w-full rounded-full bg-indigo-600 py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-indigo-700 active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? '送信中...' : 'お問い合わせを送信'}
          </button>

          {status === 'error' && (
            <button
              type="button"
              onClick={() => setStatus('idle')}
              className="block w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              再試行
            </button>
          )}

          <p className="text-center text-xs text-slate-400 pt-1">
            <Link href="/" className="text-indigo-500 hover:underline">
              トップページに戻る
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
