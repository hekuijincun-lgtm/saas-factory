import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

// ─── helpers (same as webhook) ──────────────────────────────────────────────

function getApiBase(): string {
  return (
    process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? ""
  ).replace(/\/+$/, "");
}

function getAdminToken(): string {
  let t = "";
  try {
    const cfEnv = (getRequestContext()?.env as any);
    if (cfEnv?.ADMIN_TOKEN) t = String(cfEnv.ADMIN_TOKEN);
  } catch {}
  return t || process.env.ADMIN_TOKEN || "";
}

async function checkAiEnabled(tenantId: string): Promise<boolean> {
  const apiBase = getApiBase();
  if (!apiBase) return false;
  try {
    const r = await fetch(
      `${apiBase}/ai/enabled?tenantId=${encodeURIComponent(tenantId)}`,
      { headers: { Accept: "application/json" } }
    );
    if (!r.ok) return false;
    const d = (await r.json()) as any;
    return d?.enabled === true;
  } catch {
    return false;
  }
}

const BOOKING_INTENT_KW = [
  "予約", "よやく", "予約したい", "予約できる", "予約した", "予約を開始",
  "booking", "reserve",
  "空き", "あき", "空き状況", "空いてる", "空いてますか",
  "最短", "明日行ける", "今日行ける", "来週行ける", "当日",
  "いつ空いてる",
] as const;

function detectBookingIntent(textIn: string): boolean {
  const normalized = textIn
    .normalize("NFKC")
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase();
  return BOOKING_INTENT_KW.some(k => normalized.includes(k));
}

// ─── POST /api/line/webhook/debug-simulate ──────────────────────────────────
// Simulates what the webhook would do for a given text, WITHOUT sending any
// LINE API calls. Returns the branch, intent, and diagnostics.

export async function POST(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const tenantId = searchParams.get("tenantId")?.trim();

  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: "missing_tenantId", hint: "Add ?tenantId=your-tenant-id" },
      { status: 400 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", hint: "Send JSON body with { text: '...' }" },
      { status: 400 }
    );
  }

  const text = String(body?.text ?? "").trim();
  if (!text) {
    return NextResponse.json(
      { ok: false, error: "missing_text", hint: "Body must include { text: '...' }" },
      { status: 400 }
    );
  }

  const apiBase = getApiBase();
  const adminToken = getAdminToken();

  // 1. Check credentials
  let hasSecret = false;
  let hasToken = false;
  let cfgSource = "none";

  if (apiBase) {
    try {
      const url = `${apiBase}/admin/settings?tenantId=${encodeURIComponent(tenantId)}`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (adminToken) headers["X-Admin-Token"] = adminToken;
      const r = await fetch(url, { headers });
      if (r.ok) {
        const json = (await r.json()) as any;
        const s = json?.data ?? json;
        const line = s?.integrations?.line;
        hasSecret = !!String(line?.channelSecret ?? "").trim();
        hasToken = !!String(line?.channelAccessToken ?? "").trim();
        cfgSource = "kv";
      }
    } catch {}
  }

  // 2. AI gate
  const aiEnabled = await checkAiEnabled(tenantId);

  // 3. Determine branch
  let branch: string;
  let wouldReply = false;
  let replyContent: string | null = null;
  let salesLabel: string | null = null;

  if (!aiEnabled) {
    // Sales flow
    const trimmed = text.trim();
    const numberMatch = trimmed.match(/^[１-４1-4]$/);
    const num = numberMatch
      ? trimmed.replace(/[１２３４]/g, (c) => String("１２３４".indexOf(c) + 1))
      : null;

    if (num === "1") {
      branch = "sales_reply";
      salesLabel = "interested";
      replyContent = "無料診断案内";
    } else if (num === "2") {
      branch = "sales_reply";
      salesLabel = "info_request";
      replyContent = "ツール説明";
    } else if (num === "3") {
      branch = "sales_reply";
      salesLabel = "pricing_question";
      replyContent = "料金プラン";
    } else if (num === "4") {
      branch = "sales_reply";
      salesLabel = "demo_request";
      replyContent = "担当者連絡案内";
    } else {
      branch = "sales_greeting";
      salesLabel = null;
      replyContent = "4択メニュー表示";
    }
    wouldReply = true;
  } else {
    // AI enabled
    const isBooking = detectBookingIntent(text);
    if (isBooking) {
      branch = "booking_template";
      wouldReply = true;
      replyContent = "予約テンプレカード (buttons template)";
    } else {
      branch = "ai_push";
      wouldReply = false; // reply is via push, not replyToken
      replyContent = "AI応答を pushLine() で送信 (waitUntil)";
    }
  }

  // 4. Diagnostics
  const problems: string[] = [];
  if (!hasSecret) problems.push("channelSecret missing — signature will fail");
  if (!hasToken) problems.push("channelAccessToken missing — reply/push will fail");
  if (!apiBase) problems.push("API_BASE not set");

  return NextResponse.json(
    {
      ok: true,
      tenantId,
      simulatedText: text,
      aiEnabled,
      branch,
      wouldReply,
      salesLabel,
      replyContent,
      config: { hasSecret, hasToken, source: cfgSource },
      problems,
      note: "This is a simulation — no LINE API calls were made",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
