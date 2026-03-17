import type { Metadata } from 'next';
import Link from 'next/link';
import { TrackingCTA } from '../_components/TrackingCTA';
import {
  ArrowRight, Scissors, CalendarDays, Bell, Shield, BarChart3,
  MessageCircle, Users, ClipboardList, Zap, Star, CheckCircle2,
  ChevronDown, Clock, SmartphoneNfc, Sparkles, HeartPulse,
} from 'lucide-react';

// ── Vertical LP data ─────────────────────────────────────────────────
const SIGNUP_HREF = '/signup';

interface VerticalLPConfig {
  label: string;
  badge: string;
  headline: string;
  subheadline: string;
  problems: { icon: string; title: string; desc: string }[];
  features: { icon: string; title: string; desc: string }[];
  flow: { step: string; title: string; desc: string }[];
  faqs: { q: string; a: string }[];
  metaTitle: string;
  metaDesc: string;
}

const LP: Record<string, VerticalLPConfig> = {
  nail: {
    label: 'ネイルサロン',
    badge: 'ネイルサロン専用の予約自動化ツール',
    headline: 'ネイルサロンの予約を\nLINEで自動化',
    subheadline: 'デザイン別メニュー管理・スタッフ指名・前日リマインドをすべて一つに。\nサロンワークに集中できる環境を作ります。',
    problems: [
      { icon: 'phone', title: '電話・DM対応に追われる', desc: '施術中の電話対応や、InstagramのDMでの予約やりとりで手が止まる' },
      { icon: 'calendar', title: '予約表の手書き管理が限界', desc: 'ノートや紙の予約台帳では、変更・キャンセルの追跡が大変' },
      { icon: 'clock', title: '無断キャンセルが多い', desc: '連絡なしのドタキャンで貴重な枠が空いてしまう' },
      { icon: 'users', title: 'リピーターが定着しない', desc: '来店後のフォローが手動では、再来店のきっかけが作れない' },
      { icon: 'chart', title: '人気メニューが把握できない', desc: 'どのデザインが人気か、データで分析できていない' },
    ],
    features: [
      { icon: 'message', title: 'LINEで予約完結', desc: 'お客様はLINEからメニュー選択→スタッフ指名→日時選択→予約確定。電話不要でサロンの手を止めません。' },
      { icon: 'bell', title: '前日自動リマインド', desc: '予約日の前日にLINEで自動通知。「爪を短く切らないでください」等の注意事項も一緒に送れます。' },
      { icon: 'calendar', title: 'デザイン別メニュー管理', desc: 'シンプル・アート・ジェル・ケア・オフなど、デザイン種別でメニューを分類。お客様が選びやすいUIを提供。' },
      { icon: 'users', title: 'スタッフ指名・シフト連動', desc: 'ネイリストの指名予約に対応。シフトを登録すれば空き枠を自動で表示します。' },
      { icon: 'chart', title: 'デザイン別KPI分析', desc: 'どのデザインが人気か、リピート率はどうか。データで見えるからメニュー改善に直結します。' },
      { icon: 'sparkles', title: 'リピート促進LINE配信', desc: '「ジェルの付け替え時期です」「新作デザインが入りました」。最適なタイミングで自動配信。' },
    ],
    flow: [
      { step: '01', title: 'LINE公式アカウント連携', desc: 'お手持ちのLINE公式アカウントと連携。Messaging APIの設定をガイドに沿って行うだけ。' },
      { step: '02', title: 'メニュー・スタッフ登録', desc: 'ジェルネイル・アート・ケアなどのメニューと、ネイリスト情報を管理画面から登録。' },
      { step: '03', title: '予約URLを共有して運用開始', desc: 'LINE公式アカウントのリッチメニューやプロフィールに予約URLを貼るだけ。最短30分で運用開始。' },
    ],
    faqs: [
      { q: 'ネイルのデザイン画像は掲載できますか？', a: 'はい。メニューごとに施術イメージ画像をアップロードできます。お客様が予約画面でデザインを確認しながら選択できます。' },
      { q: '付け替え時期のリマインドは自動ですか？', a: 'はい。リピート促進機能で、前回来店から一定期間後にLINEで自動配信できます。配信間隔やメッセージ文面はカスタマイズ可能です。' },
      { q: '他の予約システムからの移行は簡単ですか？', a: 'メニューとスタッフ情報を管理画面から登録するだけで移行完了です。既存の予約は手動で転記いただく形になりますが、初期設定サポートも無料で提供しています。' },
      { q: '複数のネイリストのシフトを管理できますか？', a: 'はい。Proプラン以上ではスタッフ数無制限です。各ネイリストのシフトを個別に設定でき、お客様は空いている枠から予約できます。' },
    ],
    metaTitle: 'LumiBook | ネイルサロン専用予約管理ツール',
    metaDesc: 'LINE予約・デザイン別メニュー管理・前日リマインドを自動化。ネイルサロンの予約業務を効率化するツール。',
  },
  hair: {
    label: 'ヘアサロン',
    badge: 'ヘアサロン専用の予約自動化ツール',
    headline: 'ヘアサロンの予約管理を\n圧倒的にシンプルに',
    subheadline: 'カット・カラー・パーマのカテゴリ管理からスタイリスト指名まで。\n予約の手間をなくして、技術に集中できる環境を。',
    problems: [
      { icon: 'phone', title: '電話予約の対応が施術を中断', desc: 'カット中に電話が鳴り、お客様を待たせてしまう場面が頻発' },
      { icon: 'calendar', title: 'スタイリスト間の予約調整が大変', desc: '複数スタッフのシフトと予約枠の突き合わせが手作業で非効率' },
      { icon: 'clock', title: '当日キャンセルの空き枠が埋まらない', desc: 'キャンセルが出ても告知手段がなく、枠が無駄になる' },
      { icon: 'users', title: 'カラー・パーマのリピート周期が読めない', desc: '根本が伸びてきた頃の再来店促進が、感覚頼みになっている' },
      { icon: 'chart', title: 'メニュー別の売上貢献度が見えない', desc: 'カットとカラーどちらが収益に貢献しているか、データがない' },
    ],
    features: [
      { icon: 'message', title: 'LINEで指名予約完結', desc: 'スタイリストの指名→メニュー選択→空き枠確認→予約確定。すべてLINEで完結します。' },
      { icon: 'bell', title: '前日自動リマインド', desc: '来店前日にLINEで自動通知。当日キャンセル率を大幅に削減します。' },
      { icon: 'calendar', title: 'カテゴリ別メニュー管理', desc: 'カット・カラー・パーマ・トリートメント・セット・ヘッドスパ。施術カテゴリで整理された分かりやすいメニュー表。' },
      { icon: 'users', title: 'スタイリスト別シフト管理', desc: '各スタイリストの出勤日・時間帯を登録。空き枠が自動で予約画面に反映されます。' },
      { icon: 'chart', title: 'カテゴリ別KPI分析', desc: 'カット vs カラー vs パーマ。カテゴリごとの予約数・リピート率・売上寄与を可視化。' },
      { icon: 'sparkles', title: 'リピート促進配信', desc: '「カットから1ヶ月経ちました」「カラーの根本が気になる頃では？」。お客様ごとに最適なタイミングで自動配信。' },
    ],
    flow: [
      { step: '01', title: 'LINE公式アカウント連携', desc: '既存のLINE公式アカウントとMessaging APIで連携。ガイドに沿って最短15分で完了。' },
      { step: '02', title: 'メニュー・スタイリスト登録', desc: 'カット・カラー等のメニューと、各スタイリストの情報・シフトを管理画面から登録。' },
      { step: '03', title: '予約URLを公開して運用開始', desc: 'リッチメニューやプロフィールに予約URLを設置。お客様はLINEから即日予約可能に。' },
    ],
    faqs: [
      { q: 'スタイリスト指名とフリー予約の両方に対応できますか？', a: 'はい。お客様が「指名なし」を選べば空いているスタッフに自動で振り分けられます。指名がある場合はそのスタッフの空き枠のみ表示されます。' },
      { q: 'カラーやパーマの施術時間が違っても大丈夫ですか？', a: 'メニューごとに所要時間を個別設定できます。カット45分、カラー90分、パーマ120分など。予約枠が自動で調整されます。' },
      { q: '複数店舗での利用は可能ですか？', a: 'Enterpriseプランで複数店舗の一括管理に対応しています。各店舗ごとにスタッフ・メニュー・シフトを独立して管理できます。' },
      { q: '既存の予約システムと並行運用できますか？', a: 'はい。移行期間中は既存システムと並行して運用し、段階的に切り替えることをお勧めしています。初期設定サポートも無料で提供しています。' },
    ],
    metaTitle: 'LumiBook | ヘアサロン専用予約管理ツール',
    metaDesc: 'LINE予約・スタイリスト指名・カテゴリ別メニュー管理を自動化。ヘアサロンの予約業務を効率化。',
  },
  dental: {
    label: '歯科・クリニック',
    badge: '歯科クリニック専用の予約管理ツール',
    headline: '歯科クリニックの予約を\nLINEで効率化',
    subheadline: '診療種別管理・オンライン問診・定期検診リマインド。\n患者体験の向上とスタッフの業務負荷削減を同時に実現します。',
    problems: [
      { icon: 'phone', title: '電話予約で受付が逼迫', desc: '診療時間中の電話対応で、受付スタッフの業務が圧迫される' },
      { icon: 'calendar', title: '定期検診の来院率が低い', desc: '患者さんが検診時期を忘れ、症状が進行してから来院するケースが多い' },
      { icon: 'clock', title: '問診票の記入に時間がかかる', desc: '来院してから紙の問診票を記入するため、待ち時間が長くなる' },
      { icon: 'users', title: '無断キャンセルで診療枠が空く', desc: '連絡なしのキャンセルで、他の患者さんに使えたはずの枠が無駄に' },
      { icon: 'chart', title: '診療メニュー別の経営データがない', desc: 'どの診療が収益に貢献しているか、感覚的にしか把握できていない' },
    ],
    features: [
      { icon: 'message', title: 'LINE予約受付', desc: '患者さんはLINEから診療種別を選んで予約。電話を減らし、受付の負担を軽減します。' },
      { icon: 'shield', title: 'オンライン問診', desc: '来院前にスマホで問診を完了。アレルギー・服薬情報を事前に把握し、診療の質を向上。' },
      { icon: 'bell', title: '定期検診リマインド', desc: '前回来院から一定期間後にLINEで自動通知。「定期検診の時期です」で来院率を向上。' },
      { icon: 'calendar', title: '診療種別メニュー管理', desc: '検診・クリーニング・ホワイトニング・虫歯治療・初診相談。種別ごとに時間と料金を設定。' },
      { icon: 'chart', title: '診療分析KPI', desc: '診療種別ごとの予約数・リピート率を可視化。経営判断に使えるデータを自動集計。' },
      { icon: 'sparkles', title: '患者フォローアップ', desc: '治療後のケア案内や次回予約の促進を自動配信。患者さんの継続来院をサポート。' },
    ],
    flow: [
      { step: '01', title: 'LINE公式アカウント連携', desc: 'クリニックのLINE公式アカウントと連携。Messaging API設定はガイド付きで簡単。' },
      { step: '02', title: '診療メニュー・問診票設定', desc: '診療種別・所要時間・料金を登録。事前問診のテンプレートも用意されています。' },
      { step: '03', title: '予約URLを院内・HPに設置', desc: 'ホームページやLINEプロフィールに予約URLを設置。患者さんは24時間いつでも予約可能に。' },
    ],
    faqs: [
      { q: '保険診療と自費診療の両方を管理できますか？', a: 'はい。メニューごとに料金を個別設定できるため、保険診療（料金0円表示も可）と自費診療を分けて管理できます。' },
      { q: '問診票はカスタマイズできますか？', a: 'はい。テキスト入力・選択式・チェックボックスなど複数の質問タイプに対応しています。歯科特有の質問テンプレートも用意されています。' },
      { q: '定期検診のリマインド間隔は変更できますか？', a: 'はい。3ヶ月・6ヶ月・12ヶ月など、任意の間隔で設定できます。患者さんの診療内容に応じて最適な間隔を設定してください。' },
      { q: '患者さんの個人情報のセキュリティは大丈夫ですか？', a: 'Cloudflareのインフラ上で運用しており、通信は全てHTTPS暗号化されています。データは日本リージョンのサーバーに保存されます。' },
    ],
    metaTitle: 'LumiBook | 歯科クリニック専用予約管理ツール',
    metaDesc: 'LINE予約・オンライン問診・定期検診リマインドを一括管理。歯科クリニックの業務効率を向上。',
  },
  esthetic: {
    label: 'エステ・リラクゼーション',
    badge: 'エステサロン専用の予約自動化ツール',
    headline: 'エステサロンの予約を\nもっとスマートに',
    subheadline: 'フェイシャル・ボディ・毛穴ケアの施術カテゴリ別管理。\n初回カウンセリングからリピート促進まで一元管理します。',
    problems: [
      { icon: 'phone', title: '電話・SNS対応で施術に集中できない', desc: 'Instagramの問い合わせや電話対応で、施術の合間が埋まってしまう' },
      { icon: 'calendar', title: '施術カテゴリが多く予約管理が複雑', desc: 'フェイシャル・ボディ・痩身・脱毛など、メニューが多岐にわたり管理が大変' },
      { icon: 'clock', title: '初回カウンセリングの時間配分が難しい', desc: 'お客様の悩みを事前に把握できず、カウンセリングが長引く' },
      { icon: 'users', title: 'コースの継続率が低い', desc: '施術効果が出始める前に離脱してしまうお客様が多い' },
      { icon: 'chart', title: '施術カテゴリ別の実績が見えない', desc: 'どの施術が人気で収益に貢献しているか把握できていない' },
    ],
    features: [
      { icon: 'message', title: 'LINEで予約完結', desc: 'お客様はLINEから施術カテゴリ→メニュー→日時を選択。初回カウンセリングの予約もオンラインで。' },
      { icon: 'shield', title: '事前カウンセリングシート', desc: 'お肌の悩み・アレルギー・敏感肌の既往を事前にヒアリング。施術提案の質が向上します。' },
      { icon: 'bell', title: '施術前日リマインド', desc: '予約日前日にLINEで自動通知。「メイクを落としてお越しください」等の準備案内も一緒に。' },
      { icon: 'calendar', title: '施術カテゴリ別管理', desc: 'フェイシャル・ボディ・毛穴ケア・リラクゼーション・痩身。カテゴリで整理された見やすいメニュー表。' },
      { icon: 'chart', title: '施術分析KPI', desc: 'カテゴリ別の予約数・リピート率・売上を可視化。人気施術の把握とメニュー改善に直結。' },
      { icon: 'sparkles', title: '継続施術リマインド', desc: '「前回のフェイシャルから3週間です」「季節の変わり目のケアはいかが？」。継続来店を促進。' },
    ],
    flow: [
      { step: '01', title: 'LINE公式アカウント連携', desc: 'サロンのLINE公式アカウントと連携。設定はガイドに沿って進めるだけ。' },
      { step: '02', title: 'メニュー・カウンセリング設定', desc: '施術メニューの登録と、事前アンケートの質問を設定。テンプレートですぐに始められます。' },
      { step: '03', title: '予約URLを共有して運用開始', desc: 'SNSやLINEプロフィールに予約URLを掲載。お客様は24時間いつでもオンラインで予約可能に。' },
    ],
    faqs: [
      { q: '初回カウンセリングと通常施術で時間が違いますが対応できますか？', a: 'はい。メニューごとに所要時間を個別設定できます。初回カウンセリング30分、通常施術60分のような設定が可能です。' },
      { q: '事前アンケートの内容はカスタマイズできますか？', a: 'はい。テキスト入力・チェックボックスなど複数の質問タイプで自由に構成できます。肌質や既往歴の質問テンプレートも用意しています。' },
      { q: 'コース契約の回数管理はできますか？', a: '現時点では単発予約の管理に特化しています。コース回数の管理機能は今後のアップデートで対応予定です。' },
      { q: 'スタッフが複数いる場合のシフト管理は？', a: 'Proプラン以上でスタッフ数無制限です。各エステティシャンのシフトを個別に設定でき、指名予約にも対応しています。' },
    ],
    metaTitle: 'LumiBook | エステサロン専用予約管理ツール',
    metaDesc: 'LINE予約・カウンセリング・リマインドを自動化。エステサロンの予約業務を効率化するツール。',
  },
};

