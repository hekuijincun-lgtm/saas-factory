export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

function trimSlash(s: string) {
  return s.replace(/\/+$/, "");
}

function getApiBase(): string {
  // 1) Cloudflare Pages runtime env (Functions env/secrets)
  try {
    const ctx: any = getRequestContext();
    const v =
      ctx?.env?.API_BASE ||
      ctx?.env?.NEXT_PUBLIC_API_BASE; // 互換用（あってもOK）
    if (typeof v === "string" && v.length > 0) return v;
  } catch {}

  // 2) Local dev fallback
  const v2 =
    process.env.API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE ||
    "http://127.0.0.1:8787";
  return v2;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") || "default";

  const apiBase = trimSlash(getApiBase());
  const upstream = `${apiBase}/admin/integrations/line/auth-url?tenantId=${encodeURIComponent(
    tenantId
  )}`;

  let j: any = null;
  try {
    const r = await fetch(upstream, {
      headers: { accept: "application/json" },
    });

    const text = await r.text();
    try {
      j = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid auth-url response (non-JSON)", status: r.status, body: text.slice(0, 300) },
        { status: 500 }
      );
    }

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "failed_to_get_auth_url", status: r.status, body: j },
        { status: 500 }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "fetch_failed", detail: String(e?.message || e) },
      { status: 500 }
    );
  }

  const target = j?.url;
  if (!target || typeof target !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing url in auth-url response", body: j },
      { status: 500 }
    );
  }

  // 🔒 LINE以外へ絶対にリダイレクトしない
  if (!/^https:\/\/access\.line\.me\/oauth2\/v2\.1\/authorize/i.test(target)) {
    return NextResponse.json(
      { ok: false, error: "Refusing redirect (unexpected target)", target },
      { status: 500 }
    );
  }

  return NextResponse.redirect(target, 307);
}
