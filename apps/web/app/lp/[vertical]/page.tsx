import type { Metadata } from 'next';
import Link from 'next/link';
import { DESIGNS } from '../_designs';
import type { DesignKey } from '../_designs';
import { getTheme, SIGNUP_HREF, type VerticalLPConfig } from '../_designs/shared';

export const runtime = 'edge';

// ── Vertical → Design mapping ───────────────────────────────────────
// Each vertical picks the design template that best fits its audience.
const VERTICAL_DESIGN: Record<string, DesignKey> = {
  nail:      'testimonial',     // 口コミ重視 — ネイルは写真・レビューで選ばれる
  hair:      'split-hero',      // モダン2カラム — スタイリッシュなサロンイメージ
  dental:    'comparison',      // 比較表 — 既存予約方法との違いを明確に
  esthetic:  'minimal',         // ミニマル高級感 — エステの洗練された世界観
  cleaning:  'gradient-wave',   // ポップで親しみやすい — 家庭向けサービス
  handyman:  'card-showcase',   // Bentoグリッド — 多彩なサービスカテゴリを見せる
};

function getDesignKey(vertical: string): DesignKey {
  if (VERTICAL_DESIGN[vertical]) return VERTICAL_DESIGN[vertical];
  // Auto-assign by hash for unknown verticals
  const keys = Object.keys(DESIGNS) as DesignKey[];
  let hash = 0;
  for (let i = 0; i < vertical.length; i++) hash = ((hash << 5) - hash + vertical.charCodeAt(i)) | 0;
  return keys[Math.abs(hash) % keys.length];
}

