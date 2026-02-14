import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // ✅ Never touch API / Next internals / static assets
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js")
  ) {
    return NextResponse.next();
  }

  // ✅ For now, ONLY guard admin (avoid global 500 incidents)
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // TODO: ここで cookie/session のチェックを入れる（次フェーズ）
  // いったん admin も通す（=安定化優先）
  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
