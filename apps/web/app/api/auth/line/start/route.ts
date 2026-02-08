export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

function getApiBase(): string {
  // Pages runtime env (recommended)
  try {
    const ctx = getRequestContext();
    // @ts-ignore
    const v = ctx?.env?.API_BASE || ctx?.env?.WORKER_API_BASE || ctx?.env?.BOOKING_API_BASE;
    if (v) return String(v).replace(/\/+$/, "");
  } catch {}

  // Fallback (local dev)
  const v = process.env.API_BASE || process.env.WORKER_API_BASE || process.env.BOOKING_API_BASE;
  if (v) return String(v).replace(/\/+$/, "");

  return "http://127.0.0.1:8787";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId") || "default";

  const apiBase = getApiBase();
  const u = `${apiBase}/admin/integrations/line/auth-url?tenantId=${encodeURIComponent(tenantId)}`;

  let j: any = null;
  try {
    const r = await fetch(u, { method: "GET" });
    const txt = await r.text();
    try { j = JSON.parse(txt); } catch { j = { ok: false, raw: txt }; }

    if (!r.ok || !j?.ok || !j?.url) {
      return NextResponse.json(
        { ok: false, error: "failed_to_get_auth_url", detail: j?.detail || j, status: r.status },
        { status: 500 }
      );
    }

    const target = String(j.url);

    // 🔒 only redirect to LINE authorize
    if (!/^https:\/\/access\.line\.me\/oauth2\/v2\.1\/authorize/i.test(target)) {
      return NextResponse.json(
        { ok: false, error: "Refusing_to_redirect", target },
        { status: 500 }
      );
    }

    return NextResponse.redirect(target, 307);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "failed_to_get_auth_url", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
