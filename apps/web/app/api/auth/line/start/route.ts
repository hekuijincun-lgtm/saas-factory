import { NextResponse } from "next/server";

export const runtime = "edge";

function resolveUpstreamBase(): string | null {
  const env = process.env as Record<string, string | undefined>;
  return env.BOOKING_API_BASE || env.API_BASE || null;
}

export async function GET(req: Request) {
  const stamp = "HIT_LINE_START_V2"; // ← ここ変えると反映確認が超ラク
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  // ✅ debug=1 は何があっても最優先で返す（Pages反映確認のため）
  if (debug) {
    const upstreamBase = resolveUpstreamBase();
    return NextResponse.json({
      ok: true,
      stamp,
      tenantId,
      env: {
        API_BASE: process.env.API_BASE ?? null,
        BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null,
        upstreamBase,
      },
    });
  }

  const upstreamBase = resolveUpstreamBase();
  if (!upstreamBase) {
    return NextResponse.json(
      { ok: false, stamp, error: "missing_upstream_env", detail: "API_BASE / BOOKING_API_BASE is not set on Pages" },
      { status: 500 }
    );
  }

  const upstreamUrl = new URL("/admin/integrations/line/auth-url", upstreamBase);
  upstreamUrl.searchParams.set("tenantId", tenantId);

  let text = "";
  try {
    const r = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    text = await r.text();

    if (!r.ok) {
      return NextResponse.json(
        {
          ok: false,
          stamp,
          error: "upstream_not_ok",
          upstreamStatus: r.status,
          upstream: upstreamUrl.toString(),
          upstreamBody: text.slice(0, 2000),
        },
        { status: 500 }
      );
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, stamp, error: "upstream_not_json", upstream: upstreamUrl.toString(), upstreamBody: text.slice(0, 2000) },
        { status: 500 }
      );
    }

    const lineAuthUrl = data?.url || data?.authUrl;
    if (!lineAuthUrl || typeof lineAuthUrl !== "string") {
      return NextResponse.json(
        { ok: false, stamp, error: "missing_auth_url", upstream: upstreamUrl.toString(), upstreamData: data },
        { status: 500 }
      );
    }

    return NextResponse.redirect(lineAuthUrl, 302);
  } catch (e) {
    return NextResponse.json(
      { ok: false, stamp, error: "failed_to_call_upstream", upstream: upstreamUrl.toString(), detail: String(e), upstreamBody: text.slice(0, 1000) },
      { status: 500 }
    );
  }
}
