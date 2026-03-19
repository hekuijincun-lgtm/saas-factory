'use client';

import { useState, useCallback } from 'react';

// ── Price Matrix (mirrors backend) ──────────────────────────────────────

const CATEGORIES: Record<string, { label: string; basePrice: number; unit: string; durationMin: number; emoji: string }> = {
  furniture_assembly: { label: '家具組み立て', basePrice: 5000, unit: '1点', durationMin: 60, emoji: '🪑' },
  furniture_move: { label: '家具移動', basePrice: 6000, unit: '1点', durationMin: 30, emoji: '📦' },
  hanging: { label: '取付・設置作業', basePrice: 5000, unit: '1箇所', durationMin: 30, emoji: '🔨' },
  water_trouble: { label: '水回りトラブル', basePrice: 8000, unit: '1件', durationMin: 60, emoji: '🚰' },
  electrical: { label: '電気工事・修理', basePrice: 8000, unit: '1件', durationMin: 60, emoji: '⚡' },
  cleaning: { label: '清掃・片付け', basePrice: 10000, unit: '1時間〜', durationMin: 120, emoji: '🧹' },
  garden: { label: '庭木・草刈り', basePrice: 8000, unit: '1時間〜', durationMin: 120, emoji: '🌿' },
  painting: { label: '塗装・補修', basePrice: 10000, unit: '1箇所〜', durationMin: 120, emoji: '🖌️' },
  pest: { label: '害虫・害獣駆除', basePrice: 15000, unit: '1件', durationMin: 120, emoji: '🐛' },
  key: { label: '鍵トラブル', basePrice: 8000, unit: '1件', durationMin: 30, emoji: '🔑' },
  moving_help: { label: '引越し手伝い', basePrice: 10000, unit: '1時間〜', durationMin: 180, emoji: '🚚' },
  errands: { label: '代行・お手伝い', basePrice: 5000, unit: '1時間〜', durationMin: 60, emoji: '🏃' },
  other: { label: 'その他', basePrice: 5000, unit: '1時間〜', durationMin: 60, emoji: '🔧' },
};

const OPTION_LIST = [
  { key: 'urgent', label: '緊急対応（当日・翌日）', price: 5000 },
  { key: 'night', label: '夜間対応（18時以降）', price: 3000 },
  { key: 'weekend', label: '土日祝対応', price: 2000 },
  { key: 'disposal', label: '廃棄物処分', price: 3000 },
];

const EXAMPLE_MESSAGES = [
  'IKEAの棚を組み立ててほしいです',
  '蛇口から水漏れしてます。今日来れますか？',
  '庭の草がボーボーなので草刈りお願いしたい',
  'エアコンの取り付けをお願いしたいのですが',
  '引越しの手伝いをお願いしたい。ワンルームです',
  'ベランダの蜂の巣を駆除してほしい',
];

interface EstimateResult {
  category: string;
  categoryLabel: string;
  emoji: string;
  quantity: number;
  basePrice: number;
  options: { label: string; price: number }[];
  totalBeforeTax: number;
  totalWithTax: number;
  durationMin: number;
  aiMessage: string;
}

// ── Simple client-side AI simulation ────────────────────────────────────

function classifyRequest(message: string): { category: string; urgency: string; quantity: number; options: string[] } {
  const lower = message.toLowerCase();
  const options: string[] = [];

  // Urgency detection
  let urgency = 'normal';
  if (/今日|急ぎ|至急|すぐ|緊急|早急|今すぐ/.test(lower)) {
    urgency = 'urgent';
    options.push('urgent');
  }
  if (/夜|夕方|18時|19時|20時|21時/.test(lower)) options.push('night');
  if (/土曜|日曜|祝日|土日/.test(lower)) options.push('weekend');
  if (/処分|捨て|廃棄/.test(lower)) options.push('disposal');

  // Category classification
  if (/組み立て|組立|IKEA|イケア|ニトリ/.test(lower)) return { category: 'furniture_assembly', urgency, quantity: 1, options };
  if (/家具.*移動|模様替え|配置|移す/.test(lower)) return { category: 'furniture_move', urgency, quantity: 1, options };
  if (/棚|カーテン|取付|設置|壁掛け|照明|テレビ|TV|エアコン.*取付/.test(lower)) return { category: 'hanging', urgency, quantity: 1, options };
  if (/水漏れ|蛇口|排水|トイレ|詰まり|水回り/.test(lower)) return { category: 'water_trouble', urgency, quantity: 1, options };
  if (/電気|コンセント|スイッチ|照明.*交換|配線|ブレーカー/.test(lower)) return { category: 'electrical', urgency, quantity: 1, options };
  if (/清掃|掃除|片付け|ゴミ|不用品/.test(lower)) return { category: 'cleaning', urgency, quantity: 1, options };
  if (/草|庭|剪定|芝|除草|草刈り|伐採/.test(lower)) return { category: 'garden', urgency, quantity: 1, options };
  if (/塗装|ペンキ|補修|壁.*穴|フローリング/.test(lower)) return { category: 'painting', urgency, quantity: 1, options };
  if (/害虫|ゴキブリ|ネズミ|蜂|ハチ|シロアリ|駆除/.test(lower)) return { category: 'pest', urgency, quantity: 1, options };
  if (/鍵|ロック|開かない|閉じ込め/.test(lower)) return { category: 'key', urgency, quantity: 1, options };
  if (/引越し|引っ越し|搬入|搬出|運搬/.test(lower)) return { category: 'moving_help', urgency, quantity: 1, options };
  if (/代行|買い物|並び|受け取り/.test(lower)) return { category: 'errands', urgency, quantity: 1, options };

  return { category: 'other', urgency, quantity: 1, options };
}

