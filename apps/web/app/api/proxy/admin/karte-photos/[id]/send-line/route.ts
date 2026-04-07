export const runtime = 'edge';

import { proxyJson } from '../../../../_lib/proxy';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') || 'default';
  return proxyJson(req, `/admin/karte-photos/${encodeURIComponent(id)}/send-line?tenantId=${encodeURIComponent(tenantId)}`, {
    bodyJson: await req.json(),
  });
}
