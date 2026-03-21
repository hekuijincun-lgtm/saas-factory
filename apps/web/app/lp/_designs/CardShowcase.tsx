import { DesignProps, getIcon, LEGAL, PLANS } from './shared';
import { TrackingCTA } from '../_components/TrackingCTA';
import Link from 'next/link';
import { ArrowRight, Scissors, Star, CheckCircle2, ChevronDown, Zap, X } from 'lucide-react';
import { FadeInUp, FadeInLeft, FadeInRight, ScaleIn, StaggerContainer, StaggerItem } from '../_components/animations';

export function CardShowcase({ d, t, vertical, signupUrl }: DesignProps) {
  return (
    <div className="min-h-screen font-sans antialiased">
      {/* ── Navbar ─────────────────────────────────────────────────── */}
      <nav className={`${t.heroBg} sticky top-0 z-50`}>
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className={`w-8 h-8 ${t.primary} rounded-full flex items-center justify-center`}>
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-lg">LumiBook</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-gray-300">
            <Link href="#features" className="hover:text-white transition-colors">機能</Link>
            <Link href="#pricing" className="hover:text-white transition-colors">料金</Link>
            <Link href="#faq" className="hover:text-white transition-colors">FAQ</Link>
          </div>
          <TrackingCTA
            href={signupUrl}
            vertical={vertical}
            cta="nav_cta"
            className={`${t.primary} ${t.primaryHover} text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors`}
          >
            無料で始める
          </TrackingCTA>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className={`relative overflow-hidden bg-gradient-to-br ${t.heroGradient} py-24 md:py-32`}>
        <div className="mx-auto max-w-7xl px-6 grid md:grid-cols-2 gap-12 items-center">
          {/* Left */}
          <div>
            <span className="inline-block bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full mb-6 backdrop-blur-sm">
              {d.badge}
            </span>
            <FadeInUp>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
              {d.headline}
            </h1>
            </FadeInUp>
            <FadeInUp delay={0.15}>
            <p className="text-lg text-white/80 mb-8 max-w-lg">
              {d.subheadline}
            </p>
            </FadeInUp>
            <ScaleIn delay={0.3}>
            <div className="flex flex-col sm:flex-row gap-4">
              <TrackingCTA
                href={signupUrl}
                vertical={vertical}
                cta="hero_primary"
                className="inline-flex items-center justify-center gap-2 bg-white text-gray-900 font-bold px-8 py-4 rounded-xl hover:bg-gray-100 transition-colors text-lg"
              >
                無料で始める <ArrowRight className="w-5 h-5" />
              </TrackingCTA>
              <TrackingCTA
                href="#features"
                vertical={vertical}
                cta="hero_secondary"
                className="inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/10 transition-colors text-lg"
              >
                機能を見る
              </TrackingCTA>
            </div>
            </ScaleIn>
          </div>
          {/* Right — Bento preview cards */}
          <div className="hidden md:grid grid-cols-2 gap-4">
            <div className="bg-white/15 backdrop-blur-md rounded-2xl p-5 border border-white/20">
              <p className="text-white/60 text-xs font-medium mb-1">今月の予約数</p>
              <p className="text-white text-3xl font-bold">148</p>
              <p className="text-emerald-300 text-sm font-semibold mt-1">+24% 前月比</p>
            </div>
            <div className="bg-white/15 backdrop-blur-md rounded-2xl p-5 border border-white/20">
              <p className="text-white/60 text-xs font-medium mb-1">リピート率</p>
              <p className="text-white text-3xl font-bold">85%</p>
              <div className="mt-2 h-2 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white/80 rounded-full" style={{ width: '85%' }} />
              </div>
            </div>
            <div className="bg-white/15 backdrop-blur-md rounded-2xl p-5 border border-white/20">
              <p className="text-white/60 text-xs font-medium mb-1">無断キャンセル率</p>
              <p className="text-white text-3xl font-bold">2.1%</p>
              <p className="text-emerald-300 text-sm font-semibold mt-1">-67% 削減</p>
            </div>
            <div className="bg-white/15 backdrop-blur-md rounded-2xl p-5 border border-white/20">
              <p className="text-white/60 text-xs font-medium mb-1">LINE友だち</p>
              <p className="text-white text-3xl font-bold">1,240</p>
              <p className="text-emerald-300 text-sm font-semibold mt-1">+38 今週</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Problems — Bento grid ──────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-bold px-3 py-1 rounded-full mb-4`}>
              こんなお悩みありませんか？
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
              {d.label}の現場で起きている課題
            </h2>
          </div>
          <StaggerContainer className="grid md:grid-cols-4 gap-5">
            {d.problems.map((p, i) => {
              const Icon = getIcon(p.icon);
              const isWide = i === 2 || i === 5;
              return (
                <StaggerItem
                  key={i}
                  className={`${isWide ? 'md:col-span-2' : 'md:col-span-1'} group relative rounded-2xl border border-gray-200 ${t.cardHover} p-6 transition-all hover:shadow-lg ${i % 2 === 0 ? '' : `border-l-4 ${t.primaryBorder}`}`}
                >
                  <div className={`w-12 h-12 ${t.iconBg} rounded-xl flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${t.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{p.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{p.desc}</p>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </section>

      {/* ── Features — 2x3 bento grid ─────────────────────────────── */}
      <section id="features" className={`py-20 md:py-28 ${t.sectionBg}`}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-bold px-3 py-1 rounded-full mb-4`}>
              機能紹介
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
              すべてを解決する機能
            </h2>
          </div>
          <StaggerContainer stagger={0.1} className="grid md:grid-cols-3 gap-5">
            {d.features.map((f, i) => {
              const Icon = getIcon(f.icon);
              const isHero = i === 0;
              return (
                <StaggerItem
                  key={i}
                  className={`${isHero ? 'md:col-span-2 md:row-span-2' : ''} bg-white rounded-2xl border border-gray-200 ${t.cardHover} p-8 transition-all hover:shadow-lg`}
                >
                  <div className={`${isHero ? 'w-16 h-16' : 'w-12 h-12'} ${t.iconBg} rounded-xl flex items-center justify-center mb-5`}>
                    <Icon className={`${isHero ? 'w-8 h-8' : 'w-6 h-6'} ${t.iconColor}`} />
                  </div>
                  <h3 className={`${isHero ? 'text-2xl' : 'text-lg'} font-bold text-gray-900 mb-3`}>{f.title}</h3>
                  <p className={`text-gray-600 leading-relaxed ${isHero ? 'text-base' : 'text-sm'}`}>{f.desc}</p>
                  {isHero && (
                    <TrackingCTA
                      href={signupUrl}
                      vertical={vertical}
                      cta="feature_hero_cta"
                      className={`inline-flex items-center gap-2 ${t.primaryText} font-semibold mt-6 text-sm hover:underline`}
                    >
                      詳しく見る <ArrowRight className="w-4 h-4" />
                    </TrackingCTA>
                  )}
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </section>

      {/* ── Flow — horizontal cards with arrows ────────────────────── */}
      <section className="py-20 md:py-28 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-bold px-3 py-1 rounded-full mb-4`}>
              かんたん導入
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
              最短5分で始められます
            </h2>
          </div>
          <div className="flex flex-col md:flex-row items-stretch gap-4">
            {d.flow.map((s, i) => (
              <FadeInLeft key={i} delay={i * 0.15} className="flex items-center gap-4 flex-1">
                <div className={`flex-1 bg-gray-50 rounded-2xl p-6 border border-gray-200 ${t.cardHover} transition-all hover:shadow-lg`}>
                  <div className={`w-10 h-10 ${t.primary} rounded-xl flex items-center justify-center text-white font-bold text-sm mb-4`}>
                    {s.step}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{s.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{s.desc}</p>
                </div>
                {i < d.flow.length - 1 && (
                  <ArrowRight className={`hidden md:block w-6 h-6 ${t.iconColor} flex-shrink-0`} />
                )}
              </FadeInLeft>
            ))}
          </div>
          <div className="text-center mt-12">
            <TrackingCTA
              href={signupUrl}
              vertical={vertical}
              cta="flow_cta"
              className={`inline-flex items-center gap-2 ${t.primary} ${t.primaryHover} text-white font-bold px-8 py-4 rounded-xl transition-colors text-lg`}
            >
              無料で始める <ArrowRight className="w-5 h-5" />
            </TrackingCTA>
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────── */}
      <section id="pricing" className={`py-20 md:py-28 ${t.sectionBg}`}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-bold px-3 py-1 rounded-full mb-4`}>
              料金プラン
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
              シンプルな料金体系
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <ScaleIn key={i} delay={i * 0.1}>
              <div
                className={`bg-white rounded-2xl overflow-hidden border ${plan.highlighted ? `${t.planBorder} ring-2 ${t.planRing}` : 'border-gray-200'} transition-all hover:shadow-lg`}
              >
                {/* Top color strip */}
                <div className={`h-2 ${plan.highlighted ? t.primary : 'bg-gray-200'}`} />
                <div className="p-8">
                  {plan.badge && (
                    <span className={`inline-block ${t.primary} text-white text-xs font-bold px-3 py-1 rounded-full mb-4`}>
                      {plan.badge}
                    </span>
                  )}
                  <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                  <p className="text-gray-500 text-sm mt-1 mb-4">{plan.description}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-extrabold text-gray-900">{plan.price}</span>
                    <span className="text-gray-500 text-sm">{plan.period}</span>
                  </div>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feat, fi) => (
                      <li key={fi} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle2 className={`w-5 h-5 ${t.iconColor} flex-shrink-0 mt-0.5`} />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <TrackingCTA
                    href={signupUrl}
                    vertical={vertical}
                    cta={`pricing_${plan.name.toLowerCase()}`}
                    className={`block text-center w-full py-3 rounded-xl font-bold transition-colors ${plan.highlighted ? `${t.primary} ${t.primaryHover} text-white` : `bg-gray-100 hover:bg-gray-200 text-gray-900`}`}
                  >
                    {plan.price === 'ご相談' ? 'お問い合わせ' : '無料トライアル'}
                  </TrackingCTA>
                </div>
              </div>
              </ScaleIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ — card-based 2-column ──────────────────────────────── */}
      <section id="faq" className="py-20 md:py-28 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-bold px-3 py-1 rounded-full mb-4`}>
              FAQ
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
              よくあるご質問
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {d.faqs.map((faq, i) => (
              <FadeInUp key={i} delay={i * 0.08}>
              <div className={`bg-gray-50 rounded-2xl p-6 border border-gray-200 ${t.cardHover} transition-all hover:shadow-md`}>
                <h3 className="flex items-start gap-3 text-base font-bold text-gray-900 mb-3">
                  <span className={`flex-shrink-0 w-7 h-7 ${t.primary} text-white rounded-lg flex items-center justify-center text-xs font-bold`}>Q</span>
                  {faq.q}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed pl-10">{faq.a}</p>
              </div>
              </FadeInUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────── */}
      <section className={`bg-gradient-to-br ${t.heroGradient} py-20 md:py-28`}>
        <ScaleIn>
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-6">
            今すぐ{d.label}の予約管理を変えよう
          </h2>
          <p className="text-white/80 text-lg mb-10">
            初期費用ゼロ、クレジットカード不要。5分で導入できます。
          </p>
          <TrackingCTA
            href={signupUrl}
            vertical={vertical}
            cta="final_cta"
            className="inline-flex items-center gap-2 bg-white text-gray-900 font-bold px-10 py-4 rounded-xl hover:bg-gray-100 transition-colors text-lg"
          >
            無料で始める <ArrowRight className="w-5 h-5" />
          </TrackingCTA>
        </div>
        </ScaleIn>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className={`${t.heroBg} py-12`}>
        <div className="mx-auto max-w-7xl px-6 grid md:grid-cols-2 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-8 h-8 ${t.primary} rounded-full flex items-center justify-center`}>
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-bold text-lg">LumiBook</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed max-w-md">
              {d.label}向け予約管理システム。LINE予約、AI接客、リピート促進をオールインワンで。
            </p>
          </div>
          <div className="flex flex-col md:items-end gap-4">
            <div className="flex flex-wrap gap-6 text-sm text-gray-400">
              <Link href="/legal/tokushoho" className="hover:text-white transition-colors">特商法表記</Link>
              <Link href="/legal/terms" className="hover:text-white transition-colors">利用規約</Link>
              <Link href="/legal/privacy" className="hover:text-white transition-colors">プライバシーポリシー</Link>
              <a href={`mailto:${LEGAL.email}`} className="hover:text-white transition-colors">お問い合わせ</a>
              <Link href={`/lp/${vertical}/line-setup`} className="hover:text-white transition-colors">LINE連携ガイド</Link>
            </div>
            <p className="text-gray-500 text-xs">&copy; {new Date().getFullYear()} LumiBook. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