function generateEstimate(message: string): EstimateResult {
  const { category, urgency, quantity, options } = classifyRequest(message);
  const cat = CATEGORIES[category] ?? CATEGORIES.other;

  let total = cat.basePrice * quantity;
  const optionDetails: { label: string; price: number }[] = [];

  for (const opt of options) {
    const o = OPTION_LIST.find(x => x.key === opt);
    if (o && o.price > 0) {
      total += o.price;
      optionDetails.push({ label: o.label, price: o.price });
    }
  }

  const taxIncluded = Math.round(total * 1.1);

  const greetings = [
    'お問い合わせありがとうございます！',
    'ご依頼ありがとうございます！',
    'お見積もりのご依頼ありがとうございます！',
  ];

  const aiMessage = [
    greetings[Math.floor(Math.random() * greetings.length)],
    '',
    `「${cat.label}」のご依頼ですね。`,
    `概算のお見積もりをお出しいたします。`,
    '',
    urgency === 'urgent'
      ? '⚡ 緊急対応ということで、なるべく早くお伺いできるよう調整いたします。'
      : '日程のご希望がございましたら、お気軽にお伝えください。',
    '',
    '現地の状況を確認した上で正式なお見積もりをお出しいたしますので、まずはお気軽にご予約ください！',
  ].join('\n');

  return {
    category,
    categoryLabel: cat.label,
    emoji: cat.emoji,
    quantity,
    basePrice: cat.basePrice * quantity,
    options: optionDetails,
    totalBeforeTax: total,
    totalWithTax: taxIncluded,
    durationMin: cat.durationMin * quantity,
    aiMessage,
  };
}

// ── Component ───────────────────────────────────────────────────────────

