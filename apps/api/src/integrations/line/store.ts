/* src/integrations/line/store.ts
 * D1-backed store for LINE integration + logs (defensive, minimal).
 */

export type LineIntegrationRow = {
  tenant_id: string
  user_id: string
  display_name: string | null
  picture_url: string | null
  notify_enabled: number // 0/1
  created_at: string
  updated_at: string
}

export type LineWebhookLogRow = {
  id: string
  ts: string
  tenant_id: string
  event_type: string | null
  msg_type: string | null
  reply_token_len: number | null
  body_len: number
  reply_status: number | null
  reply_body: string | null
}

// ------------------------------
// Tables (CREATE IF NOT EXISTS)
// ------------------------------
async function ensureLineIntegrationsTable(db: D1Database) {
  const sql = `
    CREATE TABLE IF NOT EXISTS line_integrations (
      tenant_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      display_name TEXT,
      picture_url TEXT,
      notify_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `
  await db.prepare(sql).run()
}

async function ensureLineSendLogsTable(db: D1Database) {
  const sql = `
    CREATE TABLE IF NOT EXISTS line_send_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      ok INTEGER NOT NULL,
      status INTEGER,
      message TEXT,
      error TEXT,
      body TEXT,
      created_at TEXT NOT NULL
    )
  `
  await db.prepare(sql).run()
}

async function ensureLineWebhookLogsTable(db: D1Database) {
  const sql = `
    CREATE TABLE IF NOT EXISTS line_webhook_logs (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      event_type TEXT,
      msg_type TEXT,
      reply_token_len INTEGER,
      body_len INTEGER NOT NULL,
      reply_status INTEGER,
      reply_body TEXT
    )
  `
  await db.prepare(sql).run()
}

// ------------------------------
// Integration CRUD
// ------------------------------
export async function getIntegration(db: D1Database, tenantId: string) {
  try {
    await ensureLineIntegrationsTable(db)
    const row = await db
      .prepare("SELECT * FROM line_integrations WHERE tenant_id = ?1 LIMIT 1")
      .bind(tenantId)
      .first()
    return (row ?? null) as any
  } catch {
    return null
  }
}

export async function upsertIntegration(
  db: D1Database,
  tenantId: string,
  patch?: Partial<{
    userId: string
    displayName?: string
    pictureUrl?: string
    updatedAt?: string
    notify_enabled?: number
  }>
) {
  const userId = (patch?.userId ?? "").toString().trim()
  if (!userId) {
    console.error("[LINE][store] missing userId patch=", patch)
    throw new Error("missing line userId")
  }

  await ensureLineIntegrationsTable(db)

  const now = (patch?.updatedAt ?? new Date().toISOString()).toString()
  const displayName = (patch?.displayName ?? null) as any
  const pictureUrl = (patch?.pictureUrl ?? null) as any
  const notifyEnabled =
    typeof patch?.notify_enabled === "number" ? patch.notify_enabled : 1

  const sql = `
    INSERT INTO line_integrations
      (tenant_id, user_id, display_name, picture_url, notify_enabled, created_at, updated_at)
    VALUES
      (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT(tenant_id) DO UPDATE SET
      user_id = excluded.user_id,
      display_name = excluded.display_name,
      picture_url = excluded.picture_url,
      notify_enabled = excluded.notify_enabled,
      updated_at = excluded.updated_at
  `
  await db
    .prepare(sql)
    .bind(tenantId, userId, displayName, pictureUrl, notifyEnabled, now, now)
    .run()

  const saved = await db
    .prepare("SELECT * FROM line_integrations WHERE tenant_id = ?1 LIMIT 1")
    .bind(tenantId)
    .first()

  return saved as any
}

export async function setNotifyEnabled(
  db: D1Database,
  tenantId: string,
  enabled: boolean
) {
  await ensureLineIntegrationsTable(db)

  const sql = `
    UPDATE line_integrations
    SET notify_enabled = ?2,
        updated_at = ?3
    WHERE tenant_id = ?1
  `
  await db
    .prepare(sql)
    .bind(tenantId, enabled ? 1 : 0, new Date().toISOString())
    .run()

  return await getIntegration(db, tenantId)
}

export async function disconnectIntegration(db: D1Database, tenantId: string) {
  await ensureLineIntegrationsTable(db)

  const sql = `
    UPDATE line_integrations
    SET notify_enabled = 0,
        updated_at = ?2
    WHERE tenant_id = ?1
  `
  await db.prepare(sql).bind(tenantId, new Date().toISOString()).run()
  return { ok: true as const }
}

// ------------------------------
// Logs
// ------------------------------
export async function insertSendLog(
  db: D1Database,
  tenantId: string,
  status: number,
  body: string
) {
  try {
    await ensureLineSendLogsTable(db)
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const ok = status >= 200 && status < 300 ? 1 : 0
    const sql = `
      INSERT INTO line_send_logs
        (id, tenant_id, kind, ok, status, message, error, body, created_at)
      VALUES
        (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    `
    await db
      .prepare(sql)
      .bind(
        id,
        tenantId,
        "reply",
        ok,
        status,
        null,
        ok ? null : "send_failed",
        (body ?? "").slice(0, 2000),
        createdAt
      )
      .run()
  } catch {
    // ignore
  }
}

export async function insertLineWebhookLog(db: D1Database, row: LineWebhookLogRow) {
  await ensureLineWebhookLogsTable(db)
  const sql = `
    INSERT INTO line_webhook_logs
      (id, ts, tenant_id, event_type, msg_type, reply_token_len, body_len, reply_status, reply_body)
    VALUES
      (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
  `
  await db
    .prepare(sql)
    .bind(
      row.id,
      row.ts,
      row.tenant_id,
      row.event_type,
      row.msg_type,
      row.reply_token_len,
      row.body_len,
      row.reply_status,
      row.reply_body
    )
    .run()
}

export async function listLineWebhookLogs(db: D1Database, tenantId: string, limit: number) {
  try {
    await ensureLineWebhookLogsTable(db)
    const n = Math.max(1, Math.min(200, limit | 0))
    const res = await db
      .prepare("SELECT * FROM line_webhook_logs WHERE tenant_id = ?1 ORDER BY ts DESC LIMIT ?2")
      .bind(tenantId, n)
      .all()
    return (res?.results ?? []) as any[]
  } catch {
    return []
  }
}
