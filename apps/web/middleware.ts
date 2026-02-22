import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  
  
  
  // BYPASS: staff detail PATCH/DELETE は route handler で処理したいので middleware rewrite を回避
  try {
    const p = req.nextUrl.pathname;
    const m = req.method.toUpperCase();
    if ((m === "PATCH" || m === "DELETE") && p.startsWith("/admin/staff/")) {
      return NextResponse.next();
    }
  } catch {}const { pathname } = req.nextUrl;

  // ✅ /api/proxy は app route handler に処理させる（middleware で横取りしない）
  if (pathname.startsWith('/api/proxy/')) {
    return NextResponse.next();
  }
// MWDEBUG_LINE_SETUP_V1
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("mwdebug") === "1" && url.pathname === "/admin/line-setup") {
      return NextResponse.json({
        ok: true,
        stamp: "MWDEBUG_LINE_SETUP_V1",
        url: url.toString(),
        env: {
          API_BASE: process.env.API_BASE ?? null,
          BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null,
          UPSTREAM_BASE: process.env.UPSTREAM_BASE ?? null,
        },
      });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, stamp: "MWDEBUG_LINE_SETUP_V1", error: String(e) }, { status: 500 });
  }
const url = req.nextUrl;
  const res = NextResponse.next();
res.headers.set("x-mw-stamp", "MW_20260218_A");
return res;
}



export const config = {
  matcher: ["/admin/:path*", "/booking/:path*", "/login", "/api/:path*"],
};

