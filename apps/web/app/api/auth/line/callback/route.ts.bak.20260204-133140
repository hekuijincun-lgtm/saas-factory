import { NextResponse } from "next/server";
import crypto from "crypto";

function signSession(payload: object, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const tenantId = u.searchParams.get("tenantId") ?? "default";
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const error = u.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/login?e=${encodeURIComponent(error)}`, u.origin));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL(`/login?e=missing_code_or_state`, u.origin));
  }

  // Call Worker token exchange endpoint (POST) - NOTE: Worker must accept this POST.
  const workerBase = process.env.WORKER_BASE_URL ?? "http://127.0.0.1:8787";
  const r = await fetch(`${workerBase}/admin/integrations/line/oauth/callback?tenantId=${encodeURIComponent(tenantId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, state }),
    cache: "no-store",
  });

  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) {
    const detail = j?.error ?? "callback_failed";
    return NextResponse.redirect(new URL(`/login?e=${encodeURIComponent(detail)}`, u.origin));
  }

  // Session cookie (httpOnly)
  const secret = process.env.WEB_SESSION_SECRET ?? "dev-secret-change-me";
  const now = Date.now();
  const session = signSession(
    { tenantId, lineUserId: j?.line?.userId ?? null, at: now, v: 1 },
    secret
  );

  const res = NextResponse.redirect(new URL("/admin/settings?line=ok", u.origin));
  res.cookies.set("kb_session", session, {
    httpOnly: true,
    secure: false, // local dev
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

