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

  const apiBase = resolveApiBase();

  const upstreamRes = await fetch(`${apiBase}/auth/email/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body),
  });

  const data = await upstreamRes.json() as Record<string, unknown>;
  return NextResponse.json(data, { status: upstreamRes.status });
}
