export type LineConfig = {
  channelId?: string | null;
  channelSecret?: string | null;
  channelAccessToken?: string | null;
  webhookUrl?: string | null;
  updatedAt?: string | null;
};

function keyOf(tenantId: string){
  return `line_config:${tenantId}`;
}

export async function getLineConfig(env: any, tenantId: string, origin?: string): Promise<LineConfig> {
  const raw = await env.LINE_ADMIN_KV.get(keyOf(tenantId));
  const cfg: LineConfig = raw ? JSON.parse(raw) : {};
  // 画面でWebhook URL表示する用（originが来たらそれ優先）
  if(origin){
    cfg.webhookUrl = `${origin}/api/line/webhook`;
  } else if(!cfg.webhookUrl){
    cfg.webhookUrl = null;
  }
  return cfg;
}

export async function setLineConfig(env: any, tenantId: string, origin: string, body: any): Promise<LineConfig> {
  const cfg: LineConfig = {
    channelId: body?.channelId ?? null,
    channelSecret: body?.channelSecret ?? null,
    channelAccessToken: body?.channelAccessToken ?? null,
    webhookUrl: `${origin}/api/line/webhook`,
    updatedAt: new Date().toISOString(),
  };
  await env.LINE_ADMIN_KV.put(keyOf(tenantId), JSON.stringify(cfg));
  return cfg;
}
