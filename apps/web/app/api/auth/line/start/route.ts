export const runtime = "edge";

import { NextResponse } from "next/server";

/**
 * Pick upstream base URL from env.
 */
function pickBase(): string | null {
  return (
    process.env.API_BASE ||
    process.env.BOOKING_API_BASE ||
    process.env.WORKER_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    null
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  // ===== DEBUG: ALWAYS RETURN JSON FIRST =====
  if (url.searchParams.get("debug") === "1") {
    const envAny = process.env as any;
    return NextResponse.json({
      ok: true,
      marker: "LINE_START_DEBUG_MARKER_V3",
      file: "apps/web/app/api/auth/line/start/route.ts",
      href: url.toString(),
      commit: envAny.CF_PAGES_COMMIT_SHA ?? null,
      env_present: {
        API_BASE: !!envAny.API_BASE,
        BOOKING_API_BASE: !!envAny.BOOKING_API_BASE,
        WORKER_API_BASE: !!envAny.WORKER_API_BASE,
        NEXT_PUBLIC_API_BASE: !!envAny.NEXT_PUBLIC_API_BASE,
        NEXT_PUBLIC_API_BASE_URL: !!envAny.NEXT_PUBLIC_API_BASE_URL,
        LINE_CHANNEL_ID: !!envAny.LINE_CHANNEL_ID,
        LINE_CHANNEL_SECRET: !!envAny.LINE_CHANNEL_SECRET,
      },
      base_selected: pickBase(),
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "debug_not_enabled",
    },
    { status: 500 }
  );
}
