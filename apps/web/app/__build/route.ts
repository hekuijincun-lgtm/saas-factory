export const runtime = 'edge';
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    sha: '25089c8',
    stamp: '2026-02-09 10:09:15'
  });
}
