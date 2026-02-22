import { NextRequest } from "next/server";

async function forward(req: NextRequest, method: "PATCH" | "DELETE", id: string) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  // Forward to existing proxy route (which hits Worker)
  const upstream = new URL(`/api/proxy/admin/staff/${encodeURIComponent(id)}`, url.origin);
  upstream.searchParams.set("tenantId", tenantId);

  const headers = new Headers(req.headers);
  // Avoid confusing upstream with wrong host/length
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = {
    method,
    headers,
    body: method === "DELETE" ? undefined : await req.text(),
  };

  const res = await fetch(upstream.toString(), init);

  // Pass-through response
  return new Response(await res.text(), {
    status: res.status,
    headers: res.headers,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return forward(req, "PATCH", id);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return forward(req, "DELETE", id);
}