export const runtime = "edge";
// Pages route:  GET /api/proxy/admin/integrations/line/messaging/status
// Upstream:     GET /admin/integrations/line/messaging/status  (Workers KV-backed)
// stamp: LINE_MSG_PROXY_STATUS_V1_20260225
import { proxyFetch } from "../../../../../_lib/proxy";

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const tenantId = (u.searchParams.get("tenantId") || "default").trim() || "default";
  return proxyFetch(req, `/admin/integrations/line/messaging/status?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type,x-admin-token",
      "cache-control": "no-store",
    },
  });
}
