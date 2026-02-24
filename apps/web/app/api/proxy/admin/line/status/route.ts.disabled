import { NextResponse } from "next/server";

export const runtime = "edge";

function upstreamBase(): string {
  const env = process.env as Record<string, string | undefined>;
  const b = env.BOOKING_API_BASE || env.API_BASE;
  if (!b) throw new Error("BOOKING_API_BASE/API_BASE is missing on Pages env");
  return b;
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  const up = new URL(upstreamBase());
  up.pathname = "/admin/integrations/line/status";
  up.searchParams.set("tenantId", tenantId);

  const r = await fetch(up.toString(), { method: "GET" });
  const body = await r.text();

  return new NextResponse(body, {
    status: r.status,
    headers: { ...corsHeaders(req), "content-type": r.headers.get("content-type") ?? "application/json", "x-proxy-stamp": "STAMP_PROXY_LINESTATUS_V1" },
  });
}

