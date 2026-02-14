export default function LoginPage() {
  const returnTo = "/admin/settings";
  const href = `/api/auth/line/start?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border p-6 space-y-4">
        <h1 className="text-2xl font-semibold">ログイン</h1>
        <p className="text-sm text-neutral-600">
          LINEでログインして管理画面へ進みます。
        </p>

        {/* ✅ LINE Login */}
        <a
          href={href}
          className="inline-flex w-full items-center justify-center rounded-lg border px-4 py-2 font-medium"
        >
          LINEでログイン
        </a>

        <p className="text-xs text-neutral-500">
          ※ログイン後に、サロンの公式アカウント（Messaging API）の設定に進みます。
        </p>
      </div>
    </main>
  );
}
