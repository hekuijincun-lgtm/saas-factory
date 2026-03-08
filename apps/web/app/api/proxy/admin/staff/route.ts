export const runtime = "edge";
import { readAdminToken, injectAdminToken, makeDebugStamp, applyDebugHeaders, readSessionPayload } from "../../_lib/proxy";

function apiBase(): string {
  const v = process.env.API_BASE || process.env.BOOKING_API_BASE || process.env.NEXT_PUBLIC_API_BASE;
  if (!v) throw new Error("API_BASE missing in Pages env");
  return v.replace(/\/$/, "");
}

function tenantIdFrom(req: Request): string {
  const u = new URL(req.url);
  return (u.searchParams.get("tenantId") || req.headers.get("x-tenant-id") || "default").trim() || "default";
}

async function forward(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const isDebug = u.searchParams.get("debug") === "1";
  const tenantId = tenantIdFrom(req);
  const method = req.method.toUpperCase();

  const upstream = new URL(apiBase() + "/admin/staff");
  // forward all query params except debug; ensure tenantId is set
  u.searchParams.forEach((v, k) => { if (k !== "debug") upstream.searchParams.set(k, v); });
  upstream.searchParams.set("tenantId", tenantId);

  const tokenConfigured = !!readAdminToken();
  const reqHeaders = new Headers({ "accept": "application/json", "x-tenant-id": tenantId });
  const ct = req.headers.get("content-type");
  if (ct) reqHeaders.set("content-type", ct);
  const tokenInjected = injectAdminToken(reqHeaders, upstream.pathname);

  // Inject HMAC-verified session headers so Workers can perform RBAC.
  // Mirrors catch-all proxy behaviour; prevents client from spoofing other tenants via ?tenantId=.
  const session = await readSessionPayload(req);
  const sessionTenantId = session.tenantId;
  if (session.tenantId) reqHeaders.set("x-session-tenant-id", session.tenantId);
  if (session.userId) reqHeaders.set("x-session-user-id", session.userId);

  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  const res = await fetch(upstream.toString(), { method, headers: reqHeaders, body, redirect: "manual" });
  const outCt = res.headers.get("content-type") ?? "application/json";
  const out = new Response(res.body, {
    status: res.status,
    headers: { "content-type": outCt, "cache-control": "no-store" },
  });
  if (tokenInjected) out.headers.set("x-admin-token-present", "1");
  // Tenant observability headers — always present so curl/devtools can verify isolation
  out.headers.set("x-tenant-query",     tenantId);
  out.headers.set("x-tenant-session",   sessionTenantId ?? "(none)");
  out.headers.set("x-tenant-effective", sessionTenantId ?? tenantId);
  if (isDebug) {
    applyDebugHeaders(out.headers, { stamp: makeDebugStamp(), isAdminRoute: true, tokenConfigured, tokenInjected });
  }
  return out;
}

export async function GET(req: Request) { return forward(req); }
export async function POST(req: Request) { return forward(req); }
export async function PATCH(req: Request) { return forward(req); }
export async function DELETE(req: Request) { return forward(req); }
