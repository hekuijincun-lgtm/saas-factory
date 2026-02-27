import { NextResponse } from "next/server";

export const runtime = "edge";

// ─── LINE push 単体テスト ─────────────────────────────────────────────────────
// GET /api/line/push-test?tenantId=default&to=Uxxxx&text=hello
//   → { ok, tenantId, toPrefix, tokenPrefix, pushStatus, pushBodySnippet }
//   ※token / userId 全文は返さない（先頭8文字のみ）
const STAMP = "LINE_PUSH_TEST_V1_20260227";
const where = "api/line/push-test";

// ─── tenant の LINE config を取得（webhook と同じロジック）────────────────────
async function getLineConfig(
  tenantId: string
): Promise<{ channelAccessToken: string; source: "kv" | "env" }> {
  const apiBase = (
    process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? ""
  ).replace(/\/+$/, "");
  const adminToken = process.env.ADMIN_TOKEN ?? "";

  if (apiBase) {
    try {
      const url = `${apiBase}/admin/settings?tenantId=${encodeURIComponent(tenantId)}`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (adminToken) headers["X-Admin-Token"] = adminToken;

      const r = await fetch(url, { headers });
      if (r.ok) {
        const json = (await r.json()) as any;
        const s = json?.data ?? json;
        const channelAccessToken = String(
          s?.integrations?.line?.channelAccessToken ?? ""
        ).trim();
        if (channelAccessToken) return { channelAccessToken, source: "kv" };
      }
    } catch { /* fall through */ }
  }

  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  return { channelAccessToken, source: "env" };
}

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId")
    ?? process.env.LINE_DEFAULT_TENANT_ID
    ?? "default";
  const to   = searchParams.get("to")   ?? "";
  const text = searchParams.get("text") ?? "LINE push test 📩";

  if (!to) {
    return NextResponse.json(
      { ok: false, stamp: STAMP, where, error: "missing_to_param: ?to=Uxxxxx" },
      { status: 400 }
    );
  }

  const { channelAccessToken, source } = await getLineConfig(tenantId);

  if (!channelAccessToken) {
    return NextResponse.json(
      { ok: false, stamp: STAMP, where, tenantId, source, error: "missing_channelAccessToken" },
      { status: 500 }
    );
  }

  const toPrefix    = to.slice(0, 8)                  + "***";
  const tokenPrefix = channelAccessToken.slice(0, 8)  + "***";

  let pushStatus      = 0;
  let pushOk          = false;
  let pushBodySnippet = "";

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + channelAccessToken,
      },
      body: JSON.stringify({
        to,
        messages: [{ type: "text", text }],
      }),
    });
    pushStatus      = res.status;
    pushOk          = res.ok;
    pushBodySnippet = (await res.text().catch(() => "")).slice(0, 500);
  } catch (e: any) {
    pushBodySnippet = `exception: ${String(e?.message ?? e).slice(0, 200)}`;
  }

  // ログ（token / userId 丸出し禁止）
  console.log(
    `[LINE_PUSH_TEST] tenant=${tenantId} to=${toPrefix} ` +
    `token=${tokenPrefix} st=${pushStatus} ok=${pushOk} ` +
    `body=${pushBodySnippet.slice(0, 120)}`
  );

  return NextResponse.json({
    ok:             pushOk,
    stamp:          STAMP,
    where,
    tenantId,
    source,
    toPrefix,
    tokenPrefix,
    pushStatus,
    pushOk,
    pushBodySnippet,
  });
}
