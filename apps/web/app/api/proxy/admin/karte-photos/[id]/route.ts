export const runtime = 'edge';

import { proxyFetch, proxyJson } from '../../../_lib/proxy';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') || 'default';
  return proxyJson(req, `/admin/karte-photos/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'PATCH',
    bodyJson: await req.json(),
  });
}
