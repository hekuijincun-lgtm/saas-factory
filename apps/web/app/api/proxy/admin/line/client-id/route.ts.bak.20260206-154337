export const runtime = 'edge';

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const API_BASE = process.env.API_BASE_URL ?? "(process.env.CF_PAGES ? "https://saas-factory-api-staging.hekuijincun.workers.dev" : "(process.env.CF_PAGES ? "https://saas-factory-api-staging.hekuijincun.workers.dev" : "http://127.0.0.1:8787"):8787")";
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






