import { NextResponse } from "next/server";
export const runtime = 'edge';

export async function GET(req: Request, ctx: any) {
  const p = (ctx?.params?.path ?? []) as string[];
  if (p.length > 0 && p[0] === "__diag") {
    const env = (globalThis as any)?.process?.env ?? {};
    return NextResponse.json({
      ok: true,
      ts: new Date().toISOString(),
      via: "proxy_catchall_GET",
      nodejs_compat_expected: true,
      hasEnv: {
        NEXT_PUBLIC_API_BASE: !!env.NEXT_PUBLIC_API_BASE,
        API_BASE: !!env.API_BASE,
        BOOKING_API_BASE: !!env.BOOKING_API_BASE,
      },
      values: {
        NEXT_PUBLIC_API_BASE: env.NEXT_PUBLIC_API_BASE ?? null,
        API_BASE: env.API_BASE ?? null,
        BOOKING_API_BASE: env.BOOKING_API_BASE ?? null,
      },
    });
  }
  return new Response("Method Not Allowed", { status: 405 });
}

