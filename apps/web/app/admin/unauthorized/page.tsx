'use client';

import { useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';

function UnauthorizedContent() {
  const searchParams = useSearchParams();
  const userId = searchParams?.get('userId') ?? '';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!userId) return;
    navigator.clipboard.writeText(userId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full space-y-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto text-3xl">
          🚫
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-800">
            管理者権限がありません
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            このLINEアカウントは管理画面へのアクセスが許可されていません。
          </p>
        </div>

        {userId && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-left">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              あなたのLINE ユーザーID
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 break-all">
                {userId}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 px-3 py-2 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                {copied ? 'コピー済み' : 'コピー'}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              このIDを管理者に伝えて、設定画面で許可リストへの追加を依頼してください。
            </p>
          </div>
        )}

        <div className="space-y-2 pt-2">
          <a
            href="/admin/line-setup"
            className="block w-full py-2.5 px-4 border border-gray-200 text-sm text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
          >
            別のアカウントでログイン
          </a>
        </div>
      </div>
    </div>
  );
}

export default function UnauthorizedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    }>
      <UnauthorizedContent />
    </Suspense>
  );
}
