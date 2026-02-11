import { NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Pages → Workers upstream
 * ✅ 明示 env のみを見る（NEXT_PUBLIC_* は混ぜない）
 */
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

  // ===== DEBUG: Pages が見ている env を即返す（最優先）=====
  if (debug) {
    return NextResponse.json({
      ok: true,
      debug: true,
      tenantId,
      env: {
        LINE_CHANNEL_ID: !!process.env.LINE_CHANNEL_ID,
        LINE_CHANNEL_SECRET: !!process.env.LINE_CHANNEL_SECRET,
        API_BASE: process.env.API_BASE ?? null,
        BOOKING_API_BASE: process.env.BOOKING_API_BASE ?? null,
      },
    });
  }

  const upstreamBase = resolveUpstreamBase();

  // ===== Health check（best-effort）=====
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

  return NextResponse.json({
    ok: true,
    tenantId,
    upstreamBase,
    upstreamOk,
    upstreamStatus,
  });
}
