export const runtime = "edge";

function apiBase(): string {
  const v = process.env.API_BASE || process.env.BOOKING_API_BASE || process.env.NEXT_PUBLIC_API_BASE;
  if (!v) throw new Error("API_BASE missing in Pages env");
  return v.replace(/\/$/, "");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const upstream = `${apiBase()}/subscription/qr/${encodeURIComponent(token)}`;

  const res = await fetch(upstream, {
    headers: { accept: "application/json" },
  });

  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
