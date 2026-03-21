import { DesignProps, getIcon, LEGAL, PLANS } from './shared';
import { TrackingCTA } from '../_components/TrackingCTA';
import Link from 'next/link';
import { ArrowRight, Scissors, Star, CheckCircle2, ChevronDown, Zap, Quote } from 'lucide-react';
import { FadeInUp, FadeInLeft, FadeInRight, ScaleIn, StaggerContainer, StaggerItem } from '../_components/animations';

/* ── Wave dividers ─────────────────────────────────────────────────── */

function WaveA({ fillClass }: { fillClass: string }) {
  return (
    <div className="w-full overflow-hidden leading-none -mb-px">
      <svg viewBox="0 0 1440 100" className="w-full h-16 sm:h-24" preserveAspectRatio="none">
        <path d="M0,40 C360,100 1080,0 1440,60 L1440,100 L0,100 Z" className={fillClass} />
      </svg>
    </div>
  );
}

function WaveB({ fillClass }: { fillClass: string }) {
  return (
    <div className="w-full overflow-hidden leading-none -mb-px">
      <svg viewBox="0 0 1440 100" className="w-full h-16 sm:h-24" preserveAspectRatio="none">
        <path d="M0,80 C240,20 480,90 720,40 C960,-10 1200,70 1440,30 L1440,100 L0,100 Z" className={fillClass} />
      </svg>
    </div>
  );
}

function WaveC({ fillClass }: { fillClass: string }) {
  return (
    <div className="w-full overflow-hidden leading-none -mb-px">
      <svg viewBox="0 0 1440 100" className="w-full h-16 sm:h-24" preserveAspectRatio="none">
        <path d="M0,20 C180,80 360,10 540,50 C720,90 900,20 1080,60 C1260,100 1350,30 1440,50 L1440,100 L0,100 Z" className={fillClass} />
      </svg>
    </div>
  );
}

function WaveD({ fillClass }: { fillClass: string }) {
  return (
    <div className="w-full overflow-hidden leading-none -mb-px">
      <svg viewBox="0 0 1440 100" className="w-full h-16 sm:h-24" preserveAspectRatio="none">
        <path d="M0,60 C200,10 400,90 600,40 C800,-10 1000,80 1200,30 C1350,5 1400,50 1440,40 L1440,100 L0,100 Z" className={fillClass} />
      </svg>
    </div>
  );
}

function WaveE({ fillClass }: { fillClass: string }) {
  return (
    <div className="w-full overflow-hidden leading-none -mb-px">
      <svg viewBox="0 0 1440 100" className="w-full h-16 sm:h-24" preserveAspectRatio="none">
        <path d="M0,50 C360,0 720,100 1080,30 C1260,-10 1380,60 1440,45 L1440,100 L0,100 Z" className={fillClass} />
      </svg>
    </div>
  );
}

