import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

function getApiBase(): string {
  return (
    process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? ""
  ).replace(/\/+$/, "");
}

function getInternalToken(): string {
  let t = "";
  try {
    const cfEnv = (getRequestContext()?.env as any);
    if (cfEnv?.LINE_INTERNAL_TOKEN) t = String(cfEnv.LINE_INTERNAL_TOKEN);
  } catch {}
  return t || process.env.LINE_INTERNAL_TOKEN || "";
}

// ─── GET /api/line/webhook/last-result ──────────────────────────────────────
// Fetches the last webhook processing result from Workers KV.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId")?.trim();

  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: "missing_tenantId", hint: "Add ?tenantId=your-tenant-id" },
      { status: 400 }
    );
  }

  const apiBase = getApiBase();
  const internalToken = getInternalToken();

  if (!apiBase) {
    return NextResponse.json(
      { ok: false, error: "no_api_base", hint: "API_BASE env var not set" },
      { status: 500 }
    );
  }

  if (!internalToken) {
    return NextResponse.json(
      { ok: false, error: "no_internal_token", hint: "LINE_INTERNAL_TOKEN not set" },
      { status: 500 }
    );
  }

  try {
    const r = await fetch(
      `${apiBase}/internal/line/last-result?tenantId=${encodeURIComponent(tenantId)}`,
      {
        headers: {
          Accept: "application/json",
          "x-internal-token": internalToken,
        },
      }
    );

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "workers_error", status: r.status },
        { status: r.status }
      );
    }

    const data = await r.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "fetch_error", message: String(e?.message ?? e).slice(0, 200) },
      { status: 500 }
    );
  }
}
