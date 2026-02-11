export const runtime = "edge";

import { NextResponse } from "next/server";

function pickBase(): string | null {
  // 優先順はプロジェクト都合で後で調整OK。まずは「存在するやつ」を使う。
  return (
    process.env.API_BASE ||
    process.env.BOOKING_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE ||
    null
  );
}

async function readJsonSafe(r: Response): Promise<any> {
  try { return await r.json(); } catch { return null; }
}

export async function GET(request: Request) {
/* LINE_START_DEBUG_MARKER_V2 */
const __url = new URL(request.url);
if (__url.searchParams.get("debug") === "1") {
  return NextResponse.json({
    ok: true,
    marker: "LINE_START_DEBUG_MARKER_V2",
    url: request.url,
    env: {
      BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null,
      NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? null,
      NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? null,
      WORKER_API_BASE: process.env.WORKER_API_BASE ?? null
    }
  });
}
    const url = new URL(req.url);
  if (url.searchParams.get("debug") === "1") {
    return NextResponse.json({
      ok: true,
      marker: "LINE_START_DEBUG_MARKER_V1",
      url: req.url,
      env: {
        BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null,
        NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? null,
        WORKER_API_BASE: process.env.WORKER_API_BASE ?? null
      }
    });
  }
// removed duplicate url\n

  // ===== DEBUG (single source of truth) =====
  if (url.searchParams.get("debug") === "1") {
    const envAny = process.env as any;
    return NextResponse.json({
      ok: true,
      where: "apps/web/app/api/auth/line/start/route.ts",
      href: url.toString(),
      env: {
        API_BASE: !!envAny.API_BASE,
        BOOKING_API_BASE: !!envAny.BOOKING_API_BASE,
        NEXT_PUBLIC_API_BASE: !!envAny.NEXT_PUBLIC_API_BASE,
        LINE_CHANNEL_ID: !!envAny.LINE_CHANNEL_ID,
        LINE_CHANNEL_SECRET: !!envAny.LINE_CHANNEL_SECRET,
      },
    });
  }

  const tenantId = url.searchParams.get("tenantId") || "default";

  const base = pickBase();
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "missing_api_base", detail: "API_BASE / BOOKING_API_BASE / NEXT_PUBLIC_API_BASE not set" },
      { status: 500 }
    );
  }

  // upstream: /admin/integrations/line/auth-url を叩いて authUrl を受け取り、そこへリダイレクト
  const upstream = new URL("/admin/integrations/line/auth-url", base);
  upstream.searchParams.set("tenantId", tenantId);

  let r: Response;
  try {
    r = await fetch(upstream.toString(), {
      method: "GET",
      headers: { "accept": "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "failed_to_fetch_upstream", upstream: upstream.toString(), detail: String(e?.message || e) },
      { status: 500 }
    );
  }

  const body = await readJsonSafe(r);
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: "upstream_not_ok", upstream: upstream.toString(), status: r.status, body },
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
      { ok: false, error: "missing_auth_url", upstream: upstream.toString(), body },
      { status: 500 }
    );
  }

  return NextResponse.redirect(authUrl, { status: 302 });
}



