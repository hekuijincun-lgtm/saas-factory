export const runtime = "edge";

import { headers } from "next/headers";

async function getLineStatus(origin: string, cookie: string) {
  const res = await fetch(`${origin}/api/admin/line/status`, {
    cache: "no-store",
    // Forward cookies so the status call sees the same session
    headers: cookie ? { cookie } : undefined,
  });
  return await res.json();
}
/api/admin/line/status`, { cache: "no-store" });
    if (!res.ok) return { ok: false, status: res.status };
    return await res.json();
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export default async function AdminSettingsPage() {
  const h = headers();
  const cookie = h.get("cookie") ?? "";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "https://saas-factory-web-v2.pages.dev";

  const st: any = await getLineStatus(origin, cookie);

  // ✅ status API は configured じゃなく line_session_present を返す
  const hasSession = Boolean(st?.line_session_present);

  if (!hasSession) {
    return (
      <div style={{ fontFamily: "system-ui", padding: 24 }}>
        <h1>Redirecting…</h1>
        <p style={{ opacity: 0.7 }}>REDIR_LINE_SESSION_MISSING</p>
        <p style={{ opacity: 0.7 }}>origin: {origin}</p>
        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(st, null, 2)}</pre>
        <p><a href="/admin/line-setup?reason=line_session_missing">手動でセットアップへ</a></p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Settings</h1>
      <p style={{ opacity: 0.7 }}>OK_SETTINGS_PAGE</p>
      <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(st, null, 2)}</pre>
    </div>
  );
}


