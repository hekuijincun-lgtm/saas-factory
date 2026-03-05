export const runtime = "edge";
// Pages route:  GET /api/proxy/admin/integrations/line/mapping-status
// Upstream:     GET /admin/integrations/line/mapping-status  (Workers)
import { proxyFetch } from "../../../../_lib/proxy";

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const tenantId = (u.searchParams.get("tenantId") || "").trim();
  if (!tenantId) return new Response(JSON.stringify({ ok: false, error: "missing_tenantId" }), { status: 400 });
  return proxyFetch(req, `/admin/integrations/line/mapping-status?tenantId=${encodeURIComponent(tenantId)}`);
}
