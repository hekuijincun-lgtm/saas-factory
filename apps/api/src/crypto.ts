/**
 * 設定値の暗号化/復号化ユーティリティ（AES-GCM）
 * 
 * マスターキーは Workers Secret CONFIG_ENC_KEY に保存（base64 32byte = 256bit）
 */

/**
 * 暗号化
 * @param plaintext 平文（JSON文字列）
 * @param masterKeyBase64 base64エンコードされた32byteキー
 * @returns { encB64: string, ivB64: string, alg: string }
 */
export async function encryptConfig(
  plaintext: string,
  masterKeyBase64: string
): Promise<{ encB64: string; ivB64: string; alg: string }> {
  try {
    // マスターキーをデコード
    const masterKeyBytes = Uint8Array.from(atob(masterKeyBase64), (c) => c.charCodeAt(0));
    if (masterKeyBytes.length !== 32) {
      throw new Error('CONFIG_ENC_KEY must be 32 bytes (256 bits)');
    }

    // キーをインポート
    const key = await crypto.subtle.importKey(
      'raw',
      masterKeyBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    // IV生成（12 bytes for AES-GCM）
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 暗号化
    const plaintextBytes = new TextEncoder().encode(plaintext);
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      plaintextBytes
    );

    // base64エンコード
    const encB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    const ivB64 = btoa(String.fromCharCode(...iv));

    return {
      encB64,
      ivB64,
      alg: 'AES-GCM',
    };
  } catch (err) {
    throw new Error(`Encryption failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 復号化
 * @param encB64 暗号文（base64）
 * @param ivB64 初期化ベクトル（base64）
 * @param masterKeyBase64 base64エンコードされた32byteキー
 * @returns 平文（JSON文字列）
 */
export async function decryptConfig(
  encB64: string,
  ivB64: string,
  masterKeyBase64: string
): Promise<string> {
  try {
    // マスターキーをデコード
    const masterKeyBytes = Uint8Array.from(atob(masterKeyBase64), (c) => c.charCodeAt(0));
    if (masterKeyBytes.length !== 32) {
      throw new Error('CONFIG_ENC_KEY must be 32 bytes (256 bits)');
    }

    // キーをインポート
    const key = await crypto.subtle.importKey(
      'raw',
      masterKeyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // base64デコード
    const encryptedBytes = Uint8Array.from(atob(encB64), (c) => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));

    // 復号化
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      encryptedBytes
    );

    // 文字列に変換
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    throw new Error(`Decryption failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * マスターキーの検証（開発用）
 */
export function validateMasterKey(masterKeyBase64: string | undefined): void {
  if (!masterKeyBase64) {
    throw new Error('CONFIG_ENC_KEY is not configured');
  }
  try {
    const bytes = Uint8Array.from(atob(masterKeyBase64), (c) => c.charCodeAt(0));
    if (bytes.length !== 32) {
      throw new Error('CONFIG_ENC_KEY must be exactly 32 bytes (256 bits) when base64 decoded');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('CONFIG_ENC_KEY')) {
      throw err;
    }
    throw new Error('CONFIG_ENC_KEY is invalid base64');
  }
}




