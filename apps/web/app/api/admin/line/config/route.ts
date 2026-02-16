import { NextResponse } from "next/server";
export const runtime = "edge";

function resolveUpstreamBase(): string {
  const env = process.env as Record<string, string | undefined>;
  const base = env.BOOKING_API_BASE || env.API_BASE;
  if (!base) throw new Error("API_BASE/BOOKING_API_BASE is missing");
  return base;
}

export async function GET() {
  const upstream = resolveUpstreamBase();
  const r = await fetch(`${upstream}/admin/line/config`, {
    headers: { "Accept": "application/json" },
  });
  const j = await r.json().catch(() => ({}));
  return NextResponse.json(j, { status: r.status });
}

export async function POST(req: Request) {
  const upstream = resolveUpstreamBase();
  const body = await req.json();
  const r = await fetch(`${upstream}/admin/line/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return NextResponse.json(j, { status: r.status });
}
