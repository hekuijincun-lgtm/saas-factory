export const runtime = "edge";

/**
 * GET/POST /api/proxy/admin/line/credentials
 * -> forward to Workers: /admin/line/credentials
 * debug=1: returns diagnostics JSON
 */

import { NextRequest, NextResponse } from "next/server";

function pickHeaders(h: Headers) {
  const keys = ["cf-connecting-ip","cf-ipcountry","cf-ray","user-agent","cookie","origin","referer","host"];
  const o: Record<string,string> = {};
  for (const k of keys) {
    const v = h.get(k);
    if (v) o[k] = v;
  }
  return o;
}

function resolveUpstreamBase(): string | null {
  const env = process.env as Record<string, string | undefined>;
  return env.BOOKING_API_BASE || env.API_BASE || env.UPSTREAM_BASE || null;
}

async function forward(req: NextRequest, path: string) {
  const upstreamBase = resolveUpstreamBase();
  if (!upstreamBase) {
    return NextResponse.json({ ok:false, error:"missing_upstream_base", envSeen:{
      API_BASE: process.env.API_BASE ?? null,
      BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null,
      UPSTREAM_BASE: process.env.UPSTREAM_BASE ?? null,
    }}, { status: 500 });
  }

  const up = new URL(upstreamBase);
  up.pathname = path;
  up.search = req.nextUrl.search; // pass through query

  const method = req.method;
  const headers = new Headers(req.headers);
  headers.delete("host");

  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await req.text();
  }

  const res = await fetch(up.toString(), init);
  const text = await res.text();

  return new Response(text, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("debug") === "1") {
    return NextResponse.json({
      ok:true,
      where:"/api/proxy/admin/line/credentials",
      method:"GET",
      upstreamBase: resolveUpstreamBase(),
      path:"/admin/line/credentials",
      req: { url: req.nextUrl.toString(), headers: pickHeaders(req.headers) },
      env: { API_BASE: process.env.API_BASE ?? null, BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null, UPSTREAM_BASE: process.env.UPSTREAM_BASE ?? null },
    });
  }
  return forward(req, "/admin/line/credentials");
}

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get("debug") === "1") {
    const body = await req.text();
    return NextResponse.json({
      ok:true,
      where:"/api/proxy/admin/line/credentials",
      method:"POST",
      upstreamBase: resolveUpstreamBase(),
      path:"/admin/line/credentials",
      req: { url: req.nextUrl.toString(), headers: pickHeaders(req.headers), bodyPreview: body.slice(0, 500) },
      env: { API_BASE: process.env.API_BASE ?? null, BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null, UPSTREAM_BASE: process.env.UPSTREAM_BASE ?? null },
    });
  }
  return forward(req, "/admin/line/credentials");
}
