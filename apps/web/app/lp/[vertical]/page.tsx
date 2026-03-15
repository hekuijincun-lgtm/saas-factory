import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, ArrowRight, Scissors, CalendarDays, Bell, Shield, BarChart3, MessageCircle } from 'lucide-react';

// ── Vertical config ──────────────────────────────────────────────────
const VERTICAL_LP_DATA: Record<string, {
  label: string;
  headline: string;
  subheadline: string;
  features: { icon: string; title: string; desc: string }[];
  color: string;
  metaTitle: string;
  metaDesc: string;
}> = {
  nail: {
    label: 'ネイルサロン',
    headline: 'ネイルサロンの予約を\nLINEで自動化',
    subheadline: 'デザイン別メニュー管理・スタッフ指名・前日リマインドをすべて一つに。ネイルサロンの運営をスマートにします。',
    features: [
      { icon: 'calendar', title: 'デザイン別メニュー管理', desc: 'シンプル・アート・ジェル・ケア・オフなど、デザイン種別ごとにメニューを管理' },
      { icon: 'message', title: 'LINE予約受付', desc: 'お客様はLINEからワンタップで予約。ネイルデザインを事前に選択' },
      { icon: 'bell', title: '前日自動リマインド', desc: '無断キャンセルを大幅削減。施術前の注意事項も自動送信' },
      { icon: 'chart', title: 'リピート促進', desc: 'デザイン別KPIで人気メニューを分析。リピート施策を自動配信' },
    ],
    color: 'rose',
    metaTitle: 'LumiBook | ネイルサロン専用予約管理ツール',
    metaDesc: 'LINE予約・リマインド・台帳をすべて自動化。ネイルサロンオーナーの手間を大幅削減。',
  },
  hair: {
    label: 'ヘアサロン',
    headline: 'ヘアサロンの予約管理を\n圧倒的にシンプルに',
    subheadline: 'カット・カラー・パーマなどカテゴリ別管理、スタッフ指名、LINE連携。ヘアサロンの業務効率を飛躍的に向上。',
    features: [
      { icon: 'calendar', title: 'カテゴリ別メニュー管理', desc: 'カット・カラー・パーマ・トリートメントなど施術カテゴリで分類管理' },
      { icon: 'message', title: 'スタッフ指名予約', desc: 'スタイリストの指名をオンラインで完結。シフト連動で空き枠を自動表示' },
      { icon: 'bell', title: '自動リマインド配信', desc: '来店前日にLINEで自動通知。ドタキャン率を大幅に低減' },
      { icon: 'chart', title: '施術分析KPI', desc: 'カテゴリ別の予約数・リピート率を可視化。売上戦略に活用' },
    ],
    color: 'indigo',
    metaTitle: 'LumiBook | ヘアサロン専用予約管理ツール',
    metaDesc: 'LINE予約・スタッフ指名・リマインドを自動化。ヘアサロンの予約業務を効率化。',
  },
  dental: {
    label: '歯科・クリニック',
    headline: '歯科クリニックの\n予約管理を効率化',
    subheadline: '診療メニュー別管理・問診票・定期検診リマインドをオールインワンで。患者さんの体験を向上させます。',
    features: [
      { icon: 'calendar', title: '診療種別メニュー管理', desc: '定期検診・クリーニング・ホワイトニング・虫歯治療など種別ごとに管理' },
      { icon: 'shield', title: '事前問診票', desc: '来院前にオンラインで問診を完了。受付の待ち時間を大幅短縮' },
      { icon: 'bell', title: '定期検診リマインド', desc: '検診時期が近づくと自動でLINE通知。定期来院率を向上' },
      { icon: 'chart', title: '診療分析', desc: '診療種別ごとの予約数・リピート率を可視化。経営判断に活用' },
    ],
    color: 'sky',
    metaTitle: 'LumiBook | 歯科クリニック専用予約管理ツール',
    metaDesc: 'LINE予約・問診票・定期検診リマインドを一括管理。歯科クリニックの業務効率を向上。',
  },
  esthetic: {
    label: 'エステ・リラクゼーション',
    headline: 'エステサロンの予約を\nもっとスマートに',
    subheadline: 'フェイシャル・ボディ・毛穴ケアなど施術カテゴリ別管理。カウンセリング予約からリピート促進まで一元管理。',
    features: [
      { icon: 'calendar', title: '施術カテゴリ別管理', desc: 'フェイシャル・ボディ・毛穴ケア・リラクゼーションなどカテゴリで分類' },
      { icon: 'message', title: '事前カウンセリング', desc: 'アンケートで事前にお悩みをヒアリング。施術提案の質を向上' },
      { icon: 'bell', title: '自動リマインド', desc: '施術前日にLINEで自動通知。準備事項も合わせてお知らせ' },
      { icon: 'chart', title: '施術分析KPI', desc: 'カテゴリ別の人気度・リピート率を可視化。メニュー改善に活用' },
    ],
    color: 'purple',
    metaTitle: 'LumiBook | エステサロン専用予約管理ツール',
    metaDesc: 'LINE予約・カウンセリング・リマインドを自動化。エステサロンの運営を効率化。',
  },
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  calendar: CalendarDays,
  message: MessageCircle,
  bell: Bell,
  shield: Shield,
  chart: BarChart3,
};

