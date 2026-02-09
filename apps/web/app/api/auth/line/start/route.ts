import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") ?? "default";

    const { env } = getRequestContext();
    // Pages Functions runtime: env is available here (NOT via process.env)
    const API_BASE = (env as any).API_BASE as string | undefined;

    if (!API_BASE) {
      throw new Error("API_BASE is missing in Pages env");
    }

    const upstream =
      `${API_BASE}/admin/integrations/line/auth-url?tenantId=${encodeURIComponent(tenantId)}`;

    const r = await fetch(upstream, { redirect: "manual" });
    const j = await r.json().catch(() => null);

    if (!j?.url) {
      throw new Error(`auth-url response missing url (status=${r.status})`);
    }

    return NextResponse.redirect(j.url, 302);
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "failed_to_get_auth_url",
        detail: e?.message ?? "unknown",
      },
      { status: 500 }
    );
  }
}
