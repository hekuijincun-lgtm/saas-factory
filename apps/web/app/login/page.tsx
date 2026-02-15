export const runtime = "edge";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
        
        {/* header */}
        <div className="bg-slate-700 px-8 py-8">
          <div className="text-xs tracking-widest text-white/70">
            ADMIN LOGIN
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            ログイン
          </h1>
          <p className="mt-2 text-sm text-white/70">
            LINEで管理画面にログインします
          </p>
        </div>

        {/* body */}
        <div className="px-8 py-10">
          <a
            href="/api/auth/line/start?returnTo=/admin/line-setup"
            className="block w-full rounded-full bg-[#06C755] py-4 text-center text-base font-semibold text-white shadow-md transition hover:opacity-90 active:opacity-80"
          >
            LINEでログイン
          </a>

          <p className="mt-6 text-center text-xs text-slate-500">
            ※ 認証後は管理画面に遷移します
          </p>
        </div>
      </div>
    </div>
  );
}
