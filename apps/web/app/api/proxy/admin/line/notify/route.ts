export const runtime = 'edge';

/**
 * PATCH /api/proxy/admin/line/notify
 */

import { NextRequest } from 'next/server';
import { forwardJson } from '../../../_lib/proxy';

export async function PATCH(req: NextRequest) {
  return forwardJson(req, '/admin/integrations/line/notify');
}


