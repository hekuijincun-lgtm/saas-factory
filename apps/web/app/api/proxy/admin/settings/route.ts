export const runtime = "edge";
import { readAdminToken, injectAdminToken, readSessionTenantId, readSessionPayload, makeDebugStamp, applyDebugHeaders, isDebugAllowed } from '../../_lib/proxy';

function apiBase() {
  const v = process.env.API_BASE || process.env.BOOKING_API_BASE || process.env.NEXT_PUBLIC_API_BASE;
  if (!v) throw new Error("API_BASE missing in Pages env");
  return v.replace(/\/$/, "");
}

/**
 * tenantId 解決優先順位:
 *   1. x-session-tenant-id (HMAC session — catch-all 互換)
 *   2. URL query param ?tenantId=
 *   3. request header x-session-tenant (フロント明示指定)
 *   4. request header x-tenant-id
 *   5. fallback: "default"
 */
async function tenantIdFrom(req: Request): Promise<string> {
  // 1. URL query (highest priority — booking flow sends explicit ?tenantId=)
  const u = new URL(req.url);
  const qTid = u.searchParams.get("tenantId")?.trim();
  if (qTid) return qTid;

  // 2. session-based (admin fallback when no explicit query)
  const sessionTid = await readSessionTenantId(req);
  if (sessionTid && sessionTid !== "default") return sessionTid;

  // 3-4. headers
  const hTid = (
    req.headers.get("x-session-tenant") ||
    req.headers.get("x-tenant-id") ||
    ""
  ).trim();
  if (hTid) return hTid;

  return "default";
}

async function buildUpstream(req: Request) {
  const u = new URL(req.url);
  const _da = isDebugAllowed();
  const isDebug = _da && u.searchParams.get("debug") === "1";
  const tenantId = await tenantIdFrom(req);

  const upstream = new URL(apiBase() + "/admin/settings");
  upstream.searchParams.set("tenantId", tenantId);
  if (u.searchParams.get("nocache")) upstream.searchParams.set("nocache", u.searchParams.get("nocache")!);

  const tokenConfigured = !!readAdminToken();
  const reqHeaders = new Headers({
    "content-type": "application/json",
    "accept": "application/json",
    "x-tenant-id": tenantId,
  });
  const tokenInjected = injectAdminToken(reqHeaders, upstream.pathname);

  // Inject session headers (x-session-tenant-id + x-session-user-id)
  // so Workers requireRole() can identify the user on PUT.
  // x-session-tenant-id: URL tenantId を優先する（セッション cookie が古い場合の
  // テナント間設定リンク問題を防止）。Workers getTenantId() は
  // x-session-tenant-id を最優先するため、ここで URL 解決済みの tenantId を使う。
  const session = await readSessionPayload(req);
  reqHeaders.set('x-session-tenant-id', tenantId);
  if (session.userId) reqHeaders.set('x-session-user-id', session.userId);

  return { upstream, reqHeaders, tenantId, isDebug, tokenConfigured, tokenInjected };
}

function buildResponse(body: string, status: number, opts: {
  isDebug: boolean; tokenConfigured: boolean; tokenInjected: boolean; tenantId: string;
}) {
  const out = new Response(body, { status, headers: { "content-type": "application/json" } });
  if (opts.isDebug) {
    if (opts.tokenInjected) out.headers.set("x-admin-token-present", "1");
    out.headers.set("x-tenant-resolved", opts.tenantId);
    applyDebugHeaders(out.headers, { stamp: makeDebugStamp(), isAdminRoute: true, tokenConfigured: opts.tokenConfigured, tokenInjected: opts.tokenInjected });
  }
  return out;
}

export async function GET(req: Request) {
  const ctx = await buildUpstream(req);

  const r = await fetch(ctx.upstream.toString(), {
    method: "GET",
    headers: ctx.reqHeaders,
    cache: "no-store",
  });

  const body = await r.text();
  return buildResponse(body, r.status, ctx);
}

export async function PUT(req: Request) {
  const ctx = await buildUpstream(req);
  const body = await req.text();

  const r = await fetch(ctx.upstream.toString(), {
    method: "PUT",
    headers: ctx.reqHeaders,
    body,
  });

  const outBody = await r.text();
  return buildResponse(outBody, r.status, ctx);
}
