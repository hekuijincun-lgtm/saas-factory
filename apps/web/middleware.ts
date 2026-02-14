import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  if (url.pathname === "/admin/settings") {
    return new NextResponse("MIDDLEWARE_HIT_418", { status: 418 });
  }

  return NextResponse.next();
}

export const config = { matcher: ["/admin/settings"] };