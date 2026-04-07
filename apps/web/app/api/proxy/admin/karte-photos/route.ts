export const runtime = 'edge';

import { proxyFetch } from '../../_lib/proxy';

export async function GET(req: Request) {
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') || 'default';
  const customerId = inUrl.searchParams.get('customerId') || '';
  let path = `/admin/karte-photos?tenantId=${encodeURIComponent(tenantId)}`;
  if (customerId) path += `&customerId=${encodeURIComponent(customerId)}`;
  return proxyFetch(req, path);
}

export async function POST(req: Request) {
  // multipart/form-data — pass through as-is (no JSON conversion)
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') || 'default';
  return proxyFetch(req, `/admin/karte-photos?tenantId=${encodeURIComponent(tenantId)}`);
}