const PLANS = [
  {
    name: 'Starter', price: '¥3,980', period: '/月（税込）',
    description: '個人・開業サロンに',
    features: ['LINEで予約受付', '前日自動リマインド', 'スタッフ 2名まで', 'メニュー 10件まで', '予約台帳', 'メールサポート'],
    highlighted: false, badge: null as string | null,
  },
  {
    name: 'Pro', price: '¥9,800', period: '/月（税込）',
    description: '成長中のサロンに',
    features: ['Starter のすべて', 'スタッフ・メニュー無制限', '事前アンケート', 'リピート促進配信', 'AI 接客（自動返信）', '優先サポート'],
    highlighted: true, badge: 'いちばん人気',
  },
  {
    name: 'Enterprise', price: 'ご相談', period: '',
    description: '複数店舗・法人向け',
    features: ['Pro のすべて', '複数店舗一括管理', '専任サポート担当', 'カスタム機能対応', '請求書払い対応', 'SLA保証'],
    highlighted: false, badge: null,
  },
];

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  calendar: CalendarDays, message: MessageCircle, bell: Bell, shield: Shield,
  chart: BarChart3, users: Users, phone: SmartphoneNfc, clock: Clock,
  sparkles: Sparkles, heart: HeartPulse,
};

// ── Metadata ─────────────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<{ vertical: string }> }): Promise<Metadata> {
  const { vertical } = await params;
  const data = LP[vertical];
  if (!data) return { title: 'LumiBook' };
  return {
    title: data.metaTitle, description: data.metaDesc,
    openGraph: { title: data.metaTitle, description: data.metaDesc, type: 'website', locale: 'ja_JP' },
    twitter: { card: 'summary_large_image', title: data.metaTitle, description: data.metaDesc },
  };
}

