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
): Promise<{ mapped: boolean; destination: string | null; channelId: string | null }> {
  // The destination-to-tenant KV uses bot's userId (Uxxxx), NOT channelId (numeric).
  // Check via reverse mapping: line:tenant2dest:{tenantId} → botUserId
  // Also get channelId from settings for display.
  const adminToken = getAdminToken();
  let channelId: string | null = null;

  try {
    // Get channelId from settings (for display)
    const url = `${apiBase}/admin/settings?tenantId=${encodeURIComponent(tenantId)}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (adminToken) headers["X-Admin-Token"] = adminToken;
    const r = await fetch(url, { headers });
    if (r.ok) {
      const json = (await r.json()) as any;
      const s = json?.data ?? json;
      channelId = String(s?.integrations?.line?.channelId ?? "").trim() || null;
    }
  } catch {}

  // Check reverse mapping (tenant → botUserId) by checking if any destination maps to this tenant
  // Use the remap endpoint's underlying check: tenant2dest KV
  // We can check by trying destination-to-tenant for known botUserId,
  // or by just checking if channelId-based lookup works.
  // Best approach: try both channelId and ask the admin endpoint for lineAccounts with botUserId
  try {
    // Try channelId first (some tenants store channelId as destination)
    if (channelId) {
      const dr = await fetch(
        `${apiBase}/line/destination-to-tenant?destination=${encodeURIComponent(channelId)}`
      );
      if (dr.ok) {
        const dd = (await dr.json()) as any;
        if (dd?.tenantId) return { mapped: true, destination: channelId, channelId };
      }
    }

    // Try fetching lineAccounts to find botUserId
    if (adminToken) {
      const ar = await fetch(
        `${apiBase}/admin/integrations/line/accounts?tenantId=${encodeURIComponent(tenantId)}`,
        { headers: { "X-Admin-Token": adminToken, Accept: "application/json" } }
      );
      if (ar.ok) {
        const ad = (await ar.json()) as any;
        const accounts = ad?.accounts ?? [];
        for (const acct of accounts) {
          const botUserId = String(acct?.botUserId ?? "").trim();
          if (botUserId) {
            const dr = await fetch(
              `${apiBase}/line/destination-to-tenant?destination=${encodeURIComponent(botUserId)}`
            );
            if (dr.ok) {
              const dd = (await dr.json()) as any;
              if (dd?.tenantId) return { mapped: true, destination: botUserId, channelId };
            }
            // Found a botUserId but not mapped
            return { mapped: false, destination: botUserId, channelId };
          }
        }
      }
    }

    return { mapped: false, destination: null, channelId };
  } catch {
    return { mapped: false, destination: null, channelId };
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
    : { mapped: false, destination: null, channelId: null };
  if (!destCheck.mapped) {
    problems.push(
      destCheck.destination
        ? `destination ${destCheck.destination.slice(0, 8)}... not mapped to tenant — will auto-remap`
        : "No channelId/botUserId found — destination mapping cannot be checked"
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

  // Auto-fix: if destination not mapped but we have token, try internal remap
  let remapResult: any = null;
  let destMappedAfterRemap = destCheck.mapped;
  let internalTokenForRemap = "";
  try {
    const cfEnv = (getRequestContext()?.env as any);
    if (cfEnv?.LINE_INTERNAL_TOKEN) internalTokenForRemap = String(cfEnv.LINE_INTERNAL_TOKEN);
  } catch {}
  if (!internalTokenForRemap) internalTokenForRemap = process.env.LINE_INTERNAL_TOKEN || "";

  if (!destCheck.mapped && hasToken && apiBase && internalTokenForRemap) {
    try {
      const r = await fetch(
        `${apiBase}/internal/line/remap?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: "POST",
          headers: { "x-internal-token": internalTokenForRemap },
        }
      );
      remapResult = await r.json().catch(() => ({ status: r.status }));
      if (remapResult?.ok && remapResult?.botUserId) {
        // Verify the newly created mapping directly
        try {
          const vr = await fetch(
            `${apiBase}/line/destination-to-tenant?destination=${encodeURIComponent(remapResult.botUserId)}`
          );
          if (vr.ok) {
            const vd = (await vr.json()) as any;
            destMappedAfterRemap = vd?.tenantId === tenantId;
          }
        } catch {}
        if (destMappedAfterRemap) {
          // Remove all destination-related problems since remap fixed it
          for (let i = problems.length - 1; i >= 0; i--) {
            if (problems[i].includes("destination") || problems[i].includes("channelId") || problems[i].includes("botUserId") || problems[i].includes("mapped")) {
              problems.splice(i, 1);
            }
          }
        }
      }
    } catch {}
  }

  return NextResponse.json(
    {
      ok: problems.length === 0 || (destMappedAfterRemap && problems.length === 0),
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
        mapped: destMappedAfterRemap,
        wasRemapped: remapResult?.ok === true,
        hasChannelId: !!destCheck.channelId,
        hasBotUserId: !!destCheck.destination,
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
      remapResult: remapResult ?? undefined,
      problems,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
