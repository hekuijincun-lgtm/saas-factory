import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

function pickEnv(o: any) {
  const keys = [
    "WORKER_API_BASE",
    "BOOKING_API_BASE",
    "API_BASE",
    "API_BASE_URL",
    "NEXT_PUBLIC_API_BASE",
    "NEXT_PUBLIC_BOOKING_API_BASE",
  ];
  const out: Record<string, any> = {};
  for (const k of keys) out[k] = o?.[k] ?? null;
  return out;
}

export async function GET() {
  let pagesEnv: any = null;
  try {
    const ctx = getRequestContext();
    // @ts-ignore
    pagesEnv = (ctx?.env as any) ?? null;
  } catch (e: any) {
    pagesEnv = { __error: String(e?.message ?? e) };
  }

  const nodeEnv = (typeof process !== "undefined" ? (process.env as any) : null);

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    pagesEnvPicked: pickEnv(pagesEnv),
    nodeEnvPicked: pickEnv(nodeEnv),
    pagesEnvKeysSample: pagesEnv ? Object.keys(pagesEnv).slice(0, 30) : null,
  });
}
