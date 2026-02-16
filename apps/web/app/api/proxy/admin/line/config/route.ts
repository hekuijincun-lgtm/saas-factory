import { NextResponse } from "next/server";
export const runtime = "edge";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function resolveUpstreamBase(): string {
  const env = process.env as Record<string, string | undefined>;
  const base = env.BOOKING_API_BASE || env.API_BASE;
  if (!base) throw new Error("API_BASE/BOOKING_API_BASE is missing");
  return base.replace(/\/+$/, "");
}

async function forward(req: Request) {
  const upstream = resolveUpstreamBase();
  const inUrl = new URL(req.url);

  // upstream 先は固定（Workersの /admin/line/config）
  const u = new URL(upstream + "/admin/line/config");

  // query を丸ごと転送（tenantId, nocache など）
  inUrl.searchParams.forEach((v, k) => u.searchParams.set(k, v));

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = { method: req.method, headers };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    // @ts-ignore
    init.duplex = "half";
  }

  const r = await fetch(u.toString(), init);

  // 透過して返す（＋stampをヘッダに付ける）
  const outHeaders = new Headers(r.headers);
  outHeaders.set("x-proxy-stamp", "STAMP_PROXY_LINECFG_20260216_111607");
  return new Response(r.body, { status: r.status, headers: outHeaders });
}

export async function GET(req: Request) { return forward(req); }
export async function POST(req: Request) { return forward(req); }
export async function OPTIONS() { return NextResponse.json({ ok: true }); }
