export const runtime = "edge";

async function getLineStatus(origin: string) {
  try {
    const res = await fetch(`${origin}/api/admin/line/status`, { cache: "no-store" });
    if (!res.ok) return { ok: false, configured: false, status: res.status };
    const json = await res.json();
    return json;
  } catch (e) {
    return { ok: false, configured: false, error: String(e) };
  }
}

export default async function AdminSettingsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  // origin を確実に取る（Cloudflare Pages上で安定）
  const origin =
    (typeof searchParams?.__origin === "string" && searchParams.__origin) ||
    (process.env.NEXT_PUBLIC_SITE_URL ?? "");

  // origin が空なら「相対で叩く」 fallback（Pagesでは普通これでOK）
  const base = origin || "";

  const st = await getLineStatus(base);

  // LINE未設定ならセットアップへ（理由を明示）
  if (!st?.configured) {
    return (
      <div style={{ fontFamily: "system-ui", padding: 24 }}>
        <h1>Redirecting…</h1>
        <p style={{ opacity: 0.7 }}>REDIR_LINE_NOT_CONFIGURED</p>
        <p style={{ opacity: 0.7 }}>status: {String(st?.status ?? "")} error: {String(st?.error ?? "")}</p>
        <p><a href="/admin/line-setup?reason=line_not_configured">手動でセットアップへ</a></p>
      </div>
    );
  }

  // ✅ ここに本来の Settings UI を置く（いまは仮）
  return (
    <div style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Settings</h1>
      <p style={{ opacity: 0.7 }}>OK_SETTINGS_PAGE</p>
      <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(st, null, 2)}</pre>
    </div>
  );
}
