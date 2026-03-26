export const runtime = 'edge';

import { proxyFetch } from '../../../_lib/proxy';

export async function GET(req: Request) {
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') || 'default';
  return proxyFetch(req, `/admin/ai/images?tenantId=${encodeURIComponent(tenantId)}`);
}
