import { forwardJson } from "../../_forward";

// /api/proxy/admin/line/credentials  ->  (Workers) /admin/line/credentials
export async function GET(req: Request)  { return forwardJson(req, "/admin/line/credentials"); }
export async function POST(req: Request) { return forwardJson(req, "/admin/line/credentials"); }

// OPTIONS は forwardJson 側で返してる想定だけど、念のため置いとく（安全）
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization",
      "access-control-max-age": "86400",
    },
  });
}
