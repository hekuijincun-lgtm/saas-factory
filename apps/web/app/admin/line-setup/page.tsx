import { cookies, headers } from "next/headers";

export const runtime = "edge";

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function pickApiBase(): string | null {
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

export default async function LineSetupPage({ searchParams }: Props) {
  const stamp = "LINE_SETUP_V2";
  const debug = searchParams?.debug === "1";

  const apiBase = pickApiBase();
  const h = headers();
  const c = cookies();

  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  const lineSessionPresent = !!c.get("line_session")?.value;
  const returnTo = `${origin}/admin/line-setup`;

  // =========================
  // ✅ debug=1 のときだけ Diagnostics
  // =========================
  if (debug) {
    const diag: any = {
      stamp: "LINE_SETUP_DEBUG_V2",
      now: new Date().toISOString(),
      env: {
        API_BASE: process.env.API_BASE ?? null,
        BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null,
        UPSTREAM_BASE: process.env.UPSTREAM_BASE ?? null,
        NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? null,
      },
      derived: { apiBase, origin, returnTo },
      headers: {
        host,
        "x-forwarded-proto": proto,
        "user-agent": h.get("user-agent") ?? null,
        "cf-ray": h.get("cf-ray") ?? null,
      },
      cookies: {
        names: c.getAll().map(x => x.name),
        line_session: lineSessionPresent ? "[present]" : null,
        line_return_to: c.get("line_return_to")?.value ? "[present]" : null,
      },
    };

    let ping: any = null;
    if (apiBase) {
      ping = await safeFetchJson(`${apiBase}/__build?v=${Math.random().toString(16).slice(2)}`);
    }

    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>LINE Setup Debug 🧪</h1>
        <p style={{ marginTop: 6, opacity: 0.8 }}>
          debug=1 のときだけ表示される Diagnostics（通常アクセスでは出ない）。
        </p>

        <h2 style={{ marginTop: 16, fontSize: 16, fontWeight: 700 }}>Diagnostics</h2>
        <pre style={{ marginTop: 8, padding: 12, background: "#111", color: "#eee", borderRadius: 10, overflow: "auto" }}>
{JSON.stringify(diag, null, 2)}
        </pre>

        <h2 style={{ marginTop: 16, fontSize: 16, fontWeight: 700 }}>Ping /__build</h2>
        <pre style={{ marginTop: 8, padding: 12, background: "#111", color: "#eee", borderRadius: 10, overflow: "auto" }}>
{JSON.stringify(ping, null, 2)}
        </pre>

        <p style={{ marginTop: 14, opacity: 0.85 }}>
          通常UIを見る → <a href="/admin/line-setup" style={{ textDecoration: "underline" }}>/admin/line-setup</a>
        </p>
      </div>
    );
  }

  // =========================
  // ✅ 通常アクセスは “本番UI”（ログイン導線）
  // =========================
  const startUrl =
    origin
      ? `/api/auth/line/start?returnTo=${encodeURIComponent(returnTo)}`
      : `/api/auth/line/start`;

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>LINE Setup</h1>

      <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div style={{ fontWeight: 700 }}>Status</div>
        <div style={{ marginTop: 6 }}>
          line_session: {lineSessionPresent ? "✅ present" : "❌ missing"}
        </div>
        <div style={{ marginTop: 6, opacity: 0.85, fontSize: 12 }}>
          stamp: {stamp}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <a
          href={startUrl}
          style={{
            display: "inline-block",
            padding: "10px 14px",
            borderRadius: 10,
            background: "#06C755",
            color: "white",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          LINEでログインして連携する
        </a>
      </div>

      <div style={{ marginTop: 14, opacity: 0.85 }}>
        <div style={{ fontSize: 12 }}>
          ※ うまく行かない時は Diagnostics を確認 👉{" "}
          <a href="/admin/line-setup?debug=1" style={{ textDecoration: "underline" }}>
            /admin/line-setup?debug=1
          </a>
        </div>
      </div>
    </div>
  );
}
