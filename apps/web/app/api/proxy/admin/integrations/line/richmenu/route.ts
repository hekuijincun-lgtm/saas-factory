export const runtime = "edge";
// Pages route:  POST /api/proxy/admin/integrations/line/richmenu (publish)
//               DELETE /api/proxy/admin/integrations/line/richmenu (delete)
// Upstream:     POST/DELETE /admin/integrations/line/richmenu/publish | /admin/integrations/line/richmenu
import { proxyFetch } from "../../../../_lib/proxy";

export async function POST(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const tenantId = (u.searchParams.get("tenantId") || "default").trim() || "default";
  return proxyFetch(req, `/admin/integrations/line/richmenu/publish?tenantId=${encodeURIComponent(tenantId)}`, {
    method: "POST",
  });
}

export async function DELETE(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const tenantId = (u.searchParams.get("tenantId") || "default").trim() || "default";
  return proxyFetch(req, `/admin/integrations/line/richmenu?tenantId=${encodeURIComponent(tenantId)}`, {
    method: "DELETE",
  });
}
