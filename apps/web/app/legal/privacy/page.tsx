import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LEGAL } from '../../../src/lib/legal';
import { SiteFooter } from '../../_components/site/SiteFooter';

export const metadata: Metadata = {
  title: `プライバシーポリシー | ${LEGAL.serviceName}`,
  description: `${LEGAL.serviceName} のプライバシーポリシーです。個人情報の取得・利用目的・第三者提供等について記載しています。`,
  openGraph: {
    title: `プライバシーポリシー | ${LEGAL.serviceName}`,
    description: `${LEGAL.serviceName} のプライバシーポリシーです。`,
    type: 'website',
    locale: 'ja_JP',
  },
  robots: { index: true, follow: true },
};

interface Section {
  heading: string;
  body: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    heading: '1. 個人情報の取得について',
    body: (
      <p>
        当サービスでは、サービスの提供にあたり、以下の個人情報を取得することがあります。
      </p>
    ),
  },
  {
    heading: '',
    body: (
      <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
        <li>氏名、メールアドレス、電話番号</li>
        <li>クレジットカード情報（決済代行会社 PAY.JP を通じて処理されます）</li>
        <li>LINE ユーザー ID（LINE 連携をご利用の場合）</li>
        <li>サービス利用に伴うアクセスログ・Cookie 情報</li>
      </ul>
    ),
  },
  {
    heading: '2. 利用目的',
    body: (
      <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
        <li>サービスの提供・運営・改善</li>
        <li>ユーザー認証およびアカウント管理</li>
        <li>お問い合わせへの対応</li>
        <li>利用状況の分析・統計処理（個人を特定しない形で実施）</li>
        <li>法令に基づく対応</li>
      </ul>
    ),
  },
  {
    heading: '3. 第三者提供について',
    body: (
      <p>
        当サービスでは、法令に基づく場合を除き、ご本人の同意なく個人情報を第三者に提供することはありません。
        ただし、決済処理のため PAY株式会社（PAY.JP）に必要な情報を連携します。
      </p>
    ),
  },
  {
    heading: '4. 安全管理措置',
    body: (
      <p>
        個人情報の漏洩・紛失・改ざん等を防止するため、適切な技術的・組織的安全管理措置を講じます。
      </p>
    ),
  },
  {
    heading: '5. 開示・訂正・削除の請求',
    body: (
      <p>
        ご本人から個人情報の開示・訂正・削除等のご請求があった場合は、合理的な期間内に対応いたします。
        下記のお問い合わせ先までご連絡ください。
      </p>
    ),
  },
  {
    heading: '6. Cookie の利用',
    body: (
      <p>
        当サービスでは、利便性向上およびアクセス解析のために Cookie
        を使用する場合があります。ブラウザの設定により Cookie
        を無効にすることも可能ですが、一部機能がご利用いただけなくなる場合があります。
      </p>
    ),
  },
  {
    heading: '7. ポリシーの変更',
    body: (
      <p>
        本ポリシーは、法令の改正やサービス内容の変更等に応じて、予告なく改定する場合があります。
        改定後のポリシーは本ページに掲載した時点で効力を生じるものとします。
      </p>
    ),
  },
  {
    heading: '8. お問い合わせ',
    body: (
      <p>
        個人情報の取扱いに関するお問い合わせは、下記までご連絡ください。
        <br />
        <br />
        {LEGAL.businessName}
        <br />
        メール：
        <a
          href={`mailto:${LEGAL.email}`}
          className="text-rose-600 hover:text-rose-500 underline underline-offset-2 transition-colors"
        >
          {LEGAL.email}
        </a>
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
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

      <main className="flex-1 py-12 sm:py-16 px-5">
        <article className="mx-auto max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-10">
            プライバシーポリシー
          </h1>

          <div className="space-y-6">
            {SECTIONS.map((s, i) => (
              <div key={i}>
                {s.heading && (
                  <h2 className="text-base font-semibold text-gray-900 mb-2">
                    {s.heading}
                  </h2>
                )}
                <div className="text-sm leading-relaxed text-gray-700">
                  {s.body}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-12 text-xs text-gray-400">制定日：2026年3月19日</p>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
