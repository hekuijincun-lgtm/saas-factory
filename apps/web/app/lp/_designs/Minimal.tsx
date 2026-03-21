import { DesignProps, getIcon, LEGAL, PLANS } from './shared';
import { TrackingCTA } from '../_components/TrackingCTA';
import Link from 'next/link';
import { ArrowRight, Scissors, Star, CheckCircle2, ChevronDown, Zap } from 'lucide-react';
import { FadeInUp, FadeInLeft, FadeInRight, ScaleIn, StaggerContainer, StaggerItem } from '../_components/animations';

export function Minimal({ d, t, vertical, signupUrl }: DesignProps) {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      {/* ── Floating logo ──────────────────────────────────────── */}
      <div className="fixed top-6 left-8 z-50">
        <Link href="/" className="text-sm tracking-[0.3em] uppercase text-gray-400 hover:text-gray-600 transition-colors">
          {d.label}
        </Link>
      </div>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <span className={`inline-block text-xs tracking-[0.2em] uppercase ${t.primaryText} mb-8`}>
          {d.badge}
        </span>
        <FadeInUp>
        <h1 className="text-6xl sm:text-7xl lg:text-8xl font-extralight tracking-tight leading-[1.05] max-w-5xl">
          {d.headline}
        </h1>
        </FadeInUp>
        <FadeInUp delay={0.15}>
        <p className="mt-8 text-lg text-gray-400 font-light max-w-xl">
          {d.subheadline}
        </p>
        </FadeInUp>
        <ScaleIn delay={0.3}>
        <TrackingCTA
          href={signupUrl}
          vertical={vertical}
          cta="hero_primary"
          className={`mt-14 inline-flex items-center gap-3 ${t.primary} text-white px-10 py-4 rounded-full text-sm tracking-wide ${t.primaryHover} transition-all`}
        >
          無料で始める
          <ArrowRight className="w-4 h-4" />
        </TrackingCTA>
        </ScaleIn>
      </section>

      {/* ── Problems ───────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-6 py-32">
        <p className={`text-xs tracking-[0.2em] uppercase ${t.primaryText} mb-4`}>
          課題
        </p>
        <h2 className="text-3xl font-extralight mb-16">
          こんなお悩みありませんか？
        </h2>
        <div className="divide-y divide-gray-100">
          {d.problems.map((p, i) => {
            const Icon = getIcon(p.icon);
            const Anim = i % 2 === 0 ? FadeInLeft : FadeInRight;
            return (
              <Anim key={i}>
              <div className="py-8 flex items-start gap-5">
                <Icon className={`w-5 h-5 ${t.iconColor} mt-0.5 shrink-0`} />
                <div>
                  <h3 className="text-base font-medium text-gray-900">{p.title}</h3>
                  <p className="mt-1 text-sm text-gray-400 font-light leading-relaxed">{p.desc}</p>
                </div>
              </div>
              </Anim>
            );
          })}
        </div>
      </section>

      {/* ── Features (editorial) ───────────────────────────────── */}
      {d.features.map((f, i) => {
        const Icon = getIcon(f.icon);
        const num = String(i + 1).padStart(2, '0');
        const Anim = i % 2 === 0 ? FadeInRight : FadeInLeft;
        return (
          <Anim key={i}>
          <section
            className={`min-h-[80vh] flex items-center ${i % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}`}
          >
            <div className="max-w-6xl mx-auto w-full px-6 py-24 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div className="flex justify-center lg:justify-end">
                <span className="text-[8rem] sm:text-[10rem] lg:text-[12rem] font-extralight text-gray-100 leading-none select-none">
                  {num}
                </span>
              </div>
              <div className="max-w-md">
                <div className={`w-10 h-10 rounded-full ${t.iconBg} flex items-center justify-center mb-6`}>
                  <Icon className={`w-5 h-5 ${t.iconColor}`} />
                </div>
                <h3 className="text-2xl font-light text-gray-900 mb-4">{f.title}</h3>
                <p className="text-gray-400 font-light leading-relaxed">{f.desc}</p>
              </div>
            </div>
          </section>
          </Anim>
        );
      })}

      {/* ── Flow ───────────────────────────────────────────────── */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto">
          <p className={`text-xs tracking-[0.2em] uppercase ${t.primaryText} mb-4 text-center`}>
            ご利用の流れ
          </p>
          <h2 className="text-3xl font-extralight text-center mb-20">
            3ステップで完了
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-0">
            {d.flow.map((step, i) => (
              <FadeInLeft key={i} delay={i * 0.15}>
              <div className="flex items-center">
                <div className="flex flex-col items-center text-center">
                  <div className={`w-20 h-20 rounded-full border-2 ${t.primaryBorder} flex items-center justify-center`}>
                    <span className={`text-2xl font-extralight ${t.primaryText}`}>{i + 1}</span>
                  </div>
                  <h3 className="mt-5 text-sm font-medium text-gray-900">{step.title}</h3>
                  <p className="mt-2 text-xs text-gray-400 max-w-[10rem]">{step.desc}</p>
                </div>
                {i < d.flow.length - 1 && (
                  <div className={`hidden sm:block w-24 h-px ${t.primaryLight} mx-4`} style={{ marginTop: '-2.5rem' }} />
                )}
              </div>
              </FadeInLeft>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────── */}
      <section className="py-32 px-6 bg-gray-50/60">
        <div className="max-w-5xl mx-auto">
          <p className={`text-xs tracking-[0.2em] uppercase ${t.primaryText} mb-4 text-center`}>
            料金
          </p>
          <h2 className="text-3xl font-extralight text-center mb-20">
            シンプルな料金プラン
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-200">
            {PLANS.map((plan, i) => (
              <ScaleIn key={i} delay={i * 0.1}>
              <div className="px-8 py-10 text-center">
                {plan.badge && (
                  <span className={`inline-block text-[10px] tracking-[0.15em] uppercase ${t.primary} text-white px-3 py-1 rounded-full mb-4`}>
                    {plan.badge}
                  </span>
                )}
                <h3 className="text-sm font-medium tracking-wide text-gray-900">{plan.name}</h3>
                <p className="mt-1 text-xs text-gray-400">{plan.description}</p>
                <div className="mt-6 mb-8">
                  <span className="text-3xl font-extralight">{plan.price}</span>
                  {plan.period && (
                    <span className="text-xs text-gray-400 ml-1">{plan.period}</span>
                  )}
                </div>
                <ul className="space-y-3 text-left mb-10">
                  {plan.features.map((feat, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-gray-500">
                      <CheckCircle2 className={`w-4 h-4 ${t.iconColor} mt-0.5 shrink-0`} />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <TrackingCTA
                  href={signupUrl}
                  vertical={vertical}
                  cta={`pricing_${plan.name.toLowerCase()}`}
                  className={`block w-full py-3 rounded-full text-sm transition-colors ${
                    plan.highlighted
                      ? `${t.primary} text-white ${t.primaryHover}`
                      : `border ${t.primaryBorder} ${t.primaryText} hover:bg-gray-50`
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

      {/* ── FAQ ─────────────────────────────────────────────────── */}
      <section className="py-32 px-6">
        <div className="max-w-2xl mx-auto">
          <p className={`text-xs tracking-[0.2em] uppercase ${t.primaryText} mb-4`}>
            FAQ
          </p>
          <h2 className="text-3xl font-extralight mb-16">
            よくある質問
          </h2>
          <div className="divide-y divide-gray-100">
            {d.faqs.map((faq, i) => (
              <FadeInUp key={i} delay={i * 0.08}>
              <div className="py-8">
                <h3 className="text-base font-medium text-gray-900 mb-3">{faq.q}</h3>
                <p className="text-sm text-gray-400 font-light leading-relaxed">{faq.a}</p>
              </div>
              </FadeInUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────── */}
      <section className="py-32 px-6 text-center">
        <ScaleIn>
        <p className="text-xl font-extralight text-gray-600 mb-10 max-w-lg mx-auto">
          今すぐ始めて、予約管理をもっとシンプルに。
        </p>
        <TrackingCTA
          href={signupUrl}
          vertical={vertical}
          cta="final_cta"
          className={`inline-flex items-center gap-3 ${t.primary} text-white px-12 py-4 rounded-full text-sm tracking-wide ${t.primaryHover} transition-all`}
        >
          無料トライアルを始める
          <ArrowRight className="w-4 h-4" />
        </TrackingCTA>
        </ScaleIn>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="py-8 px-6 text-xs text-gray-400">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>&copy; {new Date().getFullYear()} {d.label}. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link href="/legal/tokushoho" className="hover:text-gray-700 transition-colors">特商法表記</Link>
            <Link href="/legal/terms" className="hover:text-gray-700 transition-colors">利用規約</Link>
            <Link href="/legal/privacy" className="hover:text-gray-700 transition-colors">プライバシー</Link>
            <a href={`mailto:${LEGAL.email}`} className="hover:text-gray-700 transition-colors">お問い合わせ</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
