// apps/web/app/api/proxy/admin/special-features/before-after/upload/route.ts
// POST /api/proxy/admin/special-features/before-after/upload?tenantId=&kind=before|after
// multipart/form-data 転送: Content-Type(boundary付き) をそのまま Workers へ転送する
export const runtime = 'edge';

import { resolveUpstreamBase, injectAdminToken, readSessionPayload } from '../../../../_lib/proxy';

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
  const kind = inUrl.searchParams.get('kind') ?? '';

  const base = resolveUpstreamBase();
  const upstreamUrl = `${base}/admin/special-features/before-after/upload?tenantId=${encodeURIComponent(tenantId)}&kind=${encodeURIComponent(kind)}`;

  // Headers: Content-Type (multipart/form-data; boundary=...) を保持しつつ auth headers を注入
  const headers = new Headers();
  const ct = req.headers.get('content-type');
  if (ct) headers.set('content-type', ct);

  injectAdminToken(headers, '/admin/special-features/before-after/upload');

  // Inject HMAC-verified session headers so Workers can perform RBAC
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
