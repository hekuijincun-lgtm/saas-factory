'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';

// ── Size / Course / Option definitions ──────────────────────────────────

type PetSize = 'small' | 'medium' | 'large' | 'cat';

const SIZE_LABELS: Record<PetSize, string> = {
  small: '小型犬',
  medium: '中型犬',
  large: '大型犬',
  cat: '猫',
};

const COURSES: Record<string, { label: string; prices: Record<PetSize, number>; durationMin: Record<PetSize, number>; emoji: string }> = {
  trimming: {
    label: 'トリミング（シャンプー+カット）',
    prices: { small: 4000, medium: 5500, large: 7500, cat: 6000 },
    durationMin: { small: 60, medium: 75, large: 90, cat: 75 },
    emoji: '✂️',
  },
  shampoo: {
    label: 'シャンプーコース',
    prices: { small: 2500, medium: 3500, large: 5000, cat: 4000 },
    durationMin: { small: 40, medium: 50, large: 60, cat: 50 },
    emoji: '🛁',
  },
  partial_cut: {
    label: '部分カット',
    prices: { small: 1500, medium: 2000, large: 2500, cat: 2000 },
    durationMin: { small: 20, medium: 25, large: 30, cat: 25 },
    emoji: '✂️',
  },
  nail_set: {
    label: '爪切りセット（爪切り+耳掃除+肛門腺）',
    prices: { small: 1500, medium: 1800, large: 2000, cat: 1800 },
    durationMin: { small: 15, medium: 20, large: 20, cat: 20 },
    emoji: '💅',
  },
  dental: {
    label: 'デンタルケア',
    prices: { small: 2000, medium: 2500, large: 3000, cat: 2500 },
    durationMin: { small: 20, medium: 25, large: 30, cat: 25 },
    emoji: '🦷',
  },
};

const OPTIONS = [
  { key: 'microbubble', label: 'マイクロバブル', price: 1500 },
  { key: 'medicated_bath', label: '薬浴', price: 2000 },
  { key: 'matting', label: '毛玉除去（1箇所あたり）', price: 500, perUnit: true, defaultQty: 3 },
  { key: 'teeth_brushing', label: '歯磨きオプション', price: 500 },
  { key: 'paw_pack', label: '肉球パック', price: 800 },
  { key: 'aroma', label: 'アロマバス', price: 1000 },
];

const EXAMPLE_MESSAGES = [
  'トイプードルのシャンプーカットお願いします',
  '柴犬のシャンプーだけお願いしたいです',
  'ゴールデンレトリバーのフルコースでお願いします',
  'チワワの爪切りと耳掃除だけできますか？',
  '猫のシャンプーってやってますか？',
  'マイクロバブル付きでトリミングしてほしいんですが',
  '毛玉がひどいんですが追加料金かかりますか？',
];

// ── Breed → size mapping ────────────────────────────────────────────────

const BREED_SIZE_MAP: { pattern: RegExp; size: PetSize; breed: string }[] = [
  { pattern: /トイプードル|プードル|トイプー/, size: 'small', breed: 'トイプードル' },
  { pattern: /チワワ/, size: 'small', breed: 'チワワ' },
  { pattern: /ダックス|ミニチュアダックス/, size: 'small', breed: 'ミニチュアダックス' },
  { pattern: /ポメラニアン|ポメ/, size: 'small', breed: 'ポメラニアン' },
  { pattern: /ヨークシャ|ヨーキー/, size: 'small', breed: 'ヨークシャテリア' },
  { pattern: /マルチーズ/, size: 'small', breed: 'マルチーズ' },
  { pattern: /シーズー/, size: 'small', breed: 'シーズー' },
  { pattern: /パピヨン/, size: 'small', breed: 'パピヨン' },
  { pattern: /柴犬|柴/, size: 'medium', breed: '柴犬' },
  { pattern: /コーギー/, size: 'medium', breed: 'コーギー' },
  { pattern: /ビーグル/, size: 'medium', breed: 'ビーグル' },
  { pattern: /ボーダーコリー/, size: 'medium', breed: 'ボーダーコリー' },
  { pattern: /フレンチブルドッグ|フレブル/, size: 'medium', breed: 'フレンチブルドッグ' },
  { pattern: /ゴールデン|ゴールデンレトリバー/, size: 'large', breed: 'ゴールデンレトリバー' },
  { pattern: /ラブラドール|ラブ/, size: 'large', breed: 'ラブラドール' },
  { pattern: /ハスキー|シベリアンハスキー/, size: 'large', breed: 'シベリアンハスキー' },
  { pattern: /スタンダードプードル/, size: 'large', breed: 'スタンダードプードル' },
  { pattern: /秋田犬|秋田/, size: 'large', breed: '秋田犬' },
  { pattern: /猫|ネコ|ねこ|キャット/, size: 'cat', breed: '猫' },
];