// ── Metadata ─────────────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<{ vertical: string }> }): Promise<Metadata> {
  const { vertical } = await params;
  const data = VERTICAL_LP_DATA[vertical];
  if (!data) return { title: 'LumiBook' };
  return {
    title: data.metaTitle,
    description: data.metaDesc,
    openGraph: { title: data.metaTitle, description: data.metaDesc, type: 'website', locale: 'ja_JP' },
  };
}

export function generateStaticParams() {
  return Object.keys(VERTICAL_LP_DATA).map(v => ({ vertical: v }));
}

// ── Page ─────────────────────────────────────────────────────────────
export default async function VerticalLandingPage({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = await params;
  const data = VERTICAL_LP_DATA[vertical];

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">ページが見つかりません</h1>
          <Link href="/lp/eyebrow" className="text-indigo-600 hover:underline">トップページへ</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans antialiased text-gray-900">
      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm">
        <div className="mx-auto max-w-5xl px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-rose-500 rounded-lg flex items-center justify-center shadow-sm">
              <Scissors className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm">LumiBook</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">ログイン</Link>
            <Link href={`/signup?vertical=${vertical}`} className="px-4 py-2 bg-rose-500 text-white text-sm font-semibold rounded-full hover:bg-rose-600 transition-colors shadow-sm inline-flex items-center gap-1.5">
              無料で始める <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-slate-950 text-white py-24 sm:py-32">
          <div className="pointer-events-none absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-rose-600/15 blur-[120px]" />
          <div className="relative mx-auto max-w-4xl px-5 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/70 mb-8">
              {data.label}専用の予約自動化ツール
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight mb-6 whitespace-pre-line">
              {data.headline}
            </h1>
            <p className="text-lg text-white/70 max-w-2xl mx-auto mb-10 leading-relaxed">
              {data.subheadline}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href={`/signup?vertical=${vertical}`} className="px-8 py-4 bg-rose-500 text-white font-bold rounded-full hover:bg-rose-600 transition-colors shadow-lg text-lg inline-flex items-center gap-2">
                無料で始める <ArrowRight className="w-5 h-5" />
              </Link>
              <Link href="/booking" className="px-8 py-4 border border-white/20 text-white font-medium rounded-full hover:bg-white/10 transition-colors text-lg">
                デモを見る
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 sm:py-28 bg-gray-50" id="features">
          <div className="mx-auto max-w-5xl px-5">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">{data.label}に最適化された機能</h2>
              <p className="text-gray-500 text-lg">業種特化だから、使いやすさが違います</p>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              {data.features.map((f, i) => {
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

        {/* CTA */}
        <section className="py-20 sm:py-28 bg-slate-950 text-white text-center">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">{data.label}の予約管理を<br />今日から自動化しませんか？</h2>
            <p className="text-white/60 text-lg mb-10">初期費用無料・最短30分で運用開始できます</p>
            <Link href={`/signup?vertical=${vertical}`} className="inline-flex items-center gap-2 px-10 py-5 bg-rose-500 text-white font-bold text-lg rounded-full hover:bg-rose-600 transition-colors shadow-lg">
              無料で始める <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-white/10 py-8 text-center text-sm text-white/40">
        <p>&copy; {new Date().getFullYear()} LumiBook. All rights reserved.</p>
      </footer>
    </div>
  );
}
