import { NextResponse } from "next/server";

export const runtime = "edge";

function resolveUpstreamBase(): string {
  const env = process.env as Record<string, string | undefined>;
  if (env.API_BASE) return env.API_BASE;
  if (env.BOOKING_API_BASE) return env.BOOKING_API_BASE;
  throw new Error("API_BASE / BOOKING_API_BASE is not set on Pages");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  // ✅ STAMP: この route.ts が本当に実行されてるかを確定させる印
  if (debug) {
    return NextResponse.json({
      ok: true,
      stamp: "HIT_STATUS_ROUTE_V1",
      tenantId,
      env: {
        LINE_CHANNEL_ID: !!process.env.LINE_CHANNEL_ID,
        LINE_CHANNEL_SECRET: !!process.env.LINE_CHANNEL_SECRET,
        API_BASE: process.env.API_BASE ?? null,
        BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null,
      },
    });
  }

  const upstreamBase = resolveUpstreamBase();

  let upstreamOk: boolean | null = null;
  let upstreamStatus: number | null = null;

  try {
    const healthUrl = new URL("/health", upstreamBase).toString();
    const r = await fetch(healthUrl, { method: "GET" });
    upstreamOk = r.ok;
    upstreamStatus = r.status;
  } catch {
    upstreamOk = false;
    upstreamStatus = null;
  }

  return NextResponse.json({
    ok: true,
    stamp: "HIT_STATUS_ROUTE_V1",
    tenantId,
    upstreamBase,
    upstreamOk,
    upstreamStatus,
  });
}
