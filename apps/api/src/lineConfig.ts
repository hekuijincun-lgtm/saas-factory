/**
 * LINE設定のD1操作ユーティリティ
 */

import { encryptConfig, decryptConfig, validateMasterKey } from './crypto';

export type LineConfigPlain = {
  clientId: string;
  channelAccessToken: string;
  channelSecret: string;
};

export type LineConfigRow = {
  tenant_id: string;
  enc_json: string;
  iv: string;
  alg: string;
  updated_at: number;
  updated_by: string;
};

/**
 * LINE設定を取得（復号化）
 */
export async function getLineConfig(
  db: D1Database,
  tenantId: string,
  masterKeyBase64: string
): Promise<LineConfigPlain | null> {
  validateMasterKey(masterKeyBase64);

  const result = await db
    .prepare('SELECT * FROM line_config WHERE tenant_id = ?')
    .bind(tenantId)
    .first<LineConfigRow>();

  if (!result) {
    return null;
  }

  try {
    const plaintext = await decryptConfig(result.enc_json, result.iv, masterKeyBase64);
    return JSON.parse(plaintext) as LineConfigPlain;
  } catch (err) {
    throw new Error(`LINE_CONFIG_INVALID: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * LINE設定を保存（暗号化）
 */
export async function saveLineConfig(
  db: D1Database,
  tenantId: string,
  config: LineConfigPlain,
  updatedBy: string,
  masterKeyBase64: string
): Promise<void> {
  validateMasterKey(masterKeyBase64);

  const plaintext = JSON.stringify(config);
  const { encB64, ivB64, alg } = await encryptConfig(plaintext, masterKeyBase64);
  const updatedAt = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO line_config (tenant_id, enc_json, iv, alg, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET
         enc_json = excluded.enc_json,
         iv = excluded.iv,
         alg = excluded.alg,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`
    )
    .bind(tenantId, encB64, ivB64, alg, updatedAt, updatedBy)
    .run();
}

/**
 * LINE設定を削除
 */
export async function deleteLineConfig(
  db: D1Database,
  tenantId: string
): Promise<void> {
  await db
    .prepare('DELETE FROM line_config WHERE tenant_id = ?')
    .bind(tenantId)
    .run();
}

/**
 * LINE設定の存在確認
 */
export async function hasLineConfig(
  db: D1Database,
  tenantId: string
): Promise<boolean> {
  const result = await db
    .prepare('SELECT 1 FROM line_config WHERE tenant_id = ? LIMIT 1')
    .bind(tenantId)
    .first();

  return result !== null;
}

/**
 * 監査ログを記録
 */
export async function logAudit(
  db: D1Database,
  tenantId: string,
  actorUserId: string,
  action: string,
  meta?: Record<string, unknown>
): Promise<void> {
  const metaJson = meta ? JSON.stringify(meta) : null;
  const createdAt = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO audit_log (tenant_id, actor_user_id, action, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(tenantId, actorUserId, action, metaJson, createdAt)
    .run();
}

/**
 * マスク情報を生成（UI表示用）
 */
export function getMaskedConfig(config: LineConfigPlain | null): {
  clientIdLast4: string | null;
  tokenPresent: boolean;
  secretPresent: boolean;
} {
  if (!config) {
    return {
      clientIdLast4: null,
      tokenPresent: false,
      secretPresent: false,
    };
  }

  return {
    clientIdLast4: config.clientId.length >= 4 ? config.clientId.slice(-4) : '****',
    tokenPresent: config.channelAccessToken.length > 0,
    secretPresent: config.channelSecret.length > 0,
  };
}

/**
 * D1からLINE設定を取得（既存エンドポイント用ヘルパー）
 * 設定がなければ null を返す
 */
export async function getLineConfigOrNull(
  db: D1Database,
  tenantId: string,
  masterKeyBase64: string | undefined
): Promise<LineConfigPlain | null> {
  if (!masterKeyBase64) {
    return null;
  }
  try {
    return await getLineConfig(db, tenantId, masterKeyBase64);
  } catch (err) {
    // 設定が存在しない、または復号化失敗
    return null;
  }
}

