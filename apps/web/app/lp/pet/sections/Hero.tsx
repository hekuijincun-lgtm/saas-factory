import Link from 'next/link';

export default function Hero() {
  return (
    <section className="bg-cream px-4 py-12 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-6xl">
        {/* Nav */}
        <nav className="mb-12 flex items-center justify-between lg:mb-20">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-ink">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="#F7F3EC" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
            </div>
            <span className="font-serif-jp text-[16px] font-medium tracking-wide text-ink">PetBoard</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="#features" className="hidden text-[13px] text-fog sm:inline">機能</Link>
            <Link href="#pricing" className="hidden text-[13px] text-fog sm:inline">料金</Link>
            <Link href="/login" className="rounded-md border border-ink/50 px-3.5 py-1.5 text-[13px] font-medium text-ink transition hover:bg-ink hover:text-cream">ログイン</Link>
          </div>
        </nav>

        {/* Body: 2-col on lg, stacked on mobile */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">

          {/* Copy column */}
          <div className="lg:col-span-7">
            <p className="mb-6 flex items-center gap-2.5 text-[11px] font-medium tracking-[0.2em] text-terracotta">
              <span className="h-1.5 w-1.5 rounded-full bg-terracotta" />
              PetBoard ｜ ペットサロン向け AI エージェント
            </p>

            <h1 className="mb-6 font-serif-jp text-[34px] font-medium leading-[1.5] tracking-[0.005em] text-ink lg:text-[44px]">
              毎朝8時、AIが、<br />
              <span className="text-terracotta">あなたのサロン</span>を<br />
              動かし始める。
            </h1>

            <p className="mb-8 max-w-[520px] font-sans-jp text-[14px] leading-[1.95] text-fog">
              休眠顧客の呼び戻し、空き枠の誘致、誕生月の特典配信を、すべて自動で実行。あなたは経営判断に集中できます。
            </p>

            <div className="mb-7 flex flex-wrap items-center gap-4">
              <Link
                href="/signup?plan=pro&vertical=pet"
                className="rounded-md bg-terracotta px-6 py-3.5 text-[13.5px] font-medium tracking-wide text-white transition hover:bg-terracotta-hover"
              >
                14日間 無料で試す →
              </Link>
              <Link
                href="#features"
                className="text-[13.5px] font-medium text-ink"
              >
                <span className="border-b border-ink/40 pb-0.5">詳しく見る</span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-5 font-sans-jp text-[12px] font-medium text-fog-light">
              {['審査なし', '最低利用期間なし', 'Stripe 決済'].map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="#5C6470" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8.5l3.5 3.5L13 4.5" />
                  </svg>
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Product preview column */}
          <div className="lg:col-span-5">
            <ProductPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductPreview() {
  const tasks = [
    { text: '休眠顧客 6名に LINE 配信', meta: '実行中', state: 'running' as const },
    { text: '明日の空き枠 2件 誘致配信', meta: '完了', state: 'done' as const },
    { text: '田中様 誕生月クーポン送信', meta: '完了', state: 'done' as const },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
      <div className="flex items-center justify-between border-b border-ink/[0.06] px-4 py-3.5">
        <span className="font-serif-jp text-[13px] font-medium text-ink">AI店長 ｜ 今朝の判断</span>
        <span className="font-mono text-[11px] text-fog-light">2026.04.27 08:02</span>
      </div>
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-3.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-terracotta" />
        <span className="font-sans-jp text-[12px] text-fog">本日の戦略を実行中</span>
      </div>
      <div className="pb-3 pt-1">
        {tasks.map((task, idx) => (
          <div key={idx} className="flex items-center gap-3 border-t border-ink/[0.04] px-4 py-3">
            <div className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${task.state === 'running' ? 'bg-cream-tint' : 'bg-sage'}`}>
              {task.state === 'running' ? (
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 16 16" fill="none" stroke="#C45A3D" strokeWidth={2} strokeLinecap="round">
                  <path d="M8 2v3" />
                  <path d="M8 11v3" />
                  <path d="M14 8h-3" />
                  <path d="M5 8H2" />
                </svg>
              ) : (
                <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="#3B6D11" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8l3.5 3.5L13 5" />
                </svg>
              )}
            </div>
            <span className="flex-1 font-sans-jp text-[13px] text-ink">{task.text}</span>
            <span className="font-sans-jp text-[11px] text-fog-light">{task.meta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
