export const runtime = "edge";
// Pages route:  POST /api/proxy/admin/integrations/line/messaging/save
// Upstream:     POST /admin/integrations/line/messaging/save  (Workers KV-backed)
// stamp: LINE_MSG_PROXY_SAVE_V1_20260225
import { proxyFetch } from "../../../../../_lib/proxy";

export async function POST(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const tenantId = (u.searchParams.get("tenantId") || "default").trim() || "default";
  return proxyFetch(req, `/admin/integrations/line/messaging/save?tenantId=${encodeURIComponent(tenantId)}`, {
    method: "POST",
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type,x-admin-token",
      "cache-control": "no-store",
    },
  });
}
