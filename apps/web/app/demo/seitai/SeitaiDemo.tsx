'use client';
import { useState } from 'react';
import Link from 'next/link';

const EXAMPLES = [
  '肩こりがひどくて頭痛もします',
  '腰が痛くてかがむのがつらいです',
  '猫背を直したいのですが',
  'デスクワークで首がガチガチです',
  '産後の骨盤矯正をしたいです',
  '全身だるくてスッキリしたいです',
];

const COURSES: Record<string, { name: string; price: number; duration: number; reason: string }> = {
  neck: { name: 'ヘッド＆首肩集中', price: 5000, duration: 45, reason: '首・肩周りの集中ケアで頭痛も緩和します' },
  back: { name: '整体コース（60分）', price: 6000, duration: 60, reason: '腰痛には全身のバランス調整が効果的です' },
  posture: { name: '猫背改善プログラム', price: 8000, duration: 60, reason: '姿勢分析＋矯正施術で根本から改善します' },
  pelvis: { name: '骨盤矯正コース', price: 7000, duration: 50, reason: '骨盤の歪みを整え全身のバランスを改善します' },
  full: { name: 'じっくり全身コース（90分）', price: 9000, duration: 90, reason: '全身をじっくりほぐして疲労回復をサポートします' },
};

function classify(text: string): string {
  if (/肩|首|頭痛|頭/.test(text)) return 'neck';
  if (/腰|ぎっくり|かがむ/.test(text)) return 'back';
  if (/猫背|姿勢|ストレート/.test(text)) return 'posture';
  if (/骨盤|産後/.test(text)) return 'pelvis';
  return 'full';
}

export default function SeitaiDemo() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<typeof COURSES[string] | null>(null);
  const [loading, setLoading] = useState(false);
  const [key, setKey] = useState('');

  const analyze = (text: string) => {
    setInput(text);
    setLoading(true);
    setResult(null);
    setTimeout(() => {
      const k = classify(text);
      setKey(k);
      setResult(COURSES[k]);
      setLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 text-center mb-2">整体院 AI受付デモ</h1>
        <p className="text-center text-gray-500 mb-8">お悩みを入力すると、AIが最適なコースを提案します</p>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="お身体のお悩みを入力してください..."
            rows={3}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
          />
          <button
            onClick={() => analyze(input)}
            disabled={!input.trim() || loading}
            className="w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'AI分析中...' : 'AIに相談する'}
          </button>
        </div>

        <div className="mt-4">
          <p className="text-xs text-gray-400 mb-2">例文をクリック:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => analyze(ex)}
                className="rounded-full bg-teal-50 px-3 py-1.5 text-xs text-teal-700 hover:bg-teal-100 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {result && (
          <div className="mt-8 bg-white rounded-2xl shadow-lg p-6 space-y-4 border border-teal-100">
            <h2 className="text-lg font-bold text-gray-900">おすすめコース</h2>
            <div className="bg-teal-50 rounded-xl p-4">
              <p className="font-semibold text-teal-900 text-lg">{result.name}</p>
              <p className="text-sm text-teal-700 mt-1">{result.reason}</p>
              <div className="flex gap-4 mt-3 text-sm text-teal-800">
                <span>{result.price.toLocaleString()}円</span>
                <span>{result.duration}分</span>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-2">AIからの返信メッセージ</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                お問い合わせありがとうございます。{input.slice(0, 20)}…とのことですね。
                「{result.name}」がおすすめです。{result.reason}。
                ご予約はLINEから24時間受付中です！
              </p>
            </div>

            <Link
              href="/signup/seitai"
              className="block w-full rounded-xl bg-teal-600 py-3 text-center text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
            >
              無料で始める
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
