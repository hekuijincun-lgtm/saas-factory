/**
 * LINE設定のD1操作ユーティリティ（統一版）
 */

import { getLineConfig } from '../lineConfig';
import type { LineConfigPlain } from '../lineConfig';

export type LineConfigRow = LineConfigPlain;

type Env = {
  DB: D1Database;
  CONFIG_ENC_KEY?: string;
};

/**
 * LINE設定を取得（設定がなければ null）
 * @param env - { DB: D1Database, CONFIG_ENC_KEY?: string }
 * @param tenantId - テナントID（デフォルト: 'default'）
 */
export async function getLineConfigOrNull(
  env: Env,
  tenantId: string = 'default'
): Promise<LineConfigRow | null> {
  const { DB, CONFIG_ENC_KEY } = env;
  
  if (!CONFIG_ENC_KEY) {
    return null;
  }

  try {
    const config = await getLineConfig(DB, tenantId, CONFIG_ENC_KEY);
    return config;
  } catch (err) {
    // 設定が存在しない、または復号化失敗
    return null;
  }
}

/**
 * LINE設定を取得（設定がなければエラー）
 */
export async function getLineConfigRequired(
  env: Env,
  tenantId: string = 'default'
): Promise<LineConfigRow> {
  const config = await getLineConfigOrNull(env, tenantId);
  if (!config) {
    throw new Error('LINE config is not configured');
  }
  return config;
}

/**
 * エラーハンドリングヘルパー（統一JSONレスポンス）
 */
export function jsonError(error: unknown): { ok: false; kind: 'error'; message: string } {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return {
    ok: false,
    kind: 'error',
    message,
  };
}
