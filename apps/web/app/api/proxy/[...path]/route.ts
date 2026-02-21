export const runtime = "edge";

type Ctx = { params: any };

function isPromise(x: any): x is Promise<any> {
  return !!x && typeof x.then === "function";
}

async function getPathSegments(ctx: Ctx): Promise<string[]> {
  const p = ctx?.params;
  const params = isPromise(p) ? await p : p;
  const segs = params?.path;
  return Array.isArray(segs) ? segs : [];
}

function getBase(): string {
  // Prefer API_BASE, fallback to NEXT_PUBLIC_API_BASE
  // (Pages env: API_BASE is set; local may also have it)
  const b =
    (process.env.API_BASE && process.env.API_BASE.trim()) ||
    (process.env.NEXT_PUBLIC_API_BASE && process.env.NEXT_PUBLIC_API_BASE.trim()) ||
    "";
  if (!b) throw new Error("API base is not set (API_BASE or NEXT_PUBLIC_API_BASE)");
  return b.replace(/\/+$/, "");
}

async function proxy(req: Request, ctx: Ctx): Promise<Response> {
  const nextUrl = new URL(req.url);
const base = getBase();

// ✅ rel: pathname から安定抽出（ctx.params は使わない）
const fullPath = nextUrl.pathname;
const rel = fullPath.split("/api/proxy/")[1] ?? "";

// ✅ query: Next内部の path=... は全部捨てる（これが壊してた）
const sp = new URLSearchParams(nextUrl.search);
  // FIX: drop Next internal path=... param (it breaks upstream path like '=default')
  sp.delete("path");
sp.delete("path"); // Next catch-all internal
const upstream = new URL(`${base}/${rel}`);
const qs = sp.toString();
upstream.search = qs ? `?${qs}` : ""; // ✅ keep tenantId, nocache, etc.

  // forward headers (drop hop-by-hop)
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");

  const method = req.method.toUpperCase();

  let body: ArrayBuffer | undefined = undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  const res = await fetch(upstream.toString(), {
    method,
    headers,
    body,
    redirect: "manual",
  });

  const out = new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });

  out.headers.set("cache-control", "no-store");
  out.headers.set("x-proxy-stamp", "STAMP_PROXY_PARAMS_PATH_V1_20260221");
  out.headers.set("x-proxy-upstream-url", upstream.toString());
  out.headers.set("x-proxy-upstream-method", method);

  return out;
}

export async function GET(req: Request, ctx: Ctx) { return proxy(req, ctx); }
export async function POST(req: Request, ctx: Ctx) { return proxy(req, ctx); }
export async function PUT(req: Request, ctx: Ctx) { return proxy(req, ctx); }
export async function PATCH(req: Request, ctx: Ctx) { return proxy(req, ctx); }
export async function DELETE(req: Request, ctx: Ctx) { return proxy(req, ctx); }

