import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CheckCircle2,
  MessageCircle,
  Bell,
  ShieldCheck,
  Users,
  ClipboardList,
  ArrowRight,
  Scissors,
  BookOpen,
  ChevronDown,
  Zap,
  Star,
  AlarmClock,
  ShieldAlert,
  CalendarX,
  Layers,
  ExternalLink,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import { Reveal } from '../_components/Reveal';

// ──────────────────────────────────────────────────────────────────────────────
// Configuration constants — update these without touching layout logic
// ──────────────────────────────────────────────────────────────────────────────
const DEMO_HREF = '/booking';
const PRICING_ANCHOR = '#pricing';

const PLANS: {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  highlighted: boolean;
  badge: string | null;
  cta: string;
}[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '¥3,980',
    period: '/月（税込）',
    description: '個人・開業サロンに',
    features: [
      'LINEで予約受付',
      '前日自動リマインド',
      'スタッフ 2名まで',
      'メニュー 10件まで',
      '予約台帳（一覧・検索）',
      'メールサポート',
    ],
    highlighted: false,
    badge: null,
    cta: '無料で試す',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '¥9,800',
    period: '/月（税込）',
    description: '成長中のサロンに',
    features: [
      'Starter のすべての機能',
      'スタッフ・メニュー数 無制限',
      '事前アンケート機能',
      'リピート促進 LINE 配信',
      'AI 接客（自動返信）',
      '優先サポート（メール＋チャット）',
    ],
    highlighted: true,
    badge: 'いちばん人気',
    cta: '無料で試す',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'ご相談',
    period: '',
    description: '複数店舗・法人向け',
    features: [
      'Pro のすべての機能',
      '複数店舗一括管理',
      '専任サポート担当',
      'カスタム機能対応',
      '請求書払い対応',
      'SLA・稼働率保証',
    ],
    highlighted: false,
    badge: null,
    cta: 'お問い合わせ',
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: 'LINEを持っていないお客様はどうなりますか？',
    a: '専用のWebページからも同じ予約フローをご利用いただけます。LINEアプリがなくても、スマートフォンやPCのブラウザから予約できるため、既存顧客への移行もスムーズです。',
  },
  {
    q: 'スタッフが増えたり変わったりしても使えますか？',
    a: 'Proプラン以上ではスタッフ数・メニュー数ともに無制限です。管理画面からいつでも追加・変更・削除でき、シフト変更もリアルタイムで予約画面に反映されます。',
  },
  {
    q: '導入にどのくらいの時間がかかりますか？',
    a: 'LINE連携からメニュー・スタッフの初期設定まで、最短30分ほどで運用を開始できます。セットアップガイドとサポートチームが丁寧にサポートしますので、ITが苦手な方もご安心ください。',
  },
  {
    q: 'サポート体制を教えてください。',
    a: 'Starterプランはメール対応（営業日2日以内）、Proは優先メール＋チャット対応です。Enterpriseでは専任担当者が対応します。初期設定サポートはすべてのプランに無料で含まれます。',
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// SEO Metadata
// ──────────────────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: '眉毛サロン専用 予約管理ツール | LINE予約・リマインド自動化',
  description:
    'LINEで予約受付・前日リマインド自動送信・ダブルブッキング防止・予約台帳を一括管理。眉毛サロンオーナーの手間をまるごと削減する予約自動化ツール。',
  openGraph: {
    title: '眉毛サロン専用 予約管理ツール | LINE完結',
    description:
      'LINE予約・リマインド・台帳をすべて自動化。眉毛サロンオーナーの手間を大幅削減。',
    type: 'website',
    locale: 'ja_JP',
  },
  twitter: {
    card: 'summary_large_image',
    title: '眉毛サロン専用 予約管理ツール',
    description: 'LINE完結 予約×リマインド×台帳 自動化',
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Page entry point
// ──────────────────────────────────────────────────────────────────────────────
export default function EyebrowLandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans antialiased text-gray-900">
      <LpNavbar />
      <main>
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <EyebrowSection />
        <FlowSection />
        <SetupSection />
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <LpFooter />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Navbar
// ──────────────────────────────────────────────────────────────────────────────
function LpNavbar() {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm">
      <div className="mx-auto max-w-6xl px-5 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 bg-rose-500 rounded-lg flex items-center justify-center shadow-sm">
            <Scissors className="w-4 h-4 text-white" aria-hidden="true" />
          </div>
          <span className="font-bold text-gray-900 text-sm tracking-tight">EyebrowBook</span>
        </div>

        {/* Desktop nav */}
        <nav
          className="hidden md:flex items-center gap-6 text-sm text-gray-500"
          aria-label="メインナビゲーション"
        >
          <a
            href="#features"
            className="hover:text-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
          >
            機能
          </a>
          <a
            href="#setup"
            className="hover:text-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
          >
            導入方法
          </a>
          <a
            href={PRICING_ANCHOR}
            className="hover:text-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
          >
            料金
          </a>
          <a
            href="#faq"
            className="hover:text-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
          >
            よくある質問
          </a>
        </nav>

        {/* CTA */}
        <Link
          href={DEMO_HREF}
          className="group inline-flex items-center gap-1.5 px-4 py-2 bg-rose-500 text-white text-sm font-semibold rounded-full hover:bg-rose-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 shadow-sm"
        >
          デモを見る
          <ArrowRight
            className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>
      </div>
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Hero
// ──────────────────────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section
      className="relative overflow-hidden bg-slate-950 text-white"
      aria-label="ヒーロー"
    >
      {/* Decorative gradient orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full bg-rose-600/15 blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-20 -right-20 w-[500px] h-[500px] rounded-full bg-indigo-600/15 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 w-[800px] h-[200px] rounded-full bg-amber-600/10 blur-[100px]"
      />

      <div className="relative mx-auto max-w-5xl px-5 pt-24 pb-32 text-center">
        {/* Eyebrow badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/70 mb-8 backdrop-blur-sm">
          <Star
            className="w-3.5 h-3.5 text-amber-400 fill-amber-400"
            aria-hidden="true"
          />
          眉毛サロン専用の予約自動化ツール
        </div>

        {/* Main headline */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-tight mb-6">
          <span className="block text-white">予約の手間を</span>
          <span className="block bg-gradient-to-r from-rose-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">
            ゼロに近づける。
          </span>
        </h1>

        {/* Sub-headline */}
        <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
          LINEで予約を受け付け、前日リマインドを自動送信。
          <br className="hidden sm:block" />
          ダブルブッキング防止から予約台帳まで、すべてひとつで管理。
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href={DEMO_HREF}
            className="group inline-flex items-center gap-2 px-8 py-4 bg-white text-gray-900 font-bold rounded-full text-base hover:bg-gray-100 transition-all duration-200 shadow-xl shadow-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            無料でデモを見る
            <ArrowRight
              className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
          <a
            href={PRICING_ANCHOR}
            className="inline-flex items-center gap-2 px-8 py-4 border border-white/20 text-white font-semibold rounded-full text-base hover:bg-white/10 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            料金を見る
          </a>
        </div>

        {/* Trust indicators */}
        <div className="mt-14 flex flex-col sm:flex-row gap-5 sm:gap-10 justify-center items-center text-sm text-slate-400">
          {['初期費用 0円', '最低契約期間なし', 'いつでも解約OK'].map(
            (item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle2
                  className="w-4 h-4 text-green-400 shrink-0"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </div>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Problem section
// ──────────────────────────────────────────────────────────────────────────────
function ProblemSection() {
  const problems: { icon: LucideIcon; title: string; desc: string }[] = [
    {
      icon: MessageCircle,
      title: 'LINEの往復が面倒',
      desc: '空き日程を聞いて、返信して、また聞いて…。1件の予約に何往復もしている。',
    },
    {
      icon: AlarmClock,
      title: '前日確認が手動',
      desc: '「明日のご予約ありがとうございます」を毎日手作業で送っている。',
    },
    {
      icon: ShieldAlert,
      title: '無断キャンセルが怖い',
      desc: 'リマインドを送り忘れた日に限って無断キャンセルが発生する。',
    },
    {
      icon: CalendarX,
      title: 'ダブルブッキングが不安',
      desc: '手帳・LINE・メモで管理が分散して、重複予約がいつ起きるか心配。',
    },
    {
      icon: Layers,
      title: '予約管理が煩雑',
      desc: '紙・スマホ・手帳と複数の場所に予約が散らばっていて把握しきれない。',
    },
  ];

  return (
    <section
      className="bg-slate-50 py-24 px-5"
      aria-labelledby="problem-heading"
    >
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-rose-600 uppercase tracking-widest mb-3">
              お悩みではないですか？
            </p>
            <h2
              id="problem-heading"
              className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight"
            >
              予約管理で
              <br className="sm:hidden" />
              消耗していませんか
            </h2>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {problems.map((p, i) => {
            const Icon = p.icon;
            return (
              <Reveal key={p.title} delay={i * 80} className="h-full">
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-gray-200 transition-all duration-200 h-full">
                  {/* Unified icon — gradient circle + 1px border + subtle glow */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-50 to-gray-100 border border-gray-200/70 flex items-center justify-center mb-3 shadow-[0_0_8px_rgba(0,0,0,0.06)]">
                    <Icon
                      className="w-5 h-5 text-gray-400"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">{p.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{p.desc}</p>
                </div>
              </Reveal>
            );
          })}

          {/* Solution callout — 6th card */}
          <Reveal
            delay={problems.length * 80}
            className="sm:col-span-2 lg:col-span-1 h-full"
          >
            <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-6 text-white shadow-lg flex flex-col justify-center hover:shadow-xl hover:-translate-y-1 transition-all duration-200 h-full">
              <p className="font-bold text-lg mb-2">そのすべてを解決します</p>
              <p className="text-rose-100 text-sm leading-relaxed mb-4">
                予約・リマインド・台帳を自動化して、サロン業務に集中できる時間を
                取り戻しましょう。
              </p>
              <Link
                href={DEMO_HREF}
                className="group inline-flex items-center gap-1.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
              >
                デモを見る
                <ArrowRight
                  className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Solution / Features section
// ──────────────────────────────────────────────────────────────────────────────
function SolutionSection() {
  const features: {
    icon: LucideIcon;
    iconBg: string;
    iconColor: string;
    title: string;
    desc: string;
  }[] = [
    {
      icon: MessageCircle,
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      title: 'LINEで予約が完結',
      desc: 'お客様はいつも使っているLINEから予約。オーナーへの返信は不要。専用URLをリッチメニューに貼るだけで即日稼働。',
    },
    {
      icon: Bell,
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
      title: '前日リマインドを自動送信',
      desc: '設定した時刻に前日リマインドをLINEで自動送信。メッセージ文言は管理画面でいつでも編集でき、来店率の向上が期待できます。',
    },
    {
      icon: ShieldCheck,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      title: 'ダブルブッキングを防止',
      desc: '予約が入った瞬間に空き枠が自動で塞がれるため、同じ時間帯への二重予約が起きません。スタッフ別・ベッド別にも対応。',
    },
    {
      icon: Scissors,
      iconBg: 'bg-rose-100',
      iconColor: 'text-rose-600',
      title: 'メニューごとに時間設定',
      desc: '「アイブロウデザイン 60分」「リタッチ 45分」など、メニューごとに異なる施術時間を設定。過不足ない予約管理が実現。',
    },
    {
      icon: Users,
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      title: 'スタッフ別シフトに対応',
      desc: 'スタッフごとの担当可否・シフトを反映した空き枠を自動計算。指名予約・フリー選択もサポート。',
    },
    {
      icon: ClipboardList,
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      title: '予約台帳で一括管理',
      desc: '過去・未来の予約を一覧で検索・閲覧。ステータス管理・カルテ確認・傾向把握まで管理画面ひとつで完結。',
    },
  ];

  return (
    <section
      id="features"
      className="bg-white py-24 px-5"
      aria-labelledby="solution-heading"
    >
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-rose-600 uppercase tracking-widest mb-3">
              できること
            </p>
            <h2
              id="solution-heading"
              className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight"
            >
              予約に関するすべてを
              <br className="sm:hidden" />
              自動化
            </h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">
              オーナーがやること？　LINEのリッチメニューにURLを貼るだけ。
              あとはツールが自動でこなします。
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <Reveal key={f.title} delay={i * 75} className="h-full">
                <div className="rounded-2xl border border-gray-100 p-6 hover:border-gray-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 h-full">
                  <div
                    className={`w-10 h-10 ${f.iconBg} rounded-xl flex items-center justify-center mb-4`}
                  >
                    <Icon
                      className={`w-5 h-5 ${f.iconColor}`}
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Eyebrow salon specific features
// ──────────────────────────────────────────────────────────────────────────────
function EyebrowSection() {
  const specifics: {
    icon: LucideIcon;
    title: string;
    desc: string;
  }[] = [
    {
      icon: Zap,
      title: 'ベッド数でキャパ管理',
      desc: 'サロンのベッド数を登録するだけで、同時に対応できる最大人数を自動管理。スタッフが増えてもキャパシティを正確に把握できます。',
    },
    {
      icon: BookOpen,
      title: '事前アンケートを自動収集',
      desc: '「初回ですか？」「ご希望のスタイルは？」などの質問を予約時に回収。カウンセリング時間を短縮し、施術準備が充実します。',
    },
    {
      icon: CheckCircle2,
      title: '施術同意文をカスタマイズ',
      desc: 'アレルギーリスクや施術前の注意事項を同意文として設定。お客様の確認・同意をデジタルで記録して、トラブル予防に役立てます。',
    },
    {
      icon: Star,
      title: 'メニュー画像を表示',
      desc: '仕上がりイメージ写真や参考デザインをメニューカードに掲載。お客様が予約前に施術内容をイメージでき、ミスマッチを防ぎます。',
    },
  ];

  return (
    <section
      className="bg-gradient-to-br from-rose-50 via-white to-amber-50 py-24 px-5 border-y border-rose-100"
      aria-labelledby="eyebrow-heading"
    >
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-amber-600 uppercase tracking-widest mb-3">
              眉毛サロン特化
            </p>
            <h2
              id="eyebrow-heading"
              className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight"
            >
              眉毛サロンだから
              <br className="sm:hidden" />
              必要な機能を、
              <br />
              標準で搭載
            </h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">
              汎用ツールにはない、眉毛サロンならではの機能をあらかじめ備えています。
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {specifics.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal key={s.title} delay={i * 80} className="h-full">
                <div className="bg-white rounded-2xl border border-rose-100 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 h-full">
                  <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-rose-600" aria-hidden="true" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Flow / Onboarding steps
// ──────────────────────────────────────────────────────────────────────────────
function FlowSection() {
  const steps = [
    {
      num: '01',
      title: 'LINE を連携',
      desc: 'LINE公式アカウントのMessaging APIキーを管理画面に入力するだけ。10分程度で設定完了。',
    },
    {
      num: '02',
      title: 'メニュー・スタッフを登録',
      desc: '施術メニュー・料金・時間・担当スタッフを設定。あとはシステムが空き枠を自動計算します。',
    },
    {
      num: '03',
      title: 'LINE に URL を貼る',
      desc: '発行された予約URLをLINEのリッチメニューに設定すれば完成。その日から予約受付をスタートできます。',
    },
  ];

  return (
    <section className="bg-white py-24 px-5" aria-labelledby="flow-heading">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-rose-600 uppercase tracking-widest mb-3">
              導入ステップ
            </p>
            <h2
              id="flow-heading"
              className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight"
            >
              最短30分で予約受付スタート
            </h2>
          </div>
        </Reveal>

        <div className="relative">
          {/* Connecting line — desktop only */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute top-8 left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] h-0.5 bg-gradient-to-r from-rose-200 via-amber-200 to-rose-200"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <Reveal key={step.num} delay={i * 150} className="relative text-center">
                {/* Step number circle */}
                <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white font-black text-xl mb-5 shadow-lg">
                  {step.num}
                </div>

                {/* Downward arrow on mobile */}
                {i < steps.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="lg:hidden flex justify-center my-2 text-gray-300"
                  >
                    <ChevronDown className="w-6 h-6" />
                  </div>
                )}

                <h3 className="font-bold text-gray-900 text-lg mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {step.desc}
                </p>
              </Reveal>
            ))}
          </div>
        </div>

        <div className="text-center mt-12">
          <Reveal>
            <Link
              href={DEMO_HREF}
              className="group inline-flex items-center gap-2 px-8 py-4 bg-rose-500 text-white font-bold rounded-full text-base hover:bg-rose-600 transition-all duration-200 shadow-lg shadow-rose-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
            >
              実際の画面を見てみる
              <ArrowRight
                className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Setup guide (onboarding)
// ──────────────────────────────────────────────────────────────────────────────
function SetupSection() {
  const steps: {
    num: string;
    title: string;
    desc: string;
    link: { label: string; href: string } | null;
  }[] = [
    {
      num: '01',
      title: 'LINE公式アカウントを用意する',
      desc: 'まだ持っていない場合は、LINE Official Account Managerから無料で開設できます。すでに公式アカウントをお持ちの場合はそのまま使用できます。',
      link: {
        label: 'LINE Official Account Manager を開く',
        href: 'https://manager.line.biz/',
      },
    },
    {
      num: '02',
      title: 'LINE Developersにログイン',
      desc: '公式アカウントと同じLINEアカウントでログインします。初回はプロバイダーの作成が求められます。サロン名をそのまま入力すればOKです。',
      link: {
        label: 'LINE Developers を開く',
        href: 'https://developers.line.biz/',
      },
    },
    {
      num: '03',
      title: 'Messaging APIチャンネルを作成',
      desc: 'プロバイダー内で「新規チャンネル作成」→「Messaging API」を選択します。チャンネル名はサロン名、業種は「美容」を選ぶとスムーズです。',
      link: {
        label: 'Messaging API 概要を読む',
        href: 'https://developers.line.biz/ja/docs/messaging-api/overview/',
      },
    },
    {
      num: '04',
      title: 'チャンネルアクセストークンを発行',
      desc: 'チャンネル設定の「Messaging API」タブを開き、「チャンネルアクセストークン（長期）」の「発行」ボタンをクリックします。Channel IDとChannel Secretも同じページで確認できます。',
      link: null,
    },
    {
      num: '05',
      title: '管理画面のLINE設定に貼り付けて保存',
      desc: '取得した「Channel ID」「Channel Secret」「チャンネルアクセストークン」を管理画面のLINE連携設定に入力して保存します。Webhook URLの設定もこの画面から行えます。',
      link: null,
    },
    {
      num: '06',
      title: '動作テストを行って完了',
      desc: 'ご自身のLINEで公式アカウントを友だち追加し、予約URLを開いてテスト予約を入れてみましょう。予約確認メッセージと前日リマインドが届けば設定完了です。',
      link: null,
    },
  ];

  const troubleFaqs: { q: string; a: string }[] = [
    {
      q: 'Messaging APIとLINE Loginはどう違いますか？',
      a: '予約通知・リマインドを送るにはMessaging APIだけで十分です。LINE Loginは「LINEでログイン」ボタンを実装する際に使います。まずはMessaging APIの設定から始めてください。',
    },
    {
      q: 'チャンネルアクセストークンが発行できません',
      a: 'チャンネルの「Messaging API」タブ最下部に「チャンネルアクセストークン（長期）」セクションがあります。「発行」ボタンが表示されていない場合は、チャンネルの種類が「Messaging API」になっているか確認してください。',
    },
    {
      q: 'テスト予約の通知が届きません',
      a: 'まずLINE公式アカウントを友だち追加済みか確認してください。次に管理画面でWebhook URLが正しく設定・有効化されているかを確認します。それでも届かない場合はサポートまでご連絡ください。',
    },
  ];

  return (
    <section
      id="setup"
      className="bg-white py-24 px-5"
      aria-labelledby="setup-heading"
    >
      <div className="mx-auto max-w-4xl">
        {/* Heading */}
        <Reveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-rose-600 uppercase tracking-widest mb-3">
              導入方法
            </p>
            <h2
              id="setup-heading"
              className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight"
            >
              最短30分で使い始める
              <br className="sm:hidden" />
              ステップガイド
            </h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">
              LINEの初期設定から管理画面への接続まで、技術知識がなくても進められるよう手順をまとめました。
            </p>
          </div>
        </Reveal>

        {/* Steps */}
        <div className="space-y-3 mb-14">
          {steps.map((step, i) => (
            <Reveal key={step.num} delay={i * 70}>
              <div className="flex gap-4 sm:gap-5 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                {/* Number badge */}
                <div
                  className="shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white font-black text-sm flex items-center justify-center shadow-md"
                  aria-hidden="true"
                >
                  {step.num}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 mb-1 leading-snug">
                    {step.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {step.desc}
                  </p>
                  {step.link && (
                    <a
                      href={step.link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 mt-2.5 text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
                    >
                      {step.link.label}
                      <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Trouble FAQ */}
        <Reveal>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                <HelpCircle className="w-4 h-4 text-amber-600" aria-hidden="true" />
              </div>
              <h3 className="font-bold text-gray-900">つまずきポイント</h3>
            </div>
            <div className="space-y-5">
              {troubleFaqs.map((faq, i) => (
                <div
                  key={i}
                  className={
                    i < troubleFaqs.length - 1
                      ? 'pb-5 border-b border-amber-200/70'
                      : ''
                  }
                >
                  <p className="text-sm font-semibold text-gray-900 mb-1.5">
                    Q. {faq.q}
                  </p>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    A. {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Pricing
// ──────────────────────────────────────────────────────────────────────────────
function PricingSection() {
  return (
    <section
      id="pricing"
      className="bg-slate-50 py-24 px-5"
      aria-labelledby="pricing-heading"
    >
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-rose-600 uppercase tracking-widest mb-3">
              料金プラン
            </p>
            <h2
              id="pricing-heading"
              className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight"
            >
              シンプルな料金体系
            </h2>
            <p className="mt-4 text-gray-500">
              初期費用0円・最低契約期間なし。いつでもプラン変更・解約できます。
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.id} delay={i * 100} className="h-full">
              <div
                className={`relative rounded-2xl p-7 flex flex-col h-full ${
                  plan.highlighted
                    ? 'bg-slate-900 text-white shadow-2xl ring-2 ring-rose-500 md:scale-105'
                    : 'bg-white border border-gray-200 text-gray-900'
                }`}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center px-4 py-1 bg-rose-500 text-white text-xs font-bold rounded-full shadow-md">
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Plan header */}
                <div className="mb-6">
                  <p
                    className={`text-xs font-semibold uppercase tracking-widest mb-1 ${
                      plan.highlighted ? 'text-rose-400' : 'text-rose-600'
                    }`}
                  >
                    {plan.description}
                  </p>
                  <h3 className="text-xl font-black mb-3">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 flex-wrap">
                    <span className="text-4xl font-black">{plan.price}</span>
                    {plan.period && (
                      <span
                        className={`text-sm ${
                          plan.highlighted ? 'text-slate-400' : 'text-gray-400'
                        }`}
                      >
                        {plan.period}
                      </span>
                    )}
                  </div>
                </div>

                {/* Feature list */}
                <ul
                  className="space-y-2.5 mb-8 flex-1"
                  aria-label={`${plan.name}プランの機能一覧`}
                >
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 mt-0.5 ${
                          plan.highlighted ? 'text-rose-400' : 'text-green-500'
                        }`}
                        aria-hidden="true"
                      />
                      <span
                        className={
                          plan.highlighted ? 'text-slate-300' : 'text-gray-600'
                        }
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href={DEMO_HREF}
                  className={`group w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold text-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                    plan.highlighted
                      ? 'bg-rose-500 text-white hover:bg-rose-400 focus-visible:ring-rose-400 focus-visible:ring-offset-slate-900'
                      : 'bg-gray-900 text-white hover:bg-gray-700 focus-visible:ring-gray-900'
                  }`}
                >
                  {plan.cta}
                  <ArrowRight
                    className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </Link>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          ※ 表示価格はすべて税込です。プランはいつでもアップグレード・ダウングレードできます。
          金額・プラン内容は予告なく変更する場合があります。
        </p>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// FAQ
// ──────────────────────────────────────────────────────────────────────────────
function FaqSection() {
  return (
    <section
      id="faq"
      className="bg-white py-24 px-5"
      aria-labelledby="faq-heading"
    >
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-rose-600 uppercase tracking-widest mb-3">
              よくある質問
            </p>
            <h2
              id="faq-heading"
              className="text-3xl sm:text-4xl font-black text-gray-900"
            >
              FAQ
            </h2>
          </div>
        </Reveal>

        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden"
            >
              <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none font-semibold text-gray-900 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500">
                <span>{faq.q}</span>
                <ChevronDown
                  className="w-5 h-5 text-gray-400 shrink-0 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="px-6 pb-5">
                <p className="text-gray-600 leading-relaxed text-sm border-t border-gray-200 pt-4">
                  {faq.a}
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Final CTA
// ──────────────────────────────────────────────────────────────────────────────
function FinalCtaSection() {
  return (
    <section
      className="relative overflow-hidden bg-slate-950 py-28 px-5 text-center"
      aria-label="最終CTA"
    >
      {/* Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="w-[600px] h-[300px] bg-rose-600/20 blur-[100px] rounded-full" />
      </div>

      <Reveal className="relative mx-auto max-w-2xl">
        <h2 className="text-3xl sm:text-5xl font-black text-white mb-5 leading-tight">
          予約管理の手間から
          <br />
          解放されませんか
        </h2>
        <p className="text-slate-300 mb-8 text-lg leading-relaxed">
          最短30分で稼働開始。まずは無料でデモをご体験ください。
        </p>
        <Link
          href={DEMO_HREF}
          className="group inline-flex items-center gap-2 px-10 py-4 bg-white text-gray-900 font-bold rounded-full text-lg hover:bg-gray-100 transition-all duration-200 shadow-2xl shadow-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          無料でデモを見る
          <ArrowRight
            className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>
      </Reveal>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Footer
// ──────────────────────────────────────────────────────────────────────────────
function LpFooter() {
  return (
    <footer
      className="bg-slate-900 text-slate-400 py-10 px-5"
      aria-label="フッター"
    >
      <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-rose-500 rounded-md flex items-center justify-center">
            <Scissors className="w-3.5 h-3.5 text-white" aria-hidden="true" />
          </div>
          <span className="text-sm font-bold text-white">EyebrowBook</span>
        </div>

        <nav
          className="flex gap-5 text-xs"
          aria-label="フッターナビゲーション"
        >
          <a
            href="#features"
            className="hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
          >
            機能
          </a>
          <a
            href="#setup"
            className="hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
          >
            導入方法
          </a>
          <a
            href={PRICING_ANCHOR}
            className="hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
          >
            料金
          </a>
          <a
            href="#faq"
            className="hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
          >
            FAQ
          </a>
        </nav>

        <p className="text-xs">© 2026 EyebrowBook. All rights reserved.</p>
      </div>
    </footer>
  );
}
