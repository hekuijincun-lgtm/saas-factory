export interface Env {
  API_BASE?: string;
  BOOKING_API_BASE?: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const debug = url.searchParams.get("debug") === "1";

  if (debug) {
    return json({
      ok: true,
      where: "apps/web/functions/api/auth/line/start.ts",
      ts: new Date().toISOString(),
      api_base: ctx.env.API_BASE ?? null,
      booking_api_base: ctx.env.BOOKING_API_BASE ?? null,
      url: ctx.request.url,
      method: ctx.request.method,
    });
  }

  const base = ctx.env.API_BASE || ctx.env.BOOKING_API_BASE;
  if (!base) {
    return json({ ok:false, error:"missing_env", detail:"API_BASE or BOOKING_API_BASE is not set in Pages env" }, 500);
  }

  const upstream = new URL("/admin/integrations/line/auth-url", base).toString();
  const r = await fetch(upstream, { method: "GET", headers: { "accept": "application/json" } });
  const text = await r.text();

  if (!r.ok) {
    return json({ ok:false, error:"upstream_not_ok", status:r.status, upstream, body:text.slice(0,2000) }, 500);
  }

  let data: any = null;
  try { data = JSON.parse(text); } catch {}
  return json({ ok:true, upstream, data });
};
