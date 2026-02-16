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
const outHeaders = new Headers(r.headers);
outHeaders.set("x-proxy-upstream-url", u.toString());
outHeaders.set("x-proxy-upstream-method", (methodOverride ?? req.method));
return new Response(r.body, { status: r.status, headers: outHeaders });
}

export async function GET(req: Request, ctx: any) { return forward(req, ctx.params); }
export async function POST(req: Request, ctx: any) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  const segs = ((ctx?.params?.path || []) as string[]);

  // proxy 側が認識してる path を確実に見える化
  const p = "/" + segs.join("/");

  // ✅ デバッグ：proxy 内で止まってるか / path が何かを確認する
  if (debug) {
    return new Response(JSON.stringify({
      ok: true,
      where: "proxy.POST.debug",
      path: p,
      segs,
      method: req.method,
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-proxy-stamp": "STAMP_PROXY_POSTDBG_20260216_1245"
      }
    });
  }

  // ✅ /admin/line/config は upstream 側 PUT へ変換して forward
  if (p === "/admin/line/config") {
    // forward の第3引数(methodOverride) がある前提（前に入れたやつ）
    return forward(req, ctx.params, "PUT");
  }

  // それ以外は通常 forward（ここで 404 返さない）
  return forward(req, ctx.params);
}export async function PUT(req: Request, ctx: any) { return forward(req, ctx.params); }
export async function PATCH(req: Request, ctx: any) { return forward(req, ctx.params); }
export async function DELETE(req: Request, ctx: any) { return forward(req, ctx.params); }
export async function OPTIONS() { return NextResponse.json({ ok: true }); }




