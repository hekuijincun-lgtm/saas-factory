export const runtime = "edge";
import { readAdminToken, injectAdminToken } from "../../../_lib/proxy";

function apiBase(): string {
  const v = process.env.API_BASE || process.env.BOOKING_API_BASE || process.env.NEXT_PUBLIC_API_BASE;
  if (!v) throw new Error("API_BASE missing in Pages env");
  return v.replace(/\/$/, "");
}

async function forward(req: Request, method: string): Promise<Response> {
  const u = new URL(req.url);
  const tenantId = (u.searchParams.get("tenantId") || req.headers.get("x-tenant-id") || "default").trim() || "default";
  const id = u.pathname.split("/").at(-1) ?? "";

  // PATCH /admin/menu/:id → POST /admin/menu with id in body (upstream compat)
  let forwardMethod = method;
  let forwardPath = `admin/menu/${id}`;
  let rewritten = false;
  if (method === "PATCH") {
    forwardMethod = "POST";
    forwardPath = "admin/menu";
    rewritten = true;
  }

  const upstream = new URL(`${apiBase()}/${forwardPath}`);
  upstream.searchParams.set("tenantId", tenantId);

  const reqHeaders = new Headers({ "accept": "application/json", "x-tenant-id": tenantId });
  const ct = req.headers.get("content-type");
  if (ct) reqHeaders.set("content-type", ct);
  injectAdminToken(reqHeaders, upstream.pathname);

  let body: ArrayBuffer | undefined;
  if (forwardMethod !== "GET" && forwardMethod !== "HEAD" && forwardMethod !== "DELETE") {
    body = await req.arrayBuffer();
    if (rewritten && body && body.byteLength > 0) {
      try {
        const j = JSON.parse(new TextDecoder().decode(body));
        if (!j.id) j.id = id;
        body = new TextEncoder().encode(JSON.stringify(j)).buffer as ArrayBuffer;
      } catch {}
    }
  }

  const res = await fetch(upstream.toString(), { method: forwardMethod, headers: reqHeaders, body });
  const out = new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
      "x-proxy-stamp": "MENU_ID_ROUTE_V1",
      ...(rewritten ? { "x-proxy-rewrite": "patch_to_post" } : {}),
    },
  });
  return out;
}

export async function GET(req: Request) { return forward(req, "GET"); }
export async function PATCH(req: Request) { return forward(req, "PATCH"); }
export async function DELETE(req: Request) { return forward(req, "DELETE"); }
