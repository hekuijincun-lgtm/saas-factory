import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const API_BASE = process.env.BOOKING_API_BASE ?? "http://127.0.0.1:8787";
  
  // クエリストリングをそのまま引き継ぎ
  const queryString = req.nextUrl.search;
  
  const upstream =
    `${API_BASE.replace(/\/$/, "")}` +
    `/admin/integrations/line/auth-url${queryString}`;

  const res = await fetch(upstream, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  const body = await res.text();

  return new NextResponse(body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
    },
  });
}
