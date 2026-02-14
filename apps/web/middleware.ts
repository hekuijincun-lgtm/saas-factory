import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  
  const u = new URL(request.url);
  if (u.pathname === '/api/auth/line/start') return NextResponse.next();
// BYPASS_AUTH_MIDDLEWARE (stop redirect loops / 522)
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

  // ✅ Keep your existing behavior below (if you had one)
  // If you previously redirected based on some condition, re-add it safely here.
  // For now, do nothing special:
  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};




