export const runtime = 'edge';

import type { Metadata } from 'next';
import Link from 'next/link';
import { getTheme, SIGNUP_HREF } from '../../_designs/shared';
import { FadeInUp, FadeInLeft, ScaleIn, StaggerContainer, StaggerItem } from '../../_components/animations';

// ── Vertical label mapping ──────────────────────────────────────────
const VERTICALS: Record<string, { label: string; benefit: string }> = {
  nail:     { label: 'ネイルサロン',           benefit: '予約・リマインド・リピート促進を自動化' },
  hair:     { label: 'ヘアサロン',             benefit: '予約・リマインド・リピート促進を自動化' },
  dental:   { label: '歯科・クリニック',       benefit: '予約・リマインド・問い合わせ対応を自動化' },
  esthetic: { label: 'エステ・リラクゼーション', benefit: '予約・リマインド・リピート促進を自動化' },
  cleaning: { label: 'ハウスクリーニング',     benefit: '問い合わせ・見積もり対応を自動化' },
  handyman: { label: '便利屋・なんでも屋',     benefit: '問い合わせ・見積もり対応を自動化' },
  pet:      { label: 'ペットサロン',           benefit: '予約・ワクチンリマインド・来店促進を自動化' },
  seitai:   { label: '整体院',                 benefit: '予約・症状ヒアリング・リピート促進を自動化' },
  gym:      { label: 'ジム・フィットネス',     benefit: '会員管理・チェックイン・リテンションを自動化' },
  school:   { label: '習い事・スクール',       benefit: '月謝管理・出席記録・進捗管理を自動化' },
  shop:     { label: 'ネットショップ',         benefit: '商品管理・注文対応・リピート促進を自動化' },
  food:     { label: '食品・お取り寄せ',       benefit: '注文管理・配送連絡・リピート促進を自動化' },
  handmade: { label: 'ハンドメイド・クリエイター', benefit: '作品管理・オーダー対応・ファン育成を自動化' },
};

export async function generateMetadata({ params }: { params: Promise<{ vertical: string }> }): Promise<Metadata> {
  const { vertical } = await params;
  const v = VERTICALS[vertical];
  const label = v?.label ?? vertical;
  return {
    title: `LINE Messaging API 連携ガイド | ${label}向け | LumiBook`,
    description: `${label}向けLumiBookとLINE公式アカウントの連携方法を図解付きで解説。Messaging APIの設定からWebhook接続まで最短15分で完了。`,
  };
}

// ── Step data ───────────────────────────────────────────────────────
const STEPS = [
  {
    num: '01',
    title: 'LINE公式アカウントを作成',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
    items: [
      'LINE Business ID にメールアドレスで登録',
      'LINE公式アカウントを新規作成（業種・店舗名を入力）',
      'アカウント種別は「未認証」でOK（後から認証申請可能）',
    ],
    tip: '個人のLINEアカウントとは別にビジネス用アカウントが必要です。既にお持ちの場合はスキップしてください。',
    link: { label: 'LINE for Business 公式サイト', href: 'https://www.linebiz.com/jp/' },
  },
  {
    num: '02',
    title: 'Messaging APIを有効化',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
    items: [
      'LINE Official Account Manager にログイン',
      '右上の「設定」→ 左メニュー「Messaging API」を選択',
      '「Messaging APIを利用する」ボタンをクリック',
      'プロバイダーを選択（新規作成でも可）→ 同意して有効化',
    ],
    tip: 'プロバイダー名は後から変更できません。会社名やサービス名にしておくのがおすすめです。',
    link: { label: 'LINE Official Account Manager', href: 'https://manager.line.biz/' },
  },
  {
    num: '03',
    title: 'チャンネルアクセストークンを取得',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
      </svg>
    ),
    items: [
      'LINE Developers コンソールにログイン',
      '作成したチャンネルを選択',
      '「チャンネル基本設定」→ チャンネルシークレットをコピー',
      '「Messaging API設定」→「チャンネルアクセストークン（長期）」の「発行」をクリック',
      '表示されたトークンをコピーして安全な場所に保管',
    ],
    tip: 'チャンネルアクセストークンは発行時に一度だけ表示されます。必ずコピーして保管してください。紛失した場合は再発行が必要です。',
    link: { label: 'LINE Developers コンソール', href: 'https://developers.line.biz/console/' },
  },
  {
    num: '04',
    title: 'LumiBookに設定を入力',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
      </svg>
    ),
    items: [
      'LumiBook管理画面にログイン',
      '左メニュー「LINE設定」を選択',
      'チャンネルシークレットを入力',
      'チャンネルアクセストークンを入力',
      '表示されるWebhook URL をコピー',
      'LINE Developers のMessaging API設定 →「Webhook URL」に貼り付け',
      '「Webhookの利用」をONに切り替え',
    ],
    tip: 'Webhook URLは https:// で始まる必要があります。末尾にスラッシュ（/）は不要です。',
    link: null,
  },
  {
    num: '05',
    title: '動作確認',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
    items: [
      'スマホのLINEアプリで公式アカウントを友だち追加',
      'テストメッセージを送信（「予約したい」など）',
      'AI自動応答が返ってくることを確認',
      'LumiBook管理画面の問い合わせ履歴に表示されることを確認',
    ],
    tip: '応答が来ない場合は、管理画面でAI自動応答がONになっているか確認してください。',
    link: null,
  },
];

