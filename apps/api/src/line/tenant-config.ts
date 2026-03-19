/**
 * LINE Core — Tenant Config Resolution
 *
 * Consolidates the 3 existing config sources into one resolver:
 * 1. settings:{tenantId}.integrations.line (KV, primary)
 * 2. lineAccounts[] multi-account (KV)
 * 3. Legacy line_config:{tenantId} (KV, deprecated)
 */

import type { LineTenantConfig, LineMessagingConfig, LineCoreSettings } from "./types";

const DEFAULT_LINE_CORE: LineCoreSettings = {
  enabled: true,
  agentRoutingEnabled: false,
  loggingEnabled: true,
  defaultReplyMode: "legacy",
  dedupWindowSec: 120,
};

export async function getLineTenantConfig(
  kv: KVNamespace,
  tenantId: string,
): Promise<LineTenantConfig | null> {
  try {
    const raw = await kv.get(`settings:${tenantId}`);
    if (!raw) return null;
    const settings = JSON.parse(raw);

    // Try integrations.line first (primary)
    const line = settings?.integrations?.line;
    if (line?.channelAccessToken && line?.channelSecret) {
      const lineCore = settings?.lineCore as Partial<LineCoreSettings> | undefined;
      return {
        tenantId,
        enabled: line.connected !== false,
        messaging: {
          channelAccessToken: line.channelAccessToken,
          channelSecret: line.channelSecret,
          channelId: line.channelId,
          botUserId: line.userId,
          enabled: true,
        },
        login: settings?.lineLogin ?? undefined,
        defaultReplyMode: lineCore?.defaultReplyMode ?? DEFAULT_LINE_CORE.defaultReplyMode,
        webhookEnabled: true,
        agentRoutingEnabled: lineCore?.agentRoutingEnabled ?? DEFAULT_LINE_CORE.agentRoutingEnabled,
      };
    }

    // Try lineAccounts[] multi-account (find first active booking account)
    const accounts = settings?.lineAccounts as any[] | undefined;
    if (Array.isArray(accounts) && accounts.length > 0) {
      const active = accounts.find((a: any) => a.status === "active" && a.channelAccessToken);
      if (active) {
        return {
          tenantId,
          enabled: true,
          messaging: {
            channelAccessToken: active.channelAccessToken,
            channelSecret: active.channelSecret,
            channelId: active.channelId,
            botUserId: active.botUserId,
            enabled: true,
          },
          defaultReplyMode: "legacy",
          webhookEnabled: true,
          agentRoutingEnabled: false,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function getLineMessagingConfig(
  kv: KVNamespace,
  tenantId: string,
): Promise<LineMessagingConfig | null> {
  const config = await getLineTenantConfig(kv, tenantId);
  if (!config?.messaging?.enabled) return null;
  return config.messaging;
}

export async function getLineCoreSettings(
  kv: KVNamespace,
  tenantId: string,
): Promise<LineCoreSettings> {
  try {
    const raw = await kv.get(`settings:${tenantId}`);
    if (!raw) return { ...DEFAULT_LINE_CORE };
    const settings = JSON.parse(raw);
    const lc = settings?.lineCore;
    if (!lc || typeof lc !== "object") return { ...DEFAULT_LINE_CORE };
    return {
      enabled: lc.enabled ?? DEFAULT_LINE_CORE.enabled,
      agentRoutingEnabled: lc.agentRoutingEnabled ?? DEFAULT_LINE_CORE.agentRoutingEnabled,
      loggingEnabled: lc.loggingEnabled ?? DEFAULT_LINE_CORE.loggingEnabled,
      defaultReplyMode: lc.defaultReplyMode ?? DEFAULT_LINE_CORE.defaultReplyMode,
      dedupWindowSec: lc.dedupWindowSec ?? DEFAULT_LINE_CORE.dedupWindowSec,
    };
  } catch {
    return { ...DEFAULT_LINE_CORE };
  }
}

export function assertLineEnabled(config: LineTenantConfig | null): asserts config is LineTenantConfig {
  if (!config) throw new Error("LINE not configured for this tenant");
  if (!config.enabled) throw new Error("LINE is disabled for this tenant");
  if (!config.messaging.channelAccessToken) throw new Error("LINE channel access token missing");
}
