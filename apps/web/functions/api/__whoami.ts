export const onRequest: PagesFunction = async (ctx) => {
  return new Response(JSON.stringify({
    ok: true,
    where: "apps/web/functions/api/__whoami.ts",
    ts: new Date().toISOString(),
    url: ctx.request.url,
    method: ctx.request.method,
  }, null, 2), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
