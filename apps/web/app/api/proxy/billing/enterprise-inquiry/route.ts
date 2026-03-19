import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const API_BASE = process.env.API_BASE || 'https://saas-factory-api.because-and.workers.dev';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const { company, name, email, phone, storeCount, vertical, message } = body;

    if (!company || !name || !email || !storeCount || !vertical || !message) {
      return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
    }

    const res = await fetch(`${API_BASE}/billing/enterprise-inquiry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': process.env.ADMIN_TOKEN || '',
      },
      body: JSON.stringify({ company, name, email, phone, storeCount, vertical, message }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'inquiry failed' }, { status: res.status });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
