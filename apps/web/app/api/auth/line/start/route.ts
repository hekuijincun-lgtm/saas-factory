import { NextResponse } from "next/server";

export const runtime = "edge";

function resolveUpstreamBase(): string | null {
  const env = process.env as Record<string, string | undefined>;
  return env.BOOKING_API_BASE || env.API_BASE || null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  const apiBase = resolveUpstreamBase();
  if (!apiBase) {
    return NextResponse.json({ ok:false, error:"missing_api_base" }, { status: 500 });
  }

  const returnTo = url.searchParams.get("returnTo") || `${url.origin}/admin/line-setup`;

  // ✅ debug=1 は何があっても最優先で返す（Pages反映確認用）
  if (debug) {
    const w = new URL("/auth/line/start", apiBase);
    w.searchParams.set("tenantId", tenantId);
    w.searchParams.set("returnTo", returnTo);

    return NextResponse.json({
      ok: true,
      debug: true,
      where: "apps/web/app/api/auth/line/start/route.ts",
      requestUrl: url.toString(),
      tenantId,
      apiBase,
      returnTo,
      redirectTo: w.toString(),
      at: new Date().toISOString(),
    });
  }

  const w = new URL("/auth/line/start", apiBase);
  w.searchParams.set("tenantId", tenantId);
  w.searchParams.set("returnTo", returnTo);

  const res = NextResponse.redirect(w.toString(), 302);
  // keep returnTo across LINE roundtrip (fallback)
  res.headers.set("Set-Cookie", `line_return_to=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; Secure; SameSite=Lax`);
  return res;
}
