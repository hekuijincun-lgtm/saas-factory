/* LITERAL_OK_20260221_144234 */
export const runtime = "edge";
import { isAdminPathname, readAdminToken, injectAdminToken, makeDebugStamp, applyDebugHeaders } from '../_lib/proxy';

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
  const __u = new URL(req.url);
  const isDebug = __u.searchParams.get("debug") === "1";
  if (__u.searchParams.get("debug") === "2") {
    const segs = await getPathSegments(ctx);
    const sp = new URLSearchParams(__u.search);
    sp.delete("path");
    const base = getBase();
    const rel = (segs && segs.length > 0) ? segs.join("/") : (__u.pathname.split("/api/proxy/")[1] ?? "");
    const upstream = new URL(`${base}/${rel}`);
    const qs = sp.toString();
    upstream.search = qs ? `?${qs}` : "";
    return Response.json({
      ok: true,
      stamp: "DBG_PROXY_V1_20260221",
      pathname: __u.pathname,
      search: __u.search,
      params_path: segs,
      rel,
      qs,
      upstream: upstream.toString(),
    }, { status: 200, headers: { "cache-control": "no-store" } });
  }
  const nextUrl = new URL(req.url);
    const base = getBase();

  // ✅ rel: Next catch-all の params.path だけを真実にする（pathname は汚染され得る）
  const segs = await getPathSegments(ctx);
  let rel = segs.join("/");

  // ✅ query: Next内部の path=... は捨てる（壊す原因）
  const sp = new URLSearchParams(nextUrl.search);
  sp.delete("path");
  sp.delete("debug"); // strip — don't leak to upstream

  let upstream = new URL(`${base}/${rel}`);
  const qs = sp.toString();
  upstream.search = qs ? `?${qs}` : ""; // keep tenantId, nocache, etc.// keep tenantId, nocache, etc.// ✅ keep tenantId, nocache, etc.

  // forward headers (drop hop-by-hop)
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");

  // /admin/* のみ X-Admin-Token をサーバーサイドから注入（ブラウザ非公開）
  const isAdminRoute = isAdminPathname(upstream.pathname);
  const isTokenConfigured = isAdminRoute && !!readAdminToken();
  const adminTokenInjected = injectAdminToken(headers, upstream.pathname);

  let method = req.method.toUpperCase();

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
  out.headers.set("x-proxy-stamp", "CATCHALL_V1");
  out.headers.set("x-proxy-upstream-url", upstream.toString());
  out.headers.set("x-proxy-upstream-method", method);
  if (adminTokenInjected) out.headers.set("x-admin-token-present", "1");
  if (isDebug) {
    applyDebugHeaders(out.headers, { stamp: makeDebugStamp(), isAdminRoute, tokenConfigured: isTokenConfigured, tokenInjected: adminTokenInjected });
  }

  return out;
}

export async function GET(req: Request, ctx: Ctx) { return proxy(req, ctx); }
export async function POST(req: Request, ctx: Ctx) { return proxy(req, ctx); }
export async function PUT(req: Request, ctx: Ctx) { return proxy(req, ctx); }
export async function PATCH(req: Request, ctx: Ctx) { return proxy(req, ctx); }
export async function DELETE(req: Request, ctx: Ctx) { return proxy(req, ctx); }



