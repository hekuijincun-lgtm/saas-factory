'use client';

import { useState } from 'react';
import AdminTopBar from '../../_components/ui/AdminTopBar';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import type { SupportCategory, SupportPriority } from '@/src/types/support';
import {
  Bug,
  Lightbulb,
  HelpCircle,
  MessageSquare,
  Send,
  CheckCircle2,
  Clock,
} from 'lucide-react';

// ── Quick-select cards ──────────────────────────────────────────────────────

const CATEGORY_OPTIONS: {
  value: SupportCategory;
  label: string;
  icon: typeof Bug;
  color: string;
  bg: string;
  placeholder: string;
}[] = [
  {
    value: 'bug',
    label: '不具合を報告',
    icon: Bug,
    color: 'text-red-600',
    bg: 'bg-red-50 border-red-200 hover:border-red-300',
    placeholder: '例）予約画面で18:00の枠だけ選べません',
  },
  {
    value: 'feature',
    label: '機能をリクエスト',
    icon: Lightbulb,
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-200 hover:border-amber-300',
    placeholder: '例）LINEから直接予約変更できるようにしてほしい',
  },
  {
    value: 'support',
    label: '使い方を相談',
    icon: HelpCircle,
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200 hover:border-blue-300',
    placeholder: '例）スタッフごとにシフトを分けたいのですが、どこから設定しますか？',
  },
  {
    value: 'other',
    label: 'その他',
    icon: MessageSquare,
    color: 'text-gray-600',
    bg: 'bg-gray-50 border-gray-200 hover:border-gray-300',
    placeholder: '気になったことをそのまま書いてください',
  },
];

const PRIORITY_OPTIONS: { value: SupportPriority; label: string }[] = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

const EXAMPLE_REQUESTS = [
  'LINE予約をもっと便利にしたい',
  'スタッフごとに営業時間を変えたい',
  'エラー時の原因を見やすくしてほしい',
  '予約完了メールの文面をカスタマイズしたい',
];

// ── Main component ──────────────────────────────────────────────────────────

export default function AdminSupportClient() {
  const { status: tenantStatus, tenantId } = useAdminTenantId();

  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<SupportPriority>('medium');
  const [wantsReply, setWantsReply] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOption = CATEGORY_OPTIONS.find((o) => o.value === category);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || message.trim().length < 3) return;

    setSubmitting(true);
    setError(null);

    try {
      const body = {
        tenantId,
        category,
        subject: subject.trim() || undefined,
        message: message.trim(),
        priority,
        wantsReply,
        contactEmail: contactEmail.trim() || undefined,
        pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        createdAt: new Date().toISOString(),
      };

      const res = await fetch(
        `/api/proxy/admin/support?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      const json = (await res.json()) as any;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? 'submit_failed');
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message ?? '送信に失敗しました。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setCategory(null);
    setSubject('');
    setMessage('');
    setPriority('medium');
    setWantsReply(false);
    setContactEmail('');
    setSubmitted(false);
    setError(null);
  }

  if (tenantStatus === 'loading') {
    return (
      <>
        <AdminTopBar title="カスタマーサポート" />
        <div className="px-6 py-12 text-center text-sm text-gray-400">読み込み中...</div>
      </>
    );
  }

  return (
    <>
      <AdminTopBar
        title="カスタマーサポート"
        subtitle="困ったこと・改善してほしいこと・使い方の相談を気軽に送ってください"
      />

      <div className="px-6 pb-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Encouragement note */}
          <p className="text-sm text-gray-500 text-center">
            一言だけでもOKです。いただいた声をもとに改善します。
          </p>

          {submitted ? (
            /* ── Success state ── */
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                送信ありがとうございます!
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                改善の参考にさせていただきます。
              </p>
              <button
                onClick={resetForm}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                別の要望を送る
              </button>
            </div>
          ) : (
            /* ── Form ── */
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Quick category select */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  どんなご連絡ですか？
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {CATEGORY_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const selected = category === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCategory(opt.value)}
                        className={[
                          'flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all duration-150',
                          selected
                            ? 'ring-2 ring-indigo-500 border-indigo-300 bg-indigo-50'
                            : opt.bg,
                        ].join(' ')}
                      >
                        <Icon className={`w-5 h-5 ${selected ? 'text-indigo-600' : opt.color}`} />
                        <span
                          className={`text-xs font-medium ${
                            selected ? 'text-indigo-700' : 'text-gray-700'
                          }`}
                        >
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Details form — only visible once category is selected */}
              {category && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
                  {/* Subject (optional) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      件名 <span className="text-gray-400 font-normal">（任意）</span>
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300"
                      placeholder="ひとことで表すと？"
                    />
                  </div>

                  {/* Message (required) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      内容 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={5}
                      required
                      minLength={3}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 resize-y"
                      placeholder={selectedOption?.placeholder ?? '内容を入力してください'}
                    />
                    <p className="mt-1 text-xs text-gray-400">短くても大丈夫です</p>
                  </div>

                  {/* Priority (optional) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      緊急度 <span className="text-gray-400 font-normal">（任意）</span>
                    </label>
                    <div className="flex gap-2">
                      {PRIORITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPriority(opt.value)}
                          className={[
                            'px-4 py-1.5 rounded-full text-xs font-medium border transition-colors',
                            priority === opt.value
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                          ].join(' ')}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Wants reply */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      返信は必要ですか？ <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setWantsReply(true)}
                        className={[
                          'px-4 py-1.5 rounded-full text-xs font-medium border transition-colors',
                          wantsReply
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                        ].join(' ')}
                      >
                        はい
                      </button>
                      <button
                        type="button"
                        onClick={() => setWantsReply(false)}
                        className={[
                          'px-4 py-1.5 rounded-full text-xs font-medium border transition-colors',
                          !wantsReply
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                        ].join(' ')}
                      >
                        いいえ
                      </button>
                    </div>
                  </div>

                  {/* Contact email (shown when wantsReply) */}
                  {wantsReply && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        連絡先メールアドレス <span className="text-gray-400 font-normal">（推奨）</span>
                      </label>
                      <input
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300"
                        placeholder="you@example.com"
                      />
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <p className="text-sm text-red-500">{error}</p>
                  )}

                  {/* Submit */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={submitting || message.trim().length < 3}
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all"
                    >
                      {submitting ? (
                        '送信中...'
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          サポートに送る
                        </>
                      )}
                    </button>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      不具合報告は1分で送れます
                    </span>
                  </div>
                </div>
              )}
            </form>
          )}

          {/* Example requests — gentle nudge */}
          {!submitted && (
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                よくある要望の例
              </h3>
              <ul className="space-y-2">
                {EXAMPLE_REQUESTS.map((ex) => (
                  <li key={ex} className="text-sm text-gray-500 flex items-start gap-2">
                    <span className="text-gray-300 shrink-0">•</span>
                    <span>{ex}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
