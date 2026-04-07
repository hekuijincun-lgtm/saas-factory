import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LEGAL } from '../../../src/lib/legal';
import { SiteFooter } from '../../_components/site/SiteFooter';

export const metadata: Metadata = {
  title: `利用規約 | ${LEGAL.serviceName}`,
  description: `${LEGAL.serviceName} の利用規約です。サービスのご利用条件、禁止事項、免責事項等について記載しています。`,
  openGraph: {
    title: `利用規約 | ${LEGAL.serviceName}`,
    description: `${LEGAL.serviceName} の利用規約です。`,
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
    heading: '第1条（適用）',
    body: (
      <p>
        本規約は、{LEGAL.businessName}（以下「当社」といいます）が提供する「
        {LEGAL.serviceName}
        」（以下「本サービス」といいます）の利用条件を定めるものです。
        ユーザーは本規約に同意のうえ、本サービスをご利用ください。
      </p>
    ),
  },
  {
    heading: '第2条（サービス内容）',
    body: (
      <p>
        本サービスは、サロン・店舗向けのオンライン予約管理 SaaS
        です。予約受付、顧客管理、LINE
        連携、スタッフ管理等の機能を提供します。サービス内容は予告なく変更・追加・廃止する場合があります。
      </p>
    ),
  },
  {
    heading: '第3条（アカウント）',
    body: (
      <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
        <li>
          ユーザーは正確な情報を登録し、自己の責任においてアカウントを管理するものとします。
        </li>
        <li>
          アカウントの第三者への譲渡・共有は禁止します。
        </li>
        <li>
          アカウント情報の管理不十分、第三者の使用等による損害は、ユーザーの責任とします。
        </li>
      </ol>
    ),
  },
  {
    heading: '第4条（料金および支払い）',
    body: (
      <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
        <li>
          有料プランの料金は、各プランページに記載のとおりとします。
        </li>
        <li>
          支払いはクレジットカード（PAY.JP）による即時決済とします。
        </li>
        <li>
          サービスの性質上、決済完了後の返金は原則として受け付けておりません。ただし法令上認められる場合を除きます。
        </li>
      </ol>
    ),
  },
  {
    heading: '第5条（禁止事項）',
    body: (
      <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
        <li>法令または公序良俗に反する行為</li>
        <li>本サービスの運営を妨害する行為</li>
        <li>他のユーザーまたは第三者の権利を侵害する行為</li>
        <li>不正アクセス、リバースエンジニアリング等の行為</li>
        <li>その他、当社が不適切と判断する行為</li>
      </ul>
    ),
  },
  {
    heading: '第6条（サービスの停止・終了）',
    body: (
      <p>
        当社は、システム保守、天災、その他やむを得ない事由がある場合、事前通知なく本サービスの全部または一部を停止できるものとします。
        これによりユーザーに生じた損害について、当社は一切の責任を負いません。
      </p>
    ),
  },
  {
    heading: '第7条（免責事項）',
    body: (
      <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
        <li>
          当社は本サービスの完全性・正確性・有用性等について保証するものではありません。
        </li>
        <li>
          ユーザー間またはユーザーと第三者との間で生じた紛争について、当社は一切関与しません。
        </li>
      </ol>
    ),
  },
  {
    heading: '第8条（規約の変更）',
    body: (
      <p>
        当社は、必要に応じて本規約を変更できるものとします。変更後の規約は本ページに掲載した時点で効力を生じます。
      </p>
    ),
  },
  {
    heading: '第9条（準拠法・管轄）',
    body: (
      <p>
        本規約の解釈は日本法に準拠し、本サービスに関する一切の紛争については、さいたま地方裁判所を第一審の専属的合意管轄裁判所とします。
      </p>
    ),
  },
];

export default function TermsPage() {
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
            利用規約
          </h1>

          <div className="space-y-8">
            {SECTIONS.map((s, i) => (
              <section key={i}>
                <h2 className="text-base font-semibold text-gray-900 mb-2">
                  {s.heading}
                </h2>
                <div className="text-sm leading-relaxed text-gray-700">
                  {s.body}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-12 text-xs text-gray-400">制定日：2026年3月19日</p>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