// ── Estimate result type ────────────────────────────────────────────────

interface EstimateResult {
  breed: string;
  size: PetSize;
  sizeLabel: string;
  course: string;
  courseLabel: string;
  courseEmoji: string;
  basePrice: number;
  options: { label: string; price: number }[];
  total: number;
  durationMin: number;
  aiMessage: string;
}

// ── Client-side classification ──────────────────────────────────────────

function classifyRequest(message: string): {
  breed: string;
  size: PetSize;
  course: string;
  options: { key: string; qty: number }[];
} {
  const text = message;

  // Detect breed / size
  let breed = '不明';
  let size: PetSize = 'small';
  for (const entry of BREED_SIZE_MAP) {
    if (entry.pattern.test(text)) {
      breed = entry.breed;
      size = entry.size;
      break;
    }
  }

  // Detect size keywords if breed not found
  if (breed === '不明') {
    if (/小型犬|小型/.test(text)) size = 'small';
    else if (/中型犬|中型/.test(text)) size = 'medium';
    else if (/大型犬|大型/.test(text)) size = 'large';
    else if (/猫|ネコ|ねこ/.test(text)) size = 'cat';
  }

  // Detect course
  let course = 'trimming';
  if (/シャンプーカット|シャンプー\s*[&＆+＋]\s*カット|トリミング|フルコース|カット/.test(text)) {
    course = 'trimming';
  } else if (/シャンプーだけ|シャンプーのみ|シャンプーコース|(?<!カット.*?)シャンプー(?!.*カット)/.test(text)) {
    course = 'shampoo';
  }
  if (/爪切り|耳掃除|肛門腺/.test(text)) course = 'nail_set';
  if (/デンタル|歯/.test(text)) course = 'dental';
  if (/部分カット|部分だけ/.test(text)) course = 'partial_cut';

  // Detect options
  const options: { key: string; qty: number }[] = [];
  if (/マイクロバブル/.test(text)) options.push({ key: 'microbubble', qty: 1 });
  if (/薬浴/.test(text)) options.push({ key: 'medicated_bath', qty: 1 });
  if (/毛玉/.test(text)) options.push({ key: 'matting', qty: 3 });
  if (/歯磨き/.test(text)) options.push({ key: 'teeth_brushing', qty: 1 });
  if (/肉球パック/.test(text)) options.push({ key: 'paw_pack', qty: 1 });
  if (/アロマ/.test(text)) options.push({ key: 'aroma', qty: 1 });

  return { breed, size, course, options };
}

