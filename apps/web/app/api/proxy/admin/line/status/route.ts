export const runtime = "edge";

import { NextResponse } from "next/server";

function resolveUpstreamBase(): string {
  // Prefer explicit envs
  const env = process.env as Record<string, string | undefined>;

  // Put your canonical env keys here
  const candidates = [
    env.BOOKING_API_BASE,
    env.NEXT_PUBLIC_API_BASE,
    env.API_BASE,
    env.BOOKING_API_BASE_URL,
    env.NEXT_PUBLIC_API_BASE_URL,
  ].filter(Boolean) as string[];

  // If running on Pages, you usually want HTTPS to your Workers API
  // (fallback stays localhost for dev)
  return candidates[0] ?? "http://127.0.0.1:8787";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  const upstreamBase = resolveUpstreamBase();

  // health check (best-effort)
  let upstreamOk: boolean | null = null;
  let upstreamStatus: number | null = null;
  try {
    const healthUrl = new URL("/health", upstreamBase).toString();
    const r = await fetch(healthUrl, { method: "GET" });
    upstreamOk = r.ok;
    upstreamStatus = r.status;
  } catch {
    upstreamOk = false;
    upstreamStatus = null;
  }

  const out: any = {
    ok: true,
    tenantId,
    upstreamBase,
    upstreamOk,
    upstreamStatus,
  };

  if (debug) {
    out.envSeen = {
      BOOKING_API_BASE: !!process.env.BOOKING_API_BASE,
      NEXT_PUBLIC_API_BASE: !!process.env.NEXT_PUBLIC_API_BASE,
      API_BASE: !!process.env.API_BASE,
    };
  }

  return NextResponse.json(out);
}
