export const runtime = "edge";
// Pages route:  POST /api/proxy/admin/integrations/line/remap
// Upstream:     POST /admin/integrations/line/remap  (Workers)
import { proxyFetch } from "../../../../_lib/proxy";

export async function POST(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const tenantId = (u.searchParams.get("tenantId") || "").trim();
  if (!tenantId) return new Response(JSON.stringify({ ok: false, error: "missing_tenantId" }), { status: 400 });
  return proxyFetch(req, `/admin/integrations/line/remap?tenantId=${encodeURIComponent(tenantId)}`, {
    method: "POST",
  });
}