function generateEstimate(message: string): EstimateResult {
  const { breed, size, course, options } = classifyRequest(message);
  const courseData = COURSES[course] ?? COURSES.trimming;
  const basePrice = courseData.prices[size];
  const durationMin = courseData.durationMin[size];

  let total = basePrice;
  const optionDetails: { label: string; price: number }[] = [];

  for (const opt of options) {
    const def = OPTIONS.find(o => o.key === opt.key);
    if (def) {
      const price = def.price * opt.qty;
      total += price;
      optionDetails.push({
        label: opt.qty > 1 ? `${def.label} x${opt.qty}` : def.label,
        price,
      });
    }
  }

  const totalDuration = durationMin + optionDetails.length * 5;
  const sizeLabel = SIZE_LABELS[size];
  const breedDisplay = breed !== '不明' ? `${breed}（${sizeLabel}）` : sizeLabel;

  const optionLines = optionDetails.map(o => `・${o.label}: +¥${o.price.toLocaleString()}`).join('\n');

  const aiMessage = [
    `お見積もりありがとうございます！`,
    '',
    `${breedDisplay}の${courseData.label}ですね。`,
    '',
    '【お見積もり】',
    `・${courseData.label}: ¥${basePrice.toLocaleString()}`,
    ...(optionLines ? [optionLines] : []),
    '━━━━━━━━━━━',
    `合計: ¥${total.toLocaleString()}（税込）`,
    `所要時間: 約${totalDuration}分`,
    '',
    'ご予約はこちらから',
  ].join('\n');

  return {
    breed: breedDisplay,
    size,
    sizeLabel,
    course,
    courseLabel: courseData.label,
    courseEmoji: courseData.emoji,
    basePrice,
    options: optionDetails,
    total,
    durationMin: totalDuration,
    aiMessage,
  };
}

// ── Component ───────────────────────────────────────────────────────────

