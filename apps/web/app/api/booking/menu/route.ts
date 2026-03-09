export const runtime = "edge";
import { readAdminToken } from '../../proxy/_lib/proxy';

function getBase(): string {
  const b =
    (process.env.API_BASE && process.env.API_BASE.trim()) ||
    (process.env.NEXT_PUBLIC_API_BASE && process.env.NEXT_PUBLIC_API_BASE.trim()) ||
    "";
  if (!b) throw new Error("API base is not set");
  return b.replace(/\/+$/, "");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId") || "default";

  const upstream = `${getBase()}/admin/menu?tenantId=${encodeURIComponent(tenantId)}`;
  const headers = new Headers({ accept: "application/json" });
  const token = readAdminToken();
  if (token) headers.set("X-Admin-Token", token);

  const res = await fetch(upstream, { headers });
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: { "content-type": res.headers.get("content-type") || "application/json", "cache-control": "no-store" },
  });
}
