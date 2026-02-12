export const runtime = 'edge';

import { NextResponse } from "next/server";

async function forwardToWorker(req: Request) {
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
}if (!API_BASE) {
  return new Response(JSON.stringify({ ok: false, error: "missing_api_base", detail: "Set NEXT_PUBLIC_API_BASE (or API_BASE/BOOKING_API_BASE) in Pages env" }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
}
const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  const upstream =
    `${API_BASE.replace(/\/$/, "")}` +
    `/admin/line/config?tenantId=${encodeURIComponent(tenantId)}`;

  try {
    const raw = await req.text();
    let payload: any = raw ? JSON.parse(raw) : {};

    // UI → Worker キー変換
    if (payload?.loginChannelId && !payload.clientId) {
      payload.clientId = payload.loginChannelId;
    }

    const res = await fetch(upstream, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify(payload),
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

export async function POST(req: Request) {
  return forwardToWorker(req);
}

export async function PUT(req: Request) {
  return forwardToWorker(req);
}






