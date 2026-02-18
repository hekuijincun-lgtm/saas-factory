/// <reference types="@cloudflare/workers-types" />

export const onRequestGet: PagesFunction = async (ctx) => {
  const req = ctx.request;
  const url = new URL(req.url);

  const body = {
    ok: true,
    method: req.method,
    pathname: url.pathname,
    host: url.host,
    cf: (req as any).cf ?? null
  };

  return Response.json(body, {
    headers: { "cache-control": "no-store" },
  });
};
