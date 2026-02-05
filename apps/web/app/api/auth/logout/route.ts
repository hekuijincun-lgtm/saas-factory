export const runtime = 'edge';

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const u = new URL(req.url);
  const res = NextResponse.redirect(new URL("/login", u.origin));
  res.cookies.set("kb_session", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

