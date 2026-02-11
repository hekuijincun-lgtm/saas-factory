import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    hit: "FORCED_PAGES_RETURN",
    commit: "f78a6bd",
    file: "api/auth/line/start/route.ts",
    ts: Date.now()
  });
}
