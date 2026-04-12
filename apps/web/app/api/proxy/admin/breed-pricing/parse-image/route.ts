export const runtime = 'edge';

import { proxyFetch } from '../../../_lib/proxy';

export async function POST(req: Request) {
  // multipart/form-data — proxyFetch passes the raw body (arrayBuffer) through
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') || 'default';
  return proxyFetch(req, `/admin/breed-pricing/parse-image?tenantId=${encodeURIComponent(tenantId)}`);
}