const FAQS = [
  {
    q: 'LINE公式アカウントは無料で使えますか？',
    a: 'はい。LINE公式アカウントは月1,000通までメッセージ無料のコミュニケーションプランがあります。小規模な店舗であれば無料枠で十分運用できます。',
  },
  {
    q: 'Webhookの接続でエラーが出る場合は？',
    a: 'Webhook URLが https:// で始まっていること、末尾にスラッシュがないこと、「Webhookの利用」がONになっていることを確認してください。それでも解決しない場合はサポートまでお問い合わせください。',
  },
  {
    q: 'チャンネルアクセストークンを再発行したい場合は？',
    a: 'LINE Developersコンソールで再発行できます。再発行すると古いトークンは無効になるため、LumiBook管理画面のLINE設定も新しいトークンに更新してください。',
  },
  {
    q: '複数のLINE公式アカウントを連携できますか？',
    a: 'Proプラン以上で複数アカウントの連携に対応しています。店舗ごとに異なるLINE公式アカウントを使い分けることができます。',
  },
];

// ── Page ────────────────────────────────────────────────────────────
export default async function LineSetupPage({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = await params;
  const v = VERTICALS[vertical] ?? { label: vertical, benefit: '予約・問い合わせを自動化' };
  const t = getTheme(vertical);
  const signupUrl = `${SIGNUP_HREF}/${vertical}`;

  return (
    <div className="min-h-screen bg-white">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href={`/lp/${vertical}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {v.label} LP に戻る
          </Link>
          <Link
            href={signupUrl}
            className={`${t.primary} ${t.primaryHover} text-white px-4 py-1.5 rounded-full text-sm font-medium transition-colors`}
          >
            無料で始める
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={`${t.primaryLight} py-16 sm:py-24`}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <FadeInUp>
            <div className={`inline-flex items-center gap-2 rounded-full ${t.iconBg} px-4 py-1.5 text-sm font-medium ${t.primaryText} mb-6`}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 5.81 2 10.5c0 2.55 1.35 4.84 3.5 6.37V22l4.21-2.31c.73.15 1.5.23 2.29.23 5.52 0 10-3.81 10-8.5S17.52 2 12 2z" />
              </svg>
              LINE連携ガイド
            </div>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4 leading-tight">
              LINEと連携して<br className="sm:hidden" />
              {v.benefit}
            </h1>
          </FadeInUp>
          <FadeInUp delay={0.2}>
            <p className="text-gray-600 text-base sm:text-lg max-w-2xl mx-auto">
              {v.label}向けLumiBookとLINE公式アカウントの連携を5ステップで設定。<br className="hidden sm:block" />
              最短15分で、LINEからの予約・問い合わせが自動で管理画面に届くようになります。
            </p>
          </FadeInUp>
        </div>
      </section>

      {/* ── Overview timeline ── */}
      <section className="py-12 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <StaggerContainer className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
            {STEPS.map((s, i) => (
              <StaggerItem key={s.num} className="flex items-center gap-3 sm:flex-col sm:text-center sm:gap-2 flex-1">
                <div className={`w-10 h-10 rounded-full ${t.primary} text-white flex items-center justify-center text-sm font-bold flex-shrink-0`}>
                  {s.num}
                </div>
                <p className="text-sm font-medium text-gray-700 sm:max-w-[120px]">{s.title}</p>
                {i < STEPS.length - 1 && (
                  <div className="hidden sm:block w-full h-px bg-gray-200 mx-2" />
                )}
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ── Step details ── */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 space-y-16">
          {STEPS.map((step, i) => (
            <FadeInLeft key={step.num} delay={i * 0.05}>
              <div className="flex gap-6">
                {/* Step number + line */}
                <div className="hidden sm:flex flex-col items-center">
                  <div className={`w-14 h-14 rounded-2xl ${t.iconBg} ${t.iconColor} flex items-center justify-center flex-shrink-0`}>
                    {step.icon}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`w-px flex-1 mt-4 bg-gradient-to-b ${t.primaryBorder} to-transparent opacity-30`} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-3 mb-4 sm:hidden">
                    <div className={`w-10 h-10 rounded-xl ${t.iconBg} ${t.iconColor} flex items-center justify-center flex-shrink-0`}>
                      {step.icon}
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Step {step.num}: {step.title}
                    </h3>
                  </div>
                  <h3 className="hidden sm:block text-xl font-bold text-gray-900 mb-4">
                    Step {step.num}: {step.title}
                  </h3>

                  {/* Instructions */}
                  <ol className="space-y-3 mb-4">
                    {step.items.map((item, j) => (
                      <li key={j} className="flex gap-3 text-gray-700">
                        <span className={`flex-shrink-0 w-6 h-6 rounded-full ${t.iconBg} ${t.primaryText} flex items-center justify-center text-xs font-bold`}>
                          {j + 1}
                        </span>
                        <span className="text-sm leading-relaxed pt-0.5">{item}</span>
                      </li>
                    ))}
                  </ol>

                  {/* Tip */}
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-4">
                    <div className="flex gap-2">
                      <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <p className="text-sm text-amber-800">{step.tip}</p>
                    </div>
                  </div>

                  {/* External link */}
                  {step.link && (
                    <a
                      href={step.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1.5 text-sm font-medium ${t.primaryText} hover:underline`}
                    >
                      {step.link.label}
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            </FadeInLeft>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className={`${t.primaryLight} py-16`}>
        <div className="max-w-3xl mx-auto px-4">
          <FadeInUp>
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">よくある質問</h2>
          </FadeInUp>
          <div className="space-y-4">
            {FAQS.map((faq, i) => (
              <FadeInUp key={i} delay={i * 0.08}>
                <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-2 flex gap-2">
                    <span className={`${t.primaryText} font-bold`}>Q.</span>
                    {faq.q}
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed pl-6">{faq.a}</p>
                </div>
              </FadeInUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <ScaleIn>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">さっそく始めましょう</h2>
            <p className="text-gray-600 mb-8">LINE連携は最短15分で完了します。</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/admin"
                className={`${t.primary} ${t.primaryHover} text-white px-8 py-3 rounded-xl font-bold text-sm transition-colors shadow-md`}
              >
                管理画面で設定する
              </Link>
              <Link
                href={signupUrl}
                className="border border-gray-300 text-gray-700 px-8 py-3 rounded-xl font-bold text-sm hover:border-gray-400 transition-colors"
              >
                まだアカウントがない方はこちら
              </Link>
            </div>
          </ScaleIn>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center text-xs text-gray-400">
          <Link href={`/lp/${vertical}`} className="hover:text-gray-600 transition-colors">
            {v.label} LP に戻る
          </Link>
        </div>
      </footer>
    </div>
  );
}
