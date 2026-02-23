export const runtime = "edge";

function apiBase() {
  const v = process.env.API_BASE || process.env.BOOKING_API_BASE || process.env.NEXT_PUBLIC_API_BASE;
  if (!v) throw new Error("API_BASE missing in Pages env");
  return v.replace(/\/$/, "");
}

function tenantIdFrom(req: Request) {
  const u = new URL(req.url);
  return (u.searchParams.get("tenantId") || req.headers.get("x-tenant-id") || "default").trim() || "default";
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const isDebug = u.searchParams.get("debug") === "1";
  const tenantId = tenantIdFrom(req);

  const upstream = new URL(apiBase() + "/admin/settings");
  upstream.searchParams.set("tenantId", tenantId);
  if (u.searchParams.get("nocache")) upstream.searchParams.set("nocache", u.searchParams.get("nocache")!);

  const adminToken = process.env.ADMIN_TOKEN;
  const tokenConfigured = !!adminToken;
  const reqHeaders: Record<string, string> = { "accept": "application/json", "x-tenant-id": tenantId };
  if (adminToken) reqHeaders["X-Admin-Token"] = adminToken;
  const tokenInjected = tokenConfigured;

  const r = await fetch(upstream.toString(), {
    method: "GET",
    headers: reqHeaders,
    cache: "no-store",
  });

  const body = await r.text();
  const out = new Response(body, { status: r.status, headers: { "content-type": "application/json" } });
  if (tokenInjected) out.headers.set("x-admin-token-present", "1");
  if (isDebug) {
    out.headers.set("x-admin-route", "1");
    out.headers.set("x-admin-token-configured", tokenConfigured ? "1" : "0");
    if (!tokenInjected) out.headers.set("x-admin-token-present", "0");
  }
  return out;
}

export async function PUT(req: Request) {
  const u = new URL(req.url);
  const isDebug = u.searchParams.get("debug") === "1";
  const tenantId = tenantIdFrom(req);

  const upstream = new URL(apiBase() + "/admin/settings");
  upstream.searchParams.set("tenantId", tenantId);

  const body = await req.text();

  const adminToken = process.env.ADMIN_TOKEN;
  const tokenConfigured = !!adminToken;
  const reqHeaders: Record<string, string> = {
    "content-type": "application/json",
    "accept": "application/json",
    "x-tenant-id": tenantId,
  };
  if (adminToken) reqHeaders["X-Admin-Token"] = adminToken;
  const tokenInjected = tokenConfigured;

  const r = await fetch(upstream.toString(), {
    method: "PUT",
    headers: reqHeaders,
    body,
  });

  const outBody = await r.text();
  const out = new Response(outBody, { status: r.status, headers: { "content-type": "application/json" } });
  if (tokenInjected) out.headers.set("x-admin-token-present", "1");
  if (isDebug) {
    out.headers.set("x-admin-route", "1");
    out.headers.set("x-admin-token-configured", tokenConfigured ? "1" : "0");
    if (!tokenInjected) out.headers.set("x-admin-token-present", "0");
  }
  return out;
}
