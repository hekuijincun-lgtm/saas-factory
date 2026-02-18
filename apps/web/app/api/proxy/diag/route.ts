import { NextResponse } from "next/server";

export const runtime = "edge";
const stamp = "PAGES_PROXY_DIAG_V1";

export async function GET() {
  const env = process.env as any;
  return NextResponse.json({
    ok: true,
    stamp,
    envPresent: {
      API_BASE: !!env.API_BASE,
      BOOKING_API_BASE: !!env.BOOKING_API_BASE,
      NEXT_PUBLIC_API_BASE: !!env.NEXT_PUBLIC_API_BASE,
    },
    envSample: {
      API_BASE: env.API_BASE ?? null,
      BOOKING_API_BASE: env.BOOKING_API_BASE ?? null,
      NEXT_PUBLIC_API_BASE: env.NEXT_PUBLIC_API_BASE ?? null,
    },
  });
}
