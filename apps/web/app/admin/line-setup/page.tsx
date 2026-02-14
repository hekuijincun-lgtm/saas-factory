export const runtime = "edge";

export default function LineSetupPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const stamp = "LINE_SETUP_MESSAGING_ONLY_V3";
  const tenantId =
    typeof searchParams?.tenantId === "string" && searchParams.tenantId
      ? searchParams.tenantId
      : "default";
  const reason = typeof searchParams?.reason === "string" ? searchParams.reason : null;

  return (
    <main className="p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold">LINE Messaging API セットアップ</h1>
          <p className="text-sm text-gray-600 mt-1">（Loginステップはこのページに存在しません）</p>
          <p className="text-xs text-gray-500 mt-1">stamp: {stamp}</p>
          <p className="text-xs text-gray-500 mt-1">tenantId: {tenantId}</p>
        </header>

        {reason === "secret" && (
          <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
            <div className="font-semibold text-yellow-800">Channel Secret 不一致の可能性</div>
            <div className="text-sm text-yellow-700 mt-1">Workers の LINE_CHANNEL_SECRET（staging/prod）を確認してね。</div>
          </div>
        )}

        {reason === "missing_env" && (
          <div className="border border-red-200 bg-red-50 rounded-lg p-4">
            <div className="font-semibold text-red-800">環境変数が不足しています</div>
            <div className="text-sm text-red-700 mt-1">Workers / Pages の env を確認してね。</div>
          </div>
        )}

        <section className="border rounded-lg p-4">
          <h2 className="font-semibold">ステップ1: Messaging API</h2>
          <ul className="list-disc pl-5 mt-2 text-sm space-y-1">
            <li>Channel Access Token（長期）を発行して保存</li>
            <li>Webhook URL を登録</li>
            <li>Webhook 検証（Verify）</li>
          </ul>
        </section>

        <a className="text-sm underline" href="/admin">管理画面へ戻る</a>
      </div>
    </main>
  );
}

