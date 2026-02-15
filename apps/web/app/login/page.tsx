export const runtime = "edge";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-black/5">
        <div className="bg-slate-700 px-8 py-8">
          <div className="text-xs tracking-[0.25em] text-white/70">ADMIN</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">ログイン</h1>
          <p className="mt-2 text-sm text-white/70">
            LINEで認証して管理画面へ進みます
          </p>
        </div>

        <div className="px-8 py-8">
          {/* ✅ ボタンは今のまま（緑） */}
          <a
            href="/api/auth/line/start?returnTo=/admin/line-setup"
            className="block w-full rounded-full bg-[#06C755] px-6 py-4 text-center font-semibold text-white shadow-sm transition hover:opacity-90 active:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#06C755]/40"
          >
            LINEでログイン
          </a>

          <p className="mt-4 text-xs text-slate-500">
            ※ ログイン後は /admin/line-setup に遷移します
          </p>
        </div>
      </div>
    </div>
  );
}
