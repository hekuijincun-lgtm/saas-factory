import { NextResponse } from "next/server";

export const runtime = "edge";

function resolveApiBase(): string | null {
  const env = process.env as Record<string, string | undefined>;
  return env.BOOKING_API_BASE || env.API_BASE || env.UPSTREAM_BASE || env.API_ORIGIN || env.UPSTREAM_ORIGIN || null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  const apiBase = resolveApiBase();
  if (!apiBase) {
    return NextResponse.json({ ok:false, error:"missing_api_base" }, { status: 500 });
  }

  const returnTo = url.searchParams.get("returnTo") || `${url.origin}/admin/line-setup`;

  // ✅ Pages → Workers /auth/line/start に丸投げ（cookie + LINE authorize は Workers 側でやる）
  const w = new URL("/auth/line/start", apiBase);
  w.searchParams.set("tenantId", tenantId);
  w.searchParams.set("returnTo", returnTo);

  if (debug) {
    return NextResponse.json({
      ok: true,
      debug: true,
      where: "apps/web/app/api/auth/line/start/route.ts",
      requestUrl: req.url,
      tenantId,
      apiBase,
      returnTo,
      redirectTo: w.toString(),
      at: new Date().toISOString(),
    });
  }  const res = NextResponse.redirect(w.toString(), 302);
  // keep returnTo across LINE roundtrip
  res.headers.set("Set-Cookie", `line_return_to=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; Secure; SameSite=Lax`);
  return res;
}
