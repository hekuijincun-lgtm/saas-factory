export const runtime = 'edge';

import { NextResponse } from "next/server";

export async function GET(req: Request) {
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.BOOKING_API_BASE ||
  process.env.WORKER_API_BASE ||
  process.env.API_BASE ||
  process.env.API_BASE_URL ||
  "";

if (!API_BASE) {
  return new Response(
    JSON.stringify({
      ok: false,
      error: "missing_api_base",
      detail: "Set NEXT_PUBLIC_API_BASE (or API_BASE/BOOKING_API_BASE) in Pages env",
    }),
    { status: 500, headers: { "content-type": "application/json" } }
  );
}

const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  const upstream =
    `${API_BASE.replace(/\/$/, "")}` +
    `/admin/line/client-id?tenantId=${encodeURIComponent(tenantId)}`;

  try {
    const res = await fetch(upstream, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      cache: "no-store",
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}











