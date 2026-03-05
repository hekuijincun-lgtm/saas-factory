export const runtime = "edge";
// Pages route:  GET /api/proxy/admin/integrations/line/last-webhook
// Upstream:     GET /admin/integrations/line/last-webhook  (Workers)
import { proxyFetch } from "../../../../_lib/proxy";

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const tenantId = (u.searchParams.get("tenantId") || "").trim();
  if (!tenantId) return new Response(JSON.stringify({ ok: false, error: "missing_tenantId" }), { status: 400 });
  return proxyFetch(req, `/admin/integrations/line/last-webhook?tenantId=${encodeURIComponent(tenantId)}`);
}
