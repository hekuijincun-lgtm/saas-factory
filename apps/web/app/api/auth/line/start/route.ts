export const runtime = "edge";

import { NextResponse } from "next/server";

/**
 * Pick upstream base URL from env.
 * Priority can be adjusted later.
 */
function pickBase(): string | null {
  return (
    process.env.API_BASE ||
    process.env.BOOKING_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.WORKER_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    null
  );
}

async function readJsonSafe(r: Response): Promise<any> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  // ===== DEBUG FORCE RETURN (safe, no secrets) =====
  try {
    const u = new URL(request.url);
    if (u.searchParams.get("debug") === "1") {
      return new Response(JSON.stringify({
        ok: true,
        where: "line-start-debug",
        ts: new Date().toISOString(),
        envSeen: {
          API_BASE: process.env.API_BASE ?? null,
          BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null,
          NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? null
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, where: "line-start-debug", error: String(e) }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  }
  // ===== DEBUG FORCE RETURN END =====

  const url = new URL(request.url);

  // ===== DEBUG: ALWAYS return JSON BEFORE any other logic =====
  if (url.searchParams.get("debug") === "1") {
    const envAny = process.env as any;
    return NextResponse.json({
      ok: true,
      marker: "LINE_START_DEBUG_MARKER_V3",
      where: "apps/web/app/api/auth/line/start/route.ts",
      href: url.toString(),
      build: envAny.CF_PAGES_COMMIT_SHA ?? null,
      env_present: {
        API_BASE: !!envAny.API_BASE,
        BOOKING_API_BASE: !!envAny.BOOKING_API_BASE,
        NEXT_PUBLIC_API_BASE: !!envAny.NEXT_PUBLIC_API_BASE,
        NEXT_PUBLIC_API_BASE_URL: !!envAny.NEXT_PUBLIC_API_BASE_URL,
        WORKER_API_BASE: !!envAny.WORKER_API_BASE,
        LINE_CHANNEL_ID: !!envAny.LINE_CHANNEL_ID,
        LINE_CHANNEL_SECRET: !!envAny.LINE_CHANNEL_SECRET,
      },
      base_selected: pickBase(),
    });
  }

  const tenantId = url.searchParams.get("tenantId") || "default";

  const base = pickBase();
  if (!base) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_api_base",
        detail:
          "API_BASE / BOOKING_API_BASE / NEXT_PUBLIC_API_BASE / WORKER_API_BASE / NEXT_PUBLIC_API_BASE_URL not set",
      },
      { status: 500 }
    );
  }

  // upstream: /admin/integrations/line/auth-url -> expects {authUrl} or {url} etc.
  const upstream = new URL("/admin/integrations/line/auth-url", base);
  upstream.searchParams.set("tenantId", tenantId);

  let r: Response;
  try {
    r = await fetch(upstream.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "failed_to_fetch_upstream",
        upstream: upstream.toString(),
        detail: String(e?.message || e),
      },
      { status: 500 }
    );
  }

  const body = await readJsonSafe(r);

  if (!r.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "upstream_not_ok",
        upstream: upstream.toString(),
        status: r.status,
        body,
      },
      { status: 500 }
    );
  }

  const authUrl =
    body?.authUrl ||
    body?.url ||
    body?.result?.authUrl ||
    body?.result?.url ||
    null;

  if (!authUrl || typeof authUrl !== "string") {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_auth_url",
        upstream: upstream.toString(),
        body,
      },
      { status: 500 }
    );
  }

  return NextResponse.redirect(authUrl, { status: 302 });
}

