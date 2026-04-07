export const runtime = 'edge';

import { proxyFetch } from '../../_lib/proxy';

export async function GET(req: Request) {
  const inUrl = new URL(req.url);
  const qs = inUrl.searchParams.toString();
  return proxyFetch(req, `/admin/reservations${qs ? `?${qs}` : ''}`);
}
