export const runtime = 'edge';

import { proxyFetch, proxyJson } from '../../../_lib/proxy';

export async function PUT(req: Request, { params }: { params: Promise<{ couponId: string }> }) {
  const { couponId } = await params;
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') || 'default';
  return proxyJson(req, `/admin/coupons/${couponId}?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'PUT',
    bodyJson: await req.json(),
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ couponId: string }> }) {
  const { couponId } = await params;
  const inUrl = new URL(req.url);
  const tenantId = inUrl.searchParams.get('tenantId') || 'default';
  return proxyFetch(req, `/admin/coupons/${couponId}?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'DELETE',
  });
}
