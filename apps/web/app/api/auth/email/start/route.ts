export const runtime = "edge";

import { NextResponse } from "next/server";

function resolveApiBase(): string {
  const env = (globalThis as any)?.process?.env ?? {};
  const base =
    env.NEXT_PUBLIC_API_BASE ??
    env.API_BASE ??
    env.BOOKING_API_BASE ??
    "http://127.0.0.1:8787";
  return (base as string).replace(/\/+$/, "");
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  // debug=1 from URL query param OR from body (convenience — workers reads body.debug)
  const url = new URL(req.url);
  const isDebug = url.searchParams.get("debug") === "1" || body.debug === "1" || body.debug === true;
  if (isDebug) body = { ...body, debug: "1" };

  const apiBase = resolveApiBase();
  const targetUrl = `${apiBase}/auth/email/start`;

  let upstreamStatus = 500;
  let data: Record<string, unknown>;

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify(body),
    });
    upstreamStatus = upstreamRes.status;
    data = await upstreamRes.json() as Record<string, unknown>;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[email/start proxy] fetch failed:", msg);
    if (isDebug) {
      return NextResponse.json(
        { ok: false, error: "proxy_fetch_failed", resolvedBase: apiBase, targetUrl, exception: msg },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: false, error: "email_send_failed" }, { status: 500 });
  }

  if (isDebug && !data.ok) {
    // Augment error response with proxy diagnostics (no secrets in scope here)
    data = { ...data, _proxyDebug: { resolvedBase: apiBase, targetUrl, upstreamStatus } };
  }

  return NextResponse.json(data, { status: upstreamStatus });
}
