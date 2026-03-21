import { DesignProps, getIcon, LEGAL, PLANS } from './shared';
import { TrackingCTA } from '../_components/TrackingCTA';
import Link from 'next/link';
import { ArrowRight, Scissors, Star, CheckCircle2, ChevronDown, Zap } from 'lucide-react';
import { FadeInUp, FadeInLeft, FadeInRight, ScaleIn, StaggerContainer, StaggerItem } from '../_components/animations';

export function Magazine({ d, t, vertical, signupUrl }: DesignProps) {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      {/* ── Navbar ────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-8 sm:px-12 py-8">
        <Link href="/" className="font-serif text-xl tracking-tight text-gray-900 hover:text-gray-600 transition-colors">
          {d.label}
        </Link>
        <div className="hidden sm:flex items-center gap-8 text-sm text-gray-500">
          <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
          <a href="#pricing" className="hover:text-gray-900 transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-gray-900 transition-colors">FAQ</a>
          <TrackingCTA
            href={signupUrl}
            vertical={vertical}
            cta="nav_cta"
            className={`${t.primaryText} hover:underline underline-offset-4 transition-colors`}
          >
            無料で始める
          </TrackingCTA>
        </div>
      </nav>

      {/* ── Hero — asymmetric split ──────────────────────────── */}
      <section className="px-8 sm:px-12 pt-8 pb-24">
        {/* ISSUE badge */}
        <div className="mb-10">
          <span className={`inline-block text-[10px] tracking-[0.25em] uppercase ${t.primaryText} border ${t.primaryBorder} px-4 py-2 font-serif italic`}>
            Vol.1 &mdash; {d.label}の予約革命
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-8 items-start">
          {/* Left 60% — text */}
          <div className="lg:col-span-3">
            <span className={`inline-block text-xs tracking-[0.2em] uppercase ${t.primaryText} mb-6`}>
              {d.badge}
            </span>
            <FadeInUp>
            <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.08] tracking-tight text-gray-900 mb-8">
              {d.headline}
            </h1>
            </FadeInUp>
            <FadeInUp delay={0.15}>
            <p className="text-lg text-gray-500 font-light leading-relaxed max-w-lg mb-10">
              {d.subheadline}
            </p>
            </FadeInUp>
            <ScaleIn delay={0.3}>
            <TrackingCTA
              href={signupUrl}
              vertical={vertical}
              cta="hero_primary"
              className={`inline-flex items-center gap-3 ${t.primary} text-white px-10 py-4 text-sm tracking-wide ${t.primaryHover} transition-all`}
            >
              無料で始める
              <ArrowRight className="w-4 h-4" />
            </TrackingCTA>
            </ScaleIn>
          </div>

          {/* Right 40% — tall colored panel with feature highlights */}
          <div className={`lg:col-span-2 ${t.primaryLight} p-8 sm:p-10 min-h-[28rem] flex flex-col justify-center space-y-8`}>
            {d.features.slice(0, 4).map((f, i) => {
              const Icon = getIcon(f.icon);
              return (
                <div key={i} className="flex items-start gap-4">
                  <Icon className={`w-5 h-5 ${t.iconColor} mt-1 shrink-0`} />
                  <div>
                    <h3 className="font-serif text-base font-medium text-gray-900">{f.title}</h3>
                    <p className="text-sm text-gray-500 font-light mt-1">{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Problems — editorial 2-column ────────────────────── */}
      <section className="px-8 sm:px-12 py-24 border-t border-gray-100">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16 max-w-6xl mx-auto">
          {/* Left column — pull quote */}
          <div className="lg:col-span-2">
            <p className={`text-xs tracking-[0.2em] uppercase ${t.primaryText} mb-6`}>
              課題
            </p>
            <h2 className="font-serif text-4xl sm:text-5xl italic leading-[1.15] text-gray-900">
              こんなお悩み、<br />ありませんか？
            </h2>
          </div>

          {/* Right column — problem items */}
          <StaggerContainer className="lg:col-span-3">
            {d.problems.map((p, i) => {
              const Icon = getIcon(p.icon);
              return (
                <StaggerItem key={i} className={`py-8 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                  <div className="flex items-start gap-4">
                    <Icon className={`w-5 h-5 ${t.iconColor} mt-0.5 shrink-0`} />
                    <div>
                      <h3 className="text-base font-medium text-gray-900 mb-2">{p.title}</h3>
                      <p className="text-sm text-gray-500 font-light leading-relaxed">{p.desc}</p>
                    </div>
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </section>

      {/* ── Features — magazine grid ─────────────────────────── */}
      <section id="features" className={`px-8 sm:px-12 py-24 ${t.sectionBg}`}>
        <div className="max-w-6xl mx-auto">
          <p className={`text-xs tracking-[0.2em] uppercase ${t.primaryText} mb-4`}>
            特長
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-gray-900 mb-16">
            すべての機能
          </h2>

          {/* Row 1: first 2 features in 2-col */}
          <StaggerContainer stagger={0.1} className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            {d.features.slice(0, 2).map((f, i) => {
              const Icon = getIcon(f.icon);
              return (
                <StaggerItem key={i} className="bg-white p-8 border border-gray-100">
                  <div className="flex items-center gap-3 mb-4">
                    <Icon className={`w-5 h-5 ${t.iconColor}`} />
                    <h3 className="font-serif text-lg font-medium text-gray-900">{f.title}</h3>
                  </div>
                  <p className="text-sm text-gray-500 font-light leading-relaxed">{f.desc}</p>
                </StaggerItem>
              );
            })}
          </StaggerContainer>

          {/* Row 2: 1 feature as full-width "feature article" */}
          {d.features[2] && (() => {
            const f = d.features[2];
            const Icon = getIcon(f.icon);
            return (
              <FadeInUp>
              <div className="bg-white p-10 sm:p-14 border border-gray-100 mb-8">
                <div className="max-w-3xl">
                  <Icon className={`w-8 h-8 ${t.iconColor} mb-6`} />
                  <h3 className="font-serif text-2xl sm:text-3xl font-medium text-gray-900 mb-4">{f.title}</h3>
                  <p className="text-base text-gray-500 font-light leading-relaxed">{f.desc}</p>
                </div>
              </div>
              </FadeInUp>
            );
          })()}

          {/* Row 3: remaining features in 3-col */}
          {d.features.length > 3 && (
            <StaggerContainer stagger={0.1} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {d.features.slice(3).map((f, i) => {
                const Icon = getIcon(f.icon);
                return (
                  <StaggerItem key={i} className="bg-white p-8 border border-gray-100">
                    <div className="flex items-center gap-3 mb-4">
                      <Icon className={`w-5 h-5 ${t.iconColor}`} />
                      <h3 className="font-serif text-base font-medium text-gray-900">{f.title}</h3>
                    </div>
                    <p className="text-sm text-gray-500 font-light leading-relaxed">{f.desc}</p>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          )}
        </div>
      </section>

      {/* ── Flow — 3 chapters ────────────────────────────────── */}
      <section className="px-8 sm:px-12 py-24 border-t border-gray-100">
        <div className="max-w-4xl mx-auto">
          <p className={`text-xs tracking-[0.2em] uppercase ${t.primaryText} mb-4`}>
            ご利用の流れ
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-gray-900 mb-20">
            3つのチャプター
          </h2>

          <div className="space-y-20">
            {d.flow.map((step, i) => (
              <FadeInLeft key={i} delay={i * 0.15}>
              <div className="flex items-start gap-8 sm:gap-12">
                <div className="shrink-0">
                  <span className={`font-serif text-5xl sm:text-6xl font-light ${t.primaryText} leading-none`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <div className="pt-2 sm:pt-4 pl-4 sm:pl-8 border-l border-gray-200">
                  <h3 className="font-serif text-xl sm:text-2xl text-gray-900 mb-3">{step.title}</h3>
                  <p className="text-sm text-gray-500 font-light leading-relaxed max-w-lg">{step.desc}</p>
                </div>
              </div>
              </FadeInLeft>
            ))}
          </div>

          <div className="mt-16 text-center">
            <TrackingCTA
              href={signupUrl}
              vertical={vertical}
              cta="flow_cta"
              className={`inline-flex items-center gap-3 ${t.primary} text-white px-10 py-4 text-sm tracking-wide ${t.primaryHover} transition-all`}
            >
              無料で始める
              <ArrowRight className="w-4 h-4" />
            </TrackingCTA>
          </div>
        </div>
      </section>

      {/* ── Pricing — clean table layout ─────────────────────── */}
      <section id="pricing" className={`px-8 sm:px-12 py-24 ${t.sectionBg}`}>
        <div className="max-w-4xl mx-auto">
          <p className={`text-xs tracking-[0.2em] uppercase ${t.primaryText} mb-4`}>
            料金
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-gray-900 mb-16">
            料金プラン
          </h2>

          <div className="divide-y divide-gray-200">
            {PLANS.map((plan, i) => (
              <ScaleIn key={i} delay={i * 0.1}>
              <div className="py-10 grid grid-cols-1 sm:grid-cols-4 gap-6 items-start">
                <div className="sm:col-span-1">
                  <h3 className="font-serif text-xl text-gray-900">{plan.name}</h3>
                  {plan.badge && (
                    <span className={`inline-block text-[10px] tracking-[0.15em] uppercase ${t.primaryText} mt-1`}>
                      {plan.badge}
                    </span>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{plan.description}</p>
                </div>
                <div className="sm:col-span-1">
                  <span className="font-serif text-3xl text-gray-900">{plan.price}</span>
                  {plan.period && (
                    <span className="text-xs text-gray-400 ml-1">{plan.period}</span>
                  )}
                </div>
                <div className="sm:col-span-1">
                  <ul className="space-y-2">
                    {plan.features.map((feat, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                        <CheckCircle2 className={`w-3.5 h-3.5 ${t.iconColor} mt-0.5 shrink-0`} />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="sm:col-span-1 flex items-start">
                  <TrackingCTA
                    href={signupUrl}
                    vertical={vertical}
                    cta={`pricing_${plan.name.toLowerCase()}`}
                    className={`w-full text-center py-3 text-sm transition-colors ${
                      plan.highlighted
                        ? `${t.primary} text-white ${t.primaryHover}`
                        : `border border-gray-300 text-gray-700 hover:border-gray-400`
                    }`}
                  >
                    {plan.price === 'ご相談' ? 'お問い合わせ' : '選択する'}
                  </TrackingCTA>
                </div>
              </div>
              </ScaleIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ — editor's notes ──────────────────────────────── */}
      <section id="faq" className="px-8 sm:px-12 py-24 border-t border-gray-100">
        <div className="max-w-3xl mx-auto">
          <p className={`text-xs tracking-[0.2em] uppercase ${t.primaryText} mb-4`}>
            FAQ
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-gray-900 mb-16">
            {"Editor's Notes"}
          </h2>

          <div className="space-y-12">
            {d.faqs.map((faq, i) => (
              <FadeInUp key={i} delay={i * 0.08}>
              <div>
                <h3 className="flex items-baseline gap-3 mb-3">
                  <span className={`font-serif italic text-2xl ${t.primaryText}`}>Q.</span>
                  <span className="text-base font-medium text-gray-900">{faq.q}</span>
                </h3>
                <p className="text-sm text-gray-500 font-light leading-relaxed pl-10">
                  {faq.a}
                </p>
              </div>
              </FadeInUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA — elegant bordered box ─────────────────── */}
      <section className="px-8 sm:px-12 py-24">
        <ScaleIn>
        <div className={`max-w-2xl mx-auto border ${t.primaryBorder} p-12 sm:p-16 text-center`}>
          <h2 className="font-serif text-2xl sm:text-3xl text-gray-900 mb-4">
            予約管理を、もっとシンプルに。
          </h2>
          <p className="text-sm text-gray-500 font-light mb-10">
            今すぐ無料トライアルを始めましょう。
          </p>
          <TrackingCTA
            href={signupUrl}
            vertical={vertical}
            cta="final_cta"
            className={`inline-flex items-center gap-3 ${t.primary} text-white px-12 py-4 text-sm tracking-wide ${t.primaryHover} transition-all`}
          >
            無料トライアルを始める
            <ArrowRight className="w-4 h-4" />
          </TrackingCTA>
        </div>
        </ScaleIn>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="px-8 sm:px-12 py-10 border-t border-gray-100">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-serif text-sm text-gray-400">{d.label}</span>
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
            <Link href="/legal/tokushoho" className="hover:text-gray-700 transition-colors">特商法表記</Link>
            <Link href="/legal/terms" className="hover:text-gray-700 transition-colors">利用規約</Link>
            <Link href="/legal/privacy" className="hover:text-gray-700 transition-colors">プライバシー</Link>
            <a href={`mailto:${LEGAL.email}`} className="hover:text-gray-700 transition-colors">お問い合わせ</a>
          </div>
          <span className="text-xs text-gray-300">
            &copy; {new Date().getFullYear()} All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
