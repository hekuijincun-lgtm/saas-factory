import { NextResponse } from "next/server";

export const runtime = "edge";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function GET(req: Request) {
  try {
    const API_BASE = mustEnv("API_BASE");
    const url = new URL(req.url);

    const upstream = new URL(API_BASE.replace(/\/$/, "") + "/slots");
    url.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));

    const r = await fetch(upstream.toString(), {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: { "Content-Type": r.headers.get("content-type") ?? "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, where: "api/proxy/slots", error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
