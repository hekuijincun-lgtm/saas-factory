export const runtime = 'edge';

import { proxyJson } from '../../../_lib/proxy';

export async function POST(req: Request) {
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') || 'default';
  return proxyJson(req, `/admin/ai/generate-image?tenantId=${encodeURIComponent(tenantId)}`, {
    bodyJson: await req.json(),
  });
}
