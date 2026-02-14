import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // /admin/settings?line=... を /admin/line-setup?reason=... に強制移動
  if (url.pathname === "/admin/settings") {
    const line = url.searchParams.get("line");
    if (line) {
      const reason =
        line === "error_secret" ? "secret" :
        line === "error_missing" ? "missing_env" :
        line === "ok" ? "ok" :
        "unknown";

      const to = new URL(req.url);
      to.pathname = "/admin/line-setup";
      to.search = "";
      to.searchParams.set("reason", reason);

      return NextResponse.redirect(to, 307);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/settings"],
};