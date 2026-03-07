export const runtime = 'edge';

import { resolveBookingBase } from "../_lib/proxy";

function pickTenantId(u: URL, req: Request) {
  const tid =
    (u.searchParams.get("tenantId") || req.headers.get("x-tenant-id") || "default").trim();
  return tid || "default";
}

export async function GET(req: Request) {
  const inUrl = new URL(req.url);
  
const base = resolveBookingBase();

  // upstream = {BOOKING_BASE}/slots + query passthrough
  const upstream = new URL("/slots", base);

  // copy ALL query params (date, staffId, debug, nocache, etc.)
  inUrl.searchParams.forEach((v, k) => {
    if (typeof v === "string") upstream.searchParams.set(k, v);
  });

  // ensure tenantId
  const tenantId = pickTenantId(inUrl, req);
  upstream.searchParams.set("tenantId", tenantId);

  // cache-buster: prevent Cloudflare edge cache from serving stale slots
  upstream.searchParams.set("_t", String(Date.now()));

  const res = await fetch(upstream.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-tenant-id": tenantId,
    },
    cache: "no-store",
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/json",
      "cache-control": "no-store, no-cache, must-revalidate",
      "pragma": "no-cache",
    },
  });
}

