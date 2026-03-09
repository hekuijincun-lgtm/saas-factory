export const runtime = "edge";
// Pages route:  GET /api/proxy/admin/integrations/line/richmenu/status
// Upstream:     GET /admin/integrations/line/richmenu/status  (Workers KV-backed)
import { proxyFetch } from "../../../../../_lib/proxy";

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const tenantId = (u.searchParams.get("tenantId") || "default").trim() || "default";
  return proxyFetch(req, `/admin/integrations/line/richmenu/status?tenantId=${encodeURIComponent(tenantId)}`);
}
