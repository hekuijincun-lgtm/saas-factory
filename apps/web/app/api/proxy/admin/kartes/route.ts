export const runtime = 'edge';

import { proxyFetch, proxyJson } from '../../_lib/proxy';

export async function GET(req: Request) {
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') || 'default';
  const customerId = inUrl.searchParams.get('customerId');
  let path = `/admin/kartes?tenantId=${encodeURIComponent(tenantId)}`;
  if (customerId) path += `&customerId=${encodeURIComponent(customerId)}`;
  return proxyFetch(req, path);
}

export async function POST(req: Request) {
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') || 'default';
  return proxyJson(req, `/admin/kartes?tenantId=${encodeURIComponent(tenantId)}`, {
    bodyJson: await req.json(),
  });
}
