import type { Metadata } from 'next';
import Link from 'next/link';
import { HandymanDemo } from './HandymanDemo';

export const metadata: Metadata = {
  title: 'ベンリプロAI デモ | AI見積もり体験',
  description: 'LINEで問い合わせるだけでAIが即座に見積もり。便利屋向けAI見積もりツールをお試しください。',
};

export default function HandymanDemoPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-amber-50">
      <header className="bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">B</div>
            <span className="font-bold text-gray-900 text-sm">ベンリプロAI</span>
            <span className="text-xs text-gray-400 ml-1">デモ</span>
          </div>
          <Link href="/lp/handyman" className="text-sm text-amber-600 hover:text-amber-700 font-medium">
            詳しく見る →
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            AI見積もりを体験してみましょう
          </h1>
          <p className="text-gray-500 text-sm sm:text-base">
            依頼内容を入力するだけで、AIがカテゴリ分類→即時見積もりを行います
          </p>
        </div>
        <HandymanDemo />
      </main>
    </div>
  );
}
