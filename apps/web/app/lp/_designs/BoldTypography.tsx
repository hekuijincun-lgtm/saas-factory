import { DesignProps, getIcon, PLANS } from './shared';
import { TrackingCTA } from '../_components/TrackingCTA';
import Link from 'next/link';
import { ArrowRight, Scissors, Star, CheckCircle2, ChevronDown, Zap } from 'lucide-react';

export function BoldTypography({ d, t, vertical, signupUrl }: DesignProps) {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased overflow-hidden">
      {/* ── Navbar — logo + CTA only ─────────────────────────── */}
      <nav className="flex items-center justify-between px-6 sm:px-10 py-6">
        <Link href="/" className="text-xl font-black tracking-tighter text-gray-900 hover:text-gray-600 transition-colors">
          {d.label}
        </Link>
        <TrackingCTA
          href={signupUrl}
          vertical={vertical}
          cta="nav_cta"
          className={`${t.primary} text-white px-6 py-2.5 text-sm font-bold ${t.primaryHover} transition-all`}
        >
          無料で始める
        </TrackingCTA>
      </nav>

      {/* ── Hero — ENORMOUS text ──────────────────────────────── */}
      <section className="px-6 sm:px-10 pt-16 sm:pt-24 pb-32 sm:pb-40">
        <div className="max-w-7xl mx-auto">
          <span className={`block text-sm font-bold tracking-[0.15em] uppercase ${t.primaryText} mb-8`}>
            {d.badge}
          </span>
          <h1 className="text-7xl sm:text-8xl lg:text-9xl font-black tracking-tighter leading-[0.9] text-gray-900 mb-10">
            {d.headline}
          </h1>
          <p className="text-xl sm:text-2xl font-light text-gray-400 max-w-2xl mb-14">
            {d.subheadline}
          </p>
          <TrackingCTA
            href={signupUrl}
            vertical={vertical}
            cta="hero_primary"
            className={`inline-flex items-center gap-3 ${t.primary} text-white px-10 py-4 text-sm font-bold tracking-wide ${t.primaryHover} transition-all`}
          >
            無料で始める
            <ArrowRight className="w-4 h-4" />
          </TrackingCTA>
        </div>
      </section>

      {/* ── Problems — giant text lines ───────────────────────── */}
      <section className="px-6 sm:px-10 py-24 sm:py-32 border-t border-gray-100">
        <div className="max-w-6xl mx-auto">
          <span className={`block text-sm font-bold tracking-[0.15em] uppercase ${t.primaryText} mb-16`}>
            課題
          </span>
          <div className="space-y-16">
            {d.problems.map((p, i) => (
              <div key={i}>
                <div className={`w-12 h-1 ${t.primary} mb-6`} />
                <h3 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 mb-4">
                  {p.title}
                </h3>
                <p className="text-lg text-gray-400 font-light max-w-2xl">
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features — alternating huge text + bg numbers ─────── */}
      <section className="px-6 sm:px-10 py-24 sm:py-32 border-t border-gray-100">
        <div className="max-w-6xl mx-auto">
          <span className={`block text-sm font-bold tracking-[0.15em] uppercase ${t.primaryText} mb-20`}>
            特長
          </span>
          <div className="space-y-24 sm:space-y-32">
            {d.features.map((f, i) => {
              const num = String(i + 1).padStart(2, '0');
              const isEven = i % 2 === 0;
              return (
                <div key={i} className="relative">
                  {/* Background number */}
                  <span
                    className="absolute -top-8 sm:-top-12 text-[8rem] sm:text-[12rem] font-black text-gray-50 leading-none select-none pointer-events-none"
                    style={{ [isEven ? 'left' : 'right']: 0 }}
                    aria-hidden="true"
                  >
                    {num}
                  </span>
                  {/* Content */}
                  <div className={`relative z-10 ${isEven ? 'text-left' : 'text-right'}`}>
                    <h3 className="text-4xl sm:text-5xl font-black tracking-tight text-gray-900 mb-4">
                      {f.title}
                    </h3>
                    <p className={`text-lg text-gray-400 font-light max-w-xl ${isEven ? '' : 'ml-auto'}`}>
                      {f.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Flow — massive stacked words ──────────────────────── */}
      <section className={`px-6 sm:px-10 py-24 sm:py-32 ${t.sectionBg}`}>
        <div className="max-w-6xl mx-auto">
          <span className={`block text-sm font-bold tracking-[0.15em] uppercase ${t.primaryText} mb-16`}>
            ご利用の流れ
          </span>
          <div className="space-y-20">
            {d.flow.map((step, i) => (
              <div key={i}>
                <h3 className="text-5xl sm:text-6xl font-black tracking-tighter text-gray-900 leading-none mb-4">
                  <span className="text-gray-300">{String(i + 1).padStart(2, '0')}</span>
                  {' '}
                  <span className={`${t.primaryText}`}>&mdash;</span>
                  {' '}
                  {step.title}
                </h3>
                <p className="text-base sm:text-lg text-gray-400 font-light pl-2 max-w-xl">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-20">
            <TrackingCTA
              href={signupUrl}
              vertical={vertical}
              cta="flow_cta"
              className={`inline-flex items-center gap-3 ${t.primary} text-white px-10 py-4 text-sm font-bold tracking-wide ${t.primaryHover} transition-all`}
            >
              今すぐ始める
              <ArrowRight className="w-4 h-4" />
            </TrackingCTA>
          </div>
        </div>
      </section>

      {/* ── Pricing — text-based, thick rules ────────────────── */}
      <section className="px-6 sm:px-10 py-24 sm:py-32 border-t border-gray-100">
        <div className="max-w-4xl mx-auto">
          <span className={`block text-sm font-bold tracking-[0.15em] uppercase ${t.primaryText} mb-16`}>
            料金
          </span>

          {PLANS.map((plan, i) => (
            <div key={i}>
              {i > 0 && <div className="h-1 bg-gray-900 my-12" />}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-start">
                <div>
                  <div className="flex items-baseline gap-3 mb-2">
                    <h3 className="text-3xl sm:text-4xl font-black tracking-tight text-gray-900">
                      {plan.name}
                    </h3>
                    {plan.badge && (
                      <span className={`text-xs font-bold ${t.primaryText} uppercase tracking-wider`}>
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mb-4">{plan.description}</p>
                  <div className="mb-6">
                    <span className="text-5xl sm:text-6xl font-black tracking-tighter text-gray-900">
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-sm text-gray-400 ml-2">{plan.period}</span>
                    )}
                  </div>
                  <TrackingCTA
                    href={signupUrl}
                    vertical={vertical}
                    cta={`pricing_${plan.name.toLowerCase()}`}
                    className={`inline-block px-8 py-3 text-sm font-bold transition-colors ${
                      plan.highlighted
                        ? `${t.primary} text-white ${t.primaryHover}`
                        : 'border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white'
                    }`}
                  >
                    {plan.price === 'ご相談' ? 'お問い合わせ' : '始める'}
                  </TrackingCTA>
                </div>
                <ul className="space-y-3">
                  {plan.features.map((feat, j) => (
                    <li key={j} className="text-base text-gray-600">
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ — minimal text ────────────────────────────────── */}
      <section className="px-6 sm:px-10 py-24 sm:py-32 border-t border-gray-100">
        <div className="max-w-3xl mx-auto">
          <span className={`block text-sm font-bold tracking-[0.15em] uppercase ${t.primaryText} mb-16`}>
            FAQ
          </span>
          <div className="space-y-14">
            {d.faqs.map((faq, i) => (
              <div key={i}>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900 mb-3">
                  {faq.q}
                </h3>
                <p className="text-lg text-gray-400 font-normal leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA — huge question ────────────────────────── */}
      <section className={`px-6 sm:px-10 py-32 sm:py-40 ${t.sectionBg}`}>
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tighter text-gray-900 mb-12">
            始めませんか？
          </h2>
          <TrackingCTA
            href={signupUrl}
            vertical={vertical}
            cta="final_cta"
            className={`inline-flex items-center gap-3 ${t.primary} text-white px-14 py-5 text-base font-bold tracking-wide ${t.primaryHover} transition-all`}
          >
            無料トライアルを始める
            <ArrowRight className="w-5 h-5" />
          </TrackingCTA>
        </div>
      </section>

      {/* ── Footer — single line ──────────────────────────────── */}
      <footer className="px-6 sm:px-10 py-8 text-center">
        <span className="text-xs text-gray-300">
          &copy; {new Date().getFullYear()} {d.label}. All rights reserved.
        </span>
      </footer>
    </div>
  );
}
