import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// Prefer Pages env: API_BASE. Fallback to BOOKING_API_BASE if you used it before.
const API_BASE =
  process.env.API_BASE ||
  process.env.BOOKING_API_BASE ||
  "https://saas-factory-api.hekuijincun.workers.dev";

function getTenantId(req: NextRequest) {
  return req.nextUrl.searchParams.get("tenantId") || "default";
}

async function forward(req: NextRequest) {
  const url = new URL(req.url);
  const tenantId = getTenantId(req);

  // Ensure tenantId is always present
  url.searchParams.set("tenantId", tenantId);

  // Build upstream URL
  const upstream = `${API_BASE}/admin/staff?${url.searchParams.toString()}`;

  // Forward headers (keep minimal to avoid edge quirks)
  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;

  let body: BodyInit | undefined = undefined;
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    // preserve body
    body = await req.text();
  }

  const res = await fetch(upstream, {
    method,
    headers,
    body,
  });

  const text = await res.text();
  const resCt = res.headers.get("content-type") || "application/json; charset=utf-8";

  return new NextResponse(text, {
    status: res.status,
    headers: {
      "content-type": resCt,
      "cache-control": "no-store",
    },
  });
}

export async function GET(req: NextRequest)    { return forward(req); }
export async function POST(req: NextRequest)   { return forward(req); }
export async function PATCH(req: NextRequest)  { return forward(req); }
export async function DELETE(req: NextRequest) { return forward(req); }
