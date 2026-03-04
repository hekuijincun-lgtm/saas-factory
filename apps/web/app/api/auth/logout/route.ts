export const runtime = "edge";

import { NextResponse } from "next/server";

// Clears session cookies. Works for both LINE and email sessions (both use line_session).

const EXPIRED = "Thu, 01 Jan 1970 00:00:00 GMT";
const CLEAR_COOKIES = [
  `line_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=${EXPIRED}`,
  `line_uid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=${EXPIRED}`,
  `line_return_to=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=${EXPIRED}`,
  `kb_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=${EXPIRED}`,
];

export async function POST(req: Request) {
  const u = new URL(req.url);
  const res = NextResponse.redirect(new URL("/login", u.origin));
  for (const c of CLEAR_COOKIES) res.headers.append("Set-Cookie", c);
  return res;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const res = NextResponse.redirect(new URL("/login", u.origin));
  for (const c of CLEAR_COOKIES) res.headers.append("Set-Cookie", c);
  return res;
}
