export const runtime = "edge";
// Pages route:  DELETE /api/proxy/admin/integrations/line/messaging
// Upstream:     DELETE /admin/integrations/line/messaging  (Workers KV-backed)
// stamp: LINE_MSG_PROXY_DELETE_V1_20260225
import { proxyFetch } from "../../../../_lib/proxy";

export async function DELETE(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const tenantId = (u.searchParams.get("tenantId") || "default").trim() || "default";
  return proxyFetch(req, `/admin/integrations/line/messaging?tenantId=${encodeURIComponent(tenantId)}`, {
    method: "DELETE",
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-methods": "DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,x-admin-token",
      "cache-control": "no-store",
    },
  });
}
