import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("debug") === "1") {
    return NextResponse.json({
      ok: true,
      where: "api/proxy/admin/line/credentials",
      stamp: "CREDS_PROXY_MIN_V1",
      time: new Date().toISOString(),
    });
  }
  return NextResponse.json({ ok: false, error: "not_implemented_yet" }, { status: 501 });
}