// ── Vertical LP content data ────────────────────────────────────────
const LP: Record<string, VerticalLPConfig> = {
  nail: {
    label: 'ネイルサロン',
    badge: 'ネイルサロン専用の予約自動化ツール',
    headline: 'ネイルサロンの予約を\nLINEで自動化',
    subheadline: 'デザイン別メニュー管理・スタッフ指名・前日リマインドをすべて一つに。\nサロンワークに集中できる環境を作ります。',
    problems: [
      { icon: 'phone', title: '電話・DM対応に追われる', desc: '施術中の電話対応や、InstagramのDMでの予約やりとりで手が止まる' },
      { icon: 'calendar', title: '予約表の手書き管理が限界', desc: 'ノートや紙の予約台帳では、変更・キャンセルの追跡が大変' },
      { icon: 'clock', title: '無断キャンセルが多い', desc: '連絡なしのドタキャンで貴重な枠が空いてしまう' },
      { icon: 'users', title: 'リピーターが定着しない', desc: '来店後のフォローが手動では、再来店のきっかけが作れない' },
      { icon: 'chart', title: '人気メニューが把握できない', desc: 'どのデザインが人気か、データで分析できていない' },
    ],
    features: [
      { icon: 'message', title: 'LINEで予約完結', desc: 'お客様はLINEからメニュー選択→スタッフ指名→日時選択→予約確定。電話不要でサロンの手を止めません。' },
      { icon: 'bell', title: '前日自動リマインド', desc: '予約日の前日にLINEで自動通知。「爪を短く切らないでください」等の注意事項も一緒に送れます。' },
      { icon: 'calendar', title: 'デザイン別メニュー管理', desc: 'シンプル・アート・ジェル・ケア・オフなど、デザイン種別でメニューを分類。お客様が選びやすいUIを提供。' },
      { icon: 'users', title: 'スタッフ指名・シフト連動', desc: 'ネイリストの指名予約に対応。シフトを登録すれば空き枠を自動で表示します。' },
      { icon: 'chart', title: 'デザイン別KPI分析', desc: 'どのデザインが人気か、リピート率はどうか。データで見えるからメニュー改善に直結します。' },
      { icon: 'sparkles', title: 'リピート促進LINE配信', desc: '「ジェルの付け替え時期です」「新作デザインが入りました」。最適なタイミングで自動配信。' },
    ],
    flow: [
      { step: '01', title: 'LINE公式アカウント連携', desc: 'お手持ちのLINE公式アカウントと連携。Messaging APIの設定をガイドに沿って行うだけ。' },
      { step: '02', title: 'メニュー・スタッフ登録', desc: 'ジェルネイル・アート・ケアなどのメニューと、ネイリスト情報を管理画面から登録。' },
      { step: '03', title: '予約URLを共有して運用開始', desc: 'LINE公式アカウントのリッチメニューやプロフィールに予約URLを貼るだけ。最短30分で運用開始。' },
    ],
    faqs: [
      { q: 'ネイルのデザイン画像は掲載できますか？', a: 'はい。メニューごとに施術イメージ画像をアップロードできます。お客様が予約画面でデザインを確認しながら選択できます。' },
      { q: '付け替え時期のリマインドは自動ですか？', a: 'はい。リピート促進機能で、前回来店から一定期間後にLINEで自動配信できます。配信間隔やメッセージ文面はカスタマイズ可能です。' },
      { q: '他の予約システムからの移行は簡単ですか？', a: 'メニューとスタッフ情報を管理画面から登録するだけで移行完了です。既存の予約は手動で転記いただく形になりますが、初期設定サポートも無料で提供しています。' },
      { q: '複数のネイリストのシフトを管理できますか？', a: 'はい。Proプラン以上ではスタッフ数無制限です。各ネイリストのシフトを個別に設定でき、お客様は空いている枠から予約できます。' },
    ],
    metaTitle: 'LumiBook | ネイルサロン専用予約管理ツール',
    metaDesc: 'LINE予約・デザイン別メニュー管理・前日リマインドを自動化。ネイルサロンの予約業務を効率化するツール。',
  },
  hair: {
    label: 'ヘアサロン',
    badge: 'ヘアサロン専用の予約自動化ツール',
    headline: 'ヘアサロンの予約管理を\n圧倒的にシンプルに',
    subheadline: 'カット・カラー・パーマのカテゴリ管理からスタイリスト指名まで。\n予約の手間をなくして、技術に集中できる環境を。',
    problems: [
      { icon: 'phone', title: '電話予約の対応が施術を中断', desc: 'カット中に電話が鳴り、お客様を待たせてしまう場面が頻発' },
      { icon: 'calendar', title: 'スタイリスト間の予約調整が大変', desc: '複数スタッフのシフトと予約枠の突き合わせが手作業で非効率' },
      { icon: 'clock', title: '当日キャンセルの空き枠が埋まらない', desc: 'キャンセルが出ても告知手段がなく、枠が無駄になる' },
      { icon: 'users', title: 'カラー・パーマのリピート周期が読めない', desc: '根本が伸びてきた頃の再来店促進が、感覚頼みになっている' },
      { icon: 'chart', title: 'メニュー別の売上貢献度が見えない', desc: 'カットとカラーどちらが収益に貢献しているか、データがない' },
    ],
    features: [
      { icon: 'message', title: 'LINEで指名予約完結', desc: 'スタイリストの指名→メニュー選択→空き枠確認→予約確定。すべてLINEで完結します。' },
      { icon: 'bell', title: '前日自動リマインド', desc: '来店前日にLINEで自動通知。当日キャンセル率を大幅に削減します。' },
      { icon: 'calendar', title: 'カテゴリ別メニュー管理', desc: 'カット・カラー・パーマ・トリートメント・セット・ヘッドスパ。施術カテゴリで整理された分かりやすいメニュー表。' },
      { icon: 'users', title: 'スタイリスト別シフト管理', desc: '各スタイリストの出勤日・時間帯を登録。空き枠が自動で予約画面に反映されます。' },
      { icon: 'chart', title: 'カテゴリ別KPI分析', desc: 'カット vs カラー vs パーマ。カテゴリごとの予約数・リピート率・売上寄与を可視化。' },
      { icon: 'sparkles', title: 'リピート促進配信', desc: '「カットから1ヶ月経ちました」「カラーの根本が気になる頃では？」。お客様ごとに最適なタイミングで自動配信。' },
    ],
    flow: [
      { step: '01', title: 'LINE公式アカウント連携', desc: '既存のLINE公式アカウントとMessaging APIで連携。ガイドに沿って最短15分で完了。' },
      { step: '02', title: 'メニュー・スタイリスト登録', desc: 'カット・カラー等のメニューと、各スタイリストの情報・シフトを管理画面から登録。' },
      { step: '03', title: '予約URLを公開して運用開始', desc: 'リッチメニューやプロフィールに予約URLを設置。お客様はLINEから即日予約可能に。' },
    ],
    faqs: [
      { q: 'スタイリスト指名とフリー予約の両方に対応できますか？', a: 'はい。お客様が「指名なし」を選べば空いているスタッフに自動で振り分けられます。指名がある場合はそのスタッフの空き枠のみ表示されます。' },
      { q: 'カラーやパーマの施術時間が違っても大丈夫ですか？', a: 'メニューごとに所要時間を個別設定できます。カット45分、カラー90分、パーマ120分など。予約枠が自動で調整されます。' },
      { q: '複数店舗での利用は可能ですか？', a: 'Enterpriseプランで複数店舗の一括管理に対応しています。各店舗ごとにスタッフ・メニュー・シフトを独立して管理できます。' },
      { q: '既存の予約システムと並行運用できますか？', a: 'はい。移行期間中は既存システムと並行して運用し、段階的に切り替えることをお勧めしています。初期設定サポートも無料で提供しています。' },
    ],
    metaTitle: 'LumiBook | ヘアサロン専用予約管理ツール',
    metaDesc: 'LINE予約・スタイリスト指名・カテゴリ別メニュー管理を自動化。ヘアサロンの予約業務を効率化。',
  },
  dental: {
    label: '歯科・クリニック',
    badge: '歯科クリニック専用の予約管理ツール',
    headline: '歯科クリニックの予約を\nLINEで効率化',
    subheadline: '診療種別管理・オンライン問診・定期検診リマインド。\n患者体験の向上とスタッフの業務負荷削減を同時に実現します。',
    problems: [
      { icon: 'phone', title: '電話予約で受付が逼迫', desc: '診療時間中の電話対応で、受付スタッフの業務が圧迫される' },
      { icon: 'calendar', title: '定期検診の来院率が低い', desc: '患者さんが検診時期を忘れ、症状が進行してから来院するケースが多い' },
      { icon: 'clock', title: '問診票の記入に時間がかかる', desc: '来院してから紙の問診票を記入するため、待ち時間が長くなる' },
      { icon: 'users', title: '無断キャンセルで診療枠が空く', desc: '連絡なしのキャンセルで、他の患者さんに使えたはずの枠が無駄に' },
      { icon: 'chart', title: '診療メニュー別の経営データがない', desc: 'どの診療が収益に貢献しているか、感覚的にしか把握できていない' },
    ],
    features: [
      { icon: 'message', title: 'LINE予約受付', desc: '患者さんはLINEから診療種別を選んで予約。電話を減らし、受付の負担を軽減します。' },
      { icon: 'shield', title: 'オンライン問診', desc: '来院前にスマホで問診を完了。アレルギー・服薬情報を事前に把握し、診療の質を向上。' },
      { icon: 'bell', title: '定期検診リマインド', desc: '前回来院から一定期間後にLINEで自動通知。「定期検診の時期です」で来院率を向上。' },
      { icon: 'calendar', title: '診療種別メニュー管理', desc: '検診・クリーニング・ホワイトニング・虫歯治療・初診相談。種別ごとに時間と料金を設定。' },
      { icon: 'chart', title: '診療分析KPI', desc: '診療種別ごとの予約数・リピート率を可視化。経営判断に使えるデータを自動集計。' },
      { icon: 'sparkles', title: '患者フォローアップ', desc: '治療後のケア案内や次回予約の促進を自動配信。患者さんの継続来院をサポート。' },
    ],
    flow: [
      { step: '01', title: 'LINE公式アカウント連携', desc: 'クリニックのLINE公式アカウントと連携。Messaging API設定はガイド付きで簡単。' },
      { step: '02', title: '診療メニュー・問診票設定', desc: '診療種別・所要時間・料金を登録。事前問診のテンプレートも用意されています。' },
      { step: '03', title: '予約URLを院内・HPに設置', desc: 'ホームページやLINEプロフィールに予約URLを設置。患者さんは24時間いつでも予約可能に。' },
    ],
    faqs: [
      { q: '保険診療と自費診療の両方を管理できますか？', a: 'はい。メニューごとに料金を個別設定できるため、保険診療（料金0円表示も可）と自費診療を分けて管理できます。' },
      { q: '問診票はカスタマイズできますか？', a: 'はい。テキスト入力・選択式・チェックボックスなど複数の質問タイプに対応しています。歯科特有の質問テンプレートも用意されています。' },
      { q: '定期検診のリマインド間隔は変更できますか？', a: 'はい。3ヶ月・6ヶ月・12ヶ月など、任意の間隔で設定できます。患者さんの診療内容に応じて最適な間隔を設定してください。' },
      { q: '患者さんの個人情報のセキュリティは大丈夫ですか？', a: 'Cloudflareのインフラ上で運用しており、通信は全てHTTPS暗号化されています。データは日本リージョンのサーバーに保存されます。' },
    ],
    metaTitle: 'LumiBook | 歯科クリニック専用予約管理ツール',
    metaDesc: 'LINE予約・オンライン問診・定期検診リマインドを一括管理。歯科クリニックの業務効率を向上。',
  },
  cleaning: {
    label: 'ハウスクリーニング',
    badge: 'ハウスクリーニング専用 AI見積もり＆予約ツール',
    headline: 'お掃除の問い合わせに\nAIが即レスポンス',
    subheadline: '電話に出れない現場作業中も、AIが自動で見積もり・予約対応。\n問い合わせの取りこぼしゼロで、売上を最大化します。',
    problems: [
      { icon: 'phone', title: '現場作業中に電話に出れない', desc: '清掃作業中は手が離せず、問い合わせ電話に出られない。折り返す頃には他社に決まっている' },
      { icon: 'clock', title: '見積もり作成に時間がかかる', desc: '現地下見→見積書作成→送付の流れで数日かかり、お客様が待ちきれずに離脱' },
      { icon: 'calendar', title: '予約管理がバラバラ', desc: 'LINE・電話・メールから入る予約をノートや手帳で管理。ダブルブッキングのリスク' },
      { icon: 'users', title: '問い合わせの半分以上が失注', desc: '対応の遅れや見積もりの手間で、せっかくの問い合わせを逃してしまう' },
      { icon: 'chart', title: '繁忙期と閑散期の波が激しい', desc: 'リピーターへのアプローチが手動で、閑散期の売上安定化ができていない' },
    ],
    features: [
      { icon: 'sparkles', title: 'AI即時見積もり', desc: 'LINEで「3LDKのクリーニングお願いします」と送るだけ。AIが間取り・種類・オプションから即座に概算見積もりを返信。' },
      { icon: 'message', title: 'LINE自動応答24時間', desc: '深夜・早朝・作業中でもAIが自動対応。お客様を待たせず、問い合わせの取りこぼしをゼロに。' },
      { icon: 'calendar', title: '予約一元管理', desc: 'LINE予約・電話予約をひとつの管理画面で。ダブルブッキングを防ぎ、スケジュール管理をシンプルに。' },
      { icon: 'bell', title: '前日自動リマインド', desc: '予約日の前日にお客様へ自動通知。「当日は鍵のお預けをお願いします」等の連絡も一緒に。' },
      { icon: 'chart', title: '売上・顧客分析', desc: 'メニュー別売上・リピート率・エリア別実績を自動集計。繁忙期の予測と閑散期の対策に活用。' },
      { icon: 'users', title: 'リピート促進自動配信', desc: '「前回の清掃から3ヶ月です」「エアコンシーズン前のクリーニングはいかがですか？」最適なタイミングで自動配信。' },
    ],
    flow: [
      { step: '01', title: 'LINE公式アカウント連携', desc: 'お手持ちのLINE公式アカウントとAPI連携。ガイドに沿って最短15分で完了します。' },
      { step: '02', title: 'メニュー・料金設定', desc: '通常清掃・退去時・エアコン等のメニューと料金を登録。オプション料金も自由に設定可能。' },
      { step: '03', title: 'AI見積もり開始', desc: 'LINE友だち追加したお客様からの問い合わせに、AIが自動で見積もり対応。あなたは現場に集中するだけ。' },
    ],
    faqs: [
      { q: 'AIの見積もりは正確ですか？', a: 'AIは間取り・清掃種類・オプションから概算見積もりを算出します。「概算のため現地確認後に正式見積もり」と自動で案内するので、トラブルを防げます。料金マスターはご自身で自由に設定可能です。' },
      { q: '現地下見が必要な場合はどうなりますか？', a: 'AIが概算見積もりを提示した後、「正確なお見積もりのため無料下見をご案内できます」と自動で案内します。お客様が希望すれば下見予約のフローに進みます。' },
      { q: '個人事業主でも使えますか？', a: 'はい。Starterプランは月額¥3,980から。一人親方やフリーランスの清掃業の方にも多くご利用いただいています。スマホだけで管理できます。' },
      { q: '退去時クリーニングと通常清掃で料金テーブルを分けられますか？', a: 'はい。メニューごとに基本料金・部屋数追加料金・オプション料金を個別に設定できます。退去時と日常清掃で異なる料金体系に対応しています。' },
    ],
    metaTitle: 'クリーンプロAI | ハウスクリーニング専用 AI見積もり＆予約ツール',
    metaDesc: 'LINEで問い合わせ→AIが即時見積もり→そのまま予約。ハウスクリーニング業の問い合わせ対応を自動化し、売上を最大化。',
  },
  handyman: {
    label: '便利屋・なんでも屋',
    badge: '便利屋専用 AI見積もり＆予約管理ツール',
    headline: '便利屋の問い合わせに\nAIが30秒で見積もり回答',
    subheadline: '現場作業中でもAIが自動で見積もり・カテゴリ分類・予約対応。\n電話に出られない間の失注をゼロにします。',
    problems: [
      { icon: 'phone', title: '作業中に電話に出られない', desc: '脚立の上や水回り作業中に電話が鳴っても出られず、折り返す頃にはお客様が他社に依頼済み' },
      { icon: 'clock', title: '依頼内容のヒアリングに時間がかかる', desc: '「何でもやります」が売りだからこそ、依頼内容の確認に毎回10-15分かかる' },
      { icon: 'calendar', title: 'スケジュール管理が紙・手帳', desc: '電話メモと手帳の二重管理。ダブルブッキングや予定忘れが月に1-2回発生' },
      { icon: 'users', title: '見積もり作成が手間', desc: '現場下見→見積書作成→送付の流れで2-3日。その間にお客様の熱が冷める' },
      { icon: 'chart', title: 'リピーターへのアプローチが皆無', desc: '一度きりのお客様が多く、定期的な仕事につながらない' },
    ],
    features: [
      { icon: 'sparkles', title: 'AI即時見積もり', desc: 'LINEで「棚を取り付けてほしい」と送るだけ。AIが作業カテゴリを判定し、30秒で概算見積もりを自動返信。' },
      { icon: 'message', title: 'LINE自動応答24時間', desc: '深夜・早朝・作業中でもAIが対応。「鍵を開けてほしい」「蛇口が水漏れ」等の緊急依頼も即レスポンス。' },
      { icon: 'shield', title: 'AIカテゴリ分類', desc: '13カテゴリの作業を自動判定。家具組立・水回り・電気・庭木・害虫・鍵など、適切な料金テーブルを即座に適用。' },
      { icon: 'calendar', title: '予約一元管理', desc: 'LINE・電話・Webからの依頼をひとつの管理画面で。日別ビューで空き状況が一目瞭然。' },
      { icon: 'bell', title: '前日自動リマインド', desc: '作業前日にお客様へ自動通知。「作業箇所の周辺を空けておいてください」等の案内も一緒に。' },
      { icon: 'users', title: 'リピート促進自動配信', desc: '「前回の草刈りから2ヶ月です」「エアコン清掃のシーズンです」。定期的な仕事につなげる自動配信。' },
    ],
    flow: [
      { step: '01', title: 'LINE公式アカウント連携', desc: 'お手持ちのLINE公式アカウントとAPI連携。ガイドに沿って最短15分で完了します。' },
      { step: '02', title: '料金テーブル設定', desc: '13カテゴリの基本料金・オプション料金を管理画面から設定。あなたの料金体系に合わせて自由にカスタマイズ。' },
      { step: '03', title: 'AI見積もり開始', desc: 'LINEで友だち追加したお客様からの問い合わせに、AIが自動で見積もり回答。あなたは現場に集中するだけ。' },
    ],
    faqs: [
      { q: 'AIは「何でもやります」の多様な依頼に対応できますか？', a: 'はい。家具組立・水回り・電気・庭木・害虫・鍵・清掃・引越し手伝いなど13カテゴリに対応。AIが依頼内容から最適なカテゴリを自動判定します。判定できない場合は「その他」として受け付け、あなたに通知します。' },
      { q: '料金テーブルは自由に設定できますか？', a: 'はい。カテゴリごとの基本料金・数量単価・緊急対応・夜間対応・土日対応の追加料金をすべて個別に設定できます。エリア別の出張費も設定可能です。' },
      { q: '個人事業主でも使えますか？', a: 'はい。Starterプランは月額¥3,980から。一人親方の便利屋さんにも多くご利用いただいています。スマホだけで管理できます。' },
      { q: '緊急依頼の通知はリアルタイムですか？', a: 'AIが依頼の緊急度を自動判定し、「urgent（緊急）」の場合は管理者のLINEにプッシュ通知を送ります。作業中でもスマホで確認できます。' },
    ],
    metaTitle: 'ベンリプロAI | 便利屋専用 AI見積もり＆予約管理ツール',
    metaDesc: 'LINEで問い合わせ→AIが30秒で見積もり回答→予約管理。便利屋・なんでも屋の問い合わせ対応を自動化。',
  },
  esthetic: {
    label: 'エステ・リラクゼーション',
    badge: 'エステサロン専用の予約自動化ツール',
    headline: 'エステサロンの予約を\nもっとスマートに',
    subheadline: 'フェイシャル・ボディ・毛穴ケアの施術カテゴリ別管理。\n初回カウンセリングからリピート促進まで一元管理します。',
    problems: [
      { icon: 'phone', title: '電話・SNS対応で施術に集中できない', desc: 'Instagramの問い合わせや電話対応で、施術の合間が埋まってしまう' },
      { icon: 'calendar', title: '施術カテゴリが多く予約管理が複雑', desc: 'フェイシャル・ボディ・痩身・脱毛など、メニューが多岐にわたり管理が大変' },
      { icon: 'clock', title: '初回カウンセリングの時間配分が難しい', desc: 'お客様の悩みを事前に把握できず、カウンセリングが長引く' },
      { icon: 'users', title: 'コースの継続率が低い', desc: '施術効果が出始める前に離脱してしまうお客様が多い' },
      { icon: 'chart', title: '施術カテゴリ別の実績が見えない', desc: 'どの施術が人気で収益に貢献しているか把握できていない' },
    ],
    features: [
      { icon: 'message', title: 'LINEで予約完結', desc: 'お客様はLINEから施術カテゴリ→メニュー→日時を選択。初回カウンセリングの予約もオンラインで。' },
      { icon: 'shield', title: '事前カウンセリングシート', desc: 'お肌の悩み・アレルギー・敏感肌の既往を事前にヒアリング。施術提案の質が向上します。' },
      { icon: 'bell', title: '施術前日リマインド', desc: '予約日前日にLINEで自動通知。「メイクを落としてお越しください」等の準備案内も一緒に。' },
      { icon: 'calendar', title: '施術カテゴリ別管理', desc: 'フェイシャル・ボディ・毛穴ケア・リラクゼーション・痩身。カテゴリで整理された見やすいメニュー表。' },
      { icon: 'chart', title: '施術分析KPI', desc: 'カテゴリ別の予約数・リピート率・売上を可視化。人気施術の把握とメニュー改善に直結。' },
      { icon: 'sparkles', title: '継続施術リマインド', desc: '「前回のフェイシャルから3週間です」「季節の変わり目のケアはいかが？」。継続来店を促進。' },
    ],
    flow: [
      { step: '01', title: 'LINE公式アカウント連携', desc: 'サロンのLINE公式アカウントと連携。設定はガイドに沿って進めるだけ。' },
      { step: '02', title: 'メニュー・カウンセリング設定', desc: '施術メニューの登録と、事前アンケートの質問を設定。テンプレートですぐに始められます。' },
      { step: '03', title: '予約URLを共有して運用開始', desc: 'SNSやLINEプロフィールに予約URLを掲載。お客様は24時間いつでもオンラインで予約可能に。' },
    ],
    faqs: [
      { q: '初回カウンセリングと通常施術で時間が違いますが対応できますか？', a: 'はい。メニューごとに所要時間を個別設定できます。初回カウンセリング30分、通常施術60分のような設定が可能です。' },
      { q: '事前アンケートの内容はカスタマイズできますか？', a: 'はい。テキスト入力・チェックボックスなど複数の質問タイプで自由に構成できます。肌質や既往歴の質問テンプレートも用意しています。' },
      { q: 'コース契約の回数管理はできますか？', a: '現時点では単発予約の管理に特化しています。コース回数の管理機能は今後のアップデートで対応予定です。' },
      { q: 'スタッフが複数いる場合のシフト管理は？', a: 'Proプラン以上でスタッフ数無制限です。各エステティシャンのシフトを個別に設定でき、指名予約にも対応しています。' },
    ],
    metaTitle: 'LumiBook | エステサロン専用予約管理ツール',
    metaDesc: 'LINE予約・カウンセリング・リマインドを自動化。エステサロンの予約業務を効率化するツール。',
  },
};

// ── Metadata ────────────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<{ vertical: string }> }): Promise<Metadata> {
  const { vertical } = await params;
  const data = LP[vertical];
  if (!data) return { title: 'LumiBook' };
  return {
    title: data.metaTitle, description: data.metaDesc,
    openGraph: { title: data.metaTitle, description: data.metaDesc, type: 'website', locale: 'ja_JP' },
    twitter: { card: 'summary_large_image', title: data.metaTitle, description: data.metaDesc },
  };
}

export function generateStaticParams() {
  return Object.keys(LP).map(v => ({ vertical: v }));
}

// ── Page ────────────────────────────────────────────────────────────
export default async function VerticalLandingPage({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = await params;
  const d = LP[vertical];

  if (!d) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">ページが見つかりません</h1>
          <Link href="/lp/eyebrow" className="text-indigo-600 hover:underline">トップページへ</Link>
        </div>
      </div>
    );
  }

  const designKey = getDesignKey(vertical);
  const Design = DESIGNS[designKey];
  const t = getTheme(vertical);
  const signupUrl = `${SIGNUP_HREF}?vertical=${vertical}`;

  return <Design d={d} t={t} vertical={vertical} signupUrl={signupUrl} />;
}
