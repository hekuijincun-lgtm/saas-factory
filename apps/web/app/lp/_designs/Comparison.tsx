import { DesignProps, getIcon, PLANS } from './shared';
import { TrackingCTA } from '../_components/TrackingCTA';
import Link from 'next/link';
import { ArrowRight, Scissors, Star, CheckCircle2, ChevronDown, Zap, X } from 'lucide-react';

const COMPARE_ROWS = [
  { label: 'LINE予約',      lumi: true,  phone: false, other: false },
  { label: 'AI自動応答',     lumi: true,  phone: false, other: false },
  { label: '前日リマインド',  lumi: true,  phone: false, other: true  },
  { label: 'リピート促進',   lumi: true,  phone: false, other: false },
  { label: 'KPI分析',       lumi: true,  phone: false, other: true  },
  { label: '月額料金',       lumiText: '¥3,980〜', phoneText: '人件費', otherText: '¥15,000〜' },
] as const;

export function Comparison({ d, t, vertical, signupUrl }: DesignProps) {
  return (
    <div className="min-h-screen font-sans antialiased bg-white">
      {/* ── Navbar ─────────────────────────────────────────────────── */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className={`w-8 h-8 ${t.primary} rounded-lg flex items-center justify-center`}>
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-gray-900 font-bold text-lg">LumiBook</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-gray-600">
            <Link href="#compare" className="hover:text-gray-900 transition-colors">他社比較</Link>
            <Link href="#features" className="hover:text-gray-900 transition-colors">機能</Link>
            <Link href="#pricing" className="hover:text-gray-900 transition-colors">料金</Link>
            <Link href="#faq" className="hover:text-gray-900 transition-colors">FAQ</Link>
          </div>
          <TrackingCTA
            href={signupUrl}
            vertical={vertical}
            cta="nav_cta"
            className={`${t.primary} ${t.primaryHover} text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors`}
          >
            無料で始める
          </TrackingCTA>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-white">
        <div className="mx-auto max-w-7xl px-6 grid md:grid-cols-2 gap-12 items-center">
          {/* Left */}
          <div>
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-bold px-3 py-1 rounded-full mb-6`}>
              {d.badge}
            </span>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
              {d.headline}
            </h1>
            <p className="text-lg text-gray-600 mb-8 max-w-lg">
              {d.subheadline}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <TrackingCTA
                href={signupUrl}
                vertical={vertical}
                cta="hero_primary"
                className={`inline-flex items-center justify-center gap-2 ${t.primary} ${t.primaryHover} text-white font-bold px-8 py-4 rounded-lg transition-colors text-lg`}
              >
                無料で始める <ArrowRight className="w-5 h-5" />
              </TrackingCTA>
              <TrackingCTA
                href="#compare"
                vertical={vertical}
                cta="hero_secondary"
                className="inline-flex items-center justify-center gap-2 border-2 border-gray-300 text-gray-700 font-semibold px-8 py-4 rounded-lg hover:border-gray-400 transition-colors text-lg"
              >
                他社と比較する
              </TrackingCTA>
            </div>
          </div>
          {/* Right — Mini comparison preview */}
          <div className="hidden md:block">
            <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 shadow-sm">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">比較プレビュー</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-gray-500 font-medium" />
                    <th className={`text-center py-2 font-bold ${t.primaryText}`}>LumiBook</th>
                    <th className="text-center py-2 text-gray-400 font-medium">電話予約</th>
                    <th className="text-center py-2 text-gray-400 font-medium">他社ツール</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2.5 text-gray-700 font-medium">{row.label}</td>
                      <td className="py-2.5 text-center">
                        {'lumi' in row
                          ? row.lumi
                            ? <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                            : <X className="w-5 h-5 text-gray-300 mx-auto" />
                          : null}
                      </td>
                      <td className="py-2.5 text-center">
                        {'phone' in row
                          ? row.phone
                            ? <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                            : <X className="w-5 h-5 text-gray-300 mx-auto" />
                          : null}
                      </td>
                      <td className="py-2.5 text-center">
                        {'other' in row
                          ? row.other
                            ? <span className="text-amber-500 font-medium">△</span>
                            : <X className="w-5 h-5 text-gray-300 mx-auto" />
                          : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={`text-xs ${t.primaryText} font-semibold mt-3 text-center`}>
                詳しい比較は下へ ↓
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── BIG Comparison Table ────────────────────────────────────── */}
      <section id="compare" className={`py-20 md:py-28 ${t.sectionBg}`}>
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center mb-14">
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-bold px-3 py-1 rounded-full mb-4`}>
              選ばれる理由
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
              他社との徹底比較
            </h2>
            <p className="text-gray-600 mt-4 max-w-xl mx-auto">
              LumiBookが選ばれる理由を、従来の方法や他社ツールと比較してご覧ください。
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b-2 ${t.primaryBorder}`}>
                    <th className="text-left p-4 md:p-5 text-gray-500 font-medium w-1/4">機能</th>
                    <th className={`text-center p-4 md:p-5 font-bold ${t.primaryText} w-1/4`}>
                      <div className="flex flex-col items-center gap-1">
                        <div className={`w-8 h-8 ${t.primary} rounded-lg flex items-center justify-center mb-1`}>
                          <Zap className="w-4 h-4 text-white" />
                        </div>
                        LumiBook
                      </div>
                    </th>
                    <th className="text-center p-4 md:p-5 text-gray-400 font-medium w-1/4">電話予約</th>
                    <th className="text-center p-4 md:p-5 text-gray-400 font-medium w-1/4">他社ツール</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row, i) => {
                    const isLast = i === COMPARE_ROWS.length - 1;
                    return (
                      <tr key={i} className={`${!isLast ? 'border-b border-gray-100' : ''} ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                        <td className="p-4 md:p-5 text-gray-800 font-semibold">{row.label}</td>
                        {'lumi' in row ? (
                          <>
                            <td className="p-4 md:p-5 text-center">
                              {row.lumi
                                ? <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                                : <X className="w-6 h-6 text-gray-300 mx-auto" />}
                            </td>
                            <td className="p-4 md:p-5 text-center">
                              {row.phone
                                ? <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                                : <X className="w-6 h-6 text-gray-300 mx-auto" />}
                            </td>
                            <td className="p-4 md:p-5 text-center">
                              {row.other
                                ? <span className="text-amber-500 font-bold text-lg">△</span>
                                : <X className="w-6 h-6 text-gray-300 mx-auto" />}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className={`p-4 md:p-5 text-center font-bold ${t.primaryText}`}>{row.lumiText}</td>
                            <td className="p-4 md:p-5 text-center text-gray-500">{row.phoneText}</td>
                            <td className="p-4 md:p-5 text-center text-gray-500">{row.otherText}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="text-center mt-8">
            <TrackingCTA
              href={signupUrl}
              vertical={vertical}
              cta="compare_cta"
              className={`inline-flex items-center gap-2 ${t.primary} ${t.primaryHover} text-white font-bold px-8 py-4 rounded-lg transition-colors`}
            >
              LumiBookを無料で試す <ArrowRight className="w-5 h-5" />
            </TrackingCTA>
          </div>
        </div>
      </section>

      {/* ── Problems — numbered BEFORE list ─────────────────────────── */}
      <section className="py-20 md:py-28 bg-white">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center mb-14">
            <span className={`inline-block bg-red-50 text-red-600 text-xs font-bold px-3 py-1 rounded-full mb-4`}>
              BEFORE &#8212; 導入前の課題
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
              こんなお悩みありませんか？
            </h2>
          </div>
          <div className="space-y-4">
            {d.problems.map((p, i) => {
              const Icon = getIcon(p.icon);
              return (
                <div
                  key={i}
                  className="flex items-start gap-5 bg-gray-50 rounded-xl border border-gray-200 p-6 hover:border-gray-300 transition-colors"
                >
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <span className="text-red-600 font-extrabold text-sm">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded">BEFORE</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{p.title}</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">{p.desc}</p>
                  </div>
                  <div className="flex-shrink-0 hidden sm:flex w-10 h-10 bg-gray-100 rounded-lg items-center justify-center">
                    <Icon className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Features — AFTER transformation cards ──────────────────── */}
      <section id="features" className={`py-20 md:py-28 ${t.sectionBg}`}>
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-14">
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-bold px-3 py-1 rounded-full mb-4`}>
              AFTER &#8212; 導入後の変化
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
              LumiBookで実現できること
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {d.features.map((f, i) => {
              const Icon = getIcon(f.icon);
              return (
                <div
                  key={i}
                  className={`bg-white rounded-xl border border-gray-200 ${t.cardHover} p-7 transition-all hover:shadow-lg`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-11 h-11 ${t.iconBg} rounded-xl flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${t.iconColor}`} />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider">
                      <span className="text-red-400 bg-red-50 px-2 py-0.5 rounded">BEFORE</span>
                      <ArrowRight className="w-3 h-3 text-gray-400" />
                      <span className={`${t.primaryText} ${t.primaryLight} px-2 py-0.5 rounded`}>AFTER</span>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{f.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Flow — horizontal stepper ──────────────────────────────── */}
      <section className="py-20 md:py-28 bg-white">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-14">
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-bold px-3 py-1 rounded-full mb-4`}>
              導入ステップ
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
              かんたん3ステップで導入
            </h2>
          </div>
          <div className="relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-8 left-0 right-0 h-0.5 bg-gray-200" />
            <div className="grid md:grid-cols-3 gap-8 md:gap-12 relative">
              {d.flow.map((s, i) => (
                <div key={i} className="text-center">
                  <div className={`relative mx-auto w-16 h-16 ${t.primary} rounded-full flex items-center justify-center text-white font-extrabold text-xl mb-6 shadow-lg z-10`}>
                    {s.step}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{s.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="text-center mt-12">
            <TrackingCTA
              href={signupUrl}
              vertical={vertical}
              cta="flow_cta"
              className={`inline-flex items-center gap-2 ${t.primary} ${t.primaryHover} text-white font-bold px-8 py-4 rounded-lg transition-colors text-lg`}
            >
              今すぐ無料で始める <ArrowRight className="w-5 h-5" />
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
              他社と比べてください
            </h2>
            <p className="text-gray-600 mt-4 max-w-xl mx-auto">
              高額な月額費用は不要。必要な機能を、手の届く価格で。
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <div
                key={i}
                className={`bg-white rounded-xl border ${plan.highlighted ? `${t.planBorder} ring-2 ${t.planRing}` : 'border-gray-200'} p-8 transition-all hover:shadow-lg relative`}
              >
                {plan.badge && (
                  <span className={`absolute -top-3 left-1/2 -translate-x-1/2 ${t.primary} text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap`}>
                    {plan.badge}
                  </span>
                )}
                <h3 className="text-xl font-bold text-gray-900 mt-1">{plan.name}</h3>
                <p className="text-gray-500 text-sm mt-1 mb-5">{plan.description}</p>
                <div className="mb-2">
                  <span className="text-4xl font-extrabold text-gray-900">{plan.price}</span>
                  <span className="text-gray-500 text-sm">{plan.period}</span>
                </div>
                <p className="text-xs text-gray-400 mb-6">
                  {plan.price !== 'ご相談' ? '※ 他社平均 ¥15,000〜/月 と比較' : '※ ボリュームディスカウントあり'}
                </p>
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
                  className={`block text-center w-full py-3 rounded-lg font-bold transition-colors ${plan.highlighted ? `${t.primary} ${t.primaryHover} text-white` : `border-2 border-gray-200 hover:border-gray-300 text-gray-900`}`}
                >
                  {plan.price === 'ご相談' ? 'お問い合わせ' : '無料トライアル'}
                </TrackingCTA>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ — accordion with +/- icons ─────────────────────────── */}
      <section id="faq" className="py-20 md:py-28 bg-white">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center mb-14">
            <span className={`inline-block ${t.primaryLight} ${t.primaryText} text-xs font-bold px-3 py-1 rounded-full mb-4`}>
              FAQ
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
              よくあるご質問
            </h2>
          </div>
          <div className="space-y-4">
            {d.faqs.map((faq, i) => (
              <details key={i} className="group border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors">
                <summary className="flex items-center justify-between p-5 cursor-pointer select-none">
                  <span className="text-base font-semibold text-gray-900 pr-4">{faq.q}</span>
                  <span className={`flex-shrink-0 w-7 h-7 rounded-full border-2 ${t.primaryBorder} flex items-center justify-center transition-transform`}>
                    <span className={`${t.primaryText} text-lg font-bold leading-none group-open:hidden`}>+</span>
                    <span className={`${t.primaryText} text-lg font-bold leading-none hidden group-open:inline`}>&minus;</span>
                  </span>
                </summary>
                <div className="px-5 pb-5 text-gray-600 text-sm leading-relaxed border-t border-gray-100 pt-4">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-white">
        <div className="mx-auto max-w-3xl px-6">
          <div className={`border-2 ${t.primaryBorder} rounded-2xl p-10 md:p-14 text-center`}>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
              まずは無料で試してみませんか？
            </h2>
            <p className="text-gray-600 mb-8 max-w-lg mx-auto">
              初期費用ゼロ、クレジットカード不要。5分で{d.label}の予約管理を変えられます。
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <TrackingCTA
                href={signupUrl}
                vertical={vertical}
                cta="final_cta"
                className={`inline-flex items-center justify-center gap-2 ${t.primary} ${t.primaryHover} text-white font-bold px-10 py-4 rounded-lg transition-colors text-lg`}
              >
                無料で始める <ArrowRight className="w-5 h-5" />
              </TrackingCTA>
              <TrackingCTA
                href="#compare"
                vertical={vertical}
                cta="final_compare"
                className="inline-flex items-center justify-center gap-2 border-2 border-gray-300 text-gray-700 font-semibold px-10 py-4 rounded-lg hover:border-gray-400 transition-colors text-lg"
              >
                もう一度比較を見る
              </TrackingCTA>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="bg-gray-900 py-14">
        <div className="mx-auto max-w-7xl px-6 grid md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-8 h-8 ${t.primary} rounded-lg flex items-center justify-center`}>
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-bold text-lg">LumiBook</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed max-w-md">
              {d.label}向け予約管理システム。LINE予約、AI接客、リピート促進をオールインワンで提供します。
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-4">サービス</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="#features" className="hover:text-white transition-colors">機能紹介</Link></li>
              <li><Link href="#pricing" className="hover:text-white transition-colors">料金プラン</Link></li>
              <li><Link href="#compare" className="hover:text-white transition-colors">他社比較</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-4">会社情報</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/terms" className="hover:text-white transition-colors">利用規約</Link></li>
              <li><Link href="/privacy" className="hover:text-white transition-colors">プライバシーポリシー</Link></li>
              <li><Link href="/contact" className="hover:text-white transition-colors">お問い合わせ</Link></li>
            </ul>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-6 mt-10 pt-8 border-t border-gray-800">
          <p className="text-gray-500 text-xs">&copy; {new Date().getFullYear()} LumiBook. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
