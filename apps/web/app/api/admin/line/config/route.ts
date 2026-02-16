import { NextResponse } from "next/server";
export const runtime = "edge";

function resolveUpstreamBase(): string {
  const env = process.env as Record<string, string | undefined>;
  const base = env.BOOKING_API_BASE || env.API_BASE;
  if (!base) throw new Error("API_BASE/BOOKING_API_BASE is missing");
  return base;
}

function originOf(req: Request){
  return new URL(req.url).origin;
}

// Workersの既存 /admin/line/config が {ok, configured, masked} を返しても
// UIが扱える形に「正規化」して返す
function normalize(j: any, origin: string){
  // 既存形式っぽい
  if(j && typeof j === "object" && "configured" in j && "masked" in j){
    return {
      ok: true,
      configured: !!j.configured,
      masked: j.masked ?? {},
      // UIがWebhook URL表示できるように
      webhookUrl: `${origin}/api/line/webhook`,
      // UIの入力欄は空（秘密値は返さない設計）
      channelId: null,
      channelSecret: null,
      channelAccessToken: null,
      _mode: "masked",
    };
  }

  // 私たちの想定形式（channelSecret等が来る）
  return {
    ...j,
    webhookUrl: j?.webhookUrl ?? `${origin}/api/line/webhook`,
    _mode: "raw",
  };
}

export async function GET(req: Request) {
  const STAMP = "STAMP_WEB_LINECFG_20260216_110501";
  const upstream = resolveUpstreamBase();
  const origin = originOf(req);

  const u = new URL(`${upstream}/admin/line/config`);
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get("tenantId") ?? "default";
  u.searchParams.set("tenantId", tenantId);

  const r = await fetch(u.toString(), { headers: { "Accept": "application/json" } });
  const j = await r.json().catch(() => ({}));
  const out = normalize(j, origin) as any;
out.stamp = STAMP;
return NextResponse.json(out, { status: r.status });
}

export async function POST(req: Request) {
  return NextResponse.json({ ok: true, where: "pages:/api/admin/line/config", method: "POST" });
  const upstream = resolveUpstreamBase();
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get("tenantId") ?? "default";

  const body = await req.json().catch(() => ({}));

  // まずは “そのまま” Workersへ（キー名は後で既存実装に合わせて調整）
  const u = new URL(`${upstream}/admin/line/config`);
  u.searchParams.set("tenantId", tenantId);

  const r = await fetch(u.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return NextResponse.json(j, { status: r.status });
}


