export interface PlanLimits {
  maxStaff: number;
  maxMenus: number;
  aiEnabled: boolean;
  repeatEnabled: boolean;
  surveyEnabled: boolean;
  multiLineAccounts: boolean;
  maxReservationsPerMonth: number;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  starter: {
    maxStaff: 2,
    maxMenus: 10,
    aiEnabled: false,
    repeatEnabled: false,
    surveyEnabled: false,
    multiLineAccounts: false,
    maxReservationsPerMonth: 100,
  },
  pro: {
    maxStaff: Infinity,
    maxMenus: Infinity,
    aiEnabled: true,
    repeatEnabled: true,
    surveyEnabled: true,
    multiLineAccounts: false,
    maxReservationsPerMonth: Infinity,
  },
  enterprise: {
    maxStaff: Infinity,
    maxMenus: Infinity,
    aiEnabled: true,
    repeatEnabled: true,
    surveyEnabled: true,
    multiLineAccounts: true,
    maxReservationsPerMonth: Infinity,
  },
};

// During trial, user gets Pro limits
export const TRIAL_DURATION_DAYS = 14;

export function getPlanLimits(planId: string, status: string): PlanLimits {
  if (status === 'trialing') return PLAN_LIMITS.pro;
  if (status === 'cancelled' || status === 'past_due') return PLAN_LIMITS.starter;
  return PLAN_LIMITS[planId] ?? PLAN_LIMITS.starter;
}

export function isTrialExpired(trialEndsAt?: number): boolean {
  if (!trialEndsAt) return false;
  return Date.now() > trialEndsAt;
}
