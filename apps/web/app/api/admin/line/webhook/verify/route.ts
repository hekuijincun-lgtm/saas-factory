import { NextResponse } from "next/server";
export const runtime = "edge";

function resolveOrigin(req: Request) {
  const u = new URL(req.url);
  return u.origin;
}

export async function POST(req: Request) {
  // ここでは「Webhook URL が 200 を返せるか」を軽く確認するだけ
  // 本物の署名検証は /api/line/webhook がやる想定
  const origin = resolveOrigin(req);
  const url = `${origin}/api/line/webhook?ping=1`;

  const r = await fetch(url, { method: "POST" }).catch((e) => {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  });

  if (!("status" in r)) {
    return NextResponse.json({ ok: false, error: "unexpected" }, { status: 500 });
  }

  const status = (r as Response).status;
  return NextResponse.json({
    ok: status >= 200 && status < 300,
    stamp: "WEBHOOK_VERIFY_V1",
    status,
    hint: "本番の署名検証は /api/line/webhook 側で実装してね",
  }, { status: (status >= 200 && status < 300) ? 200 : 500 });
}
