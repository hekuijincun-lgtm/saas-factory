import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL } from '../../../src/lib/legal';
import {
  CheckCircle2,
  Bell,
  CalendarDays,
  Users,
  BarChart3,
  Sparkles,
  ArrowRight,
  ChevronDown,
  SmartphoneNfc,
  Clock,
  Heart,
} from 'lucide-react';
import { TrackingCTA } from '../_components/TrackingCTA';
import { ScrollAnimator } from './ScrollAnimator';

// ── Images (DALL-E 3, stored in R2) ──────────────────────────────────
const IMG = {
  hero: 'https://saas-factory-api.hekuijincun.workers.dev/media/menu/lp-images/pet/hero-1774499575714.png',
  lineBooking: 'https://saas-factory-api.hekuijincun.workers.dev/media/menu/lp-images/pet/line-booking-1774499597520.png',
  beforeAfter: 'https://saas-factory-api.hekuijincun.workers.dev/media/menu/lp-images/pet/before-after-1774499623211.png',
};

const SIGNUP_HREF = '/signup?vertical=pet&trial=1';
const VERTICAL = 'pet';

export const metadata: Metadata = {
  title: 'PetBook | ペットサロン専用予約管理ツール',
  description: 'LINE予約・犬種別メニュー管理・前日リマインドを自動化。ペットサロン・トリミングの予約業務を効率化するツール。',
  openGraph: {
    title: 'PetBook | ペットサロン専用予約管理ツール',
    description: 'LINE予約・犬種別メニュー管理・前日リマインドを自動化。',
    images: [{ url: IMG.hero, width: 1792, height: 1024 }],
  },
};

// ── Animation CSS ────────────────────────────────────────────────────
// Hero: CSS keyframe (plays on page load).
// Scroll sections: .pet-animate* classes start hidden, get .pet-visible
// added by ScrollAnimator (IntersectionObserver). If JS is off, elements
// are visible because the hiding is applied client-side only.
const animCSS = `
@keyframes petFadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.anim-up{animation:petFadeUp .6s ease-out both}
.anim-up-d1{animation:petFadeUp .6s ease-out .1s both}
.anim-up-d2{animation:petFadeUp .6s ease-out .2s both}
.anim-up-d3{animation:petFadeUp .6s ease-out .3s both}

.pet-animate{opacity:0;transform:translateY(24px);transition:opacity .7s ease-out,transform .7s ease-out}
.pet-animate.pet-visible{opacity:1;transform:translateY(0)}
.pet-animate-left{opacity:0;transform:translateX(32px);transition:opacity .7s ease-out,transform .7s ease-out}
.pet-animate-left.pet-visible{opacity:1;transform:translateX(0)}
.pet-animate-right{opacity:0;transform:translateX(-32px);transition:opacity .7s ease-out,transform .7s ease-out}
.pet-animate-right.pet-visible{opacity:1;transform:translateX(0)}
.pet-animate-scale{opacity:0;transform:scale(.93);transition:opacity .6s ease-out,transform .6s ease-out}
.pet-animate-scale.pet-visible{opacity:1;transform:scale(1)}
.pet-d1{transition-delay:.1s}
.pet-d2{transition-delay:.2s}
.pet-d3{transition-delay:.3s}
.pet-d4{transition-delay:.4s}
.pet-d5{transition-delay:.5s}
`;