export function GradientWave({ d, t, vertical, signupUrl }: DesignProps) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* ── Navbar (floating pill) ────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 px-4 pt-4">
        <div className="mx-auto max-w-5xl bg-white/90 backdrop-blur rounded-full shadow-lg border border-gray-100 px-6 py-3 flex items-center justify-between">
          <Link href={`/lp/${vertical}`} className="flex items-center gap-2 font-bold text-lg">
            <Scissors className={`w-5 h-5 ${t.iconColor}`} />
            <span>{d.label}</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-gray-600">
            <Link href="#problems" className="hover:text-gray-900 transition-colors">課題</Link>
            <Link href="#features" className="hover:text-gray-900 transition-colors">機能</Link>
            <Link href="#pricing" className="hover:text-gray-900 transition-colors">料金</Link>
            <Link href="#faq" className="hover:text-gray-900 transition-colors">FAQ</Link>
          </div>
          <TrackingCTA
            href={signupUrl}
            vertical={vertical}
            cta="nav_cta"
            className={`${t.primary} ${t.primaryHover} text-white px-5 py-2 rounded-full text-sm font-medium transition-colors shadow-md`}
          >
            無料で始める
          </TrackingCTA>
        </div>
      </nav>

      {/* ── Hero (gradient, rounded container) ───────────────────────── */}
      <section className="px-4 pt-6 pb-0">
        <div className={`mx-auto max-w-7xl bg-gradient-to-br ${t.heroGradient} rounded-3xl overflow-hidden relative`}>
          {/* Decorative circles */}
          <div className="absolute top-10 right-10 w-64 h-64 bg-white/5 rounded-full blur-2xl" />
          <div className="absolute bottom-10 left-10 w-48 h-48 bg-white/5 rounded-full blur-2xl" />

          <div className="relative px-8 sm:px-12 lg:px-16 py-20 sm:py-28 lg:py-32 text-center text-white">
            <span className="inline-block bg-white/20 backdrop-blur text-white text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
              {d.badge}
            </span>
            <FadeInUp>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-6">
              {d.headline}
            </h1>
            </FadeInUp>
            <FadeInUp delay={0.15}>
            <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto mb-10">
              {d.subheadline}
            </p>
            </FadeInUp>
            <ScaleIn delay={0.3}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <TrackingCTA
                href={signupUrl}
                vertical={vertical}
                cta="hero_primary"
                className="bg-white text-gray-900 px-8 py-3.5 rounded-full text-lg font-semibold shadow-lg hover:shadow-xl transition-shadow flex items-center gap-2"
              >
                無料で始める <ArrowRight className="w-5 h-5" />
              </TrackingCTA>
              <TrackingCTA
                href="#features"
                vertical={vertical}
                cta="hero_secondary"
                className="border-2 border-white/40 text-white px-8 py-3.5 rounded-full text-lg font-semibold hover:bg-white/10 transition-colors"
              >
                機能を見る
              </TrackingCTA>
            </div>
            </ScaleIn>
          </div>
        </div>
      </section>

      {/* Wave: gradient → white */}
      <WaveA fillClass="fill-white" />

      {/* ── Problems ─────────────────────────────────────────────────── */}
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
                  className={`bg-white border-l-4 ${t.primaryBorder} rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow`}
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

      {/* Wave: white → colored */}
      <WaveB fillClass={t.sectionBg} />

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section id="features" className={`${t.sectionBg} py-20 sm:py-28`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-semibold px-4 py-1.5 rounded-full mb-4`}>
              FEATURES
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
                  className="bg-white rounded-3xl p-6 shadow-lg hover:shadow-xl transition-shadow"
                >
                  <div className={`w-14 h-14 ${t.iconBg} rounded-full flex items-center justify-center mb-4`}>
                    <Icon className={`w-7 h-7 ${t.iconColor}`} />
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

      {/* Wave: colored → white */}
      <WaveC fillClass="fill-white" />

      {/* ── Flow (connected cards) ───────────────────────────────────── */}
      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">かんたん導入ステップ</h2>
            <p className="text-gray-500 text-lg">最短5分で予約受付を開始</p>
          </div>
          <div className="flex flex-col md:flex-row items-stretch gap-0">
            {d.flow.map((s, i) => (
              <FadeInLeft key={i} delay={i * 0.15}>
              <div className="flex-1 flex flex-col md:flex-row items-center">
                <div className={`bg-white rounded-3xl p-6 shadow-md border border-gray-100 text-center flex-1`}>
                  <div className={`w-12 h-12 ${t.primary} text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-4`}>
                    {i + 1}
                  </div>
                  <h3 className="text-lg font-bold mb-2">{s.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
                </div>
                {/* Connector (dotted line) */}
                {i < d.flow.length - 1 && (
                  <div className="flex items-center justify-center py-3 md:py-0 md:px-2">
                    <div className={`w-0.5 h-8 md:w-8 md:h-0.5 border-dashed ${t.primaryBorder} ${
                      i < d.flow.length - 1 ? 'border-l-2 md:border-l-0 md:border-t-2' : ''
                    }`} />
                    <ArrowRight className={`hidden md:block w-4 h-4 ${t.iconColor} -ml-1`} />
                  </div>
                )}
              </div>
              </FadeInLeft>
            ))}
          </div>
          <div className="text-center mt-12">
            <TrackingCTA
              href={signupUrl}
              vertical={vertical}
              cta="flow_cta"
              className={`inline-flex items-center gap-2 ${t.primary} ${t.primaryHover} text-white px-8 py-3.5 rounded-full text-lg font-semibold transition-colors shadow-lg`}
            >
              今すぐ始める <ArrowRight className="w-5 h-5" />
            </TrackingCTA>
          </div>
        </div>
      </section>

      {/* Wave: white → colored */}
      <WaveD fillClass={t.sectionBg} />

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing" className={`${t.sectionBg} py-20 sm:py-28`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">料金プラン</h2>
            <p className="text-gray-500 text-lg">すべてのプランに14日間の無料トライアル付き</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan, i) => (
              <ScaleIn key={i} delay={i * 0.1}>
              <div
                className={`relative bg-white rounded-3xl p-8 ${
                  plan.highlighted
                    ? `ring-2 ${t.planRing} scale-105 shadow-xl`
                    : 'shadow-lg'
                } transition-transform`}
              >
                {plan.badge && (
                  <span className={`absolute -top-3 left-1/2 -translate-x-1/2 ${t.primary} text-white text-xs font-semibold px-4 py-1 rounded-full shadow-md`}>
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
                  className={`block text-center w-full py-3 rounded-full font-semibold transition-colors shadow-sm ${
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

      {/* Wave: colored → white */}
      <WaveE fillClass="fill-white" />

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section id="faq" className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">よくある質問</h2>
          </div>
          <div className="space-y-4">
            {d.faqs.map((faq, i) => (
              <FadeInUp key={i} delay={i * 0.08}>
              <details className="group bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer font-medium hover:bg-gray-50 transition-colors list-none [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <ChevronDown className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform flex-shrink-0" />
                </summary>
                <div className="px-6 pb-5 text-gray-500 text-sm leading-relaxed">
                  {faq.a}
                </div>
              </details>
              </FadeInUp>
            ))}
          </div>
        </div>
      </section>

      {/* Wave: white → gradient */}
      <div className="w-full overflow-hidden leading-none -mb-px">
        <svg viewBox="0 0 1440 100" className="w-full h-16 sm:h-24" preserveAspectRatio="none">
          <defs>
            <linearGradient id="wave-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" className="[stop-color:var(--tw-gradient-from)]" style={{ stopColor: '#7c3aed' }} />
              <stop offset="100%" className="[stop-color:var(--tw-gradient-to)]" style={{ stopColor: '#db2777' }} />
            </linearGradient>
          </defs>
          <path d="M0,30 C240,90 480,10 720,50 C960,90 1200,20 1440,60 L1440,100 L0,100 Z" fill="url(#wave-grad)" className="opacity-90" />
        </svg>
      </div>

      {/* ── Final CTA (gradient) ─────────────────────────────────────── */}
      <section className={`bg-gradient-to-br ${t.heroGradient} text-white py-20 sm:py-28 -mt-px`}>
        <ScaleIn>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <Zap className="w-12 h-12 mx-auto mb-6 text-white/60" />
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">今すぐ始めましょう</h2>
          <p className="text-white/80 text-lg mb-10 max-w-xl mx-auto">
            14日間無料。クレジットカード不要。5分で設定完了。
          </p>
          <TrackingCTA
            href={signupUrl}
            vertical={vertical}
            cta="final_cta"
            className="inline-flex items-center gap-2 bg-white text-gray-900 px-10 py-4 rounded-full text-lg font-semibold shadow-lg hover:shadow-xl transition-shadow"
          >
            無料トライアルを始める <ArrowRight className="w-5 h-5" />
          </TrackingCTA>
        </div>
        </ScaleIn>
      </section>

      {/* ── Footer (gradient, rounded top) ────────────────────────────── */}
      <footer className={`bg-gradient-to-br ${t.heroGradient} border-t border-white/10 text-white/70 py-12 -mt-px`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 text-white font-bold text-lg mb-3">
                <Scissors className="w-5 h-5 text-white/80" />
                {d.label}
              </div>
              <p className="text-sm leading-relaxed text-white/60">
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
          <div className="mt-10 pt-6 border-t border-white/10 text-sm text-center text-white/50">
            &copy; {new Date().getFullYear()} {d.label}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
