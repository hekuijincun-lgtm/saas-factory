export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border p-6 space-y-4">
        <h1 className="text-2xl font-semibold">ログイン</h1>
        <p className="text-sm text-gray-600">
          LINEでログインして管理画面へ進みます。
        </p>

        <a
          href="/api/auth/line/start"
          className="block text-center rounded-xl px-4 py-3 font-medium border hover:bg-gray-50"
        >
          LINEでログイン
        </a>

        <p className="text-xs text-gray-500">
          ※ログイン後に、サロンの公式アカウント（Messaging API）の設定に進みます。
        </p>
      </div>
    </main>
  );
}




