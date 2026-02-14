import { NextResponse } from "next/server";

// DEBUG: disable middleware to diagnose 500(/500) on Pages
export function middleware(_req: Request) {
  return NextResponse.next();
}

// Match nothing (extra safety). If your Next version ignores empty matcher,
// this still won't break because middleware() is a no-op.
export const config = {
  matcher: ["/__mw_disabled__"],
};
