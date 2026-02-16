import { NextResponse } from "next/server";
export const runtime = "edge";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  // line_session cookie が present かだけ見る（画面の表示用）
  const cookie = req.headers.get("cookie") || "";
  const hasLineSession = /(?:^|;\s*)line_session=/.test(cookie);

  return NextResponse.json({
    ok: true,
    stamp: "ADMIN_LINE_STATUS_V1",
    line_session_present: hasLineSession,
    debug,
  });
}
