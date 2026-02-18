export const runtime = "edge";
const gateStamp = "SETTINGS_GATE_COOKIE_V1";
import { headers, cookies } from "next/headers";

export default async function AdminSettingsPage() {
  const h = headers();
  const cookie = h.get("cookie") ?? "";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "https://saas-factory-web-v2.pages.dev";
// ✅ status API は configured じゃなく line_session_present を返す
  const hasSession = /(?:^|;\s*)line_session=/.test(cookie);
  if (!hasSession) {
    return (
      <div style={{ fontFamily: "system-ui", padding: 24 }}>
        <h1>Redirecting…</h1>
        <p style={{ opacity: 0.7 }}>REDIR_LINE_SESSION_MISSING</p>
        <p style={{ opacity: 0.7 }}>DBG_COOKIE_LEN:{cookie.length}</p>
        <p style={{ opacity: 0.7 }}>DBG_HASSESSION:{String(hasSession)}</p>
        <p style={{ opacity: 0.7 }}>origin: {origin}</p>
<p><a href="/admin/line-setup?reason=line_session_missing">手動でセットアップへ</a></p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Settings</h1>
      <p style={{ opacity: 0.7 }}>OK_SETTINGS_PAGE</p>
</div>
  );
}






