import { DesignProps, getIcon, LEGAL, PLANS } from './shared';
import { TrackingCTA } from '../_components/TrackingCTA';
import Link from 'next/link';
import { ArrowRight, Scissors, Star, CheckCircle2, ChevronDown, Zap } from 'lucide-react';
import { FadeInUp, FadeInLeft, FadeInRight, ScaleIn, StaggerContainer, StaggerItem } from '../_components/animations';

/* ── Timeline building blocks ────────────────────────────────────── */

function TimelineDot({ t }: { t: DesignProps['t'] }) {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 z-10">
      <div className={`w-4 h-4 rounded-full ${t.primary} ring-4 ring-white`} />
    </div>
  );
}

function TimelineCard({
  side,
  children,
}: {
  side: 'left' | 'right';
  children: React.ReactNode;
}) {
  return (
    <div
      className={`w-full md:w-5/12 ${
        side === 'left' ? 'md:mr-auto md:pr-12' : 'md:ml-auto md:pl-12'
      }`}
    >
      {children}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */

export function Storytelling({ d, t, vertical, signupUrl }: DesignProps) {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      {/* ── Navbar (fixed, semi-transparent) ─────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-white/70 border-b border-gray-100">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
          <Link href="/" className={`text-sm font-semibold ${t.primaryText} tracking-wide`}>
            {d.label}
          </Link>
          <TrackingCTA
            href={signupUrl}
            vertical={vertical}
            cta="nav_cta"
            className={`text-xs ${t.primary} text-white px-5 py-2 rounded-full ${t.primaryHover} transition-colors`}
          >
            無料で始める
          </TrackingCTA>
        </div>
      </nav>

      {/* ── Hero (full-screen) ────────────────────────────────── */}
      <section className={`min-h-screen flex flex-col items-center justify-center px-6 text-center bg-gradient-to-b ${t.heroGradient} relative overflow-hidden`}>
        {/* Subtle overlay for readability */}
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10">
          <span className="inline-block text-xs tracking-[0.25em] uppercase text-white/60 mb-6">
            {d.badge}
          </span>
          <FadeInUp>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-light text-white leading-tight max-w-3xl">
            {d.headline}
          </h1>
          </FadeInUp>
          <FadeInUp delay={0.15}>
          <p className="mt-6 text-base sm:text-lg text-white/70 font-light max-w-xl mx-auto leading-relaxed">
            {d.subheadline}
          </p>
          </FadeInUp>
          <ScaleIn delay={0.3}>
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <TrackingCTA
              href={signupUrl}
              vertical={vertical}
              cta="hero_primary"
              className="inline-flex items-center gap-2 bg-white text-gray-900 px-8 py-4 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              無料で始める
              <ArrowRight className="w-4 h-4" />
            </TrackingCTA>
            <TrackingCTA
              href={signupUrl}
              vertical={vertical}
              cta="hero_secondary"
              className="inline-flex items-center gap-2 border border-white/30 text-white px-8 py-4 rounded-full text-sm hover:bg-white/10 transition-colors"
            >
              デモを見る
            </TrackingCTA>
          </div>
          </ScaleIn>
          {/* Scroll hint */}
          <div className="mt-20 animate-bounce">
            <ChevronDown className="w-5 h-5 text-white/40 mx-auto" />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          TIMELINE SECTIONS
          A continuous vertical line runs through the center.
          ═══════════════════════════════════════════════════════════ */}
      <div className="relative">
        {/* The continuous timeline line */}
        <div
          className={`hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2`}
          style={{ backgroundColor: 'currentColor' }}
        >
          <div className={`w-full h-full ${t.primary} opacity-15`} />
        </div>

        {/* ── Problems (chapters) ───────────────────────────── */}
        <section className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-center text-3xl font-serif font-light mb-4">
              こんなお悩みはありませんか？
            </h2>
            <p className="text-center text-sm text-gray-400 mb-20">
              多くの{d.label}オーナーが直面する課題
            </p>
            <div className="space-y-16 md:space-y-24">
              {d.problems.map((p, i) => {
                const Icon = getIcon(p.icon);
                const side = i % 2 === 0 ? 'left' : 'right';
                const Anim = i % 2 === 0 ? FadeInLeft : FadeInRight;
                return (
                  <Anim key={i}>
                  <div className="relative">
                    {/* Dot on timeline */}
                    <div className="hidden md:block">
                      <TimelineDot t={t} />
                    </div>
                    <TimelineCard side={side}>
                      <div className={`bg-white rounded-2xl border border-gray-100 p-6 shadow-sm ${t.cardHover} transition-colors`}>
                        <div className="flex items-center gap-3 mb-3">
                          <span className={`text-xs font-bold ${t.primaryText} tracking-wider`}>
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <div className={`w-8 h-8 rounded-lg ${t.iconBg} flex items-center justify-center`}>
                            <Icon className={`w-4 h-4 ${t.iconColor}`} />
                          </div>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">{p.title}</h3>
                        <p className="text-sm text-gray-500 leading-relaxed">{p.desc}</p>
                      </div>
                    </TimelineCard>
                  </div>
                  </Anim>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Features (larger cards, alternating) ──────────── */}
        <section className={`py-24 px-6 ${t.sectionBg}`}>
          <div className="max-w-6xl mx-auto">
            <h2 className="text-center text-3xl font-serif font-light mb-4">
              解決策
            </h2>
            <p className="text-center text-sm text-gray-400 mb-20">
              すべてを一つのツールで
            </p>
            <div className="space-y-16 md:space-y-28">
              {d.features.map((f, i) => {
                const Icon = getIcon(f.icon);
                const side = i % 2 === 0 ? 'right' : 'left';
                const Anim = i % 2 === 0 ? FadeInRight : FadeInLeft;
                return (
                  <Anim key={i}>
                  <div className="relative">
                    <div className="hidden md:block">
                      <TimelineDot t={t} />
                    </div>
                    <TimelineCard side={side}>
                      <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-md">
                        <div className={`w-12 h-12 rounded-xl ${t.iconBg} flex items-center justify-center mb-5`}>
                          <Icon className={`w-6 h-6 ${t.iconColor}`} />
                        </div>
                        <h3 className="text-xl font-medium text-gray-900 mb-3">{f.title}</h3>
                        <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
                      </div>
                    </TimelineCard>
                  </div>
                  </Anim>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Flow (on the timeline) ───────────────────────── */}
        <section className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-center text-3xl font-serif font-light mb-4">
              ご利用の流れ
            </h2>
            <p className="text-center text-sm text-gray-400 mb-20">
              かんたん3ステップ
            </p>
            <div className="space-y-20 md:space-y-28">
              {d.flow.map((step, i) => {
                const side = i % 2 === 0 ? 'left' : 'right';
                return (
                  <FadeInLeft key={i} delay={i * 0.15}>
                  <div className="relative">
                    {/* Large step circle on timeline */}
                    <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 z-10 w-14 h-14 rounded-full bg-white border-2 items-center justify-center"
                      style={{ borderColor: 'inherit' }}
                    >
                      <div className={`w-12 h-12 rounded-full ${t.primary} flex items-center justify-center`}>
                        <span className="text-white text-lg font-light">{i + 1}</span>
                      </div>
                    </div>
                    {/* Mobile step circle */}
                    <div className="md:hidden flex justify-center mb-4">
                      <div className={`w-12 h-12 rounded-full ${t.primary} flex items-center justify-center`}>
                        <span className="text-white text-lg font-light">{i + 1}</span>
                      </div>
                    </div>
                    <TimelineCard side={side}>
                      <div className="text-center md:text-left">
                        <h3 className="text-lg font-medium text-gray-900 mb-2">{step.title}</h3>
                        <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
                      </div>
                    </TimelineCard>
                  </div>
                  </FadeInLeft>
                );
              })}
            </div>
            <div className="mt-16 text-center">
              <TrackingCTA
                href={signupUrl}
                vertical={vertical}
                cta="flow_cta"
                className={`inline-flex items-center gap-2 ${t.primary} text-white px-8 py-4 rounded-full text-sm ${t.primaryHover} transition-colors`}
              >
                今すぐ始める
                <ArrowRight className="w-4 h-4" />
              </TrackingCTA>
            </div>
          </div>
        </section>

        {/* ── FAQ (on timeline) ─────────────────────────────── */}
        <section className={`py-24 px-6 ${t.sectionBg}`}>
          <div className="max-w-6xl mx-auto">
            <h2 className="text-center text-3xl font-serif font-light mb-4">
              よくある質問
            </h2>
            <p className="text-center text-sm text-gray-400 mb-20">
              導入前の疑問を解消
            </p>
            <div className="space-y-16 md:space-y-20">
              {d.faqs.map((faq, i) => {
                const side = i % 2 === 0 ? 'left' : 'right';
                return (
                  <FadeInUp key={i} delay={i * 0.08}>
                  <div className="relative">
                    <div className="hidden md:block">
                      <TimelineDot t={t} />
                    </div>
                    <TimelineCard side={side}>
                      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                        <h3 className="text-base font-medium text-gray-900 mb-3 flex items-start gap-2">
                          <span className={`${t.primaryText} font-bold shrink-0`}>Q.</span>
                          {faq.q}
                        </h3>
                        <p className="text-sm text-gray-500 leading-relaxed pl-6">{faq.a}</p>
                      </div>
                    </TimelineCard>
                  </div>
                  </FadeInUp>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Timeline endpoint ─────────────────────────────── */}
        <div className="hidden md:flex justify-center py-4">
          <div className={`w-5 h-5 rotate-45 ${t.primary} opacity-60`} />
        </div>
      </div>

      {/* ── Pricing (full-width, breaks from timeline) ──────── */}
      <section className="py-24 px-6 bg-gray-950 text-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-3xl font-serif font-light mb-4">
            料金プラン
          </h2>
          <p className="text-center text-sm text-gray-400 mb-16">
            あなたのビジネスに合ったプランを
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <ScaleIn key={i} delay={i * 0.1}>
              <div
                className={`relative rounded-2xl p-8 transition-transform hover:-translate-y-1 ${
                  plan.highlighted
                    ? `ring-2 ${t.planRing} bg-gray-900`
                    : 'bg-gray-900/60 border border-gray-800'
                }`}
              >
                {plan.badge && (
                  <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] tracking-wider uppercase ${t.primary} text-white px-4 py-1 rounded-full`}>
                    {plan.badge}
                  </span>
                )}
                <h3 className="text-lg font-medium">{plan.name}</h3>
                <p className="text-xs text-gray-500 mt-1">{plan.description}</p>
                <div className="mt-6 mb-8">
                  <span className="text-4xl font-light">{plan.price}</span>
                  {plan.period && (
                    <span className="text-xs text-gray-500 ml-1">{plan.period}</span>
                  )}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feat, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-gray-400">
                      <CheckCircle2 className={`w-4 h-4 ${t.iconColor} mt-0.5 shrink-0`} />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <TrackingCTA
                  href={signupUrl}
                  vertical={vertical}
                  cta={`pricing_${plan.name.toLowerCase()}`}
                  className={`block w-full text-center py-3 rounded-full text-sm transition-colors ${
                    plan.highlighted
                      ? `${t.primary} text-white ${t.primaryHover}`
                      : 'border border-gray-700 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  {plan.price === 'ご相談' ? 'お問い合わせ' : 'このプランで始める'}
                </TrackingCTA>
              </div>
              </ScaleIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────── */}
      <section className="py-32 px-6 text-center relative">
        <ScaleIn>
        <div className="max-w-lg mx-auto">
          <Zap className={`w-8 h-8 ${t.iconColor} mx-auto mb-6`} />
          <h2 className="text-3xl font-serif font-light mb-4">
            あなたの物語を始めましょう
          </h2>
          <p className="text-gray-400 text-sm mb-10 leading-relaxed">
            予約管理の悩みから解放されて、本来の仕事に集中できる毎日へ。
          </p>
          <TrackingCTA
            href={signupUrl}
            vertical={vertical}
            cta="final_cta"
            className={`inline-flex items-center gap-3 ${t.primary} text-white px-12 py-4 rounded-full text-sm ${t.primaryHover} transition-all`}
          >
            無料トライアルを始める
            <ArrowRight className="w-4 h-4" />
          </TrackingCTA>
        </div>
        </ScaleIn>
      </section>

      {/* ── Footer (dark, minimal) ─────────────────────────── */}
      <footer className="bg-gray-950 text-gray-500 py-12 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <Link href="/" className={`text-sm font-semibold ${t.primaryText}`}>
            {d.label}
          </Link>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <Link href="/legal/tokushoho" className="hover:text-white transition-colors">特商法表記</Link>
            <Link href="/legal/terms" className="hover:text-white transition-colors">利用規約</Link>
            <Link href="/legal/privacy" className="hover:text-white transition-colors">プライバシー</Link>
            <a href={`mailto:${LEGAL.email}`} className="hover:text-white transition-colors">お問い合わせ</a>
          </div>
          <p className="text-xs">
            &copy; {new Date().getFullYear()} {d.label}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
