// temporarily hidden — admin management is suspended
// Original component: AdminMembersManager via AdminMembersPage
// To restore: uncomment nav.config.ts entries and revert this file

import { redirect } from 'next/navigation';

export const runtime = 'edge';

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const { tenantId } = await searchParams;
  redirect(tenantId ? `/admin?tenantId=${encodeURIComponent(tenantId)}` : '/admin');
}
