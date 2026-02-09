export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

function readEnv(name: string): string | undefined {
  // Pages Functions runtime env
  try {
    const ctx = getRequestContext();
    // @ts-ignore
    const v = ctx?.env?.[name];
    if (typeof v === "string" && v.length > 0) return v;
  } catch {}
  // fallback (local/dev)
  // @ts-ignore
  const p = process?.env?.[name];
  if (typeof p === "string" && p.length > 0) return p;
  return undefined;
}

function getApiBase(): string {
  const base =
    readEnv("API_BASE") ||
    readEnv("WORKER_API_BASE") ||
    readEnv("BOOKING_API_BASE") ||
    readEnv("NEXT_PUBLIC_API_BASE_URL") ||
    readEnv("NEXT_PUBLIC_API_BASE");
  if (!base) throw new Error("API_BASE is not defined (API_BASE/WORKER_API_BASE/BOOKING_API_BASE/NEXT_PUBLIC_*)");
  return base.replace(/\/$/, "");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  const tenantId = url.searchParams.get("tenantId") || "default";

  if (debug) {
    const v = (name: string) => {
      try { 
        // @ts-ignore
        const { env } = getRequestContext();
        // @ts-ignore
        return env?.[name];
      } catch {}
      // @ts-ignore
      return process?.env?.[name];
    };

    const apiBase =
      v("API_BASE") || v("WORKER_API_BASE") || v("BOOKING_API_BASE") ||
      v("NEXT_PUBLIC_API_BASE_URL") || v("NEXT_PUBLIC_API_BASE");

    return NextResponse.json({
      ok: true,
      debug: true,
      tenantId,
      envSeen: {
        API_BASE: !!v("API_BASE"),
        WORKER_API_BASE: !!v("WORKER_API_BASE"),
        BOOKING_API_BASE: !!v("BOOKING_API_BASE"),
        NEXT_PUBLIC_API_BASE_URL: !!v("NEXT_PUBLIC_API_BASE_URL"),
        NEXT_PUBLIC_API_BASE: !!v("NEXT_PUBLIC_API_BASE"),
      },
      apiBase,
    });
  }


  let apiBase = "";
  let upstream = "";
  try {
    apiBase = getApiBase();
    upstream = `${apiBase}/admin/integrations/line/auth-url?tenantId=${encodeURIComponent(tenantId)}`;

    const res = await fetch(upstream, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    const text = await res.text();
    if (!res.ok) {
      if (debug) {
        return NextResponse.json({
          ok: false,
          error: "upstream_not_ok",
          status: res.status,
          apiBase,
          upstream,
          body: text.slice(0, 800),
          envSeen: {
            API_BASE: !!readEnv("API_BASE"),
            WORKER_API_BASE: !!readEnv("WORKER_API_BASE"),
            BOOKING_API_BASE: !!readEnv("BOOKING_API_BASE"),
            NEXT_PUBLIC_API_BASE_URL: !!readEnv("NEXT_PUBLIC_API_BASE_URL"),
            NEXT_PUBLIC_API_BASE: !!readEnv("NEXT_PUBLIC_API_BASE"),
          },
        }, { status: 502 });
      }
      return NextResponse.json({ ok: false, error: "failed_to_get_auth_url", detail: "error code: 1003" }, { status: 500 });
    }

    // parse
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    const authUrl = json?.url;
    if (!authUrl || typeof authUrl !== "string") {
      if (debug) {
        return NextResponse.json({
          ok: false,
          error: "bad_upstream_payload",
          apiBase,
          upstream,
          body: text.slice(0, 800),
        }, { status: 502 });
      }
      return NextResponse.json({ ok: false, error: "failed_to_get_auth_url", detail: "error code: 1003" }, { status: 500 });
    }

    // Redirect to LINE OAuth
    return NextResponse.redirect(authUrl, { status: 307 });

  } catch (e: any) {
    if (debug) {
      return NextResponse.json({
        ok: false,
        error: "exception",
        message: String(e?.message || e),
        apiBase,
        upstream,
        envSeen: {
          API_BASE: !!readEnv("API_BASE"),
          WORKER_API_BASE: !!readEnv("WORKER_API_BASE"),
          BOOKING_API_BASE: !!readEnv("BOOKING_API_BASE"),
          NEXT_PUBLIC_API_BASE_URL: !!readEnv("NEXT_PUBLIC_API_BASE_URL"),
          NEXT_PUBLIC_API_BASE: !!readEnv("NEXT_PUBLIC_API_BASE"),
        },
      }, { status: 500 });
    }
    return NextResponse.json({ ok: false, error: "failed_to_get_auth_url", detail: "error code: 1003" }, { status: 500 });
  }
}