export default function PetLPPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <style dangerouslySetInnerHTML={{ __html: animCSS }} />
      <ScrollAnimator />

      {/* ── Navbar ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 px-4 pt-3 pb-1">
        <div className="mx-auto max-w-5xl bg-white/90 backdrop-blur rounded-full shadow-lg border border-gray-100 px-5 py-2.5 flex items-center justify-between">
          <Link href="/lp/pet" className="flex items-center gap-2 font-bold text-lg">
            <span className="text-xl">🐾</span>
            <span className="bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent">PetBook</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-gray-600">
            <Link href="#features" className="hover:text-gray-900 transition-colors">機能</Link>
            <Link href="#pricing" className="hover:text-gray-900 transition-colors">料金</Link>
            <Link href="#faq" className="hover:text-gray-900 transition-colors">FAQ</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors">
              ログイン
            </Link>
            <TrackingCTA
              href={SIGNUP_HREF}
              vertical={VERTICAL}
              cta="nav_cta"
              className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-full text-sm font-medium transition-colors shadow-md"
            >
              無料で始める
            </TrackingCTA>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="px-4 pt-4 pb-0">
        <div className="mx-auto max-w-7xl rounded-3xl overflow-hidden relative min-h-[420px] sm:min-h-[520px]">
          <img src={IMG.hero} alt="ペットサロン" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-orange-600/80 via-orange-500/65 to-pink-500/50" />
          <div className="relative z-10 px-6 sm:px-12 py-16 sm:py-24 text-white">
            <span className="anim-up inline-block bg-white/20 backdrop-blur text-white text-xs font-semibold px-4 py-1.5 rounded-full mb-5">
              🐶 ペットサロン専用の予約自動化ツール
            </span>
            <h1 className="anim-up-d1 text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-4">
              ペットサロンの予約を<br />
              <span className="text-yellow-200">LINEで簡単管理</span>
            </h1>
            <p className="anim-up-d2 text-base sm:text-lg text-white/85 max-w-xl mb-8">
              犬種別メニュー管理・トリマー指名・仕上がり写真共有。
              飼い主さまの満足度を高めて、リピーターを増やします。
            </p>
            <div className="anim-up-d3 flex flex-col sm:flex-row items-start gap-3">
              <TrackingCTA
                href={SIGNUP_HREF}
                vertical={VERTICAL}
                cta="hero_primary"
                className="bg-white text-orange-600 px-7 py-3 rounded-full text-base font-bold shadow-lg hover:shadow-xl transition-shadow flex items-center gap-2"
              >
                無料で始める <ArrowRight className="w-4 h-4" />
              </TrackingCTA>
              <TrackingCTA
                href="#features"
                vertical={VERTICAL}
                cta="hero_secondary"
                className="border-2 border-white/40 text-white px-7 py-3 rounded-full text-base font-semibold hover:bg-white/10 transition-colors"
              >
                機能を見る
              </TrackingCTA>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────── */}
      <section className="py-10 px-4 bg-orange-50">
        <div className="mx-auto max-w-4xl grid grid-cols-3 gap-3 sm:gap-6">
          {[
            { num: '94%', label: '無断キャンセル削減', icon: '📉' },
            { num: '3h', label: '1日の業務削減', icon: '⏱' },
            { num: '2.3倍', label: 'リピート率向上', icon: '🔄' },
          ].map((s, i) => (
            <div key={i} className={`pet-animate pet-d${i + 1} bg-white rounded-2xl p-4 sm:p-5 shadow-sm text-center`}>
              <div className="text-2xl sm:text-3xl mb-1">{s.icon}</div>
              <div className="text-xl sm:text-2xl font-black text-orange-500">{s.num}</div>
              <div className="text-[11px] sm:text-sm text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Problems ───────────────────────────────────────────── */}
      <section className="py-14 px-4 bg-white">
        <div className="mx-auto max-w-6xl">
          <h2 className="pet-animate text-2xl sm:text-3xl font-bold text-center mb-3">こんなお悩みありませんか？</h2>
          <p className="pet-animate pet-d1 text-gray-500 text-center text-sm mb-8">多くのペットサロンが抱える共通の課題</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { Icon: SmartphoneNfc, title: '電話対応で手が止まる', desc: 'トリミング中に電話が鳴っても出られない' },
              { Icon: CalendarDays, title: '犬種ごとの時間管理が大変', desc: '小型犬と大型犬で時間が全然違う' },
              { Icon: Clock, title: '無断キャンセルで枠が空く', desc: '当日ドタキャンで貴重な枠が無駄に' },
              { Icon: Users, title: 'リピーター案内が手動', desc: 'お知らせを一人ひとりに送る時間がない' },
              { Icon: BarChart3, title: '人気コースが分からない', desc: 'データ分析できずメニュー改善が感覚頼み' },
            ].map((p, i) => (
              <div key={i} className={`pet-animate pet-d${i + 1} border-l-4 border-orange-300 rounded-2xl p-5 shadow-sm bg-white hover:shadow-md transition-shadow`}>
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mb-3">
                  <p.Icon className="w-5 h-5 text-orange-500" />
                </div>
                <h3 className="font-bold mb-1">{p.title}</h3>
                <p className="text-gray-500 text-sm">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features (image blocks) ────────────────────────────── */}
      <section id="features" className="py-14 px-4 bg-orange-50">
        <div className="mx-auto max-w-6xl">
          <span className="pet-animate block text-center text-orange-600 text-xs font-semibold mb-2">FEATURES</span>
          <h2 className="pet-animate pet-d1 text-2xl sm:text-3xl font-bold text-center mb-3">すべてを解決する機能</h2>
          <p className="pet-animate pet-d2 text-gray-500 text-center text-sm mb-10">ペットサロンに必要な機能が全て揃っています</p>

          {/* Feature 1: LINE予約 */}
          <div className="flex flex-col md:flex-row gap-6 items-center mb-10 bg-white rounded-2xl p-5 sm:p-7 shadow-md">
            <div className="pet-animate-right flex-1 order-2 md:order-1">
              <span className="inline-block bg-orange-100 text-orange-600 text-xs font-semibold px-3 py-1 rounded-full mb-2">LINE連携</span>
              <h3 className="text-xl font-bold mb-2">LINEで24時間予約受付</h3>
              <p className="text-gray-600 text-sm mb-3">犬種→コース→トリマー指名→日時選択→予約確定。電話不要。</p>
              <ul className="space-y-1.5">
                {['AI自動返信', '前日リマインド自動送信', 'クーポン配信', '予約変更もLINEで'].map(f => (
                  <li key={f} className="text-sm text-gray-600 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-orange-400 flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="pet-animate-left w-full md:w-72 h-48 md:h-56 rounded-xl overflow-hidden shadow flex-shrink-0 order-1 md:order-2">
              <img src={IMG.lineBooking} alt="LINE予約" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Feature 2: カルテ管理 */}
          <div className="flex flex-col md:flex-row gap-6 items-center mb-10 bg-white rounded-2xl p-5 sm:p-7 shadow-md">
            <div className="pet-animate-left w-full md:w-72 h-48 md:h-56 rounded-xl flex-shrink-0 bg-gradient-to-br from-pink-100 to-orange-100 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-2">🐾</div>
                <div className="bg-white rounded-lg px-3 py-1.5 shadow-sm text-xs">
                  <div className="text-gray-400 mb-0.5">犬種: トイプードル</div>
                  <div className="flex gap-1 justify-center">
                    <span className="bg-orange-100 text-orange-600 text-[10px] px-1.5 py-0.5 rounded-full">アレルギー無</span>
                    <span className="bg-pink-100 text-pink-600 text-[10px] px-1.5 py-0.5 rounded-full">シャンプー済</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="pet-animate-right flex-1">
              <span className="inline-block bg-pink-100 text-pink-600 text-xs font-semibold px-3 py-1 rounded-full mb-2">カルテ管理</span>
              <h3 className="text-xl font-bold mb-2">ペットの情報を一元管理</h3>
              <p className="text-gray-600 text-sm mb-3">犬種・アレルギー・施術履歴・写真をまとめて管理。</p>
              <ul className="space-y-1.5">
                {['ワクチン接種記録', 'ビフォーアフター写真', 'アレルギー情報', '施術履歴の自動記録'].map(f => (
                  <li key={f} className="text-sm text-gray-600 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-pink-400 flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Feature 3: ビフォーアフター */}
          <div className="flex flex-col md:flex-row gap-6 items-center mb-10 bg-white rounded-2xl p-5 sm:p-7 shadow-md">
            <div className="pet-animate-right flex-1 order-2 md:order-1">
              <span className="inline-block bg-purple-100 text-purple-600 text-xs font-semibold px-3 py-1 rounded-full mb-2">集客支援</span>
              <h3 className="text-xl font-bold mb-2">ビフォーアフターで集客</h3>
              <p className="text-gray-600 text-sm mb-3">施術前後の写真を管理・共有。SNS連携でリピーターを増やします。</p>
              <ul className="space-y-1.5">
                {['写真比較', 'LINEで飼い主に共有', 'SNS投稿テンプレ', 'レビュー依頼'].map(f => (
                  <li key={f} className="text-sm text-gray-600 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-purple-400 flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="pet-animate-left w-full md:w-72 h-48 md:h-56 rounded-xl overflow-hidden shadow flex-shrink-0 order-1 md:order-2">
              <img src={IMG.beforeAfter} alt="ビフォーアフター" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* 6 sub-features grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { Icon: Bell, title: '前日リマインド', desc: '予約前日に自動LINE通知', bg: 'bg-yellow-100', color: 'text-yellow-600' },
              { Icon: CalendarDays, title: '犬種別メニュー', desc: '犬種サイズ別に料金・時間設定', bg: 'bg-green-100', color: 'text-green-600' },
              { Icon: Users, title: 'トリマー指名', desc: 'シフト連動で空き枠を自動表示', bg: 'bg-blue-100', color: 'text-blue-600' },
              { Icon: BarChart3, title: 'KPI分析', desc: 'コース別の人気・リピート率', bg: 'bg-indigo-100', color: 'text-indigo-600' },
              { Icon: Sparkles, title: 'トリミング時期通知', desc: '最適タイミングで自動配信', bg: 'bg-pink-100', color: 'text-pink-600' },
              { Icon: Heart, title: 'AIコンシェルジュ', desc: 'AIが最適コースを提案', bg: 'bg-red-100', color: 'text-red-600' },
            ].map((f, i) => (
              <div key={i} className={`pet-animate-scale pet-d${i + 1} bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow`}>
                <div className={`w-10 h-10 ${f.bg} rounded-full flex items-center justify-center mb-3`}>
                  <f.Icon className={`w-5 h-5 ${f.color}`} />
                </div>
                <h3 className="font-bold text-sm mb-1">{f.title}</h3>
                <p className="text-gray-500 text-xs">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────── */}
      <section className="py-12 px-4 bg-white">
        <div className="mx-auto max-w-4xl">
          <h2 className="pet-animate text-2xl sm:text-3xl font-bold text-center mb-8">お客様の声</h2>
          <div className="space-y-4">
            <div className="pet-animate pet-d1 flex gap-4 items-center bg-orange-50 rounded-2xl p-5">
              <div className="w-16 h-16 rounded-full flex-shrink-0 bg-gradient-to-br from-orange-200 to-pink-200 flex items-center justify-center text-3xl">🐕</div>
              <div>
                <p className="text-gray-700 text-sm">「電話対応が半分に減りました。LINEで予約完結するので、トリミングに集中できます。」</p>
                <p className="text-xs text-gray-500 mt-1.5">東京都 ペットサロン経営 田中様</p>
              </div>
            </div>
            <div className="pet-animate pet-d2 flex gap-4 items-center bg-pink-50 rounded-2xl p-5">
              <div className="w-16 h-16 rounded-full flex-shrink-0 bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center text-3xl">🐩</div>
              <div>
                <p className="text-gray-700 text-sm">「犬種ごとにメニューと時間を設定できて最高。ダブルブッキングがゼロになりました。」</p>
                <p className="text-xs text-gray-500 mt-1.5">大阪府 トリミングサロン 佐藤様</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Flow ───────────────────────────────────────────────── */}
      <section className="py-12 px-4 bg-orange-50">
        <div className="mx-auto max-w-4xl">
          <h2 className="pet-animate text-2xl sm:text-3xl font-bold text-center mb-2">かんたん導入ステップ</h2>
          <p className="pet-animate pet-d1 text-gray-500 text-center text-sm mb-8">最短5分で予約受付を開始</p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { title: 'LINE公式と連携', desc: 'ガイドに沿って最短15分', emoji: '🔗' },
              { title: 'メニュー・スタッフ登録', desc: '犬種別コースと料金を設定', emoji: '📋' },
              { title: '運用開始', desc: 'URLを共有するだけ', emoji: '🚀' },
            ].map((s, i) => (
              <div key={i} className={`pet-animate-scale pet-d${i + 1} bg-white rounded-2xl p-5 shadow-sm text-center`}>
                <div className="w-10 h-10 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold mx-auto mb-3">
                  {i + 1}
                </div>
                <div className="text-2xl mb-1">{s.emoji}</div>
                <h3 className="font-bold mb-1">{s.title}</h3>
                <p className="text-gray-500 text-xs">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <TrackingCTA
              href={SIGNUP_HREF}
              vertical={VERTICAL}
              cta="flow_cta"
              className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-7 py-3 rounded-full font-semibold transition-colors shadow-lg"
            >
              今すぐ始める <ArrowRight className="w-4 h-4" />
            </TrackingCTA>
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────── */}
      <section id="pricing" className="py-14 px-4 bg-white">
        <div className="mx-auto max-w-5xl">
          <h2 className="pet-animate text-2xl sm:text-3xl font-bold text-center mb-2">料金プラン</h2>
          <p className="pet-animate pet-d1 text-gray-500 text-center text-sm mb-8">14日間無料トライアル付き</p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                name: 'Starter', price: '¥3,980', period: '/月',
                desc: '個人・開業サロンに',
                features: ['LINE予約受付', '前日リマインド', 'スタッフ2名', 'メニュー10件', 'メールサポート'],
                highlighted: false, badge: null as string | null,
              },
              {
                name: 'Pro', price: '¥9,800', period: '/月',
                desc: '成長中のサロンに',
                features: ['Starter全機能', 'スタッフ無制限', 'リピート促進配信', 'AI接客', '優先サポート'],
                highlighted: true, badge: 'いちばん人気',
              },
              {
                name: 'Enterprise', price: 'ご相談', period: '',
                desc: '複数店舗・法人向け',
                features: ['Pro全機能', '複数店舗管理', '専任サポート', 'カスタム対応', 'SLA保証'],
                highlighted: false, badge: null,
              },
            ].map((plan, i) => (
              <div key={i} className={`pet-animate-scale pet-d${i + 1} relative bg-white rounded-2xl p-6 ${
                plan.highlighted ? 'ring-2 ring-orange-500 shadow-xl' : 'shadow-md border border-gray-100'
              }`}>
                {plan.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[11px] font-semibold px-3 py-0.5 rounded-full">
                    {plan.badge}
                  </span>
                )}
                <h3 className="text-lg font-bold">{plan.name}</h3>
                <p className="text-gray-500 text-xs mb-3">{plan.desc}</p>
                <div className="mb-4">
                  <span className="text-3xl font-extrabold">{plan.price}</span>
                  <span className="text-gray-400 text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-2 mb-5">
                  {plan.features.map((f, fi) => (
                    <li key={fi} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle2 className="w-4 h-4 text-orange-500 flex-shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                <TrackingCTA
                  href={plan.name === 'Enterprise' ? '/contact/enterprise' : SIGNUP_HREF}
                  vertical={VERTICAL}
                  cta={`pricing_${plan.name.toLowerCase()}`}
                  className={`block text-center w-full py-2.5 rounded-full font-semibold text-sm transition-colors ${
                    plan.highlighted
                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                      : 'border border-orange-500 text-orange-500 hover:bg-orange-50'
                  }`}
                >
                  {plan.price === 'ご相談' ? 'お問い合わせ' : '無料トライアル'}
                </TrackingCTA>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────── */}
      <section id="faq" className="py-14 px-4 bg-orange-50">
        <div className="mx-auto max-w-3xl">
          <h2 className="pet-animate text-2xl sm:text-3xl font-bold text-center mb-8">よくある質問</h2>
          <div className="space-y-3">
            {[
              { q: '猫のトリミングにも対応？', a: 'はい。犬と猫で別メニューを設定できます。猫専用コースも作成可能です。' },
              { q: '犬種ごとに料金を変えられる？', a: 'はい。小型犬・中型犬・大型犬などサイズ別、犬種別にメニューと料金を個別設定できます。' },
              { q: '仕上がり写真の共有機能は？', a: 'トリミング後の写真をLINEで飼い主さまに即送信。SNS投稿許可も管理できます。' },
              { q: '複数トリマーのシフト管理は？', a: 'Proプラン以上でトリマー数無制限。各トリマーのシフト・指名予約に対応。' },
              { q: '導入にどのくらいかかる？', a: '最短即日。テンプレートで自動セットアップされます。' },
            ].map((faq, i) => (
              <details key={i} className={`pet-animate pet-d${i + 1} group bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden`}>
                <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer font-medium text-sm hover:bg-gray-50 transition-colors list-none [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform flex-shrink-0" />
                </summary>
                <div className="px-5 pb-4 text-gray-500 text-sm">{faq.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-orange-500 to-pink-500 text-white py-14 px-4">
        <div className="pet-animate mx-auto max-w-2xl text-center">
          <div className="text-5xl mb-4">🐾</div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">今すぐ無料で始めよう</h2>
          <p className="text-white/80 mb-8">クレジットカード不要・14日間無料・5分で設定完了</p>
          <TrackingCTA
            href={SIGNUP_HREF}
            vertical={VERTICAL}
            cta="final_cta"
            className="inline-flex items-center gap-2 bg-white text-orange-600 px-8 py-3.5 rounded-full text-base font-bold shadow-lg hover:shadow-xl transition-shadow"
          >
            無料トライアルを始める <ArrowRight className="w-4 h-4" />
          </TrackingCTA>
        </div>
      </section>

      {/* ── LINE連携セクション ──────────────────────────────── */}
      <section className="py-12 px-6 bg-orange-50">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-4xl mb-4">📱</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            LINEと連携するだけで始められます
          </h2>
          <p className="text-gray-500 mb-6 text-sm">
            むずかしい設定は不要。5ステップで完了します。
          </p>
          <Link
            href="/lp/pet/line-setup"
            className="inline-flex items-center gap-2 bg-[#06C755] text-white font-bold px-6 py-3 rounded-full hover:bg-[#05a847] transition shadow-md"
          >
            <span>LINE連携の手順を見る</span>
            <span>→</span>
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="bg-gray-900 text-gray-400 py-10 px-4">
        <div className="mx-auto max-w-5xl grid sm:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 text-white font-bold mb-2">
              <span>🐾</span> PetBook
            </div>
            <p className="text-xs leading-relaxed">ペットサロン・トリミングの予約業務を効率化するツール。</p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-2">製品</h4>
            <ul className="space-y-1.5 text-xs">
              <li><Link href="#features" className="hover:text-white transition-colors">機能</Link></li>
              <li><Link href="#pricing" className="hover:text-white transition-colors">料金</Link></li>
              <li><Link href="#faq" className="hover:text-white transition-colors">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-2">法的情報</h4>
            <ul className="space-y-1.5 text-xs">
              <li><Link href="/legal/tokushoho" className="hover:text-white transition-colors">特商法表記</Link></li>
              <li><Link href="/legal/terms" className="hover:text-white transition-colors">利用規約</Link></li>
              <li><Link href="/legal/privacy" className="hover:text-white transition-colors">プライバシーポリシー</Link></li>
              <li><a href={`mailto:${LEGAL.email}`} className="hover:text-white transition-colors">お問い合わせ</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-4 border-t border-gray-800 text-xs text-center text-gray-500 max-w-5xl mx-auto">
          &copy; {new Date().getFullYear()} PetBook. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
