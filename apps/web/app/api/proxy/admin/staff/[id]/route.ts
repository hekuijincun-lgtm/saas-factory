export const runtime = "edge";
import { readAdminToken, injectAdminToken, makeDebugStamp, applyDebugHeaders } from "../../../_lib/proxy";

function apiBase(): string {
  const v = process.env.API_BASE || process.env.BOOKING_API_BASE || process.env.NEXT_PUBLIC_API_BASE;
  if (!v) throw new Error("API_BASE missing in Pages env");
  return v.replace(/\/$/, "");
}

function getTenantId(req: Request): string {
  const u = new URL(req.url);
  return (u.searchParams.get("tenantId") || req.headers.get("x-tenant-id") || "default").trim() || "default";
}

function getStaffId(req: Request): string {
  return new URL(req.url).pathname.split("/").at(-1) ?? "";
}

async function forward(req: Request, method: string): Promise<Response> {
  const u = new URL(req.url);
  const isDebug = u.searchParams.get("debug") === "1";
  const tenantId = getTenantId(req);
  const id = getStaffId(req);

  const upstream = new URL(`${apiBase()}/admin/staff/${id}`);
  upstream.searchParams.set("tenantId", tenantId);

  const tokenConfigured = !!readAdminToken();
  const reqHeaders = new Headers({ "accept": "application/json", "x-tenant-id": tenantId });
  const ct = req.headers.get("content-type");
  if (ct) reqHeaders.set("content-type", ct);
  const tokenInjected = injectAdminToken(reqHeaders, upstream.pathname);

  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD" && method !== "DELETE") {
    body = await req.arrayBuffer();
  }

  const res = await fetch(upstream.toString(), { method, headers: reqHeaders, body });
  const data = await res.text();
  const out = new Response(data, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
  if (tokenInjected) out.headers.set("x-admin-token-present", "1");
  if (isDebug) {
    applyDebugHeaders(out.headers, { stamp: makeDebugStamp(), isAdminRoute: true, tokenConfigured, tokenInjected });
  }
  return out;
}

export async function GET(req: Request) { return forward(req, "GET"); }
export async function PATCH(req: Request) { return forward(req, "PATCH"); }
export async function DELETE(req: Request) { return forward(req, "DELETE"); }
