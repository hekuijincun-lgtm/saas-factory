export const runtime = "edge";

function apiBase(): string {
  const v = process.env.API_BASE || process.env.BOOKING_API_BASE || process.env.NEXT_PUBLIC_API_BASE;
  if (!v) throw new Error("API_BASE missing in Pages env");
  return v.replace(/\/$/, "");
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const tenantId = (u.searchParams.get("tenantId") || "default").trim() || "default";

  // Extract petId from URL: /api/proxy/pet/profile/{petId}
  const parts = u.pathname.split("/");
  const petId = parts.at(-1) ?? "";

  const upstream = new URL(`${apiBase()}/pet/profile/${encodeURIComponent(petId)}`);
  upstream.searchParams.set("tenantId", tenantId);

  const res = await fetch(upstream.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
  });

  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
