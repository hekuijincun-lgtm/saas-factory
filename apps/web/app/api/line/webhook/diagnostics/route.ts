import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

// ─── helpers (shared with webhook) ──────────────────────────────────────────

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

async function checkDestinationMapping(
  apiBase: string,
  tenantId: string
): Promise<{ mapped: boolean; destination: string | null }> {
  // Read settings to get the LINE channel ID (which is the destination)
  // Then check if destination-to-tenant KV has the mapping
  const adminToken = getAdminToken();
  try {
    const url = `${apiBase}/admin/settings?tenantId=${encodeURIComponent(tenantId)}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (adminToken) headers["X-Admin-Token"] = adminToken;
    const r = await fetch(url, { headers });
    if (!r.ok) return { mapped: false, destination: null };
    const json = (await r.json()) as any;
    const s = json?.data ?? json;
    const channelId = String(s?.integrations?.line?.channelId ?? "").trim();
    if (!channelId) return { mapped: false, destination: null };

    // Check if the destination-to-tenant mapping exists
    const dr = await fetch(
      `${apiBase}/line/destination-to-tenant?destination=${encodeURIComponent(channelId)}`
    );
    if (dr.ok) {
      const dd = (await dr.json()) as any;
      return { mapped: !!dd?.tenantId, destination: channelId };
    }
    return { mapped: false, destination: channelId };
  } catch {
    return { mapped: false, destination: null };
  }
}

// ─── GET /api/line/webhook/diagnostics ──────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const tenantId = searchParams.get("tenantId")?.trim();

  if (!tenantId) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_tenantId",
        hint: "Add ?tenantId=your-tenant-id to the URL",
      },
      { status: 400 }
    );
  }

  const apiBase = getApiBase();
  const adminToken = getAdminToken();

  const problems: string[] = [];

  // 1. Check API connectivity
  if (!apiBase) {
    problems.push("API_BASE env var not set — cannot reach Workers");
  }

  // 2. Check LINE credentials
  let hasSecret = false;
  let hasToken = false;
  let secretLen = 0;
  let tokenLen = 0;
  let hasBookingUrl = false;
  let cfgSource: "kv" | "env" | "none" = "none";

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
        const secret = String(line?.channelSecret ?? "").trim();
        const token = String(line?.channelAccessToken ?? "").trim();
        const burl = String(line?.bookingUrl ?? "").trim();
        hasSecret = secret.length > 0;
        hasToken = token.length > 0;
        secretLen = secret.length;
        tokenLen = token.length;
        hasBookingUrl = burl.length > 0;
        cfgSource = "kv";
      }
    } catch {}
  }

  // Fallback to env vars
  if (!hasSecret && process.env.LINE_CHANNEL_SECRET) {
    hasSecret = true;
    secretLen = process.env.LINE_CHANNEL_SECRET.length;
    cfgSource = "env";
  }
  if (!hasToken && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    hasToken = true;
    tokenLen = process.env.LINE_CHANNEL_ACCESS_TOKEN.length;
    cfgSource = cfgSource === "kv" ? "kv" : "env";
  }

  if (!hasSecret) problems.push("channelSecret not configured — signature verification will fail");
  if (!hasToken) problems.push("channelAccessToken not configured — replyLine/pushLine will fail");

  // 3. Check destination mapping
  const destCheck = apiBase
    ? await checkDestinationMapping(apiBase, tenantId)
    : { mapped: false, destination: null };
  if (!destCheck.mapped) {
    problems.push(
      destCheck.destination
        ? `destination ${destCheck.destination.slice(0, 8)}... not mapped to tenant — webhook without ?tenantId= will fail`
        : "No channelId in settings — destination mapping cannot be checked"
    );
  }

  // 4. Check AI enabled
  const aiEnabled = await checkAiEnabled(tenantId);
  const salesFlowAvailable = !aiEnabled;

  // 5. Check internal token
  let hasInternalToken = false;
  try {
    const cfEnv = (getRequestContext()?.env as any);
    if (cfEnv?.LINE_INTERNAL_TOKEN) hasInternalToken = true;
  } catch {}
  if (!hasInternalToken && process.env.LINE_INTERNAL_TOKEN) hasInternalToken = true;
  if (!hasInternalToken) {
    problems.push("LINE_INTERNAL_TOKEN not set — webhook logging and lead saving will fail");
  }

  // 6. Check ADMIN_TOKEN
  if (!adminToken) {
    problems.push("ADMIN_TOKEN not set — cannot read tenant settings from KV");
  }

  // 7. Fetch last webhook result
  let lastWebhook: any = null;
  if (apiBase && adminToken) {
    try {
      const r = await fetch(
        `${apiBase}/admin/integrations/line/last-webhook?tenantId=${encodeURIComponent(tenantId)}`,
        { headers: { "X-Admin-Token": adminToken, Accept: "application/json" } }
      );
      if (r.ok) {
        const d = (await r.json()) as any;
        lastWebhook = d?.log ?? null;
      }
    } catch {}
  }

  // 8. Fetch last result (our new persistence)
  let lastResult: any = null;
  if (apiBase && adminToken) {
    try {
      const r = await fetch(
        `${apiBase}/internal/line/last-result?tenantId=${encodeURIComponent(tenantId)}`,
        {
          headers: {
            Accept: "application/json",
            "x-internal-token": (() => {
              let t = "";
              try { t = String((getRequestContext()?.env as any)?.LINE_INTERNAL_TOKEN ?? ""); } catch {}
              return t || process.env.LINE_INTERNAL_TOKEN || "";
            })(),
          },
        }
      );
      if (r.ok) {
        const d = (await r.json()) as any;
        lastResult = d?.result ?? null;
      }
    } catch {}
  }

  const webhookUrl = `${origin}/api/line/webhook?tenantId=${encodeURIComponent(tenantId)}`;

  return NextResponse.json(
    {
      ok: problems.length === 0,
      tenantId,
      webhookUrl,
      config: {
        source: cfgSource,
        hasSecret,
        secretLen,
        hasToken,
        tokenLen,
        hasBookingUrl,
        hasAdminToken: !!adminToken,
        hasInternalToken,
        hasApiBase: !!apiBase,
      },
      destination: {
        mapped: destCheck.mapped,
        hasChannelId: !!destCheck.destination,
      },
      ai: {
        enabled: aiEnabled,
        salesFlowAvailable,
      },
      lastWebhook: lastWebhook
        ? {
            ts: lastWebhook.ts,
            stamp: lastWebhook.stamp,
            sigVerified: lastWebhook.sigVerified,
            eventCount: lastWebhook.eventCount,
            firstEventType: lastWebhook.firstEventType,
            firstText: lastWebhook.firstText,
          }
        : null,
      lastResult,
      problems,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
