export const runtime = 'edge';
import { NextResponse } from "next/server";

function getApiBase(): string {
  // Pages Functions env (secret)
  const v = (process.env.API_BASE || "").trim();
  if (v) return v;
  // fallback (dev only): NEXT_PUBLIC_API_BASE
  const v2 = (process.env.NEXT_PUBLIC_API_BASE || "").trim();
  if (v2) return v2;
  return "";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || "default";

    const apiBase = getApiBase();
    if (!apiBase) {
      return NextResponse.json({ ok: false, error: "API_BASE missing" }, { status: 500 });
    }

    const url = ${apiBase.replace(/\/+$/, "")}/admin/integrations/line/auth-url?tenantId=;
    const r = await fetch(url, { headers: { "accept": "application/json" } });
    const text = await r.text();
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: "failed_to_get_auth_url", status: r.status, body: text.slice(0, 500) }, { status: 500 });
    }

    let j: any;
    try { j = JSON.parse(text); } catch {
      return NextResponse.json({ ok: false, error: "invalid_json", body: text.slice(0, 500) }, { status: 500 });
    }

    const target = (j?.url || "").toString();
    if (!target) {
      return NextResponse.json({ ok: false, error: "empty_auth_url", body: j }, { status: 500 });
    }

    // 🔒 Only allow LINE authorize redirect
    if (!/^https:\/\/access\.line\.me\/oauth2\/v2\.1\/authorize/i.test(target)) {
      return NextResponse.json({ ok: false, error: "refusing_redirect", target }, { status: 500 });
    }

    return NextResponse.redirect(target, 307);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "start_route_exception", message: String(e?.message || e) }, { status: 500 });
  }
}
