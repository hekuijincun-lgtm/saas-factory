export const runtime = "edge";
import { readAdminToken, injectAdminToken, readSessionPayload } from "../../../_lib/proxy";

function apiBase(): string {
  const v = process.env.API_BASE || process.env.BOOKING_API_BASE || process.env.NEXT_PUBLIC_API_BASE;
  if (!v) throw new Error("API_BASE missing in Pages env");
  return v.replace(/\/$/, "");
}

async function forward(req: Request, method: string): Promise<Response> {
  const u = new URL(req.url);
  const tenantId = (u.searchParams.get("tenantId") || req.headers.get("x-tenant-id") || "default").trim() || "default";
  const id = u.pathname.split("/").at(-1) ?? "";

  const reqHeaders = new Headers({ "accept": "application/json", "x-tenant-id": tenantId });
  const ct = req.headers.get("content-type");
  if (ct) reqHeaders.set("content-type", ct);
  injectAdminToken(reqHeaders, `/admin/menu/${id}`);

  // Inject HMAC-verified session headers so Workers can perform RBAC
  const session = await readSessionPayload(req);
  reqHeaders.set("x-session-tenant-id", tenantId);
  if (session.userId) reqHeaders.set("x-session-user-id", session.userId);

  let forwardMethod = method;
  let forwardPath = `admin/menu/${id}`;

  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD" && method !== "DELETE") {
    body = await req.arrayBuffer();
  }

  // PATCH → POST rewrite: inject id into body, forward to POST /admin/menu
  // This matches the catch-all proxy's rewrite and ensures the POST handler
  // (which seeds defaults and has full validation) is always used for updates.
  if (method === "PATCH") {
    forwardMethod = "POST";
    forwardPath = "admin/menu";
    try {
      const j: any = (body && body.byteLength > 0)
        ? JSON.parse(new TextDecoder().decode(body))
        : {};
      if (j.id == null) j.id = id;
      body = new TextEncoder().encode(JSON.stringify(j)).buffer as ArrayBuffer;
    } catch { /* keep original body */ }
    reqHeaders.set("content-type", "application/json");
  }

  const upstream = new URL(`${apiBase()}/${forwardPath}`);
  upstream.searchParams.set("tenantId", tenantId);

  const res = await fetch(upstream.toString(), { method: forwardMethod, headers: reqHeaders, body });
  const out = new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
      "x-proxy-stamp": "MENU_ID_ROUTE_V2",
      "x-proxy-rewrite": method === "PATCH" ? "patch_to_post" : "none",
    },
  });
  return out;
}

export async function GET(req: Request) { return forward(req, "GET"); }
export async function PATCH(req: Request) { return forward(req, "PATCH"); }
export async function PUT(req: Request) { return forward(req, "PATCH"); }
export async function DELETE(req: Request) { return forward(req, "DELETE"); }
