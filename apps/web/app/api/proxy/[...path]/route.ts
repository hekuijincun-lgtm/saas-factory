import { NextResponse } from "next/server";

export const runtime = "edge";

const STAMP = "STAMP_PROXY_V4_FULLDBG_20260216_1300";

function resolveUpstreamBase(): string {
  const env = process.env as Record<string, string | undefined>;
  return (
    env.UPSTREAM_BASE ||
    env.BOOKING_API_BASE ||
    env.API_BASE ||
    env.NEXT_PUBLIC_API_BASE ||
    ""
  );
}

type Ctx = { params: any };

async function forward(req: Request, ctx: Ctx, methodOverride?: string) {
  const upstreamBase = resolveUpstreamBase();
  const inUrl = new URL(req.url);
  const p = await (ctx as any)?.params;
  const segs = ((p?.path) || []) as string[];
  const path = "/" + segs.join("/");

  const m = (methodOverride ?? req.method).toUpperCase();
  const upstreamUrl = new URL(upstreamBase);
  upstreamUrl.pathname = path;
  upstreamUrl.search = inUrl.search; // クエリはそのまま渡す

  const debug = inUrl.searchParams.get("debug") === "1";

  // ✅ debug=1 は “必ず” ここで止めて返す（deploy反映確認のため）
  if (debug) {
    return NextResponse.json(
      {
        ok: true,
        stamp: STAMP,
        req: { method: req.method, url: req.url },
        resolved: { segs, path },
        upstream: { base: upstreamBase, url: upstreamUrl.toString(), method: m },
      },
      { headers: { "x-proxy-stamp": STAMP } }
    );
  }

  if (!upstreamBase) {
    return NextResponse.json(
      { ok: false, stamp: STAMP, error: "upstream_base_missing", path },
      { status: 500, headers: { "x-proxy-stamp": STAMP } }
    );
  }

  // headers
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = { method: m, headers };

  if (m !== "GET" && m !== "HEAD") {
    const buf = await req.arrayBuffer();
    init.body = buf;
  }

  const r = await fetch(upstreamUrl.toString(), init);

  const outHeaders = new Headers(r.headers);
  outHeaders.set("x-proxy-stamp", STAMP);
  outHeaders.set("x-proxy-upstream-url", upstreamUrl.toString());
  outHeaders.set("x-proxy-upstream-method", m);

  return new Response(r.body, { status: r.status, headers: outHeaders });
}

export async function GET(req: Request, ctx: any) {
  return forward(req, ctx as Ctx);
}
export async function POST(req: Request, ctx: any) {
  const p0 = await (ctx as any)?.params;
  const segs0 = ((p0?.path) || []) as string[];
  const p = "/" + segs0.join("/");
// ✅ Pages 側が PUT を弾く運用なら、POSTで受けて upstream をPUTに変換
  if (p === "/admin/line/config") {
    return forward(req, ctx as Ctx, "PUT");
  }
  return forward(req, ctx as Ctx);
}
export async function PUT(req: Request, ctx: any) {
  return forward(req, ctx as Ctx);
}
export async function PATCH(req: Request, ctx: any) {
  return forward(req, ctx as Ctx);
}
export async function DELETE(req: Request, ctx: any) {
  return forward(req, ctx as Ctx);
}
