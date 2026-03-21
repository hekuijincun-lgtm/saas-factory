import type { Metadata } from 'next';
import Link from 'next/link';
import { PetDemo } from './PetDemo';

export const metadata: Metadata = {
  title: 'PetBook デモ | ペットサロン向けAI見積もり体験',
  description: 'ペットの犬種やコースを入力するだけでAIが即座に見積もり。ペットサロン・トリミングサロン向けAI見積もりツールをお試しください。',
};

export default function PetDemoPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50">
      <header className="bg-white/80 backdrop-blur border-b border-orange-100">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">P</div>
            <span className="font-bold text-gray-900 text-sm">PetBook</span>
            <span className="text-xs text-gray-400 ml-1">デモ</span>
          </div>
          <Link href="/signup/pet" className="text-sm text-orange-600 hover:text-orange-700 font-medium">
            無料で始める →
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            AI見積もりを体験してみましょう
          </h1>
          <p className="text-gray-500 text-sm sm:text-base">
            ペットの情報やご希望のコースを入力するだけで、AIが即座にお見積もりを算出します
          </p>
        </div>
        <PetDemo />
      </main>
    </div>
  );
}
