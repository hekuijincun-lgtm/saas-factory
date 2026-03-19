import { NextRequest, NextResponse } from 'next/server';
import { getPlanLimits, isTrialExpired, PLAN_LIMITS } from '@/src/lib/plan-limits';

export const runtime = 'edge';

const API_BASE = process.env.API_BASE || 'https://saas-factory-api.because-and.workers.dev';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'missing tenantId' }, { status: 400 });

  // Fetch settings to get subscription info
  const res = await fetch(`${API_BASE}/admin/settings?tenantId=${tenantId}`, {
    headers: { 'x-admin-token': process.env.ADMIN_TOKEN || '' },
  });
  if (!res.ok) return NextResponse.json({ error: 'settings fetch failed' }, { status: 500 });

  const settings = await res.json() as Record<string, any>;
  const sub = settings.subscription;

  if (!sub) {
    // No subscription = starter defaults
    return NextResponse.json({
      planId: 'starter',
      status: 'active',
      limits: PLAN_LIMITS.starter,
      trial: null,
    });
  }

  // Check trial expiry
  const trialExpired = sub.status === 'trialing' && isTrialExpired(sub.trialEndsAt);
  const effectiveStatus = trialExpired ? 'cancelled' : sub.status;
  const limits = getPlanLimits(sub.planId, effectiveStatus);

  return NextResponse.json({
    planId: sub.planId,
    status: effectiveStatus,
    limits,
    trial: sub.status === 'trialing' ? {
      endsAt: sub.trialEndsAt,
      expired: trialExpired,
      daysLeft: sub.trialEndsAt ? Math.max(0, Math.ceil((sub.trialEndsAt - Date.now()) / 86400000)) : 0,
    } : null,
  });
}
