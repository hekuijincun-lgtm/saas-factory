export const runtime = "edge";
// Note: Pages route /api/proxy/admin/line/status
//       → upstream  /admin/integrations/line/status  (path differs intentionally)
import { readAdminToken, injectAdminToken, makeDebugStamp, applyDebugHeaders } from "../../../_lib/proxy";

function apiBase(): string {
  const v = process.env.API_BASE || process.env.BOOKING_API_BASE || process.env.NEXT_PUBLIC_API_BASE;
  if (!v) throw new Error("API_BASE missing in Pages env");
  return v.replace(/\/$/, "");
}

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const isDebug = u.searchParams.get("debug") === "1";
  const tenantId = u.searchParams.get("tenantId") ?? "default";

  const upstream = new URL(apiBase());
  upstream.pathname = "/admin/integrations/line/status";
  upstream.searchParams.set("tenantId", tenantId);

  const tokenConfigured = !!readAdminToken();
  const reqHeaders = new Headers({ "accept": "application/json", "x-tenant-id": tenantId });
  const tokenInjected = injectAdminToken(reqHeaders, upstream.pathname);

  const r = await fetch(upstream.toString(), { method: "GET", headers: reqHeaders, cache: "no-store" });
  const body = await r.text();
  const out = new Response(body, {
    status: r.status,
    headers: {
      "content-type": r.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
  if (tokenInjected) out.headers.set("x-admin-token-present", "1");
  if (isDebug) {
    applyDebugHeaders(out.headers, { stamp: makeDebugStamp(), isAdminRoute: true, tokenConfigured, tokenInjected });
  }
  return out;
}

export async function OPTIONS(req: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": req.headers.get("origin") ?? "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}
