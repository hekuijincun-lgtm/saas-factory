export const runtime = 'edge';

import { proxyFetch, proxyJson } from '../../_lib/proxy';

export async function GET(req: Request) {
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') || 'default';
  return proxyFetch(req, `/admin/coupons?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function POST(req: Request) {
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') || 'default';
  return proxyJson(req, `/admin/coupons?tenantId=${encodeURIComponent(tenantId)}`, {
    bodyJson: await req.json(),
  });
}
