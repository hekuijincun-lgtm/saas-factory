import { cookies, headers } from "next/headers";

export const runtime = "edge";

function pickApiBase(): string | null {
  // Pages/Edge では process.env は読める（値はビルド時 or runtime env）
  const env = process.env as Record<string, string | undefined>;
  return env.BOOKING_API_BASE ?? env.API_BASE ?? env.UPSTREAM_BASE ?? null;
}

async function safeFetchJson(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: res.ok, status: res.status, url, text: text.slice(0, 2000), json };
  } catch (e: any) {
    return { ok: false, status: 0, url, text: String(e?.message ?? e), json: null };
  }
}

export default async function LineSetupPage() {
  const stamp = "LINE_SETUP_DEBUG_V1"; // ← これが表示されたら反映OK

  // --- collect diagnostics (never throw) ---
  const apiBase = pickApiBase();
  const h = headers();
  const c = cookies();

  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : null;

  const diag: any = {
    stamp,
    now: new Date().toISOString(),
    env: {
      API_BASE: process.env.API_BASE ?? null,
      BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null,
      UPSTREAM_BASE: process.env.UPSTREAM_BASE ?? null,
      NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? null,
    },
    derived: { apiBase, origin },
    headers: {
      host,
      "x-forwarded-proto": proto,
      "user-agent": h.get("user-agent") ?? null,
      "cf-ray": h.get("cf-ray") ?? null,
    },
    cookies: {
      names: c.getAll().map(x => x.name),
      line_session: c.get("line_session")?.value ? "[present]" : null,
      line_return_to: c.get("line_return_to")?.value ? "[present]" : null,
    },
  };

  // optional ping (safe)
  let ping: any = null;
  if (apiBase) {
    // とりあえず “死なない” 疎通。存在しなくてもOK（結果を表示するだけ）
    ping = await safeFetchJson(`${apiBase}/__build?v=${Math.random().toString(16).slice(2)}`);
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>LINE Setup Debug 🧪</h1>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        500 が出る原因を “画面に出す” ための暫定ページ（throwしない）。
      </p>

      <h2 style={{ marginTop: 16, fontSize: 16, fontWeight: 700 }}>Diagnostics</h2>
      <pre style={{ marginTop: 8, padding: 12, background: "#111", color: "#eee", borderRadius: 10, overflow: "auto" }}>
{JSON.stringify(diag, null, 2)}
      </pre>

      <h2 style={{ marginTop: 16, fontSize: 16, fontWeight: 700 }}>Ping /__build</h2>
      <pre style={{ marginTop: 8, padding: 12, background: "#111", color: "#eee", borderRadius: 10, overflow: "auto" }}>
{JSON.stringify(ping, null, 2)}
      </pre>

      <p style={{ marginTop: 14, opacity: 0.8 }}>
        ここが 200 で開けたら「元の page.tsx のロジックがクラッシュ原因」確定。
      </p>
    </div>
  );
}
