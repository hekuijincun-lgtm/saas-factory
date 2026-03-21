import { DesignProps, getIcon, LEGAL, PLANS } from './shared';
import { TrackingCTA } from '../_components/TrackingCTA';
import Link from 'next/link';
import { ArrowRight, Scissors, Star, CheckCircle2, ChevronDown, Zap } from 'lucide-react';
import { FadeInUp, FadeInLeft, FadeInRight, ScaleIn, StaggerContainer, StaggerItem } from '../_components/animations';

export function SplitHero({ d, t, vertical, signupUrl }: DesignProps) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href={`/lp/${vertical}`} className="flex items-center gap-2 font-bold text-xl">
            <Star className={`w-6 h-6 ${t.iconColor}`} />
            <span>{d.label}</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-600">
            <Link href="#problems" className="hover:text-gray-900 transition-colors">課題</Link>
            <Link href="#features" className="hover:text-gray-900 transition-colors">機能</Link>
            <Link href="#pricing" className="hover:text-gray-900 transition-colors">料金</Link>
            <Link href="#faq" className="hover:text-gray-900 transition-colors">FAQ</Link>
          </div>
          <TrackingCTA
            href={signupUrl}
            vertical={vertical}
            cta="nav_cta"
            className={`${t.primary} ${t.primaryHover} text-white px-5 py-2 rounded-full text-sm font-medium transition-colors`}
          >
            無料で始める
          </TrackingCTA>
        </div>
      </nav>

      {/* ── Hero (split 2-col) ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: text */}
            <div>
              <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-semibold px-3 py-1 rounded-full mb-6`}>
                {d.badge}
              </span>
              <FadeInUp>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-6">
                {d.headline}
              </h1>
              </FadeInUp>
              <FadeInUp delay={0.15}>
              <p className="text-lg text-gray-500 mb-10 max-w-lg">
                {d.subheadline}
              </p>
              </FadeInUp>
              <ScaleIn delay={0.3}>
              <div className="flex flex-col sm:flex-row gap-4">
                <TrackingCTA
                  href={signupUrl}
                  vertical={vertical}
                  cta="hero_primary"
                  className={`${t.primary} ${t.primaryHover} text-white px-8 py-3.5 rounded-full text-lg font-semibold transition-colors flex items-center gap-2`}
                >
                  無料で始める <ArrowRight className="w-5 h-5" />
                </TrackingCTA>
                <TrackingCTA
                  href="#features"
                  vertical={vertical}
                  cta="hero_secondary"
                  className={`border ${t.primaryBorder} ${t.primaryText} px-8 py-3.5 rounded-full text-lg font-semibold hover:bg-gray-50 transition-colors`}
                >
                  詳しく見る
                </TrackingCTA>
              </div>
              </ScaleIn>
            </div>

            {/* Right: floating feature cards */}
            <div className="relative hidden lg:block h-[420px]">
              <div className={`absolute inset-4 ${t.primaryLight} rounded-3xl`} />
              {d.features.slice(0, 4).map((f, i) => {
                const Icon = getIcon(f.icon);
                const positions = [
                  'top-0 left-4 rotate-2',
                  'top-6 right-0 -rotate-1',
                  'bottom-8 left-0 rotate-1',
                  'bottom-0 right-6 -rotate-2',
                ];
                return (
                  <div
                    key={i}
                    className={`absolute ${positions[i]} bg-white rounded-2xl shadow-lg p-5 w-52 transform transition-transform hover:scale-105`}
                  >
                    <div className={`w-10 h-10 ${t.iconBg} rounded-lg flex items-center justify-center mb-3`}>
                      <Icon className={`w-5 h-5 ${t.iconColor}`} />
                    </div>
                    <h4 className="font-bold text-sm">{f.title}</h4>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Problems (dark section) ────────────────────────────────────── */}
      <section id="problems" className={`${t.heroBg} text-white py-20 sm:py-28`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">こんな課題を感じていませんか？</h2>
            <p className="text-gray-400 text-lg">よくある悩みを、まとめて解決します</p>
          </div>
          {/* Horizontal scroll on mobile, grid on desktop */}
          <StaggerContainer className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0">
            {d.problems.map((p, i) => {
              const Icon = getIcon(p.icon);
              return (
                <StaggerItem key={i}>
                <div
                  className="flex-shrink-0 w-72 lg:w-auto snap-center bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur"
                >
                  <div className={`w-12 h-12 ${t.iconBg} rounded-xl flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${t.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{p.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{p.desc}</p>
                </div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </section>

      {/* ── Features (alternating rows) ────────────────────────────────── */}
      <section id="features" className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-semibold px-3 py-1 rounded-full mb-4`}>
              FEATURES
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold">必要な機能をすべて搭載</h2>
          </div>
          <StaggerContainer stagger={0.1} className="space-y-20">
            {d.features.map((f, i) => {
              const Icon = getIcon(f.icon);
              const isEven = i % 2 === 0;
              return (
                <StaggerItem key={i}>
                <div
                  className={`flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'} items-center gap-10 lg:gap-16`}
                >
                  {/* Text side */}
                  <div className="flex-1">
                    <div className={`w-14 h-14 ${t.iconBg} rounded-2xl flex items-center justify-center mb-5`}>
                      <Icon className={`w-7 h-7 ${t.iconColor}`} />
                    </div>
                    <h3 className="text-2xl font-bold mb-3">{f.title}</h3>
                    <p className="text-gray-500 leading-relaxed max-w-md">{f.desc}</p>
                  </div>
                  {/* Decorative accent side */}
                  <div className="flex-1 flex justify-center">
                    <div className={`w-full max-w-sm h-48 ${t.primaryLight} rounded-3xl flex items-center justify-center`}>
                      <div className={`w-20 h-20 ${t.primary} rounded-2xl flex items-center justify-center opacity-20`}>
                        <Icon className="w-10 h-10 text-white" />
                      </div>
                    </div>
                  </div>
                </div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </section>

      {/* ── Flow (horizontal timeline) ─────────────────────────────────── */}
      <section className={`${t.sectionBg} py-20 sm:py-28`}>
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">導入は3ステップ</h2>
            <p className="text-gray-500 text-lg">かんたん設定ですぐに使い始められます</p>
          </div>
          <div className="relative">
            {/* Connecting line (desktop only) */}
            <div className={`hidden md:block absolute top-8 left-[calc(16.67%)] right-[calc(16.67%)] h-0.5 ${t.primary} opacity-20`} />
            <div className="grid md:grid-cols-3 gap-10">
              {d.flow.map((s, i) => (
                <FadeInLeft key={i} delay={i * 0.15}>
                <div className="text-center">
                  <div className={`relative z-10 w-16 h-16 mx-auto ${t.primary} text-white rounded-full flex items-center justify-center text-2xl font-bold mb-5 shadow-lg`}>
                    {i + 1}
                  </div>
                  <h3 className="text-lg font-bold mb-2">{s.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
                </div>
                </FadeInLeft>
              ))}
            </div>
          </div>
          <div className="text-center mt-14">
            <TrackingCTA
              href={signupUrl}
              vertical={vertical}
              cta="flow_cta"
              className={`inline-flex items-center gap-2 ${t.primary} ${t.primaryHover} text-white px-8 py-3.5 rounded-full text-lg font-semibold transition-colors`}
            >
              今すぐ始める <ArrowRight className="w-5 h-5" />
            </TrackingCTA>
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────── */}
      <section id="pricing" className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">シンプルな料金プラン</h2>
            <p className="text-gray-500 text-lg">14日間無料トライアル。いつでもキャンセル可能。</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan, i) => (
              <ScaleIn key={i} delay={i * 0.1}>
              <div
                className={`relative rounded-3xl p-8 ${
                  plan.highlighted
                    ? `ring-2 ${t.planRing} ${t.primaryLight} shadow-xl scale-105`
                    : 'bg-gray-50 border border-gray-200'
                } transition-transform`}
              >
                {plan.badge && (
                  <span className={`absolute -top-3 left-1/2 -translate-x-1/2 ${t.primary} text-white text-xs font-semibold px-4 py-1 rounded-full shadow`}>
                    {plan.badge}
                  </span>
                )}
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <p className="text-gray-500 text-sm mb-5">{plan.description}</p>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold">{plan.price}</span>
                  <span className="text-gray-400 text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${t.iconColor}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <TrackingCTA
                  href={signupUrl}
                  vertical={vertical}
                  cta={`pricing_${plan.name.toLowerCase()}`}
                  className={`block text-center w-full py-3 rounded-full font-semibold transition-colors ${
                    plan.highlighted
                      ? `${t.primary} ${t.primaryHover} text-white`
                      : `border ${t.primaryBorder} ${t.primaryText} hover:bg-gray-100`
                  }`}
                >
                  {plan.price === 'ご相談' ? 'お問い合わせ' : '無料トライアル'}
                </TrackingCTA>
              </div>
              </ScaleIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ (2-column grid, always visible) ────────────────────────── */}
      <section id="faq" className={`${t.sectionBg} py-20 sm:py-28`}>
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">よくある質問</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {d.faqs.map((faq, i) => (
              <FadeInUp key={i} delay={i * 0.08}>
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="font-bold mb-2 flex items-start gap-2">
                  <span className={`${t.primaryText} font-extrabold text-lg leading-none mt-0.5`}>Q.</span>
                  {faq.q}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed pl-6">{faq.a}</p>
              </div>
              </FadeInUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA (gradient) ───────────────────────────────────────── */}
      <section className={`bg-gradient-to-r ${t.heroGradient} text-white py-20 sm:py-28`}>
        <ScaleIn>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <Zap className="w-12 h-12 mx-auto mb-6 text-white/80" />
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">さあ、はじめましょう</h2>
          <p className="text-white/80 text-lg mb-10 max-w-xl mx-auto">
            14日間無料。クレジットカード不要。5分で設定完了。
          </p>
          <TrackingCTA
            href={signupUrl}
            vertical={vertical}
            cta="final_cta"
            className="inline-flex items-center gap-2 bg-white text-gray-900 px-10 py-4 rounded-full text-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            無料トライアルを始める <ArrowRight className="w-5 h-5" />
          </TrackingCTA>
        </div>
        </ScaleIn>
      </section>

      {/* ── Footer (minimal) ───────────────────────────────────────────── */}
      <footer className="bg-gray-50 border-t border-gray-200 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Star className={`w-4 h-4 ${t.iconColor}`} />
            <span className="font-semibold text-gray-700">{d.label}</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Link href="/legal/tokushoho" className="hover:text-gray-900 transition-colors">特商法表記</Link>
            <Link href="/legal/terms" className="hover:text-gray-900 transition-colors">利用規約</Link>
            <Link href="/legal/privacy" className="hover:text-gray-900 transition-colors">プライバシー</Link>
            <a href={`mailto:${LEGAL.email}`} className="hover:text-gray-900 transition-colors">お問い合わせ</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
