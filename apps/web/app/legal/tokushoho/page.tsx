import type { Metadata } from 'next';
import Link from 'next/link';
import { Scissors, ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記 | LumiBook',
  description:
    'LumiBook（ルミブック）の特定商取引法に基づく表記ページです。販売事業者、所在地、支払方法、返金ポリシー等を掲載しています。',
  openGraph: {
    title: '特定商取引法に基づく表記 | LumiBook',
    description:
      'LumiBook の特定商取引法に基づく表記ページです。',
    type: 'website',
    locale: 'ja_JP',
  },
  robots: { index: true, follow: true },
};

interface Entry {
  label: string;
  content: React.ReactNode;
}

const ENTRIES: Entry[] = [
  { label: '販売事業者', content: '今村和葵' },
  { label: '運営責任者', content: '今村和葵' },
  {
    label: '所在地',
    content: (
      <>
        〒330-0856
        <br />
        埼玉県さいたま市大宮区
      </>
    ),
  },
  {
    label: '電話番号',
    content: (
      <>
        <span className="font-medium text-gray-900">080-7353-0117</span>
        <br />
        <span className="text-xs text-gray-500">
          ※お問い合わせはメールにてお願いいたします
        </span>
      </>
    ),
  },
  {
    label: 'メールアドレス',
    content: (
      <a
        href="mailto:hekuijincun@gmail.com"
        className="font-medium text-rose-600 hover:text-rose-500 underline underline-offset-2 transition-colors"
      >
        hekuijincun@gmail.com
      </a>
    ),
  },
  { label: '販売価格', content: '各プランページに記載' },
  {
    label: '商品代金以外の必要料金',
    content:
      'インターネット接続に必要な通信料金等はお客様のご負担となります',
  },
  { label: '支払方法', content: 'クレジットカード（Stripe）' },
  { label: '支払時期', content: 'お申し込み時に即時決済' },
  { label: '商品の提供時期', content: '決済完了後、即時利用可能' },
  {
    label: 'キャンセル・返金について',
    content:
      'サービスの性質上、決済完了後の返金は原則として受け付けておりません',
  },
  {
    label: '動作環境',
    content: '最新のブラウザ環境にてご利用ください',
  },
];

export default function TokushohoPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-slate-900 text-white">
        <div className="mx-auto max-w-3xl px-5 py-6 flex items-center gap-3">
          <Link
            href="/lp/eyebrow"
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            トップへ戻る
          </Link>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 bg-rose-500 rounded flex items-center justify-center">
              <Scissors className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-bold">LumiBook</span>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 py-12 sm:py-16 px-5">
        <article className="mx-auto max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-10">
            特定商取引法に基づく表記
          </h1>

          <dl className="divide-y divide-gray-200">
            {ENTRIES.map((e) => (
              <div
                key={e.label}
                className="py-5 sm:grid sm:grid-cols-[180px_1fr] sm:gap-6"
              >
                <dt className="text-sm font-semibold text-gray-500 mb-1 sm:mb-0">
                  {e.label}
                </dt>
                <dd className="text-sm leading-relaxed text-gray-800">
                  {e.content}
                </dd>
              </div>
            ))}
          </dl>
        </article>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-slate-900 text-slate-400 py-8 px-5">
        <div className="mx-auto max-w-3xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-rose-500 rounded flex items-center justify-center">
              <Scissors className="w-3 h-3 text-white" />
            </div>
            <span className="font-bold text-white">LumiBook</span>
          </div>
          <p>&copy; {new Date().getFullYear()} LumiBook. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
