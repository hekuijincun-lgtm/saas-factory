export const runtime = "edge";

function StepBadge({ n, active }: { n: number; active?: boolean }) {
  return (
    <div className={"h-9 w-9 rounded-full grid place-items-center text-sm font-semibold " + (active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600")}>
      {n}
    </div>
  );
}

function Divider() {
  return <div className="h-px w-full bg-slate-200" />;
}

export default function LineSetupPage() {
  // TODO: 後でAPIからステータス取得（connected / not）
  const connected = false;
  const tenantId = "default";

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
        {/* header */}
        <div className="bg-slate-800 px-8 py-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs tracking-widest text-white/70">ADMIN</div>
              <h1 className="mt-2 text-3xl font-semibold text-white">LINE Messaging API セットアップ</h1>
              <p className="mt-2 text-sm text-white/70">
                トークン/シークレットはこの画面に保存しません（安全設計）。登録はサーバー側に暗号化/隔離して保存します。
              </p>
            </div>

            <div className="text-right">
              <div className={"inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold " + (connected ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200")}>
                {connected ? "Connected" : "Not Connected"}
              </div>
              <div className="mt-2 text-xs text-white/60">tenantId: {tenantId}</div>
            </div>
          </div>
        </div>

        {/* body */}
        <div className="px-8 py-8">
          {/* steps */}
          <div className="flex items-center gap-4">
            <StepBadge n={1} active />
            <div className="h-1 flex-1 rounded-full bg-slate-200">
              <div className="h-1 w-1/3 rounded-full bg-blue-600" />
            </div>
            <StepBadge n={2} />
            <div className="h-1 flex-1 rounded-full bg-slate-200" />
            <StepBadge n={3} />
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900">ステップ1：Messaging API</h2>
            <p className="mt-1 text-sm text-slate-600">LINE Developers のコンソールで以下を行ってください。</p>

            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              <li className="flex gap-3">
                <span className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-600" />
                <span>Channel Access Token（長期）を発行して控える</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-600" />
                <span>Webhook URL を登録</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-600" />
                <span>Webhook 検証（Verify）を実行</span>
              </li>
            </ul>

            <Divider />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-500">Webhook URL（貼り付け用）</div>
                <div className="mt-2 rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700 ring-1 ring-slate-200">
                  https://saas-factory-web-v2.pages.dev/api/line/webhook
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-500">保存先</div>
                <div className="mt-2 text-sm text-slate-700">
                  Token / Secret は <span className="font-semibold">サーバー側（Workers/D1/KV）</span> に保存します。
                  UIには保持しません。
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/admin" className="rounded-full bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">
                管理画面へ戻る
              </a>

              {/* TODO: 後で API 連携して保存アクションにする */}
              <button className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:opacity-90 active:opacity-80">
                接続情報を登録（準備中）
              </button>
            </div>

            <div className="mt-4 text-xs text-slate-500">
              stamp: LINE_SETUP_MESSAGING_ONLY_V4
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
