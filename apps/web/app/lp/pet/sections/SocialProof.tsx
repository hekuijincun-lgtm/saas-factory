'use client';
import ScrollReveal from '../components/ScrollReveal';
import AnimatedNumber from '../components/AnimatedNumber';

const ANIMATED_STATS = [
  { value: 24, suffix: 'h', label: '自動稼働', desc: 'AI店長が休まず働く時間' },
  { value: 5, suffix: '本', label: '売上レバー', desc: '自動で実行される配信戦略' },
  { value: 100, suffix: '%', label: '個別対応', desc: 'AIが1人ずつメッセージ作成' },
];

export default function SocialProof() {
  return (
    <section className="px-6 py-12 md:py-16 bg-gradient-to-b from-white to-orange-50/30">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal>
          <p className="text-center text-xs md:text-sm font-semibold text-orange-600 uppercase tracking-widest mb-8 md:mb-10">
            なぜ PetBoard が選ばれるのか
          </p>
        </ScrollReveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {/* 自動稼働 */}
          <ScrollReveal delay={0} className="text-center">
            <div className="text-4xl md:text-6xl font-black text-orange-500">
              <AnimatedNumber value={ANIMATED_STATS[0].value} />
              <span className="text-2xl md:text-4xl">{ANIMATED_STATS[0].suffix}</span>
            </div>
            <div className="mt-2 text-sm md:text-base font-bold text-gray-900">{ANIMATED_STATS[0].label}</div>
            <div className="mt-1 text-xs md:text-sm text-gray-500">{ANIMATED_STATS[0].desc}</div>
          </ScrollReveal>
          {/* 売上レバー */}
          <ScrollReveal delay={0.08} className="text-center">
            <div className="text-4xl md:text-6xl font-black text-orange-500">
              <AnimatedNumber value={ANIMATED_STATS[1].value} />
              <span className="text-2xl md:text-4xl">{ANIMATED_STATS[1].suffix}</span>
            </div>
            <div className="mt-2 text-sm md:text-base font-bold text-gray-900">{ANIMATED_STATS[1].label}</div>
            <div className="mt-1 text-xs md:text-sm text-gray-500">{ANIMATED_STATS[1].desc}</div>
          </ScrollReveal>
          {/* オーナー操作 — 意図的ゼロ: テキスト��示で差別化 */}
          <ScrollReveal delay={0.16} className="text-center">
            <div className="text-4xl md:text-6xl font-black text-orange-500">
              ゼロ
            </div>
            <div className="mt-2 text-sm md:text-base font-bold text-gray-900">オーナー操作</div>
            <div className="mt-1 text-xs md:text-sm text-gray-500">必要な日常操作の回数</div>
          </ScrollReveal>
          {/* 個別対応 */}
          <ScrollReveal delay={0.24} className="text-center">
            <div className="text-4xl md:text-6xl font-black text-orange-500">
              <AnimatedNumber value={ANIMATED_STATS[2].value} />
              <span className="text-2xl md:text-4xl">{ANIMATED_STATS[2].suffix}</span>
            </div>
            <div className="mt-2 text-sm md:text-base font-bold text-gray-900">{ANIMATED_STATS[2].label}</div>
            <div className="mt-1 text-xs md:text-sm text-gray-500">{ANIMATED_STATS[2].desc}</div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
