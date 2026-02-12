import { NextResponse } from "next/server";

export const runtime = "edge";

function resolveUpstreamBase(): string {
  const env = process.env as Record<string, string | undefined>;
  if (env.API_BASE) return env.API_BASE;
  if (env.BOOKING_API_BASE) return env.BOOKING_API_BASE;
  throw new Error("API_BASE / BOOKING_API_BASE is not set on Pages");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  const stamp = "HIT_LINE_START_V1";

  let upstreamBase: string | null = null;
  let upstreamErr: string | null = null;
  try {
    upstreamBase = resolveUpstreamBase();
  } catch (e) {
    upstreamErr = String(e);
  }

  // ✅ まず「このrouteが動いてる」ことを確定させる
  if (debug) {
    return NextResponse.json({
      ok: true,
      stamp,
      tenantId,
      upstreamBase,
      upstreamErr,
      env: {
        API_BASE: process.env.API_BASE ?? null,
        BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null,
      },
    });
  }

  if (!upstreamBase) {
    return NextResponse.json(
      { ok: false, stamp, error: "missing_upstream_env", detail: upstreamErr },
      { status: 500 }
    );
  }

  const ep = new URL("/admin/integrations/line/auth-url", upstreamBase);
  ep.searchParams.set("tenantId", tenantId);

  let res: Response;
  let txt = "";
  try {
    res = await fetch(ep.toString(), { method: "GET" });
    txt = await res.text();
  } catch (e) {
    return NextResponse.json(
      { ok: false, stamp, error: "failed_to_call_upstream", upstream: ep.toString(), detail: String(e) },
      { status: 500 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, stamp, error: "upstream_not_ok", upstream: ep.toString(), upstreamStatus: res.status, upstreamBody: txt.slice(0, 2000) },
      { status: 500 }
    );
  }

  let data: any;
  try {
    data = JSON.parse(txt);
  } catch {
    return NextResponse.json(
      { ok: false, stamp, error: "upstream_not_json", upstream: ep.toString(), upstreamBody: txt.slice(0, 2000) },
      { status: 500 }
    );
  }

  const lineAuthUrl = data?.url || data?.authUrl;
  if (!lineAuthUrl || typeof lineAuthUrl !== "string") {
    return NextResponse.json(
      { ok: false, stamp, error: "missing_auth_url", upstreamData: data },
      { status: 500 }
    );
  }

  return NextResponse.redirect(lineAuthUrl, { status: 302 });
}
