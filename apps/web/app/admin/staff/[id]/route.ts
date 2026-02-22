export const runtime = "edge";

import { NextRequest } from "next/server";

type Ctx = { params: { id: string } };

async function forward(req: NextRequest, method: "PATCH" | "DELETE", id: string) {
  const origin = req.nextUrl.origin;

  // Forward to existing proxy route (which hits Worker)
  const upstream = new URL(`/api/proxy/admin/staff/${encodeURIComponent(id)}`, origin);

  // Preserve query params (tenantId / nocache etc.)
  req.nextUrl.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = {
    method,
    headers,
    body: method === "DELETE" ? undefined : await req.text(),
  };

  const res = await fetch(upstream.toString(), init);

  // pass-through (keep body + status)
  return new Response(await res.text(), {
    status: res.status,
    headers: res.headers,
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const id = ctx?.params?.id ?? "";
  if(!id || id.includes("=")){
    return new Response(JSON.stringify({ ok:false, where:"STAFF_FORWARD_ROUTE", error:"bad_id", id }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  return forward(req, "PATCH", id);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const id = ctx?.params?.id ?? "";
  if(!id || id.includes("=")){
    return new Response(JSON.stringify({ ok:false, where:"STAFF_FORWARD_ROUTE", error:"bad_id", id }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  return forward(req, "DELETE", id);
}