export const runtime = "edge";

import { NextRequest } from "next/server";

async function forward(req: NextRequest, method: "PATCH" | "DELETE", id: string) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  // Forward to existing proxy route (which hits Worker)
  const upstream = new URL(`/api/proxy/admin/staff/${encodeURIComponent(id)}`, url.origin);
  upstream.searchParams.set("tenantId", tenantId);

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = {
    method,
    headers,
    body: method === "DELETE" ? undefined : await req.text(),
  };

  const res = await fetch(upstream.toString(), init);

  // pass-through
  return new Response(await res.text(), {
    status: res.status,
    headers: res.headers,
  });
}

function getIdFromPath(req: NextRequest): string {
  // /admin/staff/<id>
  const p = new URL(req.url).pathname;
  const id = p.split("/").filter(Boolean).pop() ?? "";
  return id;
}

export async function PATCH(req: NextRequest) {
  const id = getIdFromPath(req);
  return forward(req, "PATCH", id);
}

export async function DELETE(req: NextRequest) {
  const id = getIdFromPath(req);
  return forward(req, "DELETE", id);
}