export function PetDemo() {
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedSize, setSelectedSize] = useState<PetSize | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [mode, setMode] = useState<'text' | 'form'>('text');

  const handleEstimate = useCallback(() => {
    if (!message.trim() && !selectedCourse) return;

    setIsProcessing(true);
    setTimeout(() => {
      if (mode === 'text') {
        setResult(generateEstimate(message));
      } else {
        const size = selectedSize ?? 'small';
        const course = selectedCourse ?? 'trimming';
        const courseData = COURSES[course] ?? COURSES.trimming;
        const basePrice = courseData.prices[size];
        const durationBase = courseData.durationMin[size];

        let total = basePrice;
        const optionDetails: { label: string; price: number }[] = [];
        for (const optKey of selectedOptions) {
          const def = OPTIONS.find(o => o.key === optKey);
          if (def) {
            const qty = def.perUnit ? (def.defaultQty ?? 1) : 1;
            const price = def.price * qty;
            total += price;
            optionDetails.push({
              label: qty > 1 ? `${def.label} x${qty}` : def.label,
              price,
            });
          }
        }

        const totalDuration = durationBase + optionDetails.length * 5;
        const sizeLabel = SIZE_LABELS[size];

        setResult({
          breed: sizeLabel,
          size,
          sizeLabel,
          course,
          courseLabel: courseData.label,
          courseEmoji: courseData.emoji,
          basePrice,
          options: optionDetails,
          total,
          durationMin: totalDuration,
          aiMessage: `${sizeLabel}の${courseData.label}ですね！お見積もりをお出しいたします。\n\nご希望の日時がございましたら、お気軽にお伝えください。`,
        });
      }
      setIsProcessing(false);
    }, 1200);
  }, [message, mode, selectedSize, selectedCourse, selectedOptions]);

  const handleExampleClick = (example: string) => {
    setMessage(example);
    setMode('text');
  };

  const handleReset = () => {
    setResult(null);
    setMessage('');
    setSelectedSize(null);
    setSelectedCourse(null);
    setSelectedOptions([]);
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* ── Input Panel ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-orange-100 p-6">
        {/* Mode toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode('text')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${mode === 'text' ? 'bg-orange-100 text-orange-800' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
          >
            💬 テキスト入力
          </button>
          <button
            onClick={() => setMode('form')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${mode === 'form' ? 'bg-orange-100 text-orange-800' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
          >
            📋 カテゴリ選択
          </button>
        </div>

        {mode === 'text' ? (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ご希望の内容を入力してください
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="例: トイプードルのシャンプーカットお願いします"
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent resize-none"
            />
            <div className="mt-3">
              <p className="text-xs text-gray-400 mb-2">例文をクリック:</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_MESSAGES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => handleExampleClick(ex)}
                    className="text-xs bg-gray-50 hover:bg-orange-50 text-gray-600 hover:text-orange-700 px-2.5 py-1 rounded-full border border-gray-100 hover:border-orange-200 transition-colors"
                  >
                    {ex.length > 18 ? ex.slice(0, 18) + '...' : ex}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Size selector */}
            <label className="block text-sm font-medium text-gray-700 mb-2">
              犬種サイズ
            </label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(Object.entries(SIZE_LABELS) as [PetSize, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSelectedSize(key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${selectedSize === key
                    ? 'border-orange-400 bg-orange-50 text-orange-800'
                    : 'border-gray-100 hover:border-orange-200 hover:bg-orange-50/50 text-gray-700'
                  }`}
                >
                  <span>{key === 'cat' ? '🐱' : key === 'large' ? '🐕' : key === 'medium' ? '🐕‍🦺' : '🐩'}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Course selector */}
            <label className="block text-sm font-medium text-gray-700 mb-2">
              コース
            </label>
            <div className="space-y-2 mb-4">
              {Object.entries(COURSES).map(([key, course]) => (
                <button
                  key={key}
                  onClick={() => setSelectedCourse(key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${selectedCourse === key
                    ? 'border-orange-400 bg-orange-50 text-orange-800'
                    : 'border-gray-100 hover:border-orange-200 hover:bg-orange-50/50 text-gray-700'
                  }`}
                >
                  <span>{course.emoji}</span>
                  <span className="flex-1">{course.label}</span>
                  {selectedSize && (
                    <span className="text-xs text-gray-400">¥{course.prices[selectedSize].toLocaleString()}~</span>
                  )}
                </button>
              ))}
            </div>

            {/* Options */}
            <label className="block text-sm font-medium text-gray-700 mb-2">
              オプション
            </label>
            <div className="space-y-2">
              {OPTIONS.map((opt) => (
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
                    className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-400"
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    +¥{opt.price.toLocaleString()}{opt.perUnit ? '/箇所' : ''}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <button
          onClick={handleEstimate}
          disabled={isProcessing || (mode === 'text' ? !message.trim() : !selectedCourse)}
          className="w-full mt-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
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
      <div className="bg-white rounded-2xl shadow-sm border border-orange-100 p-6">
        {!result ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12">
            <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mb-4">
              <span className="text-3xl">🐾</span>
            </div>
            <p className="text-gray-400 text-sm">
              ペットの情報を入力すると<br />AIが即座に見積もりを算出します
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Breed / size badge */}
            <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl">
              <span className="text-2xl">{result.size === 'cat' ? '🐱' : '🐾'}</span>
              <div>
                <p className="text-xs text-orange-600 font-medium">AIが判定した犬種・サイズ</p>
                <p className="font-bold text-gray-900">{result.breed}</p>
              </div>
            </div>

            {/* Estimate breakdown */}
            <div className="border border-gray-100 rounded-xl p-4 space-y-2">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                📋 お見積もり内訳
              </h3>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{result.courseEmoji} {result.courseLabel}</span>
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
                <span className="font-bold text-orange-600 text-lg">¥{result.total.toLocaleString()}</span>
              </div>
              <p className="text-xs text-gray-400">
                所要時間目安: 約{result.durationMin >= 60 ? `${Math.floor(result.durationMin / 60)}時間${result.durationMin % 60 > 0 ? `${result.durationMin % 60}分` : ''}` : `${result.durationMin}分`}
              </p>
            </div>

            {/* AI Message (LINE-style bubble) */}
            <div>
              <p className="text-xs text-gray-400 mb-2 font-medium">💬 AIの返信メッセージプレビュー</p>
              <div className="flex gap-2">
                <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1">
                  AI
                </div>
                <div className="bg-[#E8F5E9] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] shadow-sm">
                  <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{result.aiMessage}</p>
                  <div className="mt-2">
                    <span className="inline-block bg-[#06C755] text-white text-xs font-bold px-4 py-1.5 rounded-full">
                      予約する
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* CTAs */}
            <div className="space-y-2 pt-2">
              <Link
                href="/signup?vertical=pet"
                className="block w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-center transition-colors"
              >
                無料で始める
              </Link>
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
