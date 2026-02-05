export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";

function pickTenantId(state: string | null): string {
  if (!state) return "default";
  const i = state.indexOf(":");
  if (i <= 0) return "default";
  return state.slice(0, i) || "default";
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const tenantId = pickTenantId(state);

  console.log("[line-callback] HIT", {
    href: url.href,
    code: code ? "(present)" : null,
    state,
    error,
    errorDescription,
    tenantId,
  });

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/settings?line=error&tenantId=${encodeURIComponent(tenantId)}`, url.origin),
      307,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(`/admin/settings?line=missing_code&tenantId=${encodeURIComponent(tenantId)}`, url.origin),
      307,
    );
  }

  const proxyUrl = new URL(`/api/proxy/admin/line/oauth/callback?tenantId=${encodeURIComponent(tenantId)}`, url.origin);

  console.log("[line-callback] POST proxy", { proxyUrl: proxyUrl.toString(), tenantId });

  const res = await fetch(proxyUrl.toString(), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    cache: "no-store",
    body: JSON.stringify({ code, state, tenantId }),
  });

  const text = await res.text();
  console.log("[line-callback] proxy result", { status: res.status, body: text.slice(0, 800) });

  return NextResponse.redirect(
    new URL(`/admin/settings?line=${res.ok ? "linked" : "error_exchange"}&tenantId=${encodeURIComponent(tenantId)}`, url.origin),
    307,
  );
}

