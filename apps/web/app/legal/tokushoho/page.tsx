import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LEGAL } from '../../../src/lib/legal';
import { SiteFooter } from '../../_components/site/SiteFooter';

export const metadata: Metadata = {
  title: `特定商取引法に基づく表記 | ${LEGAL.serviceName}`,
  description: `${LEGAL.serviceName} の特定商取引法に基づく表記ページです。販売事業者、所在地、支払方法、返金ポリシー等を掲載しています。`,
  openGraph: {
    title: `特定商取引法に基づく表記 | ${LEGAL.serviceName}`,
    description: `${LEGAL.serviceName} の特定商取引法に基づく表記ページです。`,
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
  { label: '販売事業者', content: LEGAL.businessName },
  { label: '運営責任者', content: LEGAL.operatorName },
  {
    label: '所在地',
    content: (
      <>
        〒{LEGAL.postalCode}
        <br />
        {LEGAL.address}
      </>
    ),
  },
  {
    label: '電話番号',
    content: (
      <>
        <span className="font-medium text-gray-900">{LEGAL.phone}</span>
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
        href={`mailto:${LEGAL.email}`}
        className="font-medium text-rose-600 hover:text-rose-500 underline underline-offset-2 transition-colors"
      >
        {LEGAL.email}
      </a>
    ),
  },
  {
    label: 'サイトURL',
    content: (
      <a
        href={LEGAL.siteUrl}
        className="font-medium text-rose-600 hover:text-rose-500 underline underline-offset-2 transition-colors"
        target="_blank"
        rel="noopener noreferrer"
      >
        {LEGAL.siteUrl}
      </a>
    ),
  },
  { label: '販売価格', content: LEGAL.salesPriceText },
  { label: '商品代金以外の必要料金', content: LEGAL.extraFeesText },
  { label: '支払方法', content: LEGAL.paymentMethodText },
  { label: '支払時期', content: LEGAL.paymentTimingText },
  { label: '商品の提供時期', content: LEGAL.deliveryTimingText },
  { label: '商品・サービスの内容', content: LEGAL.serviceDescription },
  { label: 'キャンセル・返金について', content: LEGAL.refundPolicyText },
  { label: '中途解約について', content: LEGAL.cancellationText },
  { label: '動作環境', content: LEGAL.environmentText },
  { label: '注意書き', content: LEGAL.disclaimerText },
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

      <SiteFooter />
    </div>
  );
}
