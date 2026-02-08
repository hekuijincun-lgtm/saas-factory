export const runtime = "edge";

import { NextResponse } from "next/server";

type AuthUrlResp = { ok: boolean; url?: string; error?: string; detail?: any };

function getTenantId(req: Request): string {
  const u = new URL(req.url);
  return u.searchParams.get("tenantId") || "default";
}

export async function GET(req: Request) {
  const tenantId = getTenantId(req);

  // ✅ 同一オリジンで proxy を叩く（Pages / Local どっちもOK）
  const origin = new URL(req.url).origin;
  const u = `${origin}/api/proxy/admin/line/auth-url?tenantId=${encodeURIComponent(tenantId)}`;

  let j: AuthUrlResp | null = null;

  try {
    const r = await fetch(u, { cache: "no-store" });
    const text = await r.text();
    j = JSON.parse(text) as AuthUrlResp;

    if (!r.ok || !j?.ok || !j.url) {
      return NextResponse.json(
        { ok: false, error: "failed_to_get_auth_url", detail: { status: r.status, body: j ?? text } },
        { status: 500 }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "failed_to_get_auth_url", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }

  const target = j.url;

  // 🔒 LINE以外へ飛ばない（open redirect対策）
  if (!/^https:\/\/access\.line\.me\/oauth2\/v2\.1\/authorize/i.test(target)) {
    return NextResponse.json(
      { ok: false, error: "Refusing_to_redirect", target },
      { status: 500 }
    );
  }

  return NextResponse.redirect(target, 307);
}
