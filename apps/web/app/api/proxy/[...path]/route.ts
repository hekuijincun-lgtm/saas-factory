import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "edge";

function resolveUpstreamBase(): string {
  const env = process.env as Record<string, string | undefined>;
  const base = env.BOOKING_API_BASE || env.API_BASE;
  if (!base) throw new Error("API_BASE/BOOKING_API_BASE is missing");
  return base.replace(/\/+$/, "");
}

async function forward(req: Request, params: { path: string[] }, methodOverride?: string) {
  const upstream = resolveUpstreamBase();
  const inUrl = new URL(req.url);

  const path = "/" + (params.path || []).map(encodeURIComponent).join("/");
  const u = new URL(upstream + path);

  inUrl.searchParams.forEach((v, k) => u.searchParams.set(k, v));

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = { method: (methodOverride ?? req.method), headers };

  const m = (methodOverride ?? req.method);
  if (m !== "GET" && m !== "HEAD") {
    init.body = req.body;
    // @ts-ignore
    init.duplex = "half";
  }

  const r = await fetch(u.toString(), init);
  return new Response(r.body, { status: r.status, headers: new Headers(r.headers) });
}

export async function GET(req: Request, ctx: any) { return forward(req, ctx.params); }
export async function POST(req: Request, ctx: any) {
  const p = "/" + ((ctx?.params?.path || []) as string[]).join("/");
  // Pages 側が PUT を弾く前提で、POST で受けて upstream だけ PUT に変換する
  if (p === "/admin/line/config") {
    return forward(req, ctx.params, "PUT");
  }
  return forward(req, ctx.params);
}
export async function PUT(req: Request, ctx: any) { return forward(req, ctx.params); }
export async function PATCH(req: Request, ctx: any) { return forward(req, ctx.params); }
export async function DELETE(req: Request, ctx: any) { return forward(req, ctx.params); }
export async function OPTIONS() { return NextResponse.json({ ok: true }); }


