export const runtime = 'edge';

import { NextResponse } from "next/server";

export async function GET(req: Request) {
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

