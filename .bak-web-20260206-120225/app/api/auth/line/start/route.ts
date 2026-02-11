export const runtime = 'edge';

import { NextResponse } from "next/server";

export async function GET(req: Request) {
export async function GET(req: Request) {
  // ==== line-start-debug (FORCE RETURN) ====
  const u = new URL(req.url);
  if (u.searchParams.get("debug") === "1") {
    return new Response(JSON.stringify({
      ok: true,
      where: "line-start-debug",
      env: {
        API_BASE: process.env.API_BASE ?? null,
        BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  // Worker proxy route you already have:
  const r = await fetch(`http://127.0.0.1:3000/api/proxy/admin/line/auth-url?tenantId=${encodeURIComponent(tenantId)}`, {
    cache: "no-store",
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return NextResponse.json({ ok: false, error: "failed_to_get_auth_url", detail: t }, { status: 500 });
  }

  const j = await r.json();
  if (!j?.url) {
    return NextResponse.json({ ok: false, error: "auth_url_missing" }, { status: 500 });
  }

  return NextResponse.redirect(j.url);
}


