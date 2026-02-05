export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";

function resolveApiBase(): string {
  // 防御的：env名の揺れを全吸収（優先順）
  return (
    process.env.NEXT_PUBLIC_BOOKING_API_BASE ??
    process.env.BOOKING_API_BASE ??
    process.env.NEXT_PUBLIC_API_BASE ??
    process.env.API_BASE ??
    "http://127.0.0.1:8787"
  );
}

export async function GET(req: NextRequest) {
  const API_BASE = resolveApiBase();

  // 受信URL（クエリ含む）
  const url = new URL(req.url);

  // tenantId が無い/空なら default を強制
  const tenantId = url.searchParams.get("tenantId") || "default";

  // upstream を組み立て（クエリは全コピー→tenantIdだけ上書き）
  const upstream = new URL(`${API_BASE.replace(/\/$/, "")}/admin/integrations/line/status`);
  url.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));
  upstream.searchParams.set("tenantId", tenantId);

  console.log("[proxy][line-status] upstream =", upstream.toString());

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(upstream.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const body = await res.text();

    return new NextResponse(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err) {
    clearTimeout(timeoutId);

    const errorMessage = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === "AbortError";

    console.error("[proxy][line-status] fetch failed", {
      API_BASE,
      upstream: upstream.toString(),
      error: errorMessage,
      isTimeout,
    });

    return NextResponse.json(
      {
        ok: false,
        error: isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_FETCH_FAILED",
        message: `Proxy fetch failed: API_BASE=${API_BASE}, upstream=${upstream.toString()}, error=${errorMessage}`,
      },
      { status: 502 },
    );
  }
}

