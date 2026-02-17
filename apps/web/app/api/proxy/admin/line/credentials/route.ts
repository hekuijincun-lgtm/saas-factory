export const runtime = "edge";

/**
 * GET/POST /api/proxy/admin/line/credentials
 * -> forward to Workers: /admin/line/credentials
 */

import { NextRequest } from "next/server";
import { forwardJson } from "../../../_lib/proxy";

export async function GET(req: NextRequest) {
  return forwardJson(req, "/admin/line/credentials");
}

export async function POST(req: NextRequest) {
  return forwardJson(req, "/admin/line/credentials");
}
