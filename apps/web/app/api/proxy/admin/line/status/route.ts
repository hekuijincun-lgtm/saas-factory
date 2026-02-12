export const runtime = 'edge';

// ===== WORKERS DEBUG STAMP BLOCK (copy-paste) =====
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function boolEnv(env: Record<string, any>, key: string) {
  return !!env?.[key];
}

function valEnv(env: Record<string, any>, key: string) {
  const v = env?.[key];
  return v === undefined ? null : v;
}

// ルートの一番最初（1003返すより前）に入れる
export function debugStamp(request: Request, env: Record<string, any>) {
  const url = new URL(request.url);
  const debug = url.searchParams.get("debug") === "1";
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  if (!debug) return null;

  return json({
    ok: true,
    stamp: "HIT_WORKERS_ROUTE_V1",
    path: url.pathname,
    tenantId,
    envSeen: {
      // LINE
      LINE_CHANNEL_ID: boolEnv(env, "LINE_CHANNEL_ID"),
      LINE_CHANNEL_SECRET: boolEnv(env, "LINE_CHANNEL_SECRET"),
      LINE_LOGIN_CALLBACK_URL: boolEnv(env, "LINE_LOGIN_CALLBACK_URL"),
      LINE_REDIRECT_URI: boolEnv(env, "LINE_REDIRECT_URI"),

      // Upstream
      API_BASE: boolEnv(env, "API_BASE"),
      BOOKING_API_BASE: boolEnv(env, "BOOKING_API_BASE"),

      // If you have KV bindings etc.
      LINE_OAUTH_KV: boolEnv(env, "LINE_OAUTH_KV"),
    },
    values: {
      // 値も見たい場合（秘密なら null にしてOK）
      LINE_LOGIN_CALLBACK_URL: valEnv(env, "LINE_LOGIN_CALLBACK_URL"),
      LINE_REDIRECT_URI: valEnv(env, "LINE_REDIRECT_URI"),
      API_BASE: valEnv(env, "API_BASE"),
      BOOKING_API_BASE: valEnv(env, "BOOKING_API_BASE"),
    },
  });
}
// ===== /WORKERS DEBUG STAMP BLOCK =====

