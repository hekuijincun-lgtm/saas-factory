export const runtime = "edge";

function Step({ n, active }: { n: number; active?: boolean }) {
  return (
    <div className={"h-10 w-10 rounded-full grid place-items-center text-sm font-semibold " +
      (active ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600")}>
      {n}
    </div>
  );
}

export default function LineSetupPage() {
  const tenantId = "default";
  const connected = false;

  
  const [accessToken, setAccessToken] = useState("");
  const [channelSecret, setChannelSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function saveLineCreds() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/proxy/admin/integrations/line/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          channelAccessToken: accessToken,
          channelSecret,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || "save_failed");
      }
      setMsg("✅ 保存しました");
      setAccessToken("");
      setChannelSecret("");
    } catch (e: any) {
      setMsg("❌ 保存に失敗: " + (e?.message || "unknown"));
    } finally {
      setSaving(false);
    }
  }
return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">

        {/* header */}
        <div className="bg-slate-800 px-8 py-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-xs tracking-widest text-white/60">ADMIN</div>
              <h1 className="mt-2 text-3xl font-semibold text-white">
                LINE Messaging API セットアップ
              </h1>
              <p className="mt-2 text-sm text-white/70">
                トークンやシークレットは画面に保存しません。
                安全にサーバー側で管理されます。
              </p>
            </div>

            <div className="text-right">
              <div className={"inline-flex rounded-full px-3 py-1 text-xs font-semibold " +
                (connected ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200")}>
                {connected ? "Connected" : "Not Connected"}
              </div>
              <div className="mt-2 text-xs text-white/60">
                tenantId: {tenantId}
              </div>
            </div>
          </div>
        </div>

        {/* body */}
        <div className="px-8 py-8">
          {/* steps */}
          <div className="flex items-center gap-4">
            <Step n={1} active />
            <div className="h-1 flex-1 rounded-full bg-slate-200" />
            <Step n={2} />
            <div className="h-1 flex-1 rounded-full bg-slate-200" />
            <Step n={3} />
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold">ステップ1：Messaging API</h2>

            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              <li>・Channel Access Token（長期）を発行</li>
              <li>・Webhook URL を登録</li>
              <li>・Webhook 検証（Verify）を実行</li>
            </ul>

            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-500">Webhook URL</div>
              <div className="mt-2 font-mono text-xs text-slate-800">
                https://saas-factory-web-v2.pages.dev/api/line/webhook
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <a href="/admin" className="rounded-full bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-700">
                管理画面へ戻る
              </a>
              <button className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:opacity-90 active:opacity-80" onClick={saveLineCreds} disabled={saving || !accessToken || !channelSecret}>
                接続情報を登録
              </button>
            </div>

            <div className="mt-4 text-xs text-slate-400">
              stamp: LINE_SETUP_MESSAGING_ONLY_V4
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

