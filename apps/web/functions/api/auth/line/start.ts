export async function onRequestGet(context: any) {
  const req: Request = context.request;
  const url = new URL(req.url);

  const env = context.env || {};

  const pickBase = (): string | null => {
    return env.API_BASE || env.BOOKING_API_BASE || env.NEXT_PUBLIC_API_BASE || null;
  };

  const json = (obj: any, status = 200) =>
    new Response(JSON.stringify(obj, null, 2), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });

  // ===== DEBUG: must always run before upstream =====
  if (url.searchParams.get("debug") === "1") {
    return json({
      ok: true,
      where: "apps/web/functions/api/auth/line/start.ts",
      href: url.toString(),
      env: {
        API_BASE: !!env.API_BASE,
        BOOKING_API_BASE: !!env.BOOKING_API_BASE,
        NEXT_PUBLIC_API_BASE: !!env.NEXT_PUBLIC_API_BASE,
        LINE_CHANNEL_ID: !!env.LINE_CHANNEL_ID,
        LINE_CHANNEL_SECRET: !!env.LINE_CHANNEL_SECRET,
      },
    });
  }

  const tenantId = url.searchParams.get("tenantId") || "default";
  const base = pickBase();
  if (!base) {
    return json(
      { ok: false, error: "missing_api_base", detail: "API_BASE / BOOKING_API_BASE / NEXT_PUBLIC_API_BASE not set" },
      500
    );
  }

  const upstream = new URL("/admin/integrations/line/auth-url", base);
  upstream.searchParams.set("tenantId", tenantId);

  let r: Response;
  try {
    r = await fetch(upstream.toString(), { method: "GET", headers: { accept: "application/json" } });
  } catch (e: any) {
    return json(
      { ok: false, error: "failed_to_fetch_upstream", upstream: upstream.toString(), detail: String(e?.message || e) },
      500
    );
  }

  let body: any = null;
  try { body = await r.json(); } catch {}

  if (!r.ok) {
    return json(
      { ok: false, error: "upstream_not_ok", upstream: upstream.toString(), status: r.status, body },
      500
    );
  }

  const authUrl = body?.authUrl || body?.url || body?.result?.authUrl || body?.result?.url || null;
  if (!authUrl || typeof authUrl !== "string") {
    return json({ ok: false, error: "missing_auth_url", upstream: upstream.toString(), body }, 500);
  }

  return Response.redirect(authUrl, 302);
}
