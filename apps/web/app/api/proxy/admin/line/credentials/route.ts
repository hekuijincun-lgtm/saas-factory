import { NextRequest, NextResponse } from "next/server";
import { forwardJson } from "../../../_lib/proxy";

export const runtime = "edge";

/**
 * GET/POST /api/proxy/admin/line/credentials
 * -> Workers: /admin/line/credentials
 */

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("debug") === "1") {
    return NextResponse.json({
      ok: true,
      where: "api/proxy/admin/line/credentials",
      stamp: "CREDS_PROXY_FORWARD_V1",
      upstreamPath: "/admin/line/credentials",
      time: new Date().toISOString(),
    });
  }
  return forwardJson(req, "/admin/line/credentials");
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("debug") === "1") {
    const body = await req.text().catch(() => "");
    return NextResponse.json({
      ok: true,
      where: "api/proxy/admin/line/credentials",
      stamp: "CREDS_PROXY_FORWARD_V1",
      method: "POST",
      upstreamPath: "/admin/line/credentials",
      bodyPreview: body.slice(0, 200),
      time: new Date().toISOString(),
    });
  }
  return forwardJson(req, "/admin/line/credentials");
}
