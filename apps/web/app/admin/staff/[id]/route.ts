export const runtime = "edge";

import { NextRequest } from "next/server";

function pickId(req: NextRequest, ctx?: any): string {
  // 1) ctx.params.id がある環境（Next標準）を最優先
  const fromCtx = ctx?.params?.id;
  if (typeof fromCtx === "string" && fromCtx.length > 0) return fromCtx;

  // 2) Edge/Pages では req.nextUrl が一番安全
  const p = req.nextUrl?.pathname ?? new URL(req.url).pathname;

  // /admin/staff/<id>
  const parts = p.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  return last;
}

async function forward(req: NextRequest, method: "PATCH" | "DELETE", id: string) {
  const tenantId = req.nextUrl.searchParams.get("tenantId") ?? "default";

  // ✅ guard: ここで変なIDを弾く（=default みたいなのを潰す）
  if (!id || id === "staff" || id.startsWith("=") || id.includes("tenantId")) {
    return Response.json(
      { ok: false, where: "STAFF_FORWARD_ROUTE", error: "bad_id", id, tenantId, path: req.nextUrl.pathname },
      { status: 400, headers: { "x-forward-id": id || "(empty)" } }
    );
  }

  const upstream = new URL(`/api/proxy/admin/staff/${encodeURIComponent(id)}`, req.nextUrl.origin);
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
  const text = await res.text();

  // pass-through + debug header
  const outHeaders = new Headers(res.headers);
  outHeaders.set("x-forward-id", id);
  outHeaders.set("x-forward-tenant", tenantId);

  return new Response(text, {
    status: res.status,
    headers: outHeaders,
  });
}

export async function PATCH(req: NextRequest, ctx: any) {
  const id = pickId(req, ctx);
  return forward(req, "PATCH", id);
}

export async function DELETE(req: NextRequest, ctx: any) {
  const id = pickId(req, ctx);
  return forward(req, "DELETE", id);
}