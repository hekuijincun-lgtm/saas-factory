export const onRequestGet: PagesFunction = async (context) => {
  const { request, env } = context as any;
  const url = new URL(request.url);

  const debug = url.searchParams.get("debug") === "1";
  const tenantId = url.searchParams.get("tenantId") ?? "default";

  const apiBase =
    env?.BOOKING_API_BASE ||
    env?.API_BASE ||
    env?.UPSTREAM_BASE ||
    env?.API_ORIGIN ||
    env?.UPSTREAM_ORIGIN;

  if (!apiBase) {
    return new Response(JSON.stringify({ ok:false, error:"missing_api_base" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  // ✅ 戻り先：いまアクセスしてる Pages の origin に固定（これが超大事）
  const returnTo = url.searchParams.get("returnTo") || `${url.origin}/admin`;

  // ✅ Pages → Workers の /auth/line/start に直結（Workers側が cookie を仕込む）
  const w = new URL("/auth/line/start", apiBase);
  w.searchParams.set("tenantId", tenantId);
  w.searchParams.set("returnTo", returnTo);

  if (debug) {
    return new Response(JSON.stringify({
      ok: true,
      debug: true,
      where: "apps/web/functions/api/auth/line/start.ts",
      requestUrl: request.url,
      tenantId,
      apiBase,
      returnTo,
      redirectTo: w.toString(),
      at: new Date().toISOString(),
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  return Response.redirect(w.toString(), 302);
};
