import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  
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

  if (url.pathname === "/admin/settings") {
    return new NextResponse("MIDDLEWARE_HIT_418", { status: 418 });
  }

  return NextResponse.next();
}

export const config = { matcher: ["/admin/settings"] };
