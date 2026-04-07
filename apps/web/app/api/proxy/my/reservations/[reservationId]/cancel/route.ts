export const runtime = 'edge';

import { resolveUpstreamBase } from '../../../../_lib/proxy';

export async function POST(req: Request, { params }: { params: Promise<{ reservationId: string }> }) {
  const { reservationId } = await params;
  const inUrl = new URL(req.url);
  const tenantId = (inUrl.searchParams.get('tenantId') || 'default').trim();

  const body = await req.text();
  const base = resolveUpstreamBase();
  const upstream = new URL(`/my/reservations/${encodeURIComponent(reservationId)}/cancel`, base);
  upstream.searchParams.set('tenantId', tenantId);

  const res = await fetch(upstream.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'x-tenant-id': tenantId },
    body,
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
  });
}
