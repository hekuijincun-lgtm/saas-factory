export const runtime = 'edge';

import { proxyFetch } from '../../../_lib/proxy';

export async function DELETE(req: Request, { params }: { params: Promise<{ karteId: string }> }) {
  const { karteId } = await params;
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') || 'default';
  return proxyFetch(req, `/admin/kartes/${encodeURIComponent(karteId)}?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'DELETE',
  });
}
