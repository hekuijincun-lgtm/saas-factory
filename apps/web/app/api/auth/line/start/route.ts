export const runtime = 'edge';

import { NextResponse } from "next/server";

function pickApiBase(): string | null {
  const v =
    process.env.API_BASE ||
    process.env.BOOKING_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE ||
    "";
  const s = (v || "").trim();
  return s ? s.replace(/\/+$/, "") : null;
}

async function safeReadText(res: Response) {
  try { return await res.text(); } catch { return ""; }
}

export async function GET(req: Request) {
  
  // === DEBUG_ENV_DUMP (temporary) ===
  try {
    const u = new URL(req.url);
    if (u.searchParams.get("debug") === "1") {
      const pick = (k: string) => (process.env as any)?.[k] ?? null;

      const keys = [
        "API_BASE","API_BASE_URL","API_ORIGIN",
        "BOOKING_API_BASE","BOOKING_API_BASE_URL","BOOKING_API_ORIGIN",
        "NEXT_PUBLIC_API_BASE","NEXT_PUBLIC_API_ORIGIN",
        "UPSTREAM_BASE","UPSTREAM_ORIGIN",
        "LINE_CHANNEL_ID","LINE_CHANNEL_SECRET","LINE_LOGIN_CHANNEL_ID","LINE_LOGIN_CHANNEL_SECRET",
        "CF_PAGES","CF_PAGES_BRANCH","CF_PAGES_URL","CF_PAGES_COMMIT_SHA"
      ];

      const env: Record<string, any> = {};
      for (const k of keys) env[k] = pick(k);

      return NextResponse.json({
        ok: true,
        debug: true,
        at: new Date().toISOString(),
        requestUrl: req.url,
        env,
      }, { status: 200 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok:false, debug:true, error:"debug_exception", detail: String(e?.message ?? e) }, { status: 500 });
  }
  // === /DEBUG_ENV_DUMP ===
const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  const apiBase = pickApiBase();
  const callbackUrl = new URL("/api/auth/line/callback", url.origin).toString();

  // debug=1: 現状のルーティング/環境が正しいか一撃で分かるようにする
  if (debug) {
    return NextResponse.json({
      ok: true,
      where: "edge-function",
      ts: new Date().toISOString(),
      origin: url.origin,
      callbackUrl,
      apiBase,
      hasEnv: {
        API_BASE: !!process.env.API_BASE,
        BOOKING_API_BASE: !!process.env.BOOKING_API_BASE,
        NEXT_PUBLIC_API_BASE: !!process.env.NEXT_PUBLIC_API_BASE,
      },
    });
  }

  if (!apiBase) {
    return NextResponse.json(
      { ok: false, error: "missing_api_base", detail: "API_BASE/BOOKING_API_BASE/NEXT_PUBLIC_API_BASE is empty" },
      { status: 500 }
    );
  }

  // Workersに「LINEの認可URL作って」って聞く（必要ならcallbackを渡す）
  // ※ Workers側が callback を自前で計算する設計なら、callback は無視されてもOK
  const upstream = `${apiBase}/admin/integrations/line/auth-url?callback=${encodeURIComponent(callbackUrl)}`;

  let res: Response;
  try {
    res = await fetch(upstream, { method: "GET" });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "upstream_fetch_failed", upstream, detail: String(e?.message || e) },
      { status: 502 }
    );
  }

  const bodyText = await safeReadText(res);

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: "upstream_not_ok", upstream, status: res.status, body: bodyText.slice(0, 2000) },
      { status: 502 }
    );
  }

  // JSON parse（Workersが { ok:true, url } とか { authUrl } を返す想定）
  let data: any = null;
  try { data = JSON.parse(bodyText); } catch { data = null; }

  const authUrl =
    (data && (data.authUrl || data.url || data.redirectUrl)) ||
    null;

  if (!authUrl || typeof authUrl !== "string") {
    return NextResponse.json(
      { ok: false, error: "missing_auth_url", upstream, body: (data ?? bodyText).toString().slice(0, 2000) },
      { status: 502 }
    );
  }

  // ✅ ここが本命：LINEに飛ばす
  return NextResponse.redirect(authUrl, 302);
}


