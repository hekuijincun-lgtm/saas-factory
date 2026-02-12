import { NextResponse } from "next/server";
export const runtime = "edge";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  // stamp を変えたら「反映されたか」一発で分かる
  const stamp = "HIT_LINE_START_DEBUG_20260212_B";

  if (debug) {
    return NextResponse.json({
      ok: true,
      stamp,
      path: url.pathname,
      env: {
        API_BASE: process.env.API_BASE ?? null,
        BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null,
      },
    });
  }

  return NextResponse.json({ ok: false, stamp, error: "debug_only" }, { status: 400 });
}
