export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

function getApiBase(): string {
  // ✅ Pages Edge runtime: use request context env first
  const ctx = getRequestContext();
  // @ts-ignore
  const env = (ctx as any)?.env ?? {};

  const base =
    env.API_BASE ||
    env.BOOKING_API_BASE ||
    env.WORKER_API_BASE ||
    env.NEXT_PUBLIC_API_BASE_URL ||
    env.NEXT_PUBLIC_API_BASE ||
    process.env.API_BASE ||
    process.env.BOOKING_API_BASE ||
    process.env.WORKER_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE;

  if (!base) throw new Error("API_BASE is not defined (Pages env missing)");
  return String(base).replace(/\/$/, "");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId") || "default";
    const debug = url.searchParams.get("debug") === "1";

    const API_BASE = getApiBase();
    const upstream = `${API_BASE}/admin/integrations/line/auth-url?tenantId=${encodeURIComponent(tenantId)}`;

    if (debug) {
      return NextResponse.json({
        ok: true,
        debug: {
          tenantId,
          apiBase: API_BASE,
          upstream,
        },
      });
    }

    const r = await fetch(upstream, {
      method: "GET",
      headers: { "accept": "application/json" },
      cache: "no-store",
    });

    const text = await r.text();

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "upstream_failed", status: r.status, upstream, body: text.slice(0, 2000) },
        { status: 500 }
      );
    }

    let data: any = null;
    try { data = JSON.parse(text); } catch {}

    if (!data?.ok || !data?.url) {
      return NextResponse.json(
        { ok: false, error: "failed_to_get_auth_url", detail: "invalid upstream json", upstream, body: text.slice(0, 2000) },
        { status: 500 }
      );
    }

    return NextResponse.redirect(data.url, 307);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "failed_to_get_auth_url", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
