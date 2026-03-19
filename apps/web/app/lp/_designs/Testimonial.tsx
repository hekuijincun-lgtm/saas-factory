import { DesignProps, getIcon, PLANS } from './shared';
import { TrackingCTA } from '../_components/TrackingCTA';
import Link from 'next/link';
import { ArrowRight, Scissors, Star, CheckCircle2, ChevronDown, Zap, Quote } from 'lucide-react';

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < count ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
        />
      ))}
    </div>
  );
}

export function Testimonial({ d, t, vertical, signupUrl }: DesignProps) {
  const testimonials = [
    {
      name: '田中 美咲',
      role: `${d.label} オーナー`,
      quote: `導入してから予約管理のストレスがなくなりました。お客様からも「予約しやすくなった」と好評です。${d.label}を運営する全ての方におすすめします。`,
      rating: 5,
    },
    {
      name: '佐藤 健太',
      role: `${d.label} マネージャー`,
      quote: '電話対応の時間が激減して、施術に集中できるようになりました。スタッフ全員が使いやすいと言っています。',
      rating: 5,
    },
    {
      name: '鈴木 あゆみ',
      role: `${d.label} 代表`,
      quote: 'LINE連携が決め手でした。お客様の8割がLINEから予約してくれるようになり、リピート率が大幅に向上しました。',
      rating: 5,
    },
    {
      name: '山田 翔太',
      role: `${d.label} オーナー`,
      quote: '以前は紙の台帳で管理していましたが、もう戻れません。ダブルブッキングもゼロになりました。',
      rating: 4,
    },
    {
      name: '伊藤 さくら',
      role: `${d.label} 店長`,
      quote: '導入が本当に簡単で驚きました。ITに詳しくないスタッフでも5分で使い始められました。',
      rating: 5,
    },
    {
      name: '渡辺 大輔',
      role: `${d.label} 経営者`,
      quote: 'リマインド機能のおかげで無断キャンセルが80%減りました。月額以上の価値を感じています。',
      rating: 5,
    },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-center h-16">
          <Link href={`/lp/${vertical}`} className="flex items-center gap-2 font-bold text-xl">
            <Scissors className={`w-6 h-6 ${t.iconColor}`} />
            <span>{d.label}</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-600 ml-auto">
            <Link href="#problems" className="hover:text-gray-900 transition-colors">課題</Link>
            <Link href="#features" className="hover:text-gray-900 transition-colors">機能</Link>
            <Link href="#pricing" className="hover:text-gray-900 transition-colors">料金</Link>
            <Link href="#faq" className="hover:text-gray-900 transition-colors">FAQ</Link>
          </div>
          <div className="ml-auto md:ml-6">
            <TrackingCTA
              href={signupUrl}
              vertical={vertical}
              cta="nav_cta"
              className={`${t.primary} ${t.primaryHover} text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors`}
            >
              無料で始める
            </TrackingCTA>
          </div>
        </div>
      </nav>

      {/* ── Hero (split: text left, quote card right) ────────────────── */}
      <section className="bg-white py-20 sm:py-28 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: text */}
            <div>
              <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-semibold px-3 py-1 rounded-full mb-6`}>
                {d.badge}
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-6">
                {d.headline}
              </h1>
              <p className="text-lg sm:text-xl text-gray-500 mb-10 max-w-lg">
                {d.subheadline}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
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
                  className={`border ${t.primaryBorder} ${t.primaryText} px-8 py-3.5 rounded-xl text-lg font-semibold hover:${t.primaryLight} transition-colors`}
                >
                  機能を見る
                </TrackingCTA>
              </div>
            </div>

            {/* Right: featured quote card */}
            <div className={`relative ${t.primaryLight} rounded-3xl p-8 sm:p-10`}>
              <Quote className={`w-12 h-12 ${t.iconColor} opacity-30 mb-4`} />
              <p className="text-lg sm:text-xl font-medium text-gray-800 leading-relaxed italic mb-6">
                &ldquo;{testimonials[0].quote}&rdquo;
              </p>
              <Stars count={testimonials[0].rating} />
              <div className="mt-4 flex items-center gap-3">
                <div className={`w-10 h-10 ${t.primary} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                  {testimonials[0].name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-sm">{testimonials[0].name}</p>
                  <p className="text-gray-500 text-xs">{testimonials[0].role}</p>
                </div>
              </div>
              {/* Decorative dot */}
              <div className={`absolute -top-3 -right-3 w-6 h-6 ${t.primary} rounded-full opacity-40`} />
              <div className={`absolute -bottom-2 -left-2 w-4 h-4 ${t.primary} rounded-full opacity-20`} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Scrolling testimonial strip ───────────────────────────────── */}
      <section className={`${t.sectionBg} py-8`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex gap-4 overflow-x-auto pb-2">
            {testimonials.map((tm, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-72 bg-white rounded-xl p-5 shadow-sm border border-gray-100"
              >
                <Stars count={tm.rating} />
                <p className="text-sm text-gray-600 mt-2 line-clamp-3 italic">&ldquo;{tm.quote}&rdquo;</p>
                <p className="text-xs font-semibold mt-3">{tm.name}</p>
                <p className="text-xs text-gray-400">{tm.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Problems (with mini quotes) ──────────────────────────────── */}
      <section id="problems" className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">こんなお悩みありませんか？</h2>
            <p className="text-gray-500 text-lg">多くのサロンが抱える共通の課題</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {d.problems.map((p, i) => {
              const Icon = getIcon(p.icon);
              const relatedTestimonial = testimonials[i % testimonials.length];
              return (
                <div
                  key={i}
                  className={`bg-white border border-gray-200 rounded-2xl p-6 ${t.cardHover} transition-colors flex flex-col`}
                >
                  <div className={`w-12 h-12 ${t.iconBg} rounded-xl flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${t.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{p.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed mb-4">{p.desc}</p>
                  <div className={`mt-auto pt-4 border-t border-gray-100`}>
                    <p className="text-xs text-gray-400 italic line-clamp-2">&ldquo;{relatedTestimonial.quote.slice(0, 60)}...&rdquo;</p>
                    <p className="text-xs text-gray-400 mt-1">-- {relatedTestimonial.name}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Big Testimonials ─────────────────────────────────────────── */}
      <section className={`${t.sectionBg} py-20 sm:py-28`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-semibold px-3 py-1 rounded-full mb-4`}>
              VOICE
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">導入者の声</h2>
            <p className="text-gray-500 text-lg">実際にご利用いただいているオーナー様の声</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[testimonials[0], testimonials[2], testimonials[5]].map((tm, i) => (
              <div
                key={i}
                className={`bg-white rounded-2xl p-8 shadow-sm border border-gray-100 ${
                  i === 0 ? 'md:row-span-1 md:col-span-1' : ''
                } ${i === 0 ? 'ring-1 ' + t.planRing : ''}`}
              >
                <Quote className={`w-8 h-8 ${t.iconColor} opacity-30 mb-4`} />
                <Stars count={tm.rating} />
                <p className={`text-gray-700 leading-relaxed italic mt-4 mb-6 ${i === 0 ? 'text-lg' : 'text-sm'}`}>
                  &ldquo;{tm.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${t.primary} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                    {tm.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{tm.name}</p>
                    <p className="text-gray-500 text-xs">{tm.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section id="features" className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-semibold px-3 py-1 rounded-full mb-4`}>
              FEATURES
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">すべてを解決する機能</h2>
            <p className="text-gray-500 text-lg">シンプルなのに、必要な機能はすべて揃っています</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {d.features.map((f, i) => {
              const Icon = getIcon(f.icon);
              return (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow border border-gray-100"
                >
                  <div className={`w-12 h-12 ${t.iconBg} rounded-xl flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${t.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Mid-page large quote ─────────────────────────────────────── */}
      <section className={`${t.primaryLight} py-16 sm:py-20`}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <Quote className={`w-16 h-16 mx-auto ${t.iconColor} opacity-25 mb-6`} />
          <p className="text-xl sm:text-2xl font-medium text-gray-800 leading-relaxed italic mb-6">
            &ldquo;{testimonials[1].quote}&rdquo;
          </p>
          <Stars count={testimonials[1].rating} />
          <p className="font-semibold mt-4">{testimonials[1].name}</p>
          <p className="text-gray-500 text-sm">{testimonials[1].role}</p>
        </div>
      </section>

      {/* ── Flow ─────────────────────────────────────────────────────── */}
      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">かんたん導入ステップ</h2>
            <p className="text-gray-500 text-lg">最短5分で予約受付を開始</p>
          </div>
          <div className="space-y-8">
            {d.flow.map((s, i) => (
              <div key={i} className="flex gap-5 items-start">
                <div className={`flex-shrink-0 w-12 h-12 ${t.primary} text-white rounded-xl flex items-center justify-center font-bold text-lg`}>
                  {i + 1}
                </div>
                <div className="pt-1">
                  <h3 className="text-lg font-bold mb-1">{s.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
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

      {/* ── Pricing (with mini testimonial per plan) ──────────────────── */}
      <section id="pricing" className={`${t.sectionBg} py-20 sm:py-28`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">料金プラン</h2>
            <p className="text-gray-500 text-lg">すべてのプランに14日間の無料トライアル付き</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan, i) => {
              const planTestimonial = testimonials[i + 3];
              return (
                <div
                  key={i}
                  className={`relative bg-white rounded-2xl p-8 flex flex-col ${
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
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((f, fi) => (
                      <li key={fi} className="flex items-start gap-2 text-sm text-gray-600">
                        <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${t.iconColor}`} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {/* Mini testimonial */}
                  {planTestimonial && (
                    <div className={`mt-auto mb-6 ${t.primaryLight} rounded-lg p-3`}>
                      <p className="text-xs text-gray-600 italic line-clamp-2">&ldquo;{planTestimonial.quote.slice(0, 80)}...&rdquo;</p>
                      <p className="text-xs text-gray-400 mt-1">-- {planTestimonial.name}</p>
                    </div>
                  )}
                  <TrackingCTA
                    href={signupUrl}
                    vertical={vertical}
                    cta={`pricing_${plan.name.toLowerCase()}`}
                    className={`block text-center w-full py-3 rounded-xl font-semibold transition-colors mt-auto ${
                      plan.highlighted
                        ? `${t.primary} ${t.primaryHover} text-white`
                        : `border ${t.primaryBorder} ${t.primaryText} hover:${t.primaryLight}`
                    }`}
                  >
                    {plan.price === 'ご相談' ? 'お問い合わせ' : '無料トライアル'}
                  </TrackingCTA>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section id="faq" className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">よくある質問</h2>
          </div>
          <div className="space-y-3">
            {d.faqs.map((faq, i) => (
              <details key={i} className="group border border-gray-200 rounded-xl overflow-hidden">
                <summary className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer font-medium hover:bg-gray-50 transition-colors list-none [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <ChevronDown className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform flex-shrink-0" />
                </summary>
                <div className="px-6 pb-4 text-gray-500 text-sm leading-relaxed">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA (dark with testimonial) ────────────────────────── */}
      <section className={`${t.heroBg} text-white py-20 sm:py-28`}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          {/* Quote above CTA */}
          <Quote className="w-10 h-10 mx-auto mb-4 text-white/20" />
          <p className="text-lg text-gray-300 italic mb-2">
            &ldquo;{testimonials[4].quote}&rdquo;
          </p>
          <p className="text-sm text-gray-400 mb-10">
            -- {testimonials[4].name}、{testimonials[4].role}
          </p>

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
      </section>

      {/* ── Footer (dark) ────────────────────────────────────────────── */}
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
                <li><Link href="/terms" className="hover:text-white transition-colors">利用規約</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">プライバシーポリシー</Link></li>
                <li><Link href="/legal" className="hover:text-white transition-colors">特定商取引法に基づく表記</Link></li>
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
