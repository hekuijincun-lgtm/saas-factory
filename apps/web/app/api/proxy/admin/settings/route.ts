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
  const tenantId = tenantIdFrom(req);

  const upstream = new URL(apiBase() + "/admin/settings");
  upstream.searchParams.set("tenantId", tenantId);
  if (u.searchParams.get("debug") === "1") upstream.searchParams.set("debug", "1");
  if (u.searchParams.get("nocache")) upstream.searchParams.set("nocache", u.searchParams.get("nocache")!);

  const r = await fetch(upstream.toString(), {
    method: "GET",
    headers: { "accept": "application/json", "x-tenant-id": tenantId },
    cache: "no-store",
  });

  const body = await r.text();
  return new Response(body, { status: r.status, headers: { "content-type": "application/json" } });
}

export async function PUT(req: Request) {
  const u = new URL(req.url);
  const tenantId = tenantIdFrom(req);

  const upstream = new URL(apiBase() + "/admin/settings");
  upstream.searchParams.set("tenantId", tenantId);

  const body = await req.text();

  const r = await fetch(upstream.toString(), {
    method: "PUT",
    headers: { "content-type": "application/json", "accept": "application/json", "x-tenant-id": tenantId },
    body,
  });

  const out = await r.text();
  return new Response(out, { status: r.status, headers: { "content-type": "application/json" } });
}
