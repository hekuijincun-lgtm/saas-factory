import { DesignProps, getIcon, LEGAL, PLANS } from './shared';
import { TrackingCTA } from '../_components/TrackingCTA';
import Link from 'next/link';
import { ArrowRight, Scissors, Star, CheckCircle2, ChevronDown, Zap } from 'lucide-react';
import { FadeInUp, FadeInLeft, FadeInRight, ScaleIn, StaggerContainer, StaggerItem } from '../_components/animations';

export function DarkHero({ d, t, vertical, signupUrl }: DesignProps) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href={`/lp/${vertical}`} className="flex items-center gap-2 font-bold text-xl">
            <Scissors className={`w-6 h-6 ${t.iconColor}`} />
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
            className={`${t.primary} ${t.primaryHover} text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors`}
          >
            無料で始める
          </TrackingCTA>
        </div>
      </nav>

      {/* ── Hero (dark) ────────────────────────────────────────────────── */}
      <section className={`relative overflow-hidden ${t.heroBg} text-white`}>
        {/* Glow orbs */}
        <div className={`absolute top-1/4 -left-32 w-96 h-96 rounded-full ${t.heroGlow1} blur-3xl`} />
        <div className={`absolute bottom-1/4 -right-32 w-96 h-96 rounded-full ${t.heroGlow2} blur-3xl`} />

        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-24 sm:py-32 lg:py-40 text-center">
          <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-semibold px-3 py-1 rounded-full mb-6`}>
            {d.badge}
          </span>
          <FadeInUp>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-6">
            {d.headline}
          </h1>
          </FadeInUp>
          <FadeInUp delay={0.15}>
          <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto mb-10">
            {d.subheadline}
          </p>
          </FadeInUp>
          <ScaleIn delay={0.3}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <TrackingCTA
              href={signupUrl}
              vertical={vertical}
              cta="hero_primary"
              className={`${t.primary} ${t.primaryHover} text-white px-8 py-3.5 rounded-xl text-lg font-semibold transition-colors flex items-center gap-2`}
            >
              無料で始める <ArrowRight className="w-5 h-5" />
            </TrackingCTA>
            <TrackingCTA
              href="#features"
              vertical={vertical}
              cta="hero_secondary"
              className="border border-white/20 text-white px-8 py-3.5 rounded-xl text-lg font-semibold hover:bg-white/10 transition-colors"
            >
              機能を見る
            </TrackingCTA>
          </div>
          </ScaleIn>
        </div>
      </section>

      {/* ── Problems ───────────────────────────────────────────────────── */}
      <section id="problems" className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">こんなお悩みありませんか？</h2>
            <p className="text-gray-500 text-lg">多くのサロンが抱える共通の課題</p>
          </div>
          <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {d.problems.map((p, i) => {
              const Icon = getIcon(p.icon);
              return (
                <StaggerItem key={i}>
                <div
                  className={`bg-white border border-gray-200 rounded-2xl p-6 ${t.cardHover} transition-colors`}
                >
                  <div className={`w-12 h-12 ${t.iconBg} rounded-xl flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${t.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{p.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{p.desc}</p>
                </div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="features" className="bg-gray-50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-semibold px-3 py-1 rounded-full mb-4`}>
              SOLUTION
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">すべてを解決する機能</h2>
            <p className="text-gray-500 text-lg">シンプルなのに、必要な機能はすべて揃っています</p>
          </div>
          <StaggerContainer stagger={0.1} className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {d.features.map((f, i) => {
              const Icon = getIcon(f.icon);
              return (
                <StaggerItem key={i}>
                <div
                  className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className={`w-12 h-12 ${t.iconBg} rounded-xl flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${t.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
                </div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </section>

      {/* ── Flow ───────────────────────────────────────────────────────── */}
      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">かんたん導入ステップ</h2>
            <p className="text-gray-500 text-lg">最短5分で予約受付を開始</p>
          </div>
          <div className="space-y-8">
            {d.flow.map((s, i) => (
              <FadeInLeft key={i} delay={i * 0.15}>
              <div className="flex gap-5 items-start">
                <div className={`flex-shrink-0 w-12 h-12 ${t.primary} text-white rounded-xl flex items-center justify-center font-bold text-lg`}>
                  {i + 1}
                </div>
                <div className="pt-1">
                  <h3 className="text-lg font-bold mb-1">{s.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
              </FadeInLeft>
            ))}
          </div>
          <div className="text-center mt-12">
            <TrackingCTA
              href={signupUrl}
              vertical={vertical}
              cta="flow_cta"
              className={`inline-flex items-center gap-2 ${t.primary} ${t.primaryHover} text-white px-8 py-3.5 rounded-xl text-lg font-semibold transition-colors`}
            >
              今すぐ始める <ArrowRight className="w-5 h-5" />
            </TrackingCTA>
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────── */}
      <section id="pricing" className="bg-gray-50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">料金プラン</h2>
            <p className="text-gray-500 text-lg">すべてのプランに14日間の無料トライアル付き</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan, i) => (
              <ScaleIn key={i} delay={i * 0.1}>
              <div
                className={`relative bg-white rounded-2xl p-8 ${
                  plan.highlighted
                    ? `ring-2 ${t.planRing} scale-105 shadow-lg`
                    : 'border border-gray-200 shadow-sm'
                } transition-transform`}
              >
                {plan.badge && (
                  <span className={`absolute -top-3 left-1/2 -translate-x-1/2 ${t.primary} text-white text-xs font-semibold px-3 py-1 rounded-full`}>
                    {plan.badge}
                  </span>
                )}
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <p className="text-gray-500 text-sm mb-4">{plan.description}</p>
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
                  className={`block text-center w-full py-3 rounded-xl font-semibold transition-colors ${
                    plan.highlighted
                      ? `${t.primary} ${t.primaryHover} text-white`
                      : `border ${t.primaryBorder} ${t.primaryText} hover:${t.primaryLight}`
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

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section id="faq" className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">よくある質問</h2>
          </div>
          <div className="space-y-3">
            {d.faqs.map((faq, i) => (
              <FadeInUp key={i} delay={i * 0.08}>
              <details className="group border border-gray-200 rounded-xl overflow-hidden">
                <summary className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer font-medium hover:bg-gray-50 transition-colors list-none [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <ChevronDown className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform flex-shrink-0" />
                </summary>
                <div className="px-6 pb-4 text-gray-500 text-sm leading-relaxed">
                  {faq.a}
                </div>
              </details>
              </FadeInUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className={`${t.heroBg} text-white py-20 sm:py-28`}>
        <ScaleIn>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <Zap className={`w-12 h-12 mx-auto mb-6 ${t.iconColor}`} />
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">今すぐ始めましょう</h2>
          <p className="text-gray-300 text-lg mb-10 max-w-xl mx-auto">
            14日間無料。クレジットカード不要。5分で設定完了。
          </p>
          <TrackingCTA
            href={signupUrl}
            vertical={vertical}
            cta="final_cta"
            className={`inline-flex items-center gap-2 ${t.primary} ${t.primaryHover} text-white px-10 py-4 rounded-xl text-lg font-semibold transition-colors`}
          >
            無料トライアルを始める <ArrowRight className="w-5 h-5" />
          </TrackingCTA>
        </div>
        </ScaleIn>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className={`${t.heroBg} border-t border-white/10 text-gray-400 py-12`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 text-white font-bold text-lg mb-3">
                <Scissors className={`w-5 h-5 ${t.iconColor}`} />
                {d.label}
              </div>
              <p className="text-sm leading-relaxed">
                {d.metaDesc}
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">製品</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="#features" className="hover:text-white transition-colors">機能</Link></li>
                <li><Link href="#pricing" className="hover:text-white transition-colors">料金</Link></li>
                <li><Link href="#faq" className="hover:text-white transition-colors">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">法的情報</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/legal/tokushoho" className="hover:text-white transition-colors">特商法表記</Link></li>
                <li><Link href="/legal/terms" className="hover:text-white transition-colors">利用規約</Link></li>
                <li><Link href="/legal/privacy" className="hover:text-white transition-colors">プライバシーポリシー</Link></li>
                <li><a href={`mailto:${LEGAL.email}`} className="hover:text-white transition-colors">お問い合わせ</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-white/10 text-sm text-center">
            &copy; {new Date().getFullYear()} {d.label}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
