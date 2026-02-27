/**
 * 眉毛サロン予約アプリ プロキシルート
 * /api/proxy/* → API_BASE/* へ転送（CORS 回避）
 * /admin/* へのリクエストには X-Admin-Token を自動注入
 */
export const runtime = "edge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { params: any };

async function getSegments(ctx: Ctx): Promise<string[]> {
  const p = ctx?.params;
  const params = p && typeof p.then === "function" ? await p : p;
  const segs = params?.path;
  return Array.isArray(segs) ? segs : [];
}

function getApiBase(): string {
  const b =
    (process.env.API_BASE ?? "").trim() ||
    (process.env.NEXT_PUBLIC_API_BASE ?? "").trim();
  if (!b) throw new Error("API_BASE env var is not set");
  return b.replace(/\/+$/, "");
}

/** Cloudflare Pages runtime env or process.env から ADMIN_TOKEN を読む */
function readAdminToken(): string | undefined {
  // Cloudflare Pages (edge runtime) — getRequestContext が利用可能な場合
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRequestContext } = require("@cloudflare/next-on-pages");
    const ctx = getRequestContext();
    const v = (ctx?.env as Record<string, unknown>)?.ADMIN_TOKEN;
    if (typeof v === "string" && v.length > 0) return v;
  } catch {
    // ローカル dev / Vercel など getRequestContext が存在しない環境
  }
  const v2 = process.env.ADMIN_TOKEN;
  return typeof v2 === "string" && v2.length > 0 ? v2 : undefined;
}

async function proxy(req: Request, ctx: Ctx): Promise<Response> {
  const segs = await getSegments(ctx);
  const rel = segs.join("/");
  const base = getApiBase();

  // Build upstream URL — strip internal Next.js "path" query param
  const inUrl = new URL(req.url);
  const sp = new URLSearchParams(inUrl.search);
  sp.delete("path");

  const upstream = new URL(`${base}/${rel}`);
  upstream.search = sp.toString() ? `?${sp.toString()}` : "";

  // Forward headers (drop hop-by-hop)
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");

  // /admin/* へのリクエストに X-Admin-Token を注入（ADMIN_TOKEN が設定済みの場合のみ）
  const isAdminPath = upstream.pathname === "/admin" ||
                      upstream.pathname.startsWith("/admin/");
  if (isAdminPath) {
    const token = readAdminToken();
    if (token) {
      headers.set("X-Admin-Token", token);
    }
  }

  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  let res: Response;
  try {
    res = await fetch(upstream.toString(), {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: "upstream_unreachable", detail: String(e) }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  const out = new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
  out.headers.set("cache-control", "no-store");
  out.headers.set("x-proxy-upstream", upstream.toString());
  return out;
}

export async function GET(req: Request, ctx: Ctx)    { return proxy(req, ctx); }
export async function POST(req: Request, ctx: Ctx)   { return proxy(req, ctx); }
export async function PUT(req: Request, ctx: Ctx)    { return proxy(req, ctx); }
export async function PATCH(req: Request, ctx: Ctx)  { return proxy(req, ctx); }
export async function DELETE(req: Request, ctx: Ctx) { return proxy(req, ctx); }
