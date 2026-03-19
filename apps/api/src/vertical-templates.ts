// ─── Vertical Templates ─────────────────────────────────────────────
// Auto-populate a new tenant's account with starter data based on industry.

export interface VerticalTemplate {
  /** Pre-populated menu items */
  menus: {
    name: string;
    duration: number;  // minutes
    price: number;     // yen
    description?: string;
    category?: string;
  }[];
  /** Pre-populated staff members */
  staff: {
    name: string;
    role?: string;
  }[];
  /** AI FAQ entries for the AI concierge */
  faq: {
    question: string;
    answer: string;
  }[];
  /** AI system prompt / character setting */
  aiCharacter: string;
  /** Default business hours for this vertical */
  businessHours: { openTime: string; closeTime: string };
  /** Default closed weekdays (0=Sun, 1=Mon, …, 6=Sat) */
  closedWeekdays: number[];
  /** Vertical-specific settings */
  verticalConfig: {
    consentText?: string;
    surveyEnabled?: boolean;
    surveyQuestions?: { id: string; label: string; type: 'text' | 'textarea' | 'checkbox'; enabled: boolean }[];
  };
}

export const VERTICAL_TEMPLATES: Record<string, VerticalTemplate> = {
  // ────────────────────────────────────────────────────────────────────
  // 眉毛サロン
  // ────────────────────────────────────────────────────────────────────
  eyebrow: {
    menus: [
      { name: '眉毛デザイン', duration: 60, price: 5500, description: 'お顔の骨格に合わせた眉毛デザイン', category: 'デザイン' },
      { name: '眉毛カット', duration: 30, price: 3300, description: '形を整える眉カット', category: 'カット' },
      { name: '眉毛パーマ', duration: 45, price: 4400, description: '毛流れを整える眉パーマ', category: 'パーマ' },
      { name: '眉毛ワックス', duration: 30, price: 3800, description: 'ワックスを使った眉毛の脱毛・整形', category: 'ワックス' },
      { name: '初回カウンセリング付き眉デザイン', duration: 90, price: 6600, description: '初めての方向け。カウンセリング＋施術のフルコース', category: 'デザイン' },
    ],
    staff: [
      { name: 'スタッフA', role: 'アイブロウリスト' },
      { name: 'スタッフB', role: 'アイブロウリスト' },
    ],
    faq: [
      {
        question: '眉毛デザインは痛みがありますか？',
        answer: 'ワックス脱毛の際に多少の痛みを感じる場合がありますが、施術前に丁寧にお声がけしながら進めますのでご安心ください。痛みに敏感な方には、刺激の少ない手法もご提案させていただきます。',
      },
      {
        question: 'デザインの持続期間はどのくらいですか？',
        answer: '個人差はありますが、眉毛デザインの効果は約3〜4週間持続します。毛の成長サイクルに合わせて、月に1回程度のメンテナンスをおすすめしています。定期的にご来店いただくことで、美しい眉をキープできます。',
      },
      {
        question: '男性でも施術を受けられますか？',
        answer: 'もちろん大歓迎です。最近は男性のお客様も増えており、ビジネスシーンでの印象アップや清潔感のために眉毛を整える方が多くいらっしゃいます。男性向けのナチュラルなデザインもご用意しておりますので、お気軽にご相談ください。',
      },
      {
        question: '施術前に準備することはありますか？',
        answer: '特別な準備は必要ありません。ただし、施術の2週間前からは眉毛を抜いたり剃ったりせず、自然な状態でお越しいただけると、より理想的なデザインをご提案できます。メイクをしたままのご来店でも大丈夫です。',
      },
      {
        question: 'アレルギーや肌が弱い場合でも大丈夫ですか？',
        answer: '敏感肌やアレルギーをお持ちの方には、事前にパッチテストを行い、肌に優しい製品を使用いたします。カウンセリング時にお肌の状態をしっかり確認させていただきますので、ご不安な点はお気軽にお申し付けください。',
      },
    ],
    aiCharacter: 'あなたは眉毛サロン専門の丁寧な接客AIです。お客様の骨格や表情に合わせた眉デザインの魅力をお伝えし、初めてのお客様にも安心感を持っていただけるよう、優しく分かりやすい言葉遣いで対応してください。専門用語を使う際は必ず補足説明を添えてください。',
    businessHours: { openTime: '10:00', closeTime: '19:00' },
    closedWeekdays: [0],
    verticalConfig: {
      consentText: '施術内容とリスクについてご理解いただけましたか？ご同意いただける場合はチェックを入れてください。',
      surveyEnabled: true,
      surveyQuestions: [
        { id: 'eyebrow_concern', label: '眉毛に関するお悩みをお聞かせください', type: 'textarea', enabled: true },
        { id: 'eyebrow_reference', label: '理想の眉毛イメージはありますか？（芸能人名や写真など）', type: 'text', enabled: true },
        { id: 'eyebrow_allergy', label: 'アレルギーや肌トラブルの経験がありますか？', type: 'checkbox', enabled: true },
      ],
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // ネイルサロン
  // ────────────────────────────────────────────────────────────────────
  nail: {
    menus: [
      { name: 'ジェルネイル ワンカラー', duration: 60, price: 5000, description: 'お好きな1色で仕上げるシンプルジェル', category: 'ジェルネイル' },
      { name: 'ジェルネイル アート', duration: 90, price: 7500, description: 'トレンドアートやストーンを使ったデザインネイル', category: 'ジェルネイル' },
      { name: 'ケア・甘皮処理', duration: 30, price: 2500, description: '爪周りの甘皮ケアと爪の形を整えます', category: 'ケア' },
      { name: 'ジェルオフ', duration: 30, price: 2000, description: '既存のジェルネイルを丁寧にオフします', category: 'オフ' },
      { name: 'フットジェル', duration: 90, price: 7000, description: 'フットケア＋ジェル仕上げ', category: 'フット' },
      { name: 'ハンドケアコース', duration: 60, price: 4500, description: 'ハンドスパ＋保湿トリートメント＋ネイルケア', category: 'ケア' },
    ],
    staff: [
      { name: 'ネイリストA', role: 'ネイリスト' },
      { name: 'ネイリストB', role: 'ネイリスト' },
    ],
    faq: [
      {
        question: 'ジェルネイルはどのくらい持ちますか？',
        answer: '一般的に3〜4週間程度持続します。爪の伸び具合や生活スタイルによって個人差がありますが、定期的なメンテナンスで長くきれいな状態を保てます。浮きや欠けが気になった場合は、お早めにリペアにお越しください。',
      },
      {
        question: '爪が弱いのですが大丈夫ですか？',
        answer: '爪が薄い方や弱い方でもジェルネイルは可能です。むしろジェルがコーティングの役割を果たし、爪を保護する効果もあります。爪の状態に合わせて最適な施術方法をご提案いたしますので、カウンセリング時にお気軽にご相談ください。',
      },
      {
        question: '持ち込みデザインはできますか？',
        answer: 'もちろん可能です。SNSやネイルカタログの画像をお持ちいただければ、できる限り再現いたします。デザインの複雑さによって施術時間や料金が変わる場合がありますので、ご予約時またはカウンセリング時にご相談ください。',
      },
      {
        question: '自分でジェルをオフしても良いですか？',
        answer: 'ご自身でのオフはお勧めしておりません。無理に剥がすと自爪が薄くなったり、表面が傷ついてしまう原因になります。当サロンでは専用のリムーバーで爪に負担をかけないよう丁寧にオフいたしますので、ぜひご来店ください。',
      },
      {
        question: 'ネイルアレルギーが心配です',
        answer: '当サロンでは低刺激のジェルも取り扱っております。過去にアレルギー反応が出たことがある方は、事前にお知らせいただければパッチテストを行うことも可能です。安心して施術を受けていただけるよう、万全の体制を整えております。',
      },
    ],
    aiCharacter: 'あなたはネイルサロン専門の親しみやすい接客AIです。最新のトレンドデザインやお客様の好みに合わせた提案を得意とし、ネイルの楽しさを伝えるフレンドリーな会話を心がけてください。初めての方にも安心していただけるよう、施術の流れやケア方法を分かりやすく説明してください。',
    businessHours: { openTime: '10:00', closeTime: '20:00' },
    closedWeekdays: [2],
    verticalConfig: {},
  },

  // ────────────────────────────────────────────────────────────────────
  // ヘアサロン
  // ────────────────────────────────────────────────────────────────────
  hair: {
    menus: [
      { name: 'カット', duration: 45, price: 4500, description: '似合わせカット＋シャンプー・ブロー込み', category: 'カット' },
      { name: 'カラー', duration: 90, price: 7000, description: 'フルカラー（ロング料金別途）', category: 'カラー' },
      { name: 'パーマ', duration: 120, price: 8500, description: 'デジタルパーマ or コールドパーマ', category: 'パーマ' },
      { name: 'トリートメント', duration: 45, price: 4000, description: '髪質改善トリートメント', category: 'トリートメント' },
      { name: 'カット+カラー', duration: 120, price: 10500, description: 'カットとカラーのお得なセットメニュー', category: 'セット' },
      { name: 'ヘッドスパ', duration: 60, price: 5500, description: '頭皮ケア＋リラクゼーションマッサージ', category: 'スパ' },
    ],
    staff: [
      { name: 'スタイリストA', role: 'スタイリスト' },
      { name: 'スタイリストB', role: 'スタイリスト' },
      { name: 'アシスタント', role: 'アシスタント' },
    ],
    faq: [
      {
        question: '予約なしでも行けますか？',
        answer: '当サロンは予約優先制となっております。予約なしでもお席が空いていればご案内可能ですが、お待ちいただく場合がございます。確実にご希望の時間で施術を受けていただくために、事前のご予約をおすすめしています。',
      },
      {
        question: 'カラーはどのくらい持ちますか？',
        answer: 'カラーの持ちは色味や髪質によって異なりますが、一般的に1〜2ヶ月程度です。色落ちを防ぐためには、カラー用のシャンプーの使用や、洗髪後のドライヤーでの乾燥がおすすめです。退色が気になってきたら、リタッチやトーンアップのご予約もお待ちしております。',
      },
      {
        question: '子供のカットはできますか？',
        answer: 'お子様のカットも大歓迎です。お子様が安心して座れるよう配慮しながら施術いたします。小学生以下のお子様は特別料金でご案内しておりますので、お気軽にお問い合わせください。',
      },
      {
        question: 'パーマとカラーは同日にできますか？',
        answer: '同日施術も可能ですが、髪へのダメージを考慮し、髪の状態によっては別日をおすすめする場合がございます。事前にスタイリストが髪質を確認し、最適なプランをご提案いたしますので、カウンセリング時にご希望をお伝えください。',
      },
      {
        question: '駐車場はありますか？',
        answer: '店舗専用の駐車場をご用意しております。台数に限りがありますので、お車でお越しの際はご予約時にお申し付けください。近隣のコインパーキングもございますので、満車の場合はそちらをご利用いただけます。',
      },
    ],
    aiCharacter: 'あなたはヘアサロン専門のおしゃれで丁寧な接客AIです。トレンドのヘアスタイルや髪質改善の知識を活かし、お客様一人ひとりに合ったスタイル提案を行ってください。カジュアルながらも上品な言葉遣いで、サロンのリラックスした雰囲気を伝えてください。',
    businessHours: { openTime: '10:00', closeTime: '20:00' },
    closedWeekdays: [1],
    verticalConfig: {},
  },

  // ────────────────────────────────────────────────────────────────────
  // 歯科クリニック
  // ────────────────────────────────────────────────────────────────────
  dental: {
    menus: [
      { name: '定期検診', duration: 30, price: 0, description: '虫歯・歯周病チェックと口腔内診査', category: '検診' },
      { name: 'クリーニング', duration: 45, price: 3000, description: '歯石除去＋歯面清掃（PMTC）', category: 'クリーニング' },
      { name: 'ホワイトニング', duration: 60, price: 15000, description: 'オフィスホワイトニング（自費）', category: '審美' },
      { name: '虫歯治療', duration: 60, price: 0, description: '虫歯の治療（保険適用）', category: '治療' },
      { name: '初診相談', duration: 30, price: 0, description: '初めての方向けカウンセリング', category: '相談' },
      { name: '矯正相談', duration: 45, price: 0, description: '歯列矯正の無料相談', category: '矯正' },
    ],
    staff: [
      { name: '院長', role: '歯科医師' },
      { name: '歯科衛生士A', role: '歯科衛生士' },
      { name: '歯科衛生士B', role: '歯科衛生士' },
    ],
    faq: [
      {
        question: '保険は適用されますか？',
        answer: '定期検診、虫歯治療、歯周病治療などの一般的な歯科治療は健康保険が適用されます。ホワイトニングや審美目的の治療、インプラントなどは自費診療となります。治療内容ごとの費用目安は、初回カウンセリングで詳しくご説明いたします。',
      },
      {
        question: '治療は痛くないですか？',
        answer: '当院では痛みの少ない治療を心がけております。表面麻酔を塗布してから注射を行うなど、できる限り痛みを軽減する工夫をしています。それでも不安な方には、笑気麻酔などのオプションもございますので、お気軽にご相談ください。',
      },
      {
        question: '子供の診察もできますか？',
        answer: 'お子様の診察も歓迎しております。小児歯科にも対応しており、フッ素塗布やシーラントなどの予防処置も行っています。お子様が歯医者に慣れるよう、まずは雰囲気に慣れていただくところから始めますので、初めての方も安心してお越しください。',
      },
      {
        question: '急に歯が痛くなった場合は？',
        answer: '急な痛みや腫れなどの緊急の場合は、お電話にてご連絡ください。予約状況にもよりますが、できる限り当日中に応急処置をさせていただきます。診療時間外の場合は、留守番電話にメッセージをお残しいただければ、翌営業日に折り返しご連絡いたします。',
      },
      {
        question: 'ホワイトニングの効果はどのくらいですか？',
        answer: '個人差はありますが、オフィスホワイトニング1回で数段階のトーンアップが期待できます。効果は通常3〜6ヶ月持続し、定期的なメンテナンスでより長く白さを保てます。ホームホワイトニングとの併用でさらに効果的な結果が得られます。',
      },
    ],
    aiCharacter: 'あなたは歯科クリニック専門の安心感のある丁寧な接客AIです。患者様の不安や恐怖心に寄り添い、治療内容を分かりやすく説明することを心がけてください。医療的な正確性を保ちながらも、温かみのある言葉遣いで、患者様がリラックスして来院できるようサポートしてください。',
    businessHours: { openTime: '09:00', closeTime: '18:00' },
    closedWeekdays: [0, 3],
    verticalConfig: {
      surveyEnabled: true,
      surveyQuestions: [
        { id: 'dental_symptoms', label: '現在の症状やお悩みをお聞かせください', type: 'textarea', enabled: true },
        { id: 'dental_history', label: '過去の歯科治療歴で特筆すべきことはありますか？', type: 'textarea', enabled: true },
        { id: 'dental_allergy', label: '薬や麻酔に対するアレルギーはありますか？', type: 'checkbox', enabled: true },
      ],
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // エステサロン
  // ────────────────────────────────────────────────────────────────────
  esthetic: {
    menus: [
      { name: 'フェイシャルベーシック', duration: 60, price: 6000, description: 'クレンジング＋マッサージ＋パック', category: 'フェイシャル' },
      { name: 'ボディトリートメント', duration: 90, price: 9000, description: '全身オイルマッサージ＋デトックスケア', category: 'ボディ' },
      { name: '毛穴ケア', duration: 45, price: 5000, description: '毛穴の黒ずみ・開きを集中ケア', category: 'フェイシャル' },
      { name: '痩身コース', duration: 60, price: 8000, description: 'キャビテーション＋EMSの痩身プログラム', category: 'ボディ' },
      { name: 'リラクゼーション', duration: 60, price: 5500, description: 'アロマオイルを使った癒しのトリートメント', category: 'リラクゼーション' },
      { name: '初回カウンセリング付きフェイシャル', duration: 90, price: 4980, description: '初めての方限定。肌診断＋カウンセリング＋フェイシャル', category: 'フェイシャル' },
    ],
    staff: [
      { name: 'エステティシャンA', role: 'エステティシャン' },
      { name: 'エステティシャンB', role: 'エステティシャン' },
    ],
    faq: [
      {
        question: '敏感肌でも大丈夫ですか？',
        answer: '敏感肌の方にも安心して受けていただけるよう、低刺激の化粧品を複数ご用意しております。施術前のカウンセリングでお肌の状態を丁寧に確認し、お肌に合った製品と手技でケアいたします。ご不安な場合は事前にパッチテストも可能です。',
      },
      {
        question: '効果はいつから実感できますか？',
        answer: 'フェイシャルは1回目から肌のトーンアップやハリ感を実感される方が多いです。痩身コースは個人差がありますが、3〜5回の施術で変化を感じ始める方が多くいらっしゃいます。継続的なケアでより確かな効果を実感いただけます。',
      },
      {
        question: '生理中でも施術を受けられますか？',
        answer: '基本的には受けていただけますが、体調やメニューによってはおすすめしない場合もございます。ボディの施術は体が冷えやすい時期のため、フェイシャルメニューへの変更をご提案する場合がございます。当日の体調に合わせて柔軟に対応いたしますので、お気軽にお申し付けください。',
      },
      {
        question: 'メイクをして行っても大丈夫ですか？',
        answer: 'フェイシャルメニューの場合は施術前にクレンジングを行いますので、メイクをしたままお越しいただいて大丈夫です。施術後はメイク直しスペースもご用意しておりますので、お出かけ前のご来店も歓迎です。',
      },
      {
        question: '男性でも利用できますか？',
        answer: '男性のお客様も大歓迎です。メンズフェイシャルやボディケアのメニューもご用意しており、男性特有の肌悩み（毛穴、皮脂、ヒゲ負け）にも対応しております。完全個室での施術ですので、リラックスしてお過ごしいただけます。',
      },
    ],
    aiCharacter: 'あなたはエステサロン専門の上品で癒し系の接客AIです。お客様の美と健康をサポートする存在として、丁寧で温かみのある言葉遣いを心がけてください。肌悩みや体の不調に共感しつつ、プロフェッショナルな知識に基づいたアドバイスで、来店への期待感を高めてください。',
    businessHours: { openTime: '10:00', closeTime: '20:00' },
    closedWeekdays: [1],
    verticalConfig: {
      surveyEnabled: true,
      surveyQuestions: [
        { id: 'esthetic_skin_concern', label: 'お肌のお悩みをお聞かせください', type: 'textarea', enabled: true },
        { id: 'esthetic_allergy', label: 'アレルギーや肌トラブルの経験がありますか？', type: 'checkbox', enabled: true },
      ],
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // ペットサロン・トリミング
  // ────────────────────────────────────────────────────────────────────
  pet: {
    menus: [
      { name: 'トリミング 小型犬', duration: 60, price: 4000, description: 'シャンプー+カット+爪切り+耳掃除+肛門腺絞り（小型犬）', category: 'トリミング' },
      { name: 'トリミング 中型犬', duration: 90, price: 6000, description: 'シャンプー+カット+爪切り+耳掃除+肛門腺絞り（中型犬）', category: 'トリミング' },
      { name: 'トリミング 大型犬', duration: 120, price: 8000, description: 'シャンプー+カット+爪切り+耳掃除+肛門腺絞り（大型犬）', category: 'トリミング' },
      { name: 'シャンプーコース 小型犬', duration: 45, price: 3000, description: 'シャンプー+ブロー+爪切り+耳掃除+肛門腺絞り（小型犬）', category: 'シャンプー' },
      { name: '爪切り・耳掃除セット', duration: 15, price: 1500, description: '爪切りと耳掃除の単品セット', category: 'ケア' },
      { name: 'デンタルケアセット', duration: 20, price: 2000, description: '歯磨き+口臭ケア+歯石チェック', category: 'ケア' },
    ],
    staff: [
      { name: 'トリマーA', role: 'トリマー' },
      { name: 'トリマーB', role: 'トリマー' },
    ],
    faq: [
      {
        question: 'ワクチン接種は必要ですか？',
        answer: 'はい、混合ワクチン接種証明書をご持参ください。狂犬病予防接種も必要です。接種後1週間以上経過していることが条件となります。証明書をお忘れの場合は施術をお断りする場合がございますので、ご了承ください。',
      },
      {
        question: '初めてのトリミングは何ヶ月からできますか？',
        answer: '生後3〜4ヶ月頃、ワクチン接種2回目以降から可能です。初回は環境に慣れていただくため、シャンプーや部分カットなど短時間のメニューからスタートすることをおすすめしています。パピーちゃんのペースに合わせて優しく対応いたします。',
      },
      {
        question: '攻撃的な子でも大丈夫ですか？',
        answer: 'はい、経験豊富なトリマーが対応いたしますのでご安心ください。事前にわんちゃんの性格や苦手なことをお伝えいただければ、負担をかけないよう配慮しながら施術いたします。どうしても難しい場合は、獣医師と連携して対応する方法もございます。',
      },
      {
        question: '皮膚トラブルがある場合はどうすればいいですか？',
        answer: '獣医師の診断書をお持ちの場合、薬浴コースでの対応が可能です。皮膚の状態に合わせた低刺激シャンプーや薬用シャンプーをご用意しております。トリミング前にお肌の状態を確認し、最適なケア方法をご提案いたします。',
      },
      {
        question: '仕上がりの写真はもらえますか？',
        answer: 'トリミング後にLINEでお写真をお送りいたします。かわいく仕上がったわんちゃんのベストショットを撮影してお届けしますので、楽しみにお待ちください。SNS掲載の許可をいただけた場合は、当サロンのInstagramでもご紹介させていただきます。',
      },
    ],
    aiCharacter: 'ペットサロン専門の温かく親しみやすいAIスタッフです。わんちゃん・ねこちゃんの健康と美容を大切にし、飼い主さまの不安を解消するよう丁寧にご案内します。',
    businessHours: { openTime: '09:00', closeTime: '18:00' },
    closedWeekdays: [3],
    verticalConfig: {
      surveyEnabled: true,
      surveyQuestions: [
        { id: 'pet_name', label: 'ペットのお名前を教えてください', type: 'text', enabled: true },
        { id: 'pet_breed', label: '犬種・猫種を教えてください', type: 'text', enabled: true },
        { id: 'pet_age', label: '年齢（月齢）を教えてください', type: 'text', enabled: true },
        { id: 'pet_allergy', label: 'アレルギーや皮膚トラブル、持病はありますか？', type: 'textarea', enabled: true },
      ],
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // ハウスクリーニング
  // ────────────────────────────────────────────────────────────────────
  cleaning: {
    menus: [
      { name: '通常清掃 1R-1K', duration: 120, price: 15000, description: 'ワンルーム〜1Kの全体清掃', category: '通常清掃' },
      { name: '通常清掃 2LDK', duration: 180, price: 25000, description: '2LDKの全体清掃', category: '通常清掃' },
      { name: 'エアコンクリーニング', duration: 90, price: 12000, description: '壁掛けエアコンの分解洗浄', category: 'エアコン' },
      { name: '退去時クリーニング 1R', duration: 180, price: 25000, description: '退去時のフルクリーニング（1R）', category: '退去時' },
      { name: '水回りセット', duration: 120, price: 18000, description: 'キッチン＋浴室＋トイレのセット清掃', category: '水回り' },
      { name: 'レンジフード', duration: 60, price: 12000, description: 'レンジフード分解洗浄', category: 'キッチン' },
    ],
    staff: [
      { name: '清掃スタッフA', role: '清掃スタッフ' },
      { name: '清掃スタッフB', role: '清掃スタッフ' },
    ],
    faq: [
      {
        question: '駐車場は必要ですか？',
        answer: '作業車でお伺いいたしますので、作業場所の近くに駐車スペースがあると助かります。駐車場がない場合は近隣のコインパーキングを利用いたしますが、駐車料金をご負担いただく場合がございます。事前にお知らせいただければ対応を検討いたします。',
      },
      {
        question: '不在でも作業してもらえますか？',
        answer: '鍵のお預かりが可能であれば、不在時の作業も対応しております。その場合は事前に作業範囲や注意事項を確認させていただき、作業後に写真付きの完了報告をお送りいたします。貴重品の管理等はお客様ご自身でお願いしております。',
      },
      {
        question: '洗剤や道具は持参してくれますか？',
        answer: '必要な洗剤・道具はすべてスタッフが持参いたしますのでご準備は不要です。環境や健康に配慮した洗剤を使用しておりますが、特定の洗剤のご要望やアレルギーがある場合は事前にお知らせください。',
      },
      {
        question: 'ペットがいても大丈夫ですか？',
        answer: 'ペットがいるお宅でも対応可能です。ただし、作業中はペットが安全に過ごせるよう別室にいていただくか、ケージに入れていただけると助かります。ペットに安全な洗剤を使用しておりますのでご安心ください。',
      },
      {
        question: '追加料金が発生することはありますか？',
        answer: '基本的にお見積もり金額内で作業いたします。ただし、事前にお伺いしていた状態と大きく異なる場合（極度の汚れ等）は、作業開始前に追加料金のご説明とご了承をいただいてから作業を進めますのでご安心ください。',
      },
    ],
    aiCharacter: 'あなたはハウスクリーニング専門の親切で明るい接客AIです。お客様のお家の悩みに寄り添い、清掃のプロとして的確なアドバイスを提供してください。料金や作業内容について分かりやすく説明し、初めてのお客様でも気軽に依頼できる雰囲気を作ってください。',
    businessHours: { openTime: '08:00', closeTime: '18:00' },
    closedWeekdays: [0],
    verticalConfig: {
      surveyEnabled: true,
      surveyQuestions: [
        { id: 'cleaning_address', label: '作業場所の住所をご記入ください', type: 'text', enabled: true },
        { id: 'cleaning_details', label: '特に気になる箇所や汚れの状態をお知らせください', type: 'textarea', enabled: true },
        { id: 'cleaning_parking', label: '駐車スペースはありますか？', type: 'checkbox', enabled: true },
      ],
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // 便利屋
  // ────────────────────────────────────────────────────────────────────
  handyman: {
    menus: [
      { name: '家具組立', duration: 60, price: 5000, description: 'IKEA等の家具組立（1点あたり）', category: '組立' },
      { name: '水回り修理', duration: 60, price: 8000, description: '蛇口・排水・トイレ等の軽微な修理', category: '修理' },
      { name: '電気工事', duration: 60, price: 8000, description: '照明取付・コンセント増設等', category: '電気' },
      { name: '庭木剪定', duration: 120, price: 10000, description: '庭木の剪定・草刈り', category: '庭' },
      { name: '不用品回収', duration: 60, price: 5000, description: '不用品の回収・処分（軽トラ1台分まで）', category: '回収' },
      { name: '引越し手伝い', duration: 120, price: 10000, description: '小規模な引越しのお手伝い', category: '引越し' },
    ],
    staff: [
      { name: '作業スタッフA', role: '作業スタッフ' },
      { name: '作業スタッフB', role: '作業スタッフ' },
    ],
    faq: [
      {
        question: '出張費はかかりますか？',
        answer: 'サービスエリア内であれば出張費は無料です。エリア外の場合は距離に応じた出張費をいただいておりますが、ご依頼前にお見積もりにてご案内いたしますのでご安心ください。サービスエリアの詳細はお電話またはチャットでお問い合わせください。',
      },
      {
        question: '土日や祝日も対応してもらえますか？',
        answer: '土曜・祝日も通常営業しております。日曜日は定休日となっておりますが、緊急のご依頼には可能な限り対応いたします。土日祝日の追加料金は発生しませんので、お仕事がお休みの日でも安心してご依頼ください。',
      },
      {
        question: '見積もりだけでもお願いできますか？',
        answer: 'もちろん可能です。お見積もりは無料で承っております。お電話やチャットでの概算見積もりのほか、現地での詳細見積もりも対応しております。お見積もり後にお断りいただいても費用は一切かかりませんので、お気軽にご依頼ください。',
      },
      {
        question: '作業中に追加の依頼はできますか？',
        answer: '作業中の追加ご依頼も可能です。スタッフのスケジュールに余裕がある場合はその場で対応いたします。追加作業が発生する場合は、事前に内容と料金をご説明し、ご了承をいただいてから作業いたしますのでご安心ください。',
      },
      {
        question: '壊れた場合の保証はありますか？',
        answer: '万が一作業中にお客様の所有物を破損してしまった場合は、当社加入の賠償責任保険にて対応いたします。作業前に家財の状態を確認し、写真を撮らせていただく場合がございます。安心してご依頼いただけるよう、保険・保証体制を整えております。',
      },
    ],
    aiCharacter: 'あなたは便利屋専門のフレンドリーで頼もしい接客AIです。お客様の「困った」に寄り添い、どんな依頼にも前向きに対応する姿勢を見せてください。専門的な作業内容を分かりやすく説明し、お客様が安心して依頼できるよう、明るく元気な対応を心がけてください。',
    businessHours: { openTime: '08:00', closeTime: '19:00' },
    closedWeekdays: [0],
    verticalConfig: {
      surveyEnabled: true,
      surveyQuestions: [
        { id: 'handyman_address', label: '作業場所の住所をご記入ください', type: 'text', enabled: true },
        { id: 'handyman_details', label: '依頼内容の詳細をお聞かせください', type: 'textarea', enabled: true },
      ],
    },
  },
};

/**
 * Look up a vertical template by key.
 * Returns null if the vertical is not found.
 */
export function getVerticalTemplate(vertical: string): VerticalTemplate | null {
  return VERTICAL_TEMPLATES[vertical] ?? null;
}
