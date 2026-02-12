// apps/web/app/api/auth/line/start/route.ts
export const runtime = 'edge';

export async function GET() {
  return new Response(
    JSON.stringify({
      ok: true,
      where: "edge-function",
      ts: new Date().toISOString(),
    }),
    { headers: { "content-type": "application/json" } }
  );
}
