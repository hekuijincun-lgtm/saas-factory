import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: Request) {
  const url = new URL(req.url);

  // tenantId passthrough
  const tenantId = url.searchParams.get("tenantId") || "default";
  const debug    = url.searchParams.get("debug") || "";
  const nocache  = url.searchParams.get("nocache") || "";

  const apiBase = process.env.API_BASE || process.env.BOOKING_API_BASE;
  if (!apiBase) {
    return NextResponse.json({ ok:false, error:"missing_api_base" }, { status: 500 });
  }

  const upstream = new URL("/slots", apiBase);
  upstream.searchParams.set("tenantId", tenantId);
  if (debug) upstream.searchParams.set("debug", debug);
  if (nocache) upstream.searchParams.set("nocache", nocache);

  const res = await fetch(upstream.toString(), {
    method: "GET",
    headers: { "Accept": "application/json" },
    cache: "no-store",
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    }
  });
}
