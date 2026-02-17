import { NextResponse } from "next/server";
export const runtime = "edge";
export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.json({
    ok: true,
    where: "/api/ping",
    debug: url.searchParams.get("debug"),
    now: new Date().toISOString(),
  }, { headers: { "x-ping-stamp": "PING_20260217_1100" }});
}
