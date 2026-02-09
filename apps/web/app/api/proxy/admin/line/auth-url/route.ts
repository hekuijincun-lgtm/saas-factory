export const runtime = "edge";

import { NextResponse } from "next/server";

// Minimal safe module to unblock build.
// TODO: implement real proxy later.
export async function GET() {
  return NextResponse.json(
    { ok:false, where:"app/api/proxy/[...path]/route.ts", error:"proxy_not_implemented" },
    { status: 501 }
  );
}

export async function POST() {
  return NextResponse.json(
    { ok:false, where:"app/api/proxy/[...path]/route.ts", error:"proxy_not_implemented" },
    { status: 501 }
  );
}
