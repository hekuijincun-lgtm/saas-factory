'use client';
import { motion, useReducedMotion } from 'framer-motion';
import Image from 'next/image';
import InstallCTA from '../InstallCTA';

export default function Hero({ onInstall, isInstalled }: { onInstall: () => void; isInstalled: boolean }) {
  const prefersReduced = useReducedMotion();

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-orange-50/60 via-white to-white">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-20 -left-32 w-96 h-96 bg-orange-200/40 rounded-full blur-3xl" />
        <div className="absolute top-60 -right-32 w-96 h-96 bg-orange-300/30 rounded-full blur-3xl" />
      </div>

      <div className="px-6 pt-20 md:pt-32 pb-20 md:pb-28 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-[1.2fr_1fr] gap-10 md:gap-16 items-center">
          <div>
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 20 }}
              animate={prefersReduced ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-orange-100 border border-orange-200 rounded-full text-xs md:text-sm font-semibold text-orange-700"
            >
              <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
              ペットサロン専用 AIエージェント
            </motion.div>

            <motion.h1
              initial={prefersReduced ? false : { opacity: 0, y: 20 }}
              animate={prefersReduced ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-5 text-4xl md:text-6xl lg:text-7xl font-black text-gray-900 leading-[1.1] tracking-tight"
            >
              AI店長が、<br />
              <span className="text-orange-500">売上を上げ続ける。</span><br />
              あなたは<br className="md:hidden" />見ているだけ。
            </motion.h1>

            <motion.p
              initial={prefersReduced ? false : { opacity: 0, y: 20 }}
              animate={prefersReduced ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-6 text-base md:text-xl text-gray-600 leading-relaxed max-w-xl"
            >
              毎朝8時、AIがサロンのデータを見て<strong className="text-gray-900">今日やるべきこと</strong>を判断。
              休眠顧客の呼び戻し、空き枠の誘致、誕生月の特典配信を全部自動でやります。
              <br />
              <strong className="text-gray-900">オーナー操作ゼロ</strong>で稼働します。
            </motion.p>

            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 20 }}
              animate={prefersReduced ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-8 flex flex-col sm:flex-row gap-3"
            >
              <InstallCTA onClick={onInstall} isInstalled={isInstalled} size="xl" />
              <a
                href="#pricing"
                className="inline-flex items-center justify-center min-h-14 px-6 py-4 bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-semibold rounded-2xl transition-colors"
              >
                料金を見る
              </a>
            </motion.div>

            <motion.p
              initial={prefersReduced ? false : { opacity: 0 }}
              animate={prefersReduced ? {} : { opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-4 text-xs md:text-sm text-gray-500"
            >
              ✓ 審査なし ✓ アプリストア不要 ✓ 最低利用期間なし ✓ いつでも解約可能
            </motion.p>
          </div>

          <motion.div
            initial={prefersReduced ? false : { opacity: 0, scale: 0.94 }}
            animate={prefersReduced ? {} : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="relative"
          >
            <div className="absolute -inset-8 bg-orange-400/20 rounded-3xl blur-2xl -z-10" />
            <div className="rounded-2xl md:rounded-3xl border border-orange-200 shadow-2xl overflow-hidden bg-white">
              <Image
                src="/lp/pet/hero-mockup.png"
                alt="PetBoard AI店長の画面"
                width={1200}
                height={900}
                priority
                className="w-full h-auto"
              />
            </div>

            {!prefersReduced && (
              <>
                <motion.div
                  animate={{ y: [-6, 6, -6] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -top-4 -left-4 md:-top-6 md:-left-6 bg-white rounded-xl shadow-lg px-3 py-2 md:px-4 md:py-3 border border-orange-100"
                >
                  <div className="text-[10px] md:text-xs text-gray-500">今週の配信</div>
                  <div className="text-lg md:text-2xl font-black text-orange-500">6名</div>
                </motion.div>
                <motion.div
                  animate={{ y: [6, -6, 6] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -bottom-4 -right-4 md:-bottom-6 md:-right-6 bg-white rounded-xl shadow-lg px-3 py-2 md:px-4 md:py-3 border border-blue-100"
                >
                  <div className="text-[10px] md:text-xs text-gray-500">AI稼働中</div>
                  <div className="text-lg md:text-2xl font-black text-blue-600">24h</div>
                </motion.div>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