export function HandymanDemo() {
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [mode, setMode] = useState<'text' | 'form'>('text');

  const handleEstimate = useCallback(() => {
    if (!message.trim() && !selectedCategory) return;

    setIsProcessing(true);
    // Simulate AI processing delay
    setTimeout(() => {
      if (mode === 'text') {
        setResult(generateEstimate(message));
      } else {
        // Form mode
        const cat = CATEGORIES[selectedCategory ?? 'other'] ?? CATEGORIES.other;
        let total = cat.basePrice;
        const optionDetails: { label: string; price: number }[] = [];
        for (const opt of selectedOptions) {
          const o = OPTION_LIST.find(x => x.key === opt);
          if (o) { total += o.price; optionDetails.push({ label: o.label, price: o.price }); }
        }
        setResult({
          category: selectedCategory ?? 'other',
          categoryLabel: cat.label,
          emoji: cat.emoji,
          quantity: 1,
          basePrice: cat.basePrice,
          options: optionDetails,
          totalBeforeTax: total,
          totalWithTax: Math.round(total * 1.1),
          durationMin: cat.durationMin,
          aiMessage: `${cat.label}のご依頼ですね！概算お見積もりをお出しいたします。\n\n日程のご希望がございましたら、お気軽にお伝えください。`,
        });
      }
      setIsProcessing(false);
    }, 1200);
  }, [message, mode, selectedCategory, selectedOptions]);

  const handleExampleClick = (example: string) => {
    setMessage(example);
    setMode('text');
  };

  const handleReset = () => {
    setResult(null);
    setMessage('');
    setSelectedCategory(null);
    setSelectedOptions([]);
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* ── Input Panel ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        {/* Mode toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode('text')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${mode === 'text' ? 'bg-amber-100 text-amber-800' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
          >
            💬 テキストで依頼
          </button>
          <button
            onClick={() => setMode('form')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${mode === 'form' ? 'bg-amber-100 text-amber-800' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
          >
            📋 カテゴリから選択
          </button>
        </div>

        {mode === 'text' ? (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              依頼内容を入力してください
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="例: IKEAの棚を組み立ててほしいです"
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none"
            />
            <div className="mt-3">
              <p className="text-xs text-gray-400 mb-2">例文をクリック:</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_MESSAGES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => handleExampleClick(ex)}
                    className="text-xs bg-gray-50 hover:bg-amber-50 text-gray-600 hover:text-amber-700 px-2.5 py-1 rounded-full border border-gray-100 hover:border-amber-200 transition-colors"
                  >
                    {ex.slice(0, 18)}...
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              作業カテゴリを選択
            </label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {Object.entries(CATEGORIES).filter(([k]) => k !== 'other').map(([key, cat]) => (
                <button
                  key={key}
                  onClick={() => setSelectedCategory(key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${selectedCategory === key
                    ? 'border-amber-400 bg-amber-50 text-amber-800'
                    : 'border-gray-100 hover:border-amber-200 hover:bg-amber-50/50 text-gray-700'
                  }`}
                >
                  <span>{cat.emoji}</span>
                  <span className="truncate">{cat.label}</span>
                </button>
              ))}
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              オプション
            </label>
            <div className="space-y-2">
              {OPTION_LIST.map((opt) => (
                <label key={opt.key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedOptions.includes(opt.key)}
                    onChange={(e) => {
                      setSelectedOptions(e.target.checked
                        ? [...selectedOptions, opt.key]
                        : selectedOptions.filter(o => o !== opt.key)
                      );
                    }}
                    className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-400"
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                  <span className="text-xs text-gray-400 ml-auto">+¥{opt.price.toLocaleString()}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <button
          onClick={handleEstimate}
          disabled={isProcessing || (mode === 'text' ? !message.trim() : !selectedCategory)}
          className="w-full mt-6 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              AIが解析中...
            </>
          ) : (
            '見積もりを取得'
          )}
        </button>
      </div>

      {/* ── Result Panel ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        {!result ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-4">
              <span className="text-3xl">🔧</span>
            </div>
            <p className="text-gray-400 text-sm">
              依頼内容を入力すると<br />AIが即座に見積もりを算出します
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Category badge */}
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl">
              <span className="text-2xl">{result.emoji}</span>
              <div>
                <p className="text-xs text-amber-600 font-medium">AIが判定したカテゴリ</p>
                <p className="font-bold text-gray-900">{result.categoryLabel}</p>
              </div>
            </div>

            {/* Estimate breakdown */}
            <div className="border border-gray-100 rounded-xl p-4 space-y-2">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                📋 お見積もり内訳
              </h3>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{result.categoryLabel} × {result.quantity}{CATEGORIES[result.category]?.unit ?? ''}</span>
                <span className="font-medium">¥{result.basePrice.toLocaleString()}</span>
              </div>
              {result.options.map((opt, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-600">{opt.label}</span>
                  <span className="font-medium">+¥{opt.price.toLocaleString()}</span>
                </div>
              ))}
              <div className="border-t pt-2 mt-2 flex justify-between">
                <span className="font-bold text-gray-900">合計（税込）</span>
                <span className="font-bold text-amber-600 text-lg">¥{result.totalWithTax.toLocaleString()}</span>
              </div>
              <p className="text-xs text-gray-400">
                作業時間目安: 約{result.durationMin >= 60 ? `${Math.round(result.durationMin / 60 * 10) / 10}時間` : `${result.durationMin}分`}
              </p>
            </div>

            {/* AI Message */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1 font-medium">💬 AIの返信メッセージ</p>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{result.aiMessage}</p>
            </div>

            {/* CTAs */}
            <div className="space-y-2 pt-2">
              <a
                href="/signup?vertical=handyman"
                className="block w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-center transition-colors"
              >
                無料で始める
              </a>
              <button
                onClick={handleReset}
                className="block w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-600 font-medium rounded-xl text-center transition-colors text-sm"
              >
                もう一度試す
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center">
              ※ これはデモです。実際のサービスではLINEで同様の体験ができます。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
