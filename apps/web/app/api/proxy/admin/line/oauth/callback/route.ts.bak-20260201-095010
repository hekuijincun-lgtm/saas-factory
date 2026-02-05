/**
 * POST /api/proxy/admin/line/oauth/callback
 */

import { NextRequest } from 'next/server';
import { forwardJson } from '../../../../_lib/proxy';

export async function POST(req: NextRequest) {
  return forwardJson(req, '/admin/integrations/line/oauth/callback');
}