export function generateStaticParams() {
  return Object.keys(LP).map(v => ({ vertical: v }));
}

// ── Page ─────────────────────────────────────────────────────────────
export default async function VerticalLandingPage({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = await params;
  const d = LP[vertical];

  if (!d) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">ページが見つかりません</h1>
          <Link href="/lp/eyebrow" className="text-indigo-600 hover:underline">トップページへ</Link>
        </div>
      </div>
    );
  }

  const signupUrl = `${SIGNUP_HREF}?vertical=${vertical}`;

  return (
    <div className="min-h-screen bg-white font-sans antialiased text-gray-900">
      {/* ─ Navbar ─ */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm">
        <div className="mx-auto max-w-6xl px-5 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 bg-rose-500 rounded-lg flex items-center justify-center shadow-sm">
              <Scissors className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm tracking-tight">LumiBook</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-500">
            <a href="#features" className="hover:text-gray-900 transition-colors">機能</a>
            <a href="#flow" className="hover:text-gray-900 transition-colors">導入方法</a>
            <a href="#pricing" className="hover:text-gray-900 transition-colors">料金</a>
            <a href="#faq" className="hover:text-gray-900 transition-colors">よくある質問</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden sm:inline-flex text-sm text-gray-500 hover:text-gray-900 transition-colors">ログイン</Link>
            <Link href={signupUrl} className="group inline-flex items-center gap-1.5 px-4 py-2 bg-rose-500 text-white text-sm font-semibold rounded-full hover:bg-rose-600 transition-colors shadow-sm">
              無料で始める <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ─ Hero ─ */}
        <section className="relative overflow-hidden bg-slate-950 text-white py-24 sm:py-32">
          <div aria-hidden="true" className="pointer-events-none absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full bg-rose-600/15 blur-[140px]" />
          <div aria-hidden="true" className="pointer-events-none absolute top-20 -right-20 w-[500px] h-[500px] rounded-full bg-indigo-600/15 blur-[120px]" />
          <div className="relative mx-auto max-w-5xl px-5 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/70 mb-8 backdrop-blur-sm">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              {d.badge}
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight mb-6 whitespace-pre-line">{d.headline}</h1>
            <p className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto mb-10 leading-relaxed whitespace-pre-line">{d.subheadline}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <TrackingCTA href={signupUrl} vertical={vertical} cta="hero_primary" eventType="lp_signup_click" className="px-8 py-4 bg-rose-500 text-white font-bold rounded-full hover:bg-rose-600 transition-colors shadow-lg text-lg inline-flex items-center gap-2">
                無料で始める <ArrowRight className="w-5 h-5" />
              </TrackingCTA>
              <Link href="/booking" className="px-8 py-4 border border-white/20 text-white font-medium rounded-full hover:bg-white/10 transition-colors text-lg">
                デモを見る
              </Link>
            </div>
          </div>
        </section>

        {/* ─ Problems ─ */}
        <section className="py-20 sm:py-28 bg-white">
          <div className="mx-auto max-w-5xl px-5">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">こんな課題、ありませんか？</h2>
              <p className="text-gray-500 text-lg">{d.label}の現場で起きている「あるある」</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {d.problems.map((p, i) => {
                const Icon = ICON_MAP[p.icon] ?? ClipboardList;
                return (
                  <div key={i} className="relative p-6 bg-gray-50 rounded-2xl border border-gray-100 hover:border-rose-200 transition-colors">
                    <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center mb-4">
                      <Icon className="w-5 h-5 text-rose-500" />
                    </div>
                    <h3 className="text-base font-bold text-gray-900 mb-2">{p.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{p.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─ Solution / Features ─ */}
        <section className="py-20 sm:py-28 bg-gray-50" id="features">
          <div className="mx-auto max-w-5xl px-5">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-4 py-1.5 text-xs font-semibold text-rose-600 mb-4">
                <Zap className="w-3.5 h-3.5" /> SOLUTION
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">{d.label}に最適化された<br />6つの機能</h2>
              <p className="text-gray-500 text-lg">業種特化だから、使いやすさが違います</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {d.features.map((f, i) => {
                const Icon = ICON_MAP[f.icon] ?? CalendarDays;
                return (
                  <div key={i} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center mb-4">
                      <Icon className="w-6 h-6 text-rose-500" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{f.title}</h3>
                    <p className="text-gray-500 leading-relaxed">{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─ Flow ─ */}
        <section className="py-20 sm:py-28 bg-white" id="flow">
          <div className="mx-auto max-w-4xl px-5">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">かんたん3ステップで導入</h2>
              <p className="text-gray-500 text-lg">最短30分で運用開始できます</p>
            </div>
            <div className="space-y-8">
              {d.flow.map((f, i) => (
                <div key={i} className="flex gap-6 items-start">
                  <div className="shrink-0 w-14 h-14 bg-rose-500 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-md">
                    {f.step}
                  </div>
                  <div className="pt-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{f.title}</h3>
                    <p className="text-gray-500 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-12">
              <TrackingCTA href={signupUrl} vertical={vertical} cta="flow_cta" eventType="lp_signup_click" className="inline-flex items-center gap-2 px-8 py-4 bg-rose-500 text-white font-bold rounded-full hover:bg-rose-600 transition-colors shadow-lg text-lg">
                無料で始める <ArrowRight className="w-5 h-5" />
              </TrackingCTA>
            </div>
          </div>
        </section>

        {/* ─ Pricing ─ */}
        <section className="py-20 sm:py-28 bg-gray-50" id="pricing">
          <div className="mx-auto max-w-5xl px-5">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">料金プラン</h2>
              <p className="text-gray-500 text-lg">初期費用無料。いつでもプラン変更可能です</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {PLANS.map((plan, i) => (
                <div key={i} className={`relative bg-white rounded-2xl p-8 shadow-sm border ${plan.highlighted ? 'border-rose-300 ring-2 ring-rose-500 md:scale-105' : 'border-gray-200'}`}>
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-rose-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">{plan.badge}</div>
                  )}
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                    <div className="mt-4">
                      <span className="text-4xl font-black text-gray-900">{plan.price}</span>
                      <span className="text-sm text-gray-500">{plan.period}</span>
                    </div>
                  </div>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                        <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href={signupUrl} className={`block w-full py-3 rounded-full text-center font-semibold text-sm transition-colors ${
                    plan.highlighted ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}>
                    新規登録（30秒）
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─ FAQ ─ */}
        <section className="py-20 sm:py-28 bg-white" id="faq">
          <div className="mx-auto max-w-3xl px-5">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">よくある質問</h2>
            </div>
            <div className="space-y-4">
              {d.faqs.map((faq, i) => (
                <details key={i} className="group bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                  <summary className="flex items-center justify-between px-6 py-5 cursor-pointer text-left font-semibold text-gray-900 hover:bg-gray-100 transition-colors">
                    {faq.q}
                    <ChevronDown className="w-5 h-5 text-gray-400 shrink-0 ml-4 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-6 pb-5 text-sm text-gray-600 leading-relaxed">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─ Final CTA ─ */}
        <section className="py-20 sm:py-28 bg-slate-950 text-white text-center">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">{d.label}の予約管理を<br />今日から自動化しませんか？</h2>
            <p className="text-white/60 text-lg mb-10">初期費用無料・最短30分で運用開始できます</p>
            <TrackingCTA href={signupUrl} vertical={vertical} cta="final_cta" eventType="lp_signup_click" className="inline-flex items-center gap-2 px-10 py-5 bg-rose-500 text-white font-bold text-lg rounded-full hover:bg-rose-600 transition-colors shadow-lg">
              無料で始める <ArrowRight className="w-5 h-5" />
            </TrackingCTA>
          </div>
        </section>
      </main>

      {/* ─ Footer ─ */}
      <footer className="bg-slate-950 border-t border-white/10 py-8">
        <div className="mx-auto max-w-5xl px-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/40">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-rose-500 rounded flex items-center justify-center">
              <Scissors className="w-3 h-3 text-white" />
            </div>
            <span className="font-bold text-white/60">LumiBook</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="hover:text-white/70 transition-colors">ログイン</Link>
            <Link href={signupUrl} className="hover:text-white/70 transition-colors">新規登録</Link>
            <Link href="/legal/tokushoho" className="hover:text-white/70 transition-colors">特定商取引法</Link>
          </div>
          <p>&copy; {new Date().getFullYear()} LumiBook</p>
        </div>
      </footer>
    </div>
  );
}
