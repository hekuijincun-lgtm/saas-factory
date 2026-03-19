/**
 * LINE Core — Main Entry Point
 *
 * Bundles tenant config, webhook, sender, logs, and agent bridge.
 */

import type {
  LineTenantConfig,
  LineSendResult,
  LineMessage,
  LineNormalizedEvent,
  LineCoreSettings,
} from "./types";
import { getLineTenantConfig, getLineCoreSettings, assertLineEnabled } from "./tenant-config";
import { handleWebhook } from "./webhook";
import type { WebhookHandleResult } from "./webhook";
import { pushMessage, replyMessage, pushText, replyText } from "./sender";
import { listRecentLineLogs } from "./logs";
import { buildTextMessage } from "./templates";

export class LineCore {
  private env: Record<string, unknown>;
  private kv: KVNamespace | null;

  constructor(env: Record<string, unknown>) {
    this.env = env;
    this.kv = (env.SAAS_FACTORY as KVNamespace) ?? null;
  }

  /** Load tenant LINE config. */
  async getTenantConfig(tenantId: string): Promise<LineTenantConfig | null> {
    if (!this.kv) return null;
    return getLineTenantConfig(this.kv, tenantId);
  }

  /** Load LINE Core settings for a tenant. */
  async getCoreSettings(tenantId: string): Promise<LineCoreSettings> {
    if (!this.kv) return { enabled: false, agentRoutingEnabled: false, loggingEnabled: true, defaultReplyMode: "legacy", dedupWindowSec: 120 };
    return getLineCoreSettings(this.kv, tenantId);
  }

  /** Process a webhook request. */
  async handleWebhook(rawBody: string, signature: string, tenantId: string): Promise<WebhookHandleResult> {
    return handleWebhook(rawBody, signature, tenantId, this.env);
  }

  /** Send a reply message. */
  async sendReply(tenantId: string, replyToken: string, messages: LineMessage[], traceId?: string): Promise<LineSendResult> {
    const config = await this.requireConfig(tenantId);
    return replyMessage(config.messaging.channelAccessToken, { tenantId, replyToken, messages, traceId }, this.kv);
  }

  /** Send a push message. */
  async sendPush(tenantId: string, userId: string, messages: LineMessage[], traceId?: string, dedup?: string): Promise<LineSendResult> {
    const config = await this.requireConfig(tenantId);
    return pushMessage(config.messaging.channelAccessToken, { tenantId, userId, messages, traceId, dedup }, this.kv);
  }

  /** Convenience: push a text message. */
  async pushText(tenantId: string, userId: string, text: string, dedup?: string): Promise<LineSendResult> {
    const config = await this.requireConfig(tenantId);
    return pushText(config.messaging.channelAccessToken, tenantId, userId, text, this.kv, dedup);
  }

  /** Convenience: reply with text. */
  async replyText(tenantId: string, replyToken: string, text: string): Promise<LineSendResult> {
    const config = await this.requireConfig(tenantId);
    return replyText(config.messaging.channelAccessToken, tenantId, replyToken, text, this.kv);
  }

  /** Get recent LINE logs for a tenant. */
  async getRecentLogs(tenantId: string, limit?: number) {
    return listRecentLineLogs(this.kv, tenantId, limit);
  }

  /** Health status check. */
  async getHealthStatus(tenantId: string): Promise<{
    configured: boolean;
    enabled: boolean;
    hasToken: boolean;
    hasSecret: boolean;
    agentRouting: boolean;
    recentLogCount: number;
  }> {
    const config = await this.getTenantConfig(tenantId);
    const coreSettings = await this.getCoreSettings(tenantId);
    const logs = await this.getRecentLogs(tenantId, 1);

    return {
      configured: !!config,
      enabled: config?.enabled ?? false,
      hasToken: !!config?.messaging?.channelAccessToken,
      hasSecret: !!config?.messaging?.channelSecret,
      agentRouting: coreSettings.agentRoutingEnabled,
      recentLogCount: logs.length,
    };
  }

  private async requireConfig(tenantId: string): Promise<LineTenantConfig> {
    if (!this.kv) throw new Error("KV not available");
    const config = await getLineTenantConfig(this.kv, tenantId);
    assertLineEnabled(config);
    return config;
  }
}
