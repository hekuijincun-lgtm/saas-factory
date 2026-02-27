export interface EyebrowMenu {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  description: string;
  tags?: string[];
}

export const eyebrowMenus: EyebrowMenu[] = [
  {
    id: "brow_style",
    name: "美眉スタイリング",
    durationMin: 45,
    price: 4500,
    description: "骨格・顔型に合わせたオーダーメイドの美眉デザイン。ワックス＋仕上げが含まれます。",
    tags: ["人気No.1", "初回おすすめ"],
  },
  {
    id: "hollywood_brow",
    name: "ハリウッドブロウリフト",
    durationMin: 60,
    price: 7000,
    description: "眉毛のパーマとケアを同時に行い、立体的でエレガントな眉に。効果は4〜6週間持続。",
    tags: ["人気急上昇", "リフトアップ"],
  },
  {
    id: "brow_wax",
    name: "眉ワックス脱毛",
    durationMin: 30,
    price: 3500,
    description: "ワックスで余分な毛を除去し、スッキリとした印象の眉ラインを形成します。",
    tags: ["短時間・気軽に"],
  },
  {
    id: "mens_brow",
    name: "メンズ眉スタイリング",
    durationMin: 45,
    price: 4800,
    description: "男性の骨格に合わせた自然でシャープな眉デザイン。ビジネス・プライベートどちらにも。",
    tags: ["メンズ専門"],
  },
  {
    id: "student_brow",
    name: "学割眉スタイリング",
    durationMin: 45,
    price: 3800,
    description: "学生証提示で通常の美眉スタイリングがお得な価格で。来店時に学生証をご提示ください。",
    tags: ["学割", "要学生証"],
  },
];

export const defaultCopy = {
  salonName: "Brow Studio",
  tagline: "あなただけの美眉を、一緒に作りましょう",
  description:
    "骨格・顔型・ライフスタイルに合わせたオーダーメイドの眉デザイン。" +
    "初回の方もお気軽にどうぞ。",
  notes: [
    "ご予約の変更・キャンセルは前日17時までにご連絡ください",
    "施術前の眉毛シェービング・自己処理はご遠慮ください",
    "肌荒れ・かぶれがある場合は施術をお断りする場合があります",
    "初回はカウンセリングシートのご記入があります（5分程度）",
  ],
  repeatCycle: "眉の仕上がりを保つため、3〜4週間ごとのご来店をおすすめします",
  consentText: "予約内容を確認しました。キャンセルは前日17時までにご連絡ください。",
};
