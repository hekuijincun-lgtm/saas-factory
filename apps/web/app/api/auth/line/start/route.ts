export const runtime = "edge";



/* DEBUG__LINE_START_V1 */
function __dbgEnvSummary() {
  const keys = Object.keys(process.env || {});
  const pick = (re: RegExp) => keys.filter(k => re.test(k)).sort();
  const has = (k: string) => !!(process.env as any)?.[k];
  return {
    keys_api: pick(/API|BOOKING|UPSTREAM/i),
    keys_line: pick(/LINE/i),
    keys_cf: pick(/^CF_|CLOUDFLARE/i),
    has_API_BASE: has("API_BASE"),
    has_BOOKING_API_BASE: has("BOOKING_API_BASE"),
    has_NEXT_PUBLIC_API_BASE: has("NEXT_PUBLIC_API_BASE"),
    has_LINE_CHANNEL_ID: has("LINE_CHANNEL_ID"),
    has_LINE_CHANNEL_SECRET: has("LINE_CHANNEL_SECRET"),
    has_LINE_LOGIN_CALLBACK_URL: has("LINE_LOGIN_CALLBACK_URL"),
  };
}
async function __dbgFetch(url: string, init?: RequestInit){
  try{
    const r = await fetch(url, init);
    const ct = r.headers.get("content-type") || "";
    const t = await r.text();
    return { ok: r.ok, status: r.status, contentType: ct, bodyHead: t.slice(0, 800) };
  }catch(e:any){
    return { ok: false, status: 0, contentType: "", bodyHead: "", error: String(e?.message || e) };
  }
}
/* /DEBUG__LINE_START_V1 */
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

  // ===== DEBUG: must run before any upstream fetch =====
  if (url.searchParams.get("debug") === "1") {
    const envAny = (process.env as any);
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
      }
    });
  }
  if (url.searchParams.get("debug") === "1") {
    const body = {
      ok: true,
      where: "app:/api/auth/line/start",
      ts: new Date().toISOString(),
      url: req.url,
      env: {
        API_BASE: process.env.API_BASE ?? null,
        BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null,
        LINE_CHANNEL_ID: process.env.LINE_CHANNEL_ID ?? null,
        LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET ?? null,
        LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? null,
      },
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ↓ existing logic continues...
  // If this does not show up, Pages is not running this code path.
  try {
    const u = new URL(request.url);
    if (u.searchParams.get("debug") === "1") {
      return new Response(JSON.stringify({
        ok: true,
        where: "apps/web/app/api/auth/line/start/route.ts",
        ts: new Date().toISOString(),
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers),
      }, null, 2), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
    }
  } catch (e) {
  }

/* DEBUG__LINE_START_GET_V1 */  try{
    const url = new URL((arguments as any)[0]?.url || (typeof request !== "undefined" ? (request as any).url : ""));
    const debug = url.searchParams.get("debug")==="1";
    if(debug){
      const env = __dbgEnvSummary();
      // If your code uses an upstream endpoint, set it here in env vars and we'll see failures.
      const candidates = [
        (process.env as any).API_BASE,
        (process.env as any).BOOKING_API_BASE,
        (process.env as any).NEXT_PUBLIC_API_BASE,
      ].filter(Boolean);

      // Try common endpoints (adjust later once we see what your route actually calls)
      const probes:any[] = [];
      for(const base of candidates){
        for(const p of ["/admin/integrations/line/auth-url","/api/admin/integrations/line/auth-url"]){
          const full = String(base).replace(/\/$/,"") + p;
          probes.push({ url: full, result: await __dbgFetch(full, { method:"GET" }) });
        }
      }
      return (globalThis as any).NextResponse
        ? (NextResponse as any).json({ ok:true, debug:true, env, probes }, { status: 200 })
        : Response.json({ ok:true, debug:true, env, probes });
    }
  }catch(e:any){
    // ignore, proceed normal
  }

// removed duplicate: const url = new URL(req.url);
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

    return NextResponse.json({ buildId: 'BUILD_MARKER_20260209_121647',
      ok: true,
      debug: true,
      tenantId,
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
        return NextResponse.json({ buildId: 'BUILD_MARKER_20260209_121647',
          ok: false,
          status: res.status,
          apiBase,
          upstream,
          body: text.slice(0, 800),
            API_BASE: !!readEnv("API_BASE"),
            WORKER_API_BASE: !!readEnv("WORKER_API_BASE"),
            BOOKING_API_BASE: !!readEnv("BOOKING_API_BASE"),
            NEXT_PUBLIC_API_BASE_URL: !!readEnv("NEXT_PUBLIC_API_BASE_URL"),
            NEXT_PUBLIC_API_BASE: !!readEnv("NEXT_PUBLIC_API_BASE"),
          },
        }, { status: 502 });
      }
      return NextResponse.json({ buildId: 'BUILD_MARKER_20260209_121647', ok: false, error: "failed_to_get_auth_url", detail: "error code: 1003" }, { status: 500 });
    }

    // parse
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    const authUrl = json?.url;
    if (!authUrl || typeof authUrl !== "string") {
      if (debug) {
        return NextResponse.json({ buildId: 'BUILD_MARKER_20260209_121647',
          ok: false,
          error: "bad_upstream_payload",
          apiBase,
          upstream,
          body: text.slice(0, 800),
        }, { status: 502 });
      }
      return NextResponse.json({ buildId: 'BUILD_MARKER_20260209_121647', ok: false, error: "failed_to_get_auth_url", detail: "error code: 1003" }, { status: 500 });
    }

    // Redirect to LINE OAuth
    return NextResponse.redirect(authUrl, { status: 307 });

  } catch (e: any) {
    if (debug) {
      return NextResponse.json({ buildId: 'BUILD_MARKER_20260209_121647',
        ok: false,
        message: String(e?.message || e),
        apiBase,
        upstream,
          API_BASE: !!readEnv("API_BASE"),
          WORKER_API_BASE: !!readEnv("WORKER_API_BASE"),
          BOOKING_API_BASE: !!readEnv("BOOKING_API_BASE"),
          NEXT_PUBLIC_API_BASE_URL: !!readEnv("NEXT_PUBLIC_API_BASE_URL"),
          NEXT_PUBLIC_API_BASE: !!readEnv("NEXT_PUBLIC_API_BASE"),
        },
      }, { status: 500 });
    }
    return NextResponse.json({ buildId: 'BUILD_MARKER_20260209_121647', ok: false, error: "failed_to_get_auth_url", detail: "error code: 1003" }, { status: 500 });
  }
}













