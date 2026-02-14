export const onRequestGet: PagesFunction = async (context) => {
  const { request, env } = context as any;
  const url = new URL(request.url);

  const debug = url.searchParams.get("debug") === "1";
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  // ここはあなたの既存 env 名に合わせる（今の debug 出力に合わせてる）
  const apiBase =
    env?.BOOKING_API_BASE ||
    env?.API_BASE ||
    env?.UPSTREAM_BASE ||
    env?.API_ORIGIN ||
    env?.UPSTREAM_ORIGIN;

  const channelId =
    env?.LINE_LOGIN_CHANNEL_ID || env?.LINE_CHANNEL_ID;

  const channelSecret =
    env?.LINE_LOGIN_CHANNEL_SECRET || env?.LINE_CHANNEL_SECRET;

  if (!apiBase || !channelId || !channelSecret) {
    const body = {
      ok: false,
      error: "missing_env",
      apiBase: apiBase ?? null,
      channelId: channelId ?? null,
      channelSecret: channelSecret ? "***" : null,
      tenantId,
    };
    return new Response(JSON.stringify(body), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  // ✅ 本来は Workers 側の auth-url を叩いて authUrl を取る想定
  const authUrlEndpoint = new URL("/admin/integrations/line/auth-url", apiBase);
  authUrlEndpoint.searchParams.set("tenantId", tenantId);
  authUrlEndpoint.searchParams.set("v", crypto.randomUUID().replaceAll("-", ""));

  const resp = await fetch(authUrlEndpoint.toString(), {
    method: "GET",
    headers: { "accept": "application/json" },
  });

  const txt = await resp.text();

  if (debug) {
    return new Response(
      JSON.stringify({
        ok: true,
        debug: true,
        at: new Date().toISOString(),
        requestUrl: request.url,
        tenantId,
        upstream: authUrlEndpoint.toString(),
        upstreamStatus: resp.status,
        upstreamBodyHead: txt.slice(0, 500),
        env: {
          API_BASE: env?.API_BASE ?? null,
          API_ORIGIN: env?.API_ORIGIN ?? null,
          BOOKING_API_BASE: env?.BOOKING_API_BASE ?? null,
          UPSTREAM_BASE: env?.UPSTREAM_BASE ?? null,
          LINE_LOGIN_CHANNEL_ID: env?.LINE_LOGIN_CHANNEL_ID ?? null,
          LINE_CHANNEL_ID: env?.LINE_CHANNEL_ID ?? null,
          CF_PAGES: env?.CF_PAGES ?? null,
          CF_PAGES_BRANCH: env?.CF_PAGES_BRANCH ?? null,
          CF_PAGES_URL: env?.CF_PAGES_URL ?? null,
          CF_PAGES_COMMIT_SHA: env?.CF_PAGES_COMMIT_SHA ?? null,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  // debug 以外は 302 でLINEへ
  let authUrl: string | null = null;
  try {
    const j = JSON.parse(txt);
    authUrl = j?.authUrl || j?.url || j?.result?.authUrl || null;
  } catch {}

  if (!resp.ok || !authUrl) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "failed_to_get_auth_url",
        upstreamStatus: resp.status,
        upstreamBodyHead: txt.slice(0, 500),
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  return Response.redirect(authUrl, 302);
};
