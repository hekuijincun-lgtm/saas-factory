/**
 * LINE OAuth 連携用のユーティリティ
 */

/**
 * LINE OAuth認証URLを生成
 */
export function buildLineAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: 'profile openid',
  });

  return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
}

/**
 * LINE OAuth code をアクセストークンに交換
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  id_token?: string;
}> {
  const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE token exchange failed: ${response.status} ${errorText}`);
  }

  return await response.json();
}

/**
 * LINE アクセストークンを検証し、プロフィール情報を取得
 */
export async function verifyAccessToken(accessToken: string): Promise<{
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}> {
  const response = await fetch('https://api.line.me/v2/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE profile verification failed: ${response.status} ${errorText}`);
  }

  return await response.json();
}

/**
 * LINE Push API でメッセージを送信（Messaging API）
 */
export async function sendLineMessage(
  channelAccessToken: string,
  toUserId: string,
  message: string
): Promise<void> {
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      to: toUserId,
      messages: [
        {
          type: 'text',
          text: message,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE push message failed: ${response.status} ${errorText}`);
  }
}

/**
 * LINE通知を送信（Messaging API使用）
 */
export async function sendLineNotification(
  kv: KVNamespace,
  channelAccessToken: string,
  userId: string,
  message: string
): Promise<void> {
  if (!userId) {
    throw new Error('LINE userId not found. Please send a message from LINE first.');
  }

  if (!channelAccessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
  }

  // Push APIで通知を送信
  await sendLineMessage(channelAccessToken, userId, message);
}

/**
 * LINE Webhook 署名検証
 */
export async function verifyLineWebhookSignature(
  body: string,
  signature: string,
  channelSecret: string
): Promise<boolean> {
  if (!signature || !channelSecret) {
    return false;
  }

  // HMAC-SHA256 で署名を計算
  const encoder = new TextEncoder();
  const keyData = encoder.encode(channelSecret);
  const messageData = encoder.encode(body);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const calculatedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  // 署名を比較
  return calculatedSignature === signature;
}


