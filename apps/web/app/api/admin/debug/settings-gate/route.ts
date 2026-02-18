import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const hasSession = /(?:^|;\s*)line_session=/.test(cookie);

  return NextResponse.json({
    ok: true,
    stamp: "DEBUG_SETTINGS_GATE_V1",
    cookie_len: cookie.length,
    cookie_has_line_session: hasSession,
    cookie_head: cookie.slice(0, 120), // 先頭だけ（漏洩防止）
  }, { headers: { "cache-control": "no-store" }});
}
