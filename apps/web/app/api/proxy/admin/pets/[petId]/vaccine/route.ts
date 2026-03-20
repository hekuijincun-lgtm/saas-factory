export const runtime = "edge";
import { readAdminToken, injectAdminToken, makeDebugStamp, applyDebugHeaders, readSessionPayload, isDebugAllowed } from "../../../../_lib/proxy";

function apiBase(): string {
  const v = process.env.API_BASE || process.env.BOOKING_API_BASE || process.env.NEXT_PUBLIC_API_BASE;
  if (!v) throw new Error("API_BASE missing in Pages env");
  return v.replace(/\/$/, "");
}

function getTenantId(req: Request): string {
  const u = new URL(req.url);
  return (u.searchParams.get("tenantId") || req.headers.get("x-tenant-id") || "default").trim() || "default";
}

function getPetId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/");
  // URL: /api/proxy/admin/pets/{petId}/vaccine
  const vaccineIdx = parts.indexOf("vaccine");
  return vaccineIdx > 0 ? parts[vaccineIdx - 1] : "";
}

async function forward(req: Request, method: string, pathSuffix = ""): Promise<Response> {
  const u = new URL(req.url);
  const isDebug = isDebugAllowed() && u.searchParams.get("debug") === "1";
  const tenantId = getTenantId(req);
  const petId = getPetId(req);

  const upstream = new URL(`${apiBase()}/admin/pets/${petId}/vaccine${pathSuffix}`);
  upstream.searchParams.set("tenantId", tenantId);

  const tokenConfigured = !!readAdminToken();
  const reqHeaders = new Headers({ "accept": "application/json", "x-tenant-id": tenantId });
  const ct = req.headers.get("content-type");
  if (ct) reqHeaders.set("content-type", ct);
  const tokenInjected = injectAdminToken(reqHeaders, upstream.pathname);

  const session = await readSessionPayload(req);
  const sessionTenantId = session.tenantId;
  reqHeaders.set("x-session-tenant-id", tenantId);
  if (session.userId) reqHeaders.set("x-session-user-id", session.userId);

  const body = method !== "DELETE" ? await req.arrayBuffer() : undefined;

  const res = await fetch(upstream.toString(), { method, headers: reqHeaders, body });
  const data = await res.text();
  const out = new Response(data, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
  if (isDebug) {
    if (tokenInjected) out.headers.set("x-admin-token-present", "1");
    out.headers.set("x-tenant-query",     tenantId);
    out.headers.set("x-tenant-session",   sessionTenantId ?? "(none)");
    out.headers.set("x-tenant-effective", sessionTenantId ?? tenantId);
    applyDebugHeaders(out.headers, { stamp: makeDebugStamp(), isAdminRoute: true, tokenConfigured, tokenInjected });
  }
  return out;
}

export async function POST(req: Request) { return forward(req, "POST"); }

export async function DELETE(req: Request) {
  // vaccineId is passed as query param since Next.js route doesn't have it as a segment
  const u = new URL(req.url);
  const vaccineId = u.searchParams.get("vaccineId") || "";
  return forward(req, "DELETE", `/${encodeURIComponent(vaccineId)}`);
}
