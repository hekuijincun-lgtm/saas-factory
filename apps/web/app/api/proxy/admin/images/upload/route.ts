export const runtime = 'edge';

import { resolveUpstreamBase, injectAdminToken, readSessionPayload } from '../../../_lib/proxy';

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

export async function POST(req: Request) {
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') ?? '';
  const imageType = inUrl.searchParams.get('type') ?? '';
  const menuId = inUrl.searchParams.get('menuId') ?? '';

  const base = resolveUpstreamBase();
  const params = new URLSearchParams({ tenantId, type: imageType });
  if (menuId) params.set('menuId', menuId);
  const upstreamUrl = `${base}/admin/images/upload?${params}`;

  const headers = new Headers();
  const ct = req.headers.get('content-type');
  if (ct) headers.set('content-type', ct);

  injectAdminToken(headers, '/admin/images/upload');

  const session = await readSessionPayload(req);
  headers.set('x-session-tenant-id', tenantId);
  if (session.userId) headers.set('x-session-user-id', session.userId);

  const body = await req.arrayBuffer().catch(() => null);

  const res = await fetch(upstreamUrl, {
    method: 'POST',
    headers,
    body: body as any,
    redirect: 'manual',
  });

  const outHeaders = new Headers(res.headers);
  outHeaders.set('Access-Control-Allow-Origin', '*');

  return new Response(res.body, {
    status: res.status,
    headers: outHeaders,
  });
}
