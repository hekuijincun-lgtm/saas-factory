export const runtime = 'edge';

import { resolveUpstreamBase } from '../../_lib/proxy';

export async function GET(req: Request) {
  const inUrl = new URL(req.url);
  const tenantId = (inUrl.searchParams.get('tenantId') || 'default').trim();
  const customerKey = (inUrl.searchParams.get('customerKey') || '').trim();

  if (!customerKey) {
    return Response.json({ ok: false, error: 'missing_customerKey' }, { status: 400 });
  }

  const base = resolveUpstreamBase();
  const upstream = new URL('/my/reservations', base);
  upstream.searchParams.set('tenantId', tenantId);
  upstream.searchParams.set('customerKey', customerKey);

  const res = await fetch(upstream.toString(), {
    method: 'GET',
    headers: { accept: 'application/json', 'x-tenant-id': tenantId },
    cache: 'no-store',
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
  });
}